/**
 * Review-store — coordinates the imperative "generate cards" intent
 * across the app.
 *
 * Multiple call sites (document header button, command palette item,
 * future file-tree multi-select) want to open the same generation
 * dialog. Threading the open state through props would be noisy and
 * forces every entry point to know where the dialog lives. Instead,
 * those callers `requestGenerate({vaultId, path})`; AppShell mounts a
 * single `<GenerateCardsDialog>` keyed off this store and dismisses on
 * its own close handler.
 *
 * Single-pending semantics: a second request while one is open replaces
 * the target — the latest call wins. That matches the expected UX:
 * clicking "Generate" twice in a row should still feel coherent.
 */

import { create } from 'zustand'
import type { VaultId, VaultPath } from '@/core/vault'

export interface GenerateIntent {
  vaultId: VaultId
  path: VaultPath
  /** When set, cards are generated from THIS content instead of reading the
   *  file at `path` (e.g. a distilled blob of the document's highlights). */
  inlineContent?: string
  /** Human label for the dialog's "Source:" line (defaults to the filename). */
  sourceLabel?: string
}

interface ReviewStoreState {
  /** Live target for the generate-cards dialog, or `null` when closed. */
  pending: GenerateIntent | null
}

interface ReviewStoreActions {
  requestGenerate: (intent: GenerateIntent) => void
  dismissGenerate: () => void
  /** Reset for tests. */
  reset: () => void
}

export type ReviewStore = ReviewStoreState & ReviewStoreActions

export const useReviewStore = create<ReviewStore>((set) => ({
  pending: null,

  requestGenerate(intent) {
    set({ pending: intent })
  },

  dismissGenerate() {
    set({ pending: null })
  },

  reset() {
    set({ pending: null })
  },
}))

/** Module-level convenience for non-React callers (e.g. router, app-init). */
export function requestGenerateCards(intent: GenerateIntent): void {
  useReviewStore.getState().requestGenerate(intent)
}
