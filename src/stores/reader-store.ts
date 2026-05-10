/**
 * Reader store — per-vault reading state.
 *
 * M4.7 introduced recent files. M2.7 adds scroll-position memory. The store
 * keeps both kinds of state on the same hydration lifecycle so a single
 * `init()` call at startup populates everything the reading shell needs.
 */

import { create } from 'zustand'
import { db } from '@/core/persistence/db'
import { normalizePath } from '@/core/vault'
import type { VaultId, VaultPath } from '@/core/vault'
import { registerVaultDeletionHook } from './vault-lifecycle'

export const MAX_RECENT_FILES_PER_VAULT = 20

/**
 * Cap stored scroll positions per vault. Vaults can have thousands of files;
 * unbounded growth would bloat IndexedDB on long-lived sessions. 500 keeps
 * the working set comfortably ahead of any realistic per-session reading
 * trail while still bounding storage to a few KB.
 */
export const MAX_SCROLL_POSITIONS_PER_VAULT = 500

export interface RecentFile {
  vaultId: VaultId
  path: VaultPath
  openedAt: Date
}

export interface ScrollPosition {
  vaultId: VaultId
  path: VaultPath
  scrollY: number
  updatedAt: Date
}

interface ReaderStoreState {
  recentByVault: Record<VaultId, RecentFile[]>
  scrollByVault: Record<VaultId, Record<VaultPath, ScrollPosition>>
  /** True after `init()` has loaded recent files + scroll positions from Dexie. */
  ready: boolean
}

interface ReaderStoreActions {
  init: () => Promise<void>
  markRecentFile: (vaultId: VaultId, path: VaultPath) => Promise<void>
  clearRecentFiles: (vaultId: VaultId) => Promise<void>
  recordScrollPosition: (
    vaultId: VaultId,
    path: VaultPath,
    scrollY: number,
  ) => Promise<void>
  clearScrollPositions: (vaultId: VaultId) => Promise<void>
  /**
   * Drop in-memory per-vault state (recents + scroll positions) without
   * touching IndexedDB. Called by `useVaultStore.removeVault` after the
   * Dexie rows have already been deleted in bulk — this just keeps the
   * in-memory map honest. Synchronous, no-op if vault wasn't tracked.
   */
  forgetVault: (vaultId: VaultId) => void
}

export type ReaderStore = ReaderStoreState & ReaderStoreActions

export const useReaderStore = create<ReaderStore>((set, get) => ({
  recentByVault: {},
  scrollByVault: {},
  ready: false,

  async init() {
    if (get().ready) return
    const [recentRows, scrollRows] = await Promise.all([
      db.recentFiles.toArray(),
      db.scrollPositions.toArray(),
    ])
    set({
      recentByVault: groupRows(recentRows),
      scrollByVault: groupScrollRows(scrollRows),
      ready: true,
    })
  },

  async markRecentFile(vaultId, path) {
    const normalized = normalizePath(path)
    if (normalized === '') return

    const row = {
      id: recentFileId(vaultId, normalized),
      vaultId,
      path: normalized,
      openedAtMs: Date.now(),
    }

    await db.recentFiles.put(row)

    const rows = await db.recentFiles.where('vaultId').equals(vaultId).toArray()
    const sorted = sortRows(rows, normalized)
    const keep = sorted.slice(0, MAX_RECENT_FILES_PER_VAULT)
    const stale = sorted.slice(MAX_RECENT_FILES_PER_VAULT)
    if (stale.length > 0) {
      await db.recentFiles.bulkDelete(stale.map((item) => item.id))
    }

    set((state) => ({
      recentByVault: {
        ...state.recentByVault,
        [vaultId]: keep.map(rowToRecentFile),
      },
    }))
  },

  async clearRecentFiles(vaultId) {
    const rows = await db.recentFiles.where('vaultId').equals(vaultId).toArray()
    if (rows.length > 0) {
      await db.recentFiles.bulkDelete(rows.map((row) => row.id))
    }
    set((state) => {
      const next = { ...state.recentByVault }
      delete next[vaultId]
      return { recentByVault: next }
    })
  },

  async recordScrollPosition(vaultId, path, scrollY) {
    const normalized = normalizePath(path)
    if (normalized === '') return
    const safeScrollY = Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0

    // Treat positions at the very top as "no memory" — saves a row, and
    // matches the user's mental model: opening a fresh doc shouldn't
    // remember "you scrolled to 0" in a way that overrides nothing.
    if (safeScrollY === 0) {
      const current = get().scrollByVault[vaultId]?.[normalized]
      if (!current) return
      await db.scrollPositions.delete(scrollPositionId(vaultId, normalized))
      set((state) => {
        const vaultMap = { ...(state.scrollByVault[vaultId] ?? {}) }
        delete vaultMap[normalized]
        return {
          scrollByVault: { ...state.scrollByVault, [vaultId]: vaultMap },
        }
      })
      return
    }

    const row = {
      id: scrollPositionId(vaultId, normalized),
      vaultId,
      path: normalized,
      scrollY: safeScrollY,
      updatedAtMs: Date.now(),
    }
    await db.scrollPositions.put(row)

    // Cheap prune: if we're over the cap for this vault, drop oldest rows.
    const rowsForVault = await db.scrollPositions
      .where('vaultId')
      .equals(vaultId)
      .toArray()
    let prunedPaths: string[] = []
    if (rowsForVault.length > MAX_SCROLL_POSITIONS_PER_VAULT) {
      const oldest = rowsForVault
        .sort((a, b) => a.updatedAtMs - b.updatedAtMs)
        .slice(0, rowsForVault.length - MAX_SCROLL_POSITIONS_PER_VAULT)
      await db.scrollPositions.bulkDelete(oldest.map((entry) => entry.id))
      prunedPaths = oldest.map((entry) => entry.path)
    }

    set((state) => {
      const existing = state.scrollByVault[vaultId] ?? {}
      const next: Record<VaultPath, ScrollPosition> = { ...existing }
      for (const path of prunedPaths) delete next[path]
      next[normalized] = {
        vaultId,
        path: normalized,
        scrollY: safeScrollY,
        updatedAt: new Date(row.updatedAtMs),
      }
      return {
        scrollByVault: { ...state.scrollByVault, [vaultId]: next },
      }
    })
  },

  async clearScrollPositions(vaultId) {
    const rows = await db.scrollPositions
      .where('vaultId')
      .equals(vaultId)
      .toArray()
    if (rows.length > 0) {
      await db.scrollPositions.bulkDelete(rows.map((row) => row.id))
    }
    set((state) => {
      const next = { ...state.scrollByVault }
      delete next[vaultId]
      return { scrollByVault: next }
    })
  },

  forgetVault(vaultId) {
    set((state) => {
      const nextRecents = { ...state.recentByVault }
      const nextScrolls = { ...state.scrollByVault }
      delete nextRecents[vaultId]
      delete nextScrolls[vaultId]
      return {
        recentByVault: nextRecents,
        scrollByVault: nextScrolls,
      }
    })
    // Persisted rows are cleared via the deletion hook below — keeping
    // both halves in lockstep means a single forgetVault() leaves no
    // orphan recents or scroll positions in Dexie.
    void Promise.all([
      db.recentFiles
        .where('vaultId')
        .equals(vaultId)
        .delete()
        .catch(() => 0),
      db.scrollPositions
        .where('vaultId')
        .equals(vaultId)
        .delete()
        .catch(() => 0),
    ])
  },
}))

// Register at module load so vault-store doesn't have to know which
// stores own per-vault state. Idempotent — calling forgetVault for a
// vault id that's already gone is a no-op.
registerVaultDeletionHook((vaultId) => {
  useReaderStore.getState().forgetVault(vaultId)
})

export function getRecentFilesForVault(vaultId: VaultId): RecentFile[] {
  return useReaderStore.getState().recentByVault[vaultId] ?? []
}

export function getScrollPosition(
  vaultId: VaultId,
  path: VaultPath,
): ScrollPosition | undefined {
  const normalized = normalizePath(path)
  return useReaderStore.getState().scrollByVault[vaultId]?.[normalized]
}

function recentFileId(vaultId: VaultId, path: VaultPath): string {
  return JSON.stringify([vaultId, path])
}

function scrollPositionId(vaultId: VaultId, path: VaultPath): string {
  return JSON.stringify([vaultId, path])
}

function groupScrollRows(
  rows: {
    vaultId: string
    path: string
    scrollY: number
    updatedAtMs: number
  }[],
): Record<VaultId, Record<VaultPath, ScrollPosition>> {
  const grouped: Record<VaultId, Record<VaultPath, ScrollPosition>> = {}
  for (const row of rows) {
    const bucket = grouped[row.vaultId] ?? {}
    bucket[row.path] = {
      vaultId: row.vaultId,
      path: row.path,
      scrollY: row.scrollY,
      updatedAt: new Date(row.updatedAtMs),
    }
    grouped[row.vaultId] = bucket
  }
  return grouped
}

function groupRows(
  rows: {
    vaultId: string
    path: string
    openedAtMs: number
  }[],
): Record<VaultId, RecentFile[]> {
  const grouped: Record<VaultId, typeof rows> = {}
  for (const row of rows) {
    const bucket = grouped[row.vaultId] ?? []
    bucket.push(row)
    grouped[row.vaultId] = bucket
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([vaultId, vaultRows]) => [
      vaultId,
      sortRows(vaultRows)
        .slice(0, MAX_RECENT_FILES_PER_VAULT)
        .map(rowToRecentFile),
    ]),
  )
}

function sortRows<T extends { path: string; openedAtMs: number }>(
  rows: T[],
  currentPath?: VaultPath,
): T[] {
  return [...rows].sort((a, b) => {
    if (a.openedAtMs !== b.openedAtMs) return b.openedAtMs - a.openedAtMs
    if (currentPath) {
      if (a.path === currentPath) return -1
      if (b.path === currentPath) return 1
    }
    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
  })
}

function rowToRecentFile(row: {
  vaultId: string
  path: string
  openedAtMs: number
}): RecentFile {
  return {
    vaultId: row.vaultId,
    path: row.path,
    openedAt: new Date(row.openedAtMs),
  }
}
