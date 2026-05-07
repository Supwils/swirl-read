/**
 * Tabs store — per-vault open document tabs.
 *
 * Tabs follow the VS Code preview-then-pin convention. A single-click in
 * the file tree calls {@link useTabsStore.openOrFocus}; if a preview tab
 * exists, the new path replaces it (preventing tab proliferation while
 * scanning a vault). A modifier-click pins, as does a tab double-click,
 * giving the user explicit control over which tabs survive.
 *
 * The URL is the source of truth for which tab is *active*: this store
 * does not hold an `activeTab` field. Callers consume the tabs array and
 * compare against `useLocation().pathname` to derive the active state.
 *
 * Persistence: per-vault rows in the Dexie `openTabs` table. Hydrated by
 * `init()` at app startup, kept in sync on every mutation. Cleared as
 * part of the `useVaultStore.removeVault` fan-out.
 *
 * Concurrency note: persistence is fire-and-forget from the action's
 * perspective. We write to Dexie inside `void` blocks so the UI never
 * waits for IDB on a tab switch. The only operation that blocks on IDB
 * is `init()`, which already runs at startup.
 */

import { create } from 'zustand'
import { db } from '@/core/persistence/db'
import { normalizePath } from '@/core/vault'
import type { VaultId, VaultPath } from '@/core/vault'

/** Soft cap mirrors `MAX_RECENT_FILES_PER_VAULT`. Real users top out
 *  far below this; the cap exists to prevent runaway growth from
 *  forgotten Cmd-clicks. When the cap is reached, the oldest unpinned
 *  tab is evicted to make room for the new one. */
export const MAX_TABS_PER_VAULT = 20

// A.L1 — per-vault debounce bucket for reorder persistence. Drag events
// can fire dozens of times per second; batching them into one Dexie
// transaction (200 ms trailing edge) prevents a write storm without
// affecting in-memory state, which updates synchronously on every event.
const reorderPersistTimers = new Map<VaultId, ReturnType<typeof setTimeout>>()

function scheduleReorderPersist(vaultId: VaultId, next: Tab[]): void {
  const existing = reorderPersistTimers.get(vaultId)
  if (existing !== undefined) clearTimeout(existing)
  reorderPersistTimers.set(
    vaultId,
    setTimeout(() => {
      reorderPersistTimers.delete(vaultId)
      void persistVaultTabs(vaultId, next)
    }, 200),
  )
}

/** Per-vault cap on the recently-closed stack (for Cmd+Shift+T). */
const MAX_RECENTLY_CLOSED_PER_VAULT = 10

export interface Tab {
  vaultId: VaultId
  path: VaultPath
  pinned: boolean
  openedAt: Date
}

interface TabsStoreState {
  tabsByVault: Record<VaultId, Tab[]>
  /** Ephemeral undo stack — not persisted across sessions. */
  recentlyClosedByVault: Record<VaultId, Tab[]>
  ready: boolean
  /** True after the first eviction within this page session. Used to
   *  trigger the one-time `tab-cap-hit` HintToast. Resets on removeVault. */
  tabCapHit: boolean
  /** True after the first time a preview tab gets replaced by a
   *  different document within this page session. Used to trigger the
   *  one-time `preview-tab-replaced` HintToast so users learn about
   *  preview semantics before the cap fires. */
  previewReplaced: boolean
}

interface TabsStoreActions {
  init: () => Promise<void>
  /** Open a tab if absent, or focus the existing one. When a preview tab
   *  exists and `opts.pin` is not truthy, the new path replaces the
   *  preview — so casual single-click browsing doesn't pile up tabs. */
  openOrFocus: (
    vaultId: VaultId,
    path: VaultPath,
    opts?: { pin?: boolean },
  ) => Promise<void>
  /** Close a tab by path. Pushes it onto the recently-closed stack so
   *  the user can reopen with Cmd+Shift+T. */
  closeTab: (vaultId: VaultId, path: VaultPath) => Promise<void>
  /** Promote a preview tab to pinned. Idempotent on already-pinned tabs. */
  pinTab: (vaultId: VaultId, path: VaultPath) => Promise<void>
  /** Reorder a tab from index `fromIdx` to index `toIdx` (pre-removal
   *  semantics, like Array.splice). No-op on out-of-range indices. */
  reorderTabs: (
    vaultId: VaultId,
    fromIdx: number,
    toIdx: number,
  ) => Promise<void>
  /** Reopen the most recently closed tab in the vault and return its
   *  path. Returns `null` if the recently-closed stack is empty. */
  reopenLastClosed: (vaultId: VaultId) => VaultPath | null
  /** Drop in-memory state for a vault. Called by `removeVault` fan-out
   *  after Dexie rows have already been bulk-deleted. */
  forgetVault: (vaultId: VaultId) => void
}

export type TabsStore = TabsStoreState & TabsStoreActions

interface TabRow {
  id: string
  vaultId: string
  path: string
  pinned: boolean
  order: number
  openedAtMs: number
}

function tabRowId(vaultId: VaultId, path: VaultPath): string {
  return JSON.stringify([vaultId, path])
}

function rowToTab(row: TabRow): Tab {
  return {
    vaultId: row.vaultId,
    path: row.path,
    pinned: row.pinned,
    openedAt: new Date(row.openedAtMs),
  }
}

function tabToRow(tab: Tab, order: number): TabRow {
  return {
    id: tabRowId(tab.vaultId, tab.path),
    vaultId: tab.vaultId,
    path: tab.path,
    pinned: tab.pinned,
    order,
    openedAtMs: tab.openedAt.getTime(),
  }
}

/** Replace the persisted tabs for a vault with `next`. Runs in a
 *  transaction so a partial write can never leave gaps. */
async function persistVaultTabs(vaultId: VaultId, next: Tab[]): Promise<void> {
  const rows = next.map((tab, idx) => tabToRow(tab, idx))
  await db.transaction('rw', db.openTabs, async () => {
    const existing = await db.openTabs
      .where('vaultId')
      .equals(vaultId)
      .toArray()
    const nextIds = new Set(rows.map((r) => r.id))
    const stale = existing.filter((row) => !nextIds.has(row.id))
    if (stale.length > 0) {
      await db.openTabs.bulkDelete(stale.map((row) => row.id))
    }
    if (rows.length > 0) {
      await db.openTabs.bulkPut(rows)
    }
  })
}

function groupRows(rows: TabRow[]): Record<VaultId, Tab[]> {
  const grouped: Record<VaultId, TabRow[]> = {}
  for (const row of rows) {
    const bucket = grouped[row.vaultId] ?? []
    bucket.push(row)
    grouped[row.vaultId] = bucket
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([vaultId, vaultRows]) => [
      vaultId,
      [...vaultRows]
        .sort((a, b) => a.order - b.order)
        .slice(0, MAX_TABS_PER_VAULT)
        .map(rowToTab),
    ]),
  )
}

export const useTabsStore = create<TabsStore>((set, get) => ({
  tabsByVault: {},
  recentlyClosedByVault: {},
  ready: false,
  tabCapHit: false,
  previewReplaced: false,

  async init() {
    if (get().ready) return
    const rows = (await db.openTabs.toArray()) as TabRow[]
    set({
      tabsByVault: groupRows(rows),
      ready: true,
    })
  },

  async openOrFocus(vaultId, path, opts) {
    const normalized = normalizePath(path)
    if (normalized === '') return

    const wantPin = opts?.pin === true
    const current = get().tabsByVault[vaultId] ?? []
    const existingIdx = current.findIndex((t) => t.path === normalized)

    let next: Tab[]
    if (existingIdx >= 0) {
      // Already open — promote pinned if asked, otherwise leave alone.
      const existing = current[existingIdx]!
      if (wantPin && !existing.pinned) {
        next = current.map((tab, idx) =>
          idx === existingIdx ? { ...tab, pinned: true } : tab,
        )
      } else {
        // Idempotent — no state change. Skip the persistence write too.
        return
      }
    } else {
      const previewIdx = current.findIndex((t) => !t.pinned)
      const newTab: Tab = {
        vaultId,
        path: normalized,
        pinned: wantPin,
        openedAt: new Date(),
      }
      if (!wantPin && previewIdx >= 0) {
        // Replace the existing preview tab in place.
        next = current.map((tab, idx) => (idx === previewIdx ? newTab : tab))
        if (!get().previewReplaced) set({ previewReplaced: true })
      } else {
        next = [...current, newTab]
        if (next.length > MAX_TABS_PER_VAULT) {
          // Cap reached — evict the oldest unpinned tab. If none, evict
          // the oldest pinned (rare; pinned tabs are usually intentional).
          const evictIdx = next.findIndex((tab) => !tab.pinned)
          if (evictIdx >= 0 && evictIdx < next.length - 1) {
            next.splice(evictIdx, 1)
          } else {
            next.shift()
          }
          // A.L4 — notify when the cap fires; surface a one-time hint.
          console.warn(
            `[SwirlRead] Tab cap reached for vault ${vaultId} — oldest tab evicted. Limit: ${String(MAX_TABS_PER_VAULT)}.`,
          )
          if (!get().tabCapHit) set({ tabCapHit: true })
        }
      }
    }

    set((state) => ({
      tabsByVault: { ...state.tabsByVault, [vaultId]: next },
    }))
    await persistVaultTabs(vaultId, next)
  },

  async closeTab(vaultId, path) {
    const normalized = normalizePath(path)
    const current = get().tabsByVault[vaultId] ?? []
    const idx = current.findIndex((t) => t.path === normalized)
    if (idx < 0) return

    const closed = current[idx]!
    const next = [...current.slice(0, idx), ...current.slice(idx + 1)]

    set((state) => {
      const closedStack = state.recentlyClosedByVault[vaultId] ?? []
      const nextClosed = [closed, ...closedStack].slice(
        0,
        MAX_RECENTLY_CLOSED_PER_VAULT,
      )
      return {
        tabsByVault: { ...state.tabsByVault, [vaultId]: next },
        recentlyClosedByVault: {
          ...state.recentlyClosedByVault,
          [vaultId]: nextClosed,
        },
      }
    })
    await persistVaultTabs(vaultId, next)
  },

  async pinTab(vaultId, path) {
    const normalized = normalizePath(path)
    const current = get().tabsByVault[vaultId] ?? []
    const idx = current.findIndex((t) => t.path === normalized)
    if (idx < 0) return
    if (current[idx]!.pinned) return
    const next = current.map((tab, i) =>
      i === idx ? { ...tab, pinned: true } : tab,
    )
    set((state) => ({
      tabsByVault: { ...state.tabsByVault, [vaultId]: next },
    }))
    await persistVaultTabs(vaultId, next)
  },

  reorderTabs(vaultId, fromIdx, toIdx) {
    const current = get().tabsByVault[vaultId] ?? []
    if (
      fromIdx < 0 ||
      fromIdx >= current.length ||
      toIdx < 0 ||
      toIdx >= current.length ||
      fromIdx === toIdx
    ) {
      return Promise.resolve()
    }
    const next = [...current]
    const [moved] = next.splice(fromIdx, 1)
    if (moved) {
      next.splice(toIdx, 0, moved)
    }
    set((state) => ({
      tabsByVault: { ...state.tabsByVault, [vaultId]: next },
    }))
    // A.L1 — in-memory state updated synchronously above; only the Dexie
    // write is debounced so rapid drag events don't storm IDB.
    scheduleReorderPersist(vaultId, next)
    return Promise.resolve()
  },

  reopenLastClosed(vaultId) {
    const stack = get().recentlyClosedByVault[vaultId] ?? []
    if (stack.length === 0) return null
    const [head, ...rest] = stack
    if (!head) return null
    set((state) => ({
      recentlyClosedByVault: {
        ...state.recentlyClosedByVault,
        [vaultId]: rest,
      },
    }))
    // Fire-and-forget the open. We return the path immediately so the
    // caller can navigate without waiting on IDB.
    void get().openOrFocus(vaultId, head.path, { pin: head.pinned })
    return head.path
  },

  forgetVault(vaultId) {
    set((state) => {
      const nextTabs = { ...state.tabsByVault }
      const nextClosed = { ...state.recentlyClosedByVault }
      delete nextTabs[vaultId]
      delete nextClosed[vaultId]
      return {
        tabsByVault: nextTabs,
        recentlyClosedByVault: nextClosed,
      }
    })
  },
}))

export function getTabsForVault(vaultId: VaultId): Tab[] {
  return useTabsStore.getState().tabsByVault[vaultId] ?? []
}
