/**
 * Panes store — per-vault Workspace pane state.
 *
 * Single-doc-per-pane model (PR B v0.1):
 *   - Each vault tracks 1 or 2 panes; each pane has a `currentPath` and an
 *     id (`pane-1` | `pane-2`).
 *   - `viewMode` is derived: `dual` iff `panes.length === 2`.
 *   - The window's tab strip (existing `tabs-store`) remains shared; tabs
 *     are NOT pane-scoped in this iteration. Multi-tabs per pane can land
 *     later behind a Dexie v11 if real usage demands it.
 *
 * Persisted as one row per vault in the Dexie `panes` table (v10 schema).
 * `forgetVault` is wired through the standard vault-lifecycle registry so
 * vault removal cleans up both halves in a single fan-out.
 */

import { create } from 'zustand'
import { db, type PaneStateRow } from '@/core/persistence/db'
import { normalizePath } from '@/core/vault'
import type { VaultId, VaultPath } from '@/core/vault'
import { registerVaultDeletionHook } from './vault-lifecycle'
import { useVaultStore } from './vault-store'

/**
 * True while `vaultId` is still a registered vault. Persisting mutators
 * gate on this so a late async action (e.g. an "Open right" context-menu
 * click that resolves *after* the vault was removed) can't re-insert an
 * orphan `panes` row that `forgetVault` has no second chance to clean.
 * In every legitimate flow the vault is registered before a pane mutator
 * runs, so this is a no-op except during the removal race.
 */
function vaultIsRegistered(vaultId: VaultId): boolean {
  return useVaultStore.getState().registeredVaults.some((v) => v.id === vaultId)
}

export type PaneId = 'pane-1' | 'pane-2'
export const PANE_1: PaneId = 'pane-1'
export const PANE_2: PaneId = 'pane-2'
export type ViewMode = 'single' | 'dual'

export interface PaneState {
  id: PaneId
  currentPath: VaultPath | null
}

export interface VaultPaneState {
  panes: PaneState[]
  activePaneId: PaneId
  viewMode: ViewMode
}

interface PanesStoreState {
  panesByVault: Record<VaultId, VaultPaneState>
  ready: boolean
}

interface PanesStoreActions {
  init: () => Promise<void>
  /** Read the pane shape for a vault, creating a single-pane default if
   *  one has never been initialized. Pure read — no persistence. */
  getOrInit: (vaultId: VaultId) => VaultPaneState
  /** Set the active pane focus. No-op if the id doesn't exist. */
  setActivePane: (vaultId: VaultId, paneId: PaneId) => Promise<void>
  /** Set a pane's current document path. `null` clears it (e.g., after
   *  closing the last tab in that pane). */
  setCurrentPath: (
    vaultId: VaultId,
    paneId: PaneId,
    path: VaultPath | null,
  ) => Promise<void>
  /** Single → dual. Pane 2 inherits pane 1's current path by default so
   *  the user has somewhere to land; pass `path` to land on a different
   *  doc. No-op when already dual. */
  splitPane: (vaultId: VaultId, path?: VaultPath) => Promise<void>
  /** Dual → single (closes the given pane). When the active pane is the
   *  one being closed, focus moves to the survivor. No-op in single mode. */
  closePane: (vaultId: VaultId, paneId: PaneId) => Promise<void>
  /** Cycle focus to pane N. In single mode requesting pane 2 is a no-op. */
  focusPane: (vaultId: VaultId, paneId: PaneId) => Promise<void>
  /** Open a path in the non-active pane. Splits into dual mode if needed
   *  and focuses the destination pane. */
  openInOtherPane: (vaultId: VaultId, path: VaultPath) => Promise<void>
  /** Open a path in a *specific* pane and focus it.
   *  - Single mode + PANE_2: split into dual so pane 2 lands on `path`.
   *  - Single mode + PANE_1: set pane 1's path and keep focus on it.
   *  - Dual mode: set the target pane's path, then focus it. */
  openInPane: (
    vaultId: VaultId,
    paneId: PaneId,
    path: VaultPath,
  ) => Promise<void>
  /** Drop in-memory + Dexie state for a vault. Idempotent. */
  forgetVault: (vaultId: VaultId) => void
}

export type PanesStore = PanesStoreState & PanesStoreActions

function defaultVaultPanes(): VaultPaneState {
  return {
    panes: [{ id: PANE_1, currentPath: null }],
    activePaneId: PANE_1,
    viewMode: 'single',
  }
}

function rowToState(row: PaneStateRow): VaultPaneState {
  const panes = row.panes
    .filter((p): p is PaneState =>
      p.id === PANE_1 || p.id === PANE_2 ? true : false,
    )
    .map((p) => ({
      id: p.id,
      currentPath: p.currentPath === null ? null : normalizePath(p.currentPath),
    }))
  if (panes.length === 0) panes.push({ id: PANE_1, currentPath: null })
  const activePaneId: PaneId =
    row.activePaneId === PANE_2 && panes.some((p) => p.id === PANE_2)
      ? PANE_2
      : PANE_1
  const viewMode: ViewMode = panes.length === 2 ? 'dual' : 'single'
  return { panes, activePaneId, viewMode }
}

function stateToRow(vaultId: VaultId, state: VaultPaneState): PaneStateRow {
  return {
    vaultId,
    panes: state.panes.map((p) => ({
      id: p.id,
      currentPath: p.currentPath,
    })),
    activePaneId: state.activePaneId,
    viewMode: state.viewMode,
  }
}

async function persist(vaultId: VaultId, state: VaultPaneState): Promise<void> {
  await db.panes.put(stateToRow(vaultId, state))
}

export const usePanesStore = create<PanesStore>((set, get) => ({
  panesByVault: {},
  ready: false,

  async init() {
    if (get().ready) return
    const rows = await db.panes.toArray()
    const next: Record<VaultId, VaultPaneState> = {}
    for (const row of rows) {
      next[row.vaultId] = rowToState(row)
    }
    set({ panesByVault: next, ready: true })
  },

  getOrInit(vaultId) {
    const current = get().panesByVault[vaultId]
    if (current) return current
    // Seed an in-memory single-pane default on first access so repeat reads
    // are stable, but NEVER persist — a Dexie row is written only by a real
    // mutation (the first `setCurrentPath` when a doc opens). Merely viewing
    // a vault no longer churns storage or seeds a future orphan row. The
    // seed is skipped for an unregistered vault so a post-removal read can't
    // leave a stale entry behind.
    const fresh = defaultVaultPanes()
    if (vaultIsRegistered(vaultId)) {
      set((state) => ({
        panesByVault: { ...state.panesByVault, [vaultId]: fresh },
      }))
    }
    return fresh
  },

  async setActivePane(vaultId, paneId) {
    if (!vaultIsRegistered(vaultId)) return
    const current = get().panesByVault[vaultId] ?? defaultVaultPanes()
    if (!current.panes.some((p) => p.id === paneId)) return
    if (current.activePaneId === paneId) return
    const next: VaultPaneState = { ...current, activePaneId: paneId }
    set((state) => ({
      panesByVault: { ...state.panesByVault, [vaultId]: next },
    }))
    await persist(vaultId, next)
  },

  async setCurrentPath(vaultId, paneId, path) {
    if (!vaultIsRegistered(vaultId)) return
    const current = get().panesByVault[vaultId] ?? defaultVaultPanes()
    const normalized = path === null ? null : normalizePath(path)
    const updated = current.panes.map((p) =>
      p.id === paneId ? { ...p, currentPath: normalized } : p,
    )
    const next: VaultPaneState = { ...current, panes: updated }
    set((state) => ({
      panesByVault: { ...state.panesByVault, [vaultId]: next },
    }))
    await persist(vaultId, next)
  },

  async splitPane(vaultId, path) {
    if (!vaultIsRegistered(vaultId)) return
    const current = get().panesByVault[vaultId] ?? defaultVaultPanes()
    if (current.viewMode === 'dual') return
    const pane1 = current.panes[0] ?? { id: PANE_1, currentPath: null }
    const fallback = path ?? pane1.currentPath ?? null
    const next: VaultPaneState = {
      panes: [
        pane1,
        {
          id: PANE_2,
          currentPath: fallback === null ? null : normalizePath(fallback),
        },
      ],
      activePaneId: PANE_2,
      viewMode: 'dual',
    }
    set((state) => ({
      panesByVault: { ...state.panesByVault, [vaultId]: next },
    }))
    await persist(vaultId, next)
  },

  async closePane(vaultId, paneId) {
    if (!vaultIsRegistered(vaultId)) return
    const current = get().panesByVault[vaultId] ?? defaultVaultPanes()
    if (current.viewMode === 'single') return
    const survivors = current.panes.filter((p) => p.id !== paneId)
    if (survivors.length === 0) return
    // Survivor always gets renamed to pane-1 so single-mode invariants
    // hold (`pane-1` is the only id that survives a return to single).
    const survivor = survivors[0]!
    const next: VaultPaneState = {
      panes: [{ id: PANE_1, currentPath: survivor.currentPath }],
      activePaneId: PANE_1,
      viewMode: 'single',
    }
    set((state) => ({
      panesByVault: { ...state.panesByVault, [vaultId]: next },
    }))
    await persist(vaultId, next)
  },

  async focusPane(vaultId, paneId) {
    const current = get().panesByVault[vaultId] ?? defaultVaultPanes()
    if (current.viewMode === 'single' && paneId === PANE_2) return
    await get().setActivePane(vaultId, paneId)
  },

  async openInOtherPane(vaultId, path) {
    const current = get().panesByVault[vaultId] ?? defaultVaultPanes()
    if (current.viewMode === 'single') {
      await get().splitPane(vaultId, path)
      return
    }
    const otherId: PaneId = current.activePaneId === PANE_1 ? PANE_2 : PANE_1
    await get().setCurrentPath(vaultId, otherId, path)
    await get().setActivePane(vaultId, otherId)
  },

  async openInPane(vaultId, paneId, path) {
    const current = get().panesByVault[vaultId] ?? defaultVaultPanes()
    if (current.viewMode === 'single' && paneId === PANE_2) {
      // Pane 2 doesn't exist yet — split so it lands on `path`. splitPane
      // already focuses PANE_2.
      await get().splitPane(vaultId, path)
      return
    }
    await get().setCurrentPath(vaultId, paneId, path)
    await get().setActivePane(vaultId, paneId)
  },

  forgetVault(vaultId) {
    set((state) => {
      const next = { ...state.panesByVault }
      delete next[vaultId]
      return { panesByVault: next }
    })
    void db.panes.delete(vaultId).catch(() => 0)
  },
}))

registerVaultDeletionHook((vaultId) => {
  usePanesStore.getState().forgetVault(vaultId)
})

export function getActivePane(vaultId: VaultId): PaneState | null {
  const state = usePanesStore.getState().panesByVault[vaultId]
  if (!state) return null
  return state.panes.find((p) => p.id === state.activePaneId) ?? null
}
