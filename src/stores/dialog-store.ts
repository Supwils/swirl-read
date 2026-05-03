/**
 * Dialog store — thin coordinator for app-wide imperative confirm dialogs.
 *
 * Why imperative: the dirty-navigation guard and the editor's Cancel
 * action both need to ask the user "leave anyway?" from arbitrary call
 * sites (router blocker, click handler, keymap callback). React Router's
 * `useBlocker` doesn't surface a built-in modal, and threading an open
 * flag through every caller is noisy. This store exposes a single
 * `requestConfirmation(opts)` Promise so callers can `if (!await
 * requestConfirmation(...)) return` without owning state.
 *
 * Only one confirmation can be pending at a time; if a second request
 * lands while one is open, the existing one is auto-dismissed as
 * `false` so the second can take its place.
 *
 * The resolve function lives in module scope on purpose — it's not
 * serialisable and would only confuse Zustand's structural-equality
 * checks if it were stored in state.
 */

import { create } from 'zustand'

export interface ConfirmDialogPayload {
  /** Short title shown at the top of the dialog. */
  title: string
  /** Body copy explaining the consequence of confirming. */
  description: string
  /** Label for the destructive / forward action. */
  confirmLabel: string
  /** Label for the safe / cancel action. */
  cancelLabel?: string
  /** When `true`, the confirm button gets a danger-styled treatment. */
  destructive?: boolean
}

interface DialogStoreState {
  /** Live payload for the confirm dialog, or `null` when nothing is pending. */
  confirmPayload: ConfirmDialogPayload | null
}

interface DialogStoreActions {
  requestConfirmation: (opts: ConfirmDialogPayload) => Promise<boolean>
  answerConfirmation: (answer: boolean) => void
  /** Reset for tests. */
  reset: () => void
}

export type DialogStore = DialogStoreState & DialogStoreActions

let pendingResolve: ((answer: boolean) => void) | null = null

export const useDialogStore = create<DialogStore>((set) => ({
  confirmPayload: null,

  requestConfirmation(opts) {
    // If a previous prompt is still up, cancel it first so two
    // concurrent prompts don't race for the same dialog instance.
    if (pendingResolve) {
      const stale = pendingResolve
      pendingResolve = null
      stale(false)
    }
    set({ confirmPayload: opts })
    return new Promise<boolean>((resolve) => {
      pendingResolve = resolve
    })
  },

  answerConfirmation(answer) {
    const resolver = pendingResolve
    pendingResolve = null
    set({ confirmPayload: null })
    resolver?.(answer)
  },

  reset() {
    if (pendingResolve) {
      const stale = pendingResolve
      pendingResolve = null
      stale(false)
    }
    set({ confirmPayload: null })
  },
}))

/**
 * Module-level convenience so callers don't have to type
 * `useDialogStore.getState().requestConfirmation(...)`.
 */
export function requestConfirmation(
  opts: ConfirmDialogPayload,
): Promise<boolean> {
  return useDialogStore.getState().requestConfirmation(opts)
}
