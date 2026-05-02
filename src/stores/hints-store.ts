/**
 * Hints store (M9.4).
 *
 * Tracks which one-shot onboarding hints the current user has already
 * seen, persisted to the Dexie `hintsSeen` table. Components ask
 * `isSeen(id)` before deciding whether to render their tooltip / toast,
 * and call `markSeen(id)` once the hint is dismissed (or auto-dismissed).
 *
 * Reset is exposed via `clearAll()` for the Settings panel "Reset hints"
 * button — handy for users who want a refresher and for testing.
 */

import { create } from 'zustand'
import { db } from '@/core/persistence/db'

interface HintsStoreState {
  seen: Set<string>
  ready: boolean
}

interface HintsStoreActions {
  init: () => Promise<void>
  isSeen: (id: string) => boolean
  markSeen: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

export type HintsStore = HintsStoreState & HintsStoreActions

export const useHintsStore = create<HintsStore>((set, get) => ({
  seen: new Set<string>(),
  ready: false,

  async init() {
    if (get().ready) return
    const rows = await db.hintsSeen.toArray()
    set({
      seen: new Set(rows.map((r) => r.id)),
      ready: true,
    })
  },

  isSeen(id) {
    return get().seen.has(id)
  },

  async markSeen(id) {
    if (get().seen.has(id)) return
    await db.hintsSeen.put({ id, seenAtMs: Date.now() })
    set((state) => {
      const next = new Set(state.seen)
      next.add(id)
      return { seen: next }
    })
  },

  async clearAll() {
    await db.hintsSeen.clear()
    set({ seen: new Set<string>() })
  },
}))
