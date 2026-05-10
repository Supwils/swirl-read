/**
 * Sidebar-visibility store.
 *
 * Tracks per-vault paths the user has chosen to hide from the file
 * tree (right-click → "Hide from sidebar"). Hiding is purely a viewing
 * preference — the underlying `.md` files never move, never get deleted,
 * and stay reachable through ⌘K, wikilinks, recents, the URL bar.
 *
 * Persistence: a single `preferences` row keyed `sidebar:hiddenByVault`
 * stores `Record<vaultId, vaultPath[]>`. Compact, no schema bump, and
 * trivially debuggable by inspecting Dexie.
 *
 * Hiding semantics:
 *   - A path is hidden if it's in the set, OR if any ancestor directory
 *     is in the set. So hiding `notes/junk` also hides
 *     `notes/junk/draft.md` without us tracking the descendants.
 *   - Sections-nav and file-tree both consult `isHidden(path)` before
 *     rendering, so a hidden directory disappears from every sidebar
 *     surface in one call.
 */

import { create } from 'zustand'
import { db } from '@/core/persistence/db'
import type { VaultId, VaultPath } from '@/core/vault'

const STORAGE_KEY = 'sidebar:hiddenByVault'

interface SidebarVisibilityState {
  hiddenByVault: Record<VaultId, Set<VaultPath>>
  ready: boolean
}

interface SidebarVisibilityActions {
  init: () => Promise<void>
  /** Return `true` if `path` (or any of its ancestor directories) has
   *  been hidden in the given vault. */
  isHidden: (vaultId: VaultId, path: VaultPath) => boolean
  /** Hide a single path. Children are not enumerated — they're masked
   *  automatically by the ancestor check in {@link isHidden}. */
  hide: (vaultId: VaultId, path: VaultPath) => Promise<void>
  /** Reveal a single path again. */
  unhide: (vaultId: VaultId, path: VaultPath) => Promise<void>
  /** Reveal every hidden path for a vault. Used by the "Show all"
   *  toolbar button. */
  reset: (vaultId: VaultId) => Promise<void>
  /** Cardinality helper for the toolbar — show the button only when the
   *  user actually has something hidden in this vault. */
  hiddenCount: (vaultId: VaultId) => number
  /** Drop all state for a vault. Wired into vault removal so re-adding
   *  the same id later starts from a clean slate. */
  forgetVault: (vaultId: VaultId) => Promise<void>
}

export type SidebarVisibilityStore = SidebarVisibilityState &
  SidebarVisibilityActions

async function persist(
  hiddenByVault: Record<VaultId, Set<VaultPath>>,
): Promise<void> {
  const serialised: Record<VaultId, VaultPath[]> = {}
  for (const [vaultId, paths] of Object.entries(hiddenByVault)) {
    if (paths.size === 0) continue
    serialised[vaultId] = Array.from(paths).sort()
  }
  await db.preferences.put({ key: STORAGE_KEY, value: serialised })
}

export const useSidebarVisibilityStore = create<SidebarVisibilityStore>(
  (set, get) => ({
    hiddenByVault: {},
    ready: false,

    async init() {
      if (get().ready) return
      const row = await db.preferences.get(STORAGE_KEY)
      const stored = row?.value
      const next: Record<VaultId, Set<VaultPath>> = {}
      if (
        typeof stored === 'object' &&
        stored !== null &&
        !Array.isArray(stored)
      ) {
        for (const [vaultId, paths] of Object.entries(
          stored as Record<string, unknown>,
        )) {
          if (Array.isArray(paths)) {
            next[vaultId] = new Set(paths.filter((p) => typeof p === 'string'))
          }
        }
      }
      set({ hiddenByVault: next, ready: true })
    },

    isHidden(vaultId, path) {
      const set = get().hiddenByVault[vaultId]
      if (!set || set.size === 0) return false
      if (set.has(path)) return true
      // Ancestor check: hidden `notes/junk` should mask `notes/junk/x.md`.
      for (const hidden of set) {
        if (path.startsWith(hidden + '/')) return true
      }
      return false
    },

    async hide(vaultId, path) {
      const current = get().hiddenByVault[vaultId] ?? new Set<VaultPath>()
      if (current.has(path)) return
      const next = new Set(current)
      next.add(path)
      const merged = { ...get().hiddenByVault, [vaultId]: next }
      set({ hiddenByVault: merged })
      await persist(merged)
    },

    async unhide(vaultId, path) {
      const current = get().hiddenByVault[vaultId]
      if (!current?.has(path)) return
      const next = new Set(current)
      next.delete(path)
      const merged = { ...get().hiddenByVault, [vaultId]: next }
      set({ hiddenByVault: merged })
      await persist(merged)
    },

    async reset(vaultId) {
      const current = get().hiddenByVault[vaultId]
      if (!current || current.size === 0) return
      const merged = { ...get().hiddenByVault, [vaultId]: new Set<VaultPath>() }
      set({ hiddenByVault: merged })
      await persist(merged)
    },

    hiddenCount(vaultId) {
      return get().hiddenByVault[vaultId]?.size ?? 0
    },

    async forgetVault(vaultId) {
      if (!(vaultId in get().hiddenByVault)) return
      const next = { ...get().hiddenByVault }
      delete next[vaultId]
      set({ hiddenByVault: next })
      await persist(next)
    },
  }),
)
