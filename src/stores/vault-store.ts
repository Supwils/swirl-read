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
import { db, metaToStored, storedToMeta } from '@/core/persistence/db'
import { deleteHandle } from '@/core/vault'
import { invalidateBacklinks } from '@/core/navigation/backlinks'
import { useEditorStore } from '@/stores/editor-store'
import { useReaderStore } from '@/stores/reader-store'
import { useTabsStore } from '@/stores/tabs-store'
import type { VaultFileSystem, VaultId, VaultMeta } from '@/core/vault'

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
    import('@/ui/file-tree/vault-graph')
      .then((m) => {
        m.invalidateVaultGraph(id)
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
    // Persisted state — fan out across every Dexie table that holds
    // per-vault rows so re-registering the same folder later doesn't
    // resurrect stale recents / scroll memory / backlinks. Each table
    // gets its own try/catch so a single failure (permission revoked
    // mid-cleanup, schema mismatch on an old client) doesn't block the
    // vault removal itself.
    await db.vaults.delete(id)
    if (get().activeVaultId === id) {
      await db.preferences.delete(ACTIVE_VAULT_ID_PREF_KEY)
    }
    await Promise.all([
      db.recentFiles
        .where('vaultId')
        .equals(id)
        .delete()
        .catch(() => 0),
      db.scrollPositions
        .where('vaultId')
        .equals(id)
        .delete()
        .catch(() => 0),
      db.backlinks
        .where('vaultId')
        .equals(id)
        .delete()
        .catch(() => 0),
      db.openTabs
        .where('vaultId')
        .equals(id)
        .delete()
        .catch(() => 0),
    ])
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

    // In-memory caches that key by vault id. Drop them so a later
    // re-registration of the same id starts from a clean slate; the
    // Dexie-backed sources have already been cleared above.
    invalidateBacklinks(id)
    useReaderStore.getState().forgetVault(id)
    useTabsStore.getState().forgetVault(id)
    useEditorStore.getState().forgetVault(id)
    // Heavy / lazy caches: don't block removal on these resolving.
    void invalidateVaultCachesLazy(id)

    set((state) => ({
      registeredVaults: state.registeredVaults.filter((v) => v.id !== id),
      activeVaultId: state.activeVaultId === id ? null : state.activeVaultId,
      contentRevisionByVault: Object.fromEntries(
        Object.entries(state.contentRevisionByVault).filter(
          ([vaultId]) => vaultId !== id,
        ),
      ),
    }))
  },

  async refreshVaultContent(id) {
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
