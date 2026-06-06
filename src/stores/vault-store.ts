/**
 * Vault store — Zustand-backed state for registered vaults and the active vault.
 *
 * Responsibilities:
 *   - Track {@link VaultMeta} records (persisted to Dexie)
 *   - Track which vault is currently active (id only; persisted to Dexie)
 *   - Hold live {@link VaultFileSystem} adapters in a non-reactive Map
 *     (adapters are large + non-serializable; never put them in Zustand state)
 *
 * **NOT responsible for**:
 *   - Permission re-grant flow on returning users (see M6.3)
 *   - Per-vault reading state like recent files / scroll positions (M2.7 / M4.7)
 *
 * This store replaces the M1.3 `core/vault/registry.ts` shim. Migration is a
 * mechanical swap: `registerVault(adapter)` → `useVaultStore.getState().registerVault(adapter)`.
 */

import { create } from 'zustand'
import type { Table } from 'dexie'
import { db, metaToStored, storedToMeta } from '@/core/persistence/db'
import { deleteHandle } from '@/core/vault'
import { invalidateBacklinks } from '@/core/navigation/backlinks'
import { runVaultDeletionHooks } from '@/stores/vault-lifecycle'
import type { VaultFileSystem, VaultId, VaultMeta } from '@/core/vault'

/**
 * Boot-time orphan sweep. `removeVault` deletes per-vault rows before the
 * `vaults` metadata row so an interruption can only ever leave a stale
 * *metadata* row (harmless, retried) — never orphaned dependent rows. But
 * older builds, hard crashes, or manual IndexedDB edits can still leave
 * rows whose `vaultId` no longer maps to a registered vault. We sweep them
 * once on init so storage doesn't accumulate dead per-vault data.
 *
 * Best-effort: a sweep failure must never block app boot.
 */
/** Minimal Dexie surface the sweep needs: every per-vault table carries a
 *  `vaultId` column and a string primary key (synthetic `id`, or `vaultId`
 *  itself for `panes`). Erasing to this shape lets one helper sweep them
 *  all without fighting each table's distinct InsertType generic. */
type VaultKeyedTable = Table<{ vaultId: string }, string>

async function sweepOrphans(
  table: VaultKeyedTable,
  known: Set<string>,
): Promise<void> {
  const orphanKeys = await table
    .filter((row) => !known.has(row.vaultId))
    .primaryKeys()
  if (orphanKeys.length > 0) await table.bulkDelete(orphanKeys)
}

async function pruneOrphanedVaultData(knownIds: Set<VaultId>): Promise<void> {
  // All seven tables have string primary keys, so the structural cast is
  // sound — the helper only reads `vaultId` and deletes by primary key.
  const tables = [
    db.recentFiles,
    db.backlinks,
    db.scrollPositions,
    db.openTabs,
    db.reviewBatches,
    db.reviewCards,
    db.panes,
  ] as unknown as VaultKeyedTable[]
  try {
    await Promise.all(tables.map((table) => sweepOrphans(table, knownIds)))
  } catch {
    /* best-effort — a failed sweep must never block boot */
  }
}

// Per-vault cleanup is no longer hardcoded here. Each store / module
// that owns vault-scoped state registers a `vault-lifecycle` hook at
// module load (see reader-store, tabs-store, editor-store,
// sidebar-visibility-store, review/card-store, navigation/
// backlinks). `removeVault` runs the registry instead of editing this
// list every time a new domain shows up.

// Cache-invalidation imports for `removeVault` are dynamic (see the
// inline helper below). Static imports here would pull every per-vault
// cache module into the eager main bundle — including MiniSearch
// (~6 KB gz) for full-text search. The palette chunk is the only place
// that should be paying that cost; the invalidators are rare-use and
// small enough that a couple of dynamic imports during removal are
// fine. `invalidateBacklinks` lives in `core/` and has no heavy deps,
// so it stays static.

/**
 * Lazy-fire cache invalidation for a vault. Each cache module is
 * dynamic-imported so the static dep graph from `vault-store` to
 * `removeVault → minisearch` doesn't drag heavy modules into main.
 * Failures are swallowed — invalidation runs after Dexie rows are
 * already gone, so a missed in-memory entry is at most a stale read,
 * not data loss.
 */
async function invalidateVaultCachesLazy(id: VaultId): Promise<void> {
  await Promise.all([
    import('@/ui/file-tree/file-tree-cache')
      .then((m) => {
        m.invalidateFileTreeListings(id)
      })
      .catch(() => undefined),
    import('@/ui/reading-shell/tag-index-cache')
      .then((m) => {
        m.invalidateTagIndex(id)
      })
      .catch(() => undefined),
    import('@/ui/command-palette/walked-files-cache')
      .then((m) => {
        m.invalidateWalkedFiles(id)
      })
      .catch(() => undefined),
    import('@/ui/command-palette/full-text-cache')
      .then((m) => {
        m.invalidateFullTextIndex(id)
      })
      .catch(() => undefined),
    import('@/core/graph')
      .then((m) => {
        m.invalidateVaultGraph(id)
      })
      .catch(() => undefined),
    import('@/ui/reading-shell/wikilink-preview-cache')
      .then((m) => {
        m.invalidateWikilinkPreviewCache(id)
      })
      .catch(() => undefined),
  ])
}

const ACTIVE_VAULT_ID_PREF_KEY = 'activeVaultId'

/** Live adapters keyed by vault id. Module-scoped so they don't end up in
 *  Zustand's reactive store (they're large objects; equality checks would
 *  cause unnecessary re-renders). */
const adapters = new Map<VaultId, VaultFileSystem>()

interface VaultStoreState {
  registeredVaults: VaultMeta[]
  activeVaultId: VaultId | null
  /** True after `init()` has finished loading from Dexie. */
  ready: boolean
  /** Incremented each time an adapter is attached so components that
   *  called getAdapter() too early can re-run their effects. */
  adapterRevision: number
  /**
   * Per-vault content revision. Bumped after explicit cache invalidation so
   * subscribers re-read directory listings / derived indexes from the adapter.
   */
  contentRevisionByVault: Record<VaultId, number>
}

interface VaultStoreActions {
  /** Load registered vaults and the active id from Dexie. Idempotent. */
  init: () => Promise<void>

  /** Register a freshly-picked adapter. Persists metadata, sets active. */
  registerVault: (adapter: VaultFileSystem) => Promise<VaultMeta>

  /** Make a registered vault active. No-op if `id` is unknown. */
  switchVault: (id: VaultId) => Promise<void>

  /** Remove a vault from the registry. Does NOT delete vault content. */
  removeVault: (id: VaultId) => Promise<void>

  /**
   * Drop derived content caches for a vault and bump its revision. Used by the
   * file-tree manual refresh today; future focus / polling sync should share
   * this path.
   */
  refreshVaultContent: (id: VaultId) => Promise<void>

  /** Bind a live adapter to an existing meta entry (e.g. after permission
   *  re-grant on a returning user). M6.3 calls this. */
  attachAdapter: (adapter: VaultFileSystem) => void
}

export type VaultStore = VaultStoreState & VaultStoreActions

export const useVaultStore = create<VaultStore>((set, get) => ({
  registeredVaults: [],
  activeVaultId: null,
  ready: false,
  adapterRevision: 0,
  contentRevisionByVault: {},

  async init() {
    if (get().ready) return
    const stored = await db.vaults.orderBy('lastOpenedAtMs').reverse().toArray()
    const activePref = await db.preferences.get(ACTIVE_VAULT_ID_PREF_KEY)
    const activeId =
      typeof activePref?.value === 'string' ? activePref.value : null
    set({
      registeredVaults: stored.map(storedToMeta),
      activeVaultId: activeId,
      ready: true,
    })
    // Drop any per-vault rows left behind by an interrupted removal or an
    // older build. Fire-and-forget so boot isn't gated on the sweep.
    void pruneOrphanedVaultData(new Set(stored.map((s) => s.id)))
  },

  async registerVault(adapter) {
    const now = new Date()
    const existing = get().registeredVaults.find((v) => v.id === adapter.id)
    const meta: VaultMeta = {
      id: adapter.id,
      name: adapter.name,
      registeredAt: existing?.registeredAt ?? now,
      lastOpenedAt: now,
    }
    await db.vaults.put(metaToStored(meta))
    await db.preferences.put({ key: ACTIVE_VAULT_ID_PREF_KEY, value: meta.id })
    adapters.set(adapter.id, adapter)
    set((state) => {
      const others = state.registeredVaults.filter((v) => v.id !== meta.id)
      // Most-recently-opened first
      return {
        registeredVaults: [meta, ...others],
        activeVaultId: meta.id,
      }
    })
    return meta
  },

  async switchVault(id) {
    const meta = get().registeredVaults.find((v) => v.id === id)
    if (!meta) return
    const updated: VaultMeta = { ...meta, lastOpenedAt: new Date() }
    await db.vaults.put(metaToStored(updated))
    await db.preferences.put({ key: ACTIVE_VAULT_ID_PREF_KEY, value: id })
    set((state) => {
      const others = state.registeredVaults.filter((v) => v.id !== id)
      return {
        registeredVaults: [updated, ...others],
        activeVaultId: id,
      }
    })
  },

  async removeVault(id) {
    // Order matters for crash-safety. Every piece of *dependent* per-vault
    // state is deleted FIRST; the `vaults` metadata row + active-id
    // preference (owned directly by this store) come LAST. If the process
    // dies mid-removal the metadata row still exists, so the vault stays
    // registered and a retry re-runs cleanup — strictly better than
    // orphaned rows with no vault left to trigger their deletion. A boot
    // sweep (`pruneOrphanedVaultData`) backstops any older orphan.

    // Each registered hook owns both its in-memory state and any Dexie
    // rows it persists. Hooks run in parallel and isolate their own
    // failures, so one misbehaving subsystem cannot leave a vault
    // half-removed.
    await runVaultDeletionHooks(id)

    // FSAPI handle persists in idb-keyval (separate store from Dexie).
    try {
      await deleteHandle(id)
    } catch {
      /* non-fatal — orphan handle gets cleaned up by autoRestore later */
    }

    // Adapter eviction. `dispose()` revokes any cached blob: URLs the
    // adapter handed out for image/video/audio embeds so the underlying
    // File objects can be garbage-collected. Adapters without resources
    // (sample / future Tauri) implement dispose as a no-op or omit it.
    const evicted = adapters.get(id)
    if (evicted?.dispose) {
      try {
        evicted.dispose()
      } catch {
        /* dispose failure shouldn't block removal */
      }
    }
    adapters.delete(id)

    // Lazy / heavy in-memory caches without a natural store home —
    // file-tree listings, tag index, walked files, full-text index,
    // graph, wikilink hover preview. Awaited so removal only resolves
    // once the derived caches are actually dropped.
    await invalidateVaultCachesLazy(id)

    // Metadata last — see the ordering note above.
    await db.vaults.delete(id)

    // When the active vault is the one being removed, promote the next
    // most-recently-opened survivor instead of dropping the user back to
    // the picker. `registeredVaults` is kept most-recent-first.
    const wasActive = get().activeVaultId === id
    const survivors = get().registeredVaults.filter((v) => v.id !== id)
    const nextActiveId: VaultId | null = wasActive
      ? (survivors[0]?.id ?? null)
      : get().activeVaultId
    if (wasActive) {
      if (nextActiveId) {
        await db.preferences.put({
          key: ACTIVE_VAULT_ID_PREF_KEY,
          value: nextActiveId,
        })
      } else {
        await db.preferences.delete(ACTIVE_VAULT_ID_PREF_KEY)
      }
    }

    set((state) => ({
      registeredVaults: state.registeredVaults.filter((v) => v.id !== id),
      activeVaultId: nextActiveId,
      contentRevisionByVault: Object.fromEntries(
        Object.entries(state.contentRevisionByVault).filter(
          ([vaultId]) => vaultId !== id,
        ),
      ),
    }))
  },

  async refreshVaultContent(id) {
    // External-change refresh: drop cached blob URLs so media replaced on
    // disk outside SwirlRead re-fetches fresh bytes (the per-file blob cache
    // is otherwise only evicted on internal writeText).
    adapters.get(id)?.clearBlobURLCache?.()
    invalidateBacklinks(id)
    await invalidateVaultCachesLazy(id)
    set((state) => ({
      contentRevisionByVault: {
        ...state.contentRevisionByVault,
        [id]: (state.contentRevisionByVault[id] ?? 0) + 1,
      },
    }))
  },

  attachAdapter(adapter) {
    adapters.set(adapter.id, adapter)
    set((s) => ({ adapterRevision: s.adapterRevision + 1 }))
  },
}))

/* ─── selectors / accessors that don't need to be reactive ─────────── */

/** Get the live adapter for a registered vault, or `null` if not loaded. */
export function getAdapter(id: VaultId): VaultFileSystem | null {
  return adapters.get(id) ?? null
}

/** Get the currently active adapter, or `null` if none / not loaded. */
export function getActiveAdapter(): VaultFileSystem | null {
  const id = useVaultStore.getState().activeVaultId
  return id ? (adapters.get(id) ?? null) : null
}

/** Test-only: clear in-memory adapters. Does NOT touch Dexie. */
export function __resetAdaptersForTests(): void {
  adapters.clear()
}
