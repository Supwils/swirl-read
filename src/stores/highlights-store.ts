/**
 * Highlights store — per-vault local text highlights & annotations.
 *
 * Local-first: highlights live only in this browser's IndexedDB and NEVER
 * upload. Keyed in memory by `${vaultId}::${path}` so each document's set
 * loads and re-renders independently.
 *
 * Persistence: one row per highlight in the Dexie `highlights` table (v11).
 * `init()` bulk-loads at startup; every CRUD mutation writes through and
 * survives a re-init. Vault deletion clears both halves through the
 * standard `vault-lifecycle` registry.
 *
 * Write-gating: persisting mutators bail when the vault is no longer
 * registered, so a late async action can't re-insert an orphan row that
 * `forgetVault` has no second chance to clean — mirrors panes-store.
 */

import { create } from 'zustand'
import { db, type HighlightRow } from '@/core/persistence/db'
import { normalizePath } from '@/core/vault'
import type { VaultId, VaultPath } from '@/core/vault'
import type { Anchor, Highlight, HighlightColor } from '@/core/highlights/types'
import { isHighlightColor } from '@/core/highlights/types'
import { registerVaultDeletionHook } from './vault-lifecycle'
import { useVaultStore } from './vault-store'

/** Composite in-memory key — one bucket of highlights per document. */
export function docKey(vaultId: VaultId, path: VaultPath): string {
  return `${vaultId}::${normalizePath(path)}`
}

/**
 * True while `vaultId` is a registered vault. Persisting mutators gate on
 * this so a removal-race write can't orphan a row.
 */
function vaultIsRegistered(vaultId: VaultId): boolean {
  return useVaultStore.getState().registeredVaults.some((v) => v.id === vaultId)
}

interface HighlightsStoreState {
  /** Keyed by `docKey(vaultId, path)`. */
  byDoc: Record<string, Highlight[]>
  ready: boolean
}

interface HighlightsStoreActions {
  init: () => Promise<void>
  /** Read the highlights for a document (empty array when none). Pure. */
  getForDoc: (vaultId: VaultId, path: VaultPath) => Highlight[]
  /** Create a highlight from a freshly captured anchor. Returns the new
   *  highlight (or null when the vault is unregistered). */
  add: (
    vaultId: VaultId,
    path: VaultPath,
    anchor: Anchor,
    color: HighlightColor,
    note?: string,
  ) => Promise<Highlight | null>
  /** Change a highlight's colour. No-op when the id is unknown. */
  setColor: (id: string, color: HighlightColor) => Promise<void>
  /** Set a highlight's note (empty string clears it). */
  setNote: (id: string, note: string) => Promise<void>
  /** Remove a highlight by id. */
  remove: (id: string) => Promise<void>
  /** Drop in-memory + Dexie state for a vault. Idempotent. */
  forgetVault: (vaultId: VaultId) => void
}

export type HighlightsStore = HighlightsStoreState & HighlightsStoreActions

function rowToHighlight(row: HighlightRow): Highlight {
  const color: HighlightColor = isHighlightColor(row.color)
    ? row.color
    : 'yellow'
  return {
    id: row.id,
    vaultId: row.vaultId,
    path: row.path,
    color,
    note: row.note,
    anchor: { ...row.anchor },
    // `status` is recomputed on every decorate pass; default to anchored.
    status: 'anchored',
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
  }
}

function highlightToRow(hl: Highlight): HighlightRow {
  return {
    id: hl.id,
    vaultId: hl.vaultId,
    path: hl.path,
    color: hl.color,
    note: hl.note,
    anchor: { ...hl.anchor },
    createdAtMs: hl.createdAtMs,
    updatedAtMs: hl.updatedAtMs,
  }
}

/** Sort by creation time so the list reads in the order things were
 *  highlighted; stable within a single document. */
function sortHighlights(items: Highlight[]): Highlight[] {
  return [...items].sort((a, b) => a.createdAtMs - b.createdAtMs)
}

function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `hl-${String(Date.now())}-${String(Math.random()).slice(2)}`
}

/** Find a highlight + its doc key across the whole in-memory map. */
function locate(
  byDoc: Record<string, Highlight[]>,
  id: string,
): { key: string; highlight: Highlight } | null {
  for (const [key, items] of Object.entries(byDoc)) {
    const highlight = items.find((h) => h.id === id)
    if (highlight) return { key, highlight }
  }
  return null
}

export const useHighlightsStore = create<HighlightsStore>((set, get) => ({
  byDoc: {},
  ready: false,

  async init() {
    if (get().ready) return
    const rows = await db.highlights.toArray()
    const next: Record<string, Highlight[]> = {}
    for (const row of rows) {
      const hl = rowToHighlight(row)
      const key = docKey(hl.vaultId, hl.path)
      const bucket = next[key] ?? []
      bucket.push(hl)
      next[key] = bucket
    }
    for (const key of Object.keys(next)) {
      next[key] = sortHighlights(next[key]!)
    }
    set({ byDoc: next, ready: true })
  },

  getForDoc(vaultId, path) {
    return get().byDoc[docKey(vaultId, path)] ?? []
  },

  async add(vaultId, path, anchor, color, note = '') {
    if (!vaultIsRegistered(vaultId)) return null
    const normalizedPath = normalizePath(path)
    const now = Date.now()
    const hl: Highlight = {
      id: newId(),
      vaultId,
      path: normalizedPath,
      color,
      note,
      anchor: { ...anchor },
      status: 'anchored',
      createdAtMs: now,
      updatedAtMs: now,
    }
    const key = docKey(vaultId, normalizedPath)
    set((state) => ({
      byDoc: {
        ...state.byDoc,
        [key]: sortHighlights([...(state.byDoc[key] ?? []), hl]),
      },
    }))
    await db.highlights.put(highlightToRow(hl))
    return hl
  },

  async setColor(id, color) {
    const found = locate(get().byDoc, id)
    if (!found) return
    const updated: Highlight = {
      ...found.highlight,
      color,
      updatedAtMs: Date.now(),
    }
    set((state) => ({
      byDoc: {
        ...state.byDoc,
        [found.key]: (state.byDoc[found.key] ?? []).map((h) =>
          h.id === id ? updated : h,
        ),
      },
    }))
    await db.highlights.put(highlightToRow(updated))
  },

  async setNote(id, note) {
    const found = locate(get().byDoc, id)
    if (!found) return
    const updated: Highlight = {
      ...found.highlight,
      note,
      updatedAtMs: Date.now(),
    }
    set((state) => ({
      byDoc: {
        ...state.byDoc,
        [found.key]: (state.byDoc[found.key] ?? []).map((h) =>
          h.id === id ? updated : h,
        ),
      },
    }))
    await db.highlights.put(highlightToRow(updated))
  },

  async remove(id) {
    const found = locate(get().byDoc, id)
    if (!found) return
    set((state) => {
      const bucket = (state.byDoc[found.key] ?? []).filter((h) => h.id !== id)
      const nextByDoc = { ...state.byDoc }
      if (bucket.length === 0) {
        delete nextByDoc[found.key]
      } else {
        nextByDoc[found.key] = bucket
      }
      return { byDoc: nextByDoc }
    })
    await db.highlights.delete(id)
  },

  forgetVault(vaultId) {
    set((state) => {
      const nextByDoc: Record<string, Highlight[]> = {}
      const prefix = `${vaultId}::`
      for (const [key, items] of Object.entries(state.byDoc)) {
        if (!key.startsWith(prefix)) nextByDoc[key] = items
      }
      return { byDoc: nextByDoc }
    })
    void db.highlights
      .where('vaultId')
      .equals(vaultId)
      .delete()
      .catch(() => 0)
  },
}))

// Register at module load so vault-store doesn't need to know about us.
registerVaultDeletionHook((vaultId) => {
  useHighlightsStore.getState().forgetVault(vaultId)
})
