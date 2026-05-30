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
 * Concurrent requests are SERIALIZED, not collapsed. If a second request
 * lands while one is open it queues behind the first and is shown after
 * the user answers — each caller gets the answer to its OWN prompt. (The
 * previous behaviour auto-resolved the in-flight prompt to `false`, so two
 * overlapping guards — e.g. the router blocker plus an explicit close —
 * could answer the wrong dialog and take the wrong discard-vs-keep branch.)
 *
 * The resolve fn + queue live in module scope on purpose — they're not
 * serialisable and would only confuse Zustand's structural-equality checks.
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

interface QueuedConfirm {
  payload: ConfirmDialogPayload
  resolve: (answer: boolean) => void
}

let pendingResolve: ((answer: boolean) => void) | null = null
const queue: QueuedConfirm[] = []

export const useDialogStore = create<DialogStore>((set) => ({
  confirmPayload: null,

  requestConfirmation(opts) {
    return new Promise<boolean>((resolve) => {
      if (pendingResolve) {
        // A prompt is already on screen — wait our turn rather than
        // hijacking it. The current caller still gets its own answer.
        queue.push({ payload: opts, resolve })
        return
      }
      pendingResolve = resolve
      set({ confirmPayload: opts })
    })
  },

  answerConfirmation(answer) {
    const resolver = pendingResolve
    pendingResolve = null
    resolver?.(answer)
    // Advance the queue: show the next prompt (if any) on its own.
    const next = queue.shift()
    if (next) {
      pendingResolve = next.resolve
      set({ confirmPayload: next.payload })
    } else {
      set({ confirmPayload: null })
    }
  },

  reset() {
    const stale = pendingResolve
    pendingResolve = null
    const drained = queue.splice(0, queue.length)
    set({ confirmPayload: null })
    // Resolve everything outstanding as `false` (safe default) so no
    // awaiting caller hangs forever.
    stale?.(false)
    for (const item of drained) item.resolve(false)
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
