/**
 * Router-level dirty blocker (Phase 2D).
 *
 * Combines React Router 7's `useBlocker` with the editor-store dirty
 * flag and the app-wide Radix confirm dialog. Mounts once at the
 * AppShell so any pathname change while a dirty session is open
 * surfaces the standard "leave anyway?" prompt before routing
 * proceeds.
 *
 * Why this is separate from `useDirtyNavigationGuard`:
 *   - `useDirtyNavigationGuard` handles the *browser-level* exit gate
 *     (tab close, refresh) via `beforeunload`.
 *   - This hook handles *in-app* navigation that the router controls
 *     (clicking a wikilink, palette nav, vault switcher).
 *
 * Both can coexist; `beforeunload` only fires when the browser is
 * actually unloading, never on internal SPA route changes.
 */

import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { requestConfirmation } from '@/stores/dialog-store'
import { useEditorStore } from '@/stores/editor-store'

export function useRouterDirtyBlocker(): void {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!useEditorStore.getState().active?.dirty) return false
    // Same-pathname state-only changes (hash anchor, search updates)
    // shouldn't trigger the prompt — they aren't "leaving" the doc.
    return currentLocation.pathname !== nextLocation.pathname
  })

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let cancelled = false
    void (async () => {
      const ok = await requestConfirmation({
        title: 'Discard unsaved changes?',
        description:
          'You have unsaved edits in this document. Navigate away and lose them?',
        confirmLabel: 'Leave without saving',
        cancelLabel: 'Stay here',
        destructive: true,
      })
      if (cancelled) return
      if (ok) {
        // User accepted — drop the editor session so the next page
        // doesn't inherit a stale dirty flag.
        useEditorStore.getState().cancel()
        blocker.proceed?.()
      } else {
        blocker.reset?.()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [blocker])
}
