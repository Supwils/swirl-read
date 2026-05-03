/**
 * Dirty navigation guard for the lightweight editor (Phase 2B).
 *
 * Two responsibilities, both driven by `useEditorStore.active.dirty`:
 *
 * 1. **Tab close / refresh** — installs a `beforeunload` listener while a
 *    dirty session is open. The browser shows its native "leave site?"
 *    prompt; modern browsers ignore the custom message but still gate the
 *    navigation on the user's confirmation.
 *
 * 2. **In-app navigation** — exposes `confirmLeaveIfDirty()` so callers
 *    (file-tree clicks, vault switcher, command palette navigation) can
 *    `if (!confirmLeaveIfDirty()) return`.
 *
 * The hook is mounted once at the AppShell layer; the imperative helper
 * is safe to import from anywhere.
 *
 * Intentionally narrow: no React Router blocker registration. React
 * Router 7's `useBlocker` ties cleanly into the data router and can be
 * added later in Phase 2C alongside the EditSurface — at that point the
 * blocker UI also needs a stylable confirm dialog rather than a
 * `window.confirm` so deferring the dependency keeps Phase 2B a pure
 * state slice.
 */

import { useEffect } from 'react'
import { requestConfirmation } from '@/stores/dialog-store'
import { useEditorStore } from '@/stores/editor-store'

const DIRTY_MESSAGE = 'You have unsaved changes in this document. Leave anyway?'

/**
 * Subscribe to dirty state and install / remove a `beforeunload`
 * listener. Mount at the AppShell so the listener follows the app's
 * lifecycle, not any individual document.
 */
export function useDirtyNavigationGuard(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    function handle(event: BeforeUnloadEvent): void {
      if (!useEditorStore.getState().active?.dirty) return
      event.preventDefault()
      // Required for Safari and older Chromium to actually surface the
      // native dialog. The custom string is ignored by modern browsers
      // but the assignment itself is what triggers the prompt.
      event.returnValue = DIRTY_MESSAGE
    }

    window.addEventListener('beforeunload', handle)
    return () => {
      window.removeEventListener('beforeunload', handle)
    }
  }, [])
}

/**
 * Async gate for in-app navigation. Returns `true` if the caller may
 * proceed (no dirty session, or user confirmed the prompt), `false`
 * to abort.
 *
 * Phase 2D promoted this from the original `window.confirm` synchronous
 * primitive to the Radix-backed `requestConfirmation` flow so the
 * prompt is theme-aware and styled like the rest of the app. Callers
 * that previously did `if (!confirmLeaveIfDirty()) return` now `await`
 * the result; the React Router blocker integration drives this from
 * inside a useEffect so the await doesn't fight the router.
 */
export async function confirmLeaveIfDirty(): Promise<boolean> {
  if (typeof window === 'undefined') return true
  if (!useEditorStore.getState().active?.dirty) return true
  return requestConfirmation({
    title: 'Discard unsaved changes?',
    description: DIRTY_MESSAGE,
    confirmLabel: 'Leave without saving',
    cancelLabel: 'Stay',
    destructive: true,
  })
}
