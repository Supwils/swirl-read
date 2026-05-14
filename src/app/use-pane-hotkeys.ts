/**
 * Pane keyboard shortcuts for the Workspace surface.
 *
 *   ⌘\ / Ctrl+\   — split current pane (single → dual) using active doc
 *   ⌘W / Ctrl+W   — close active pane (dual → single). Single mode is a no-op.
 *   ⌘1 / Ctrl+1   — focus pane 1
 *   ⌘2 / Ctrl+2   — focus pane 2 (no-op in single mode)
 *
 * All guarded against editable targets so they don't hijack form inputs
 * or the CodeMirror editor. ⌘W in particular needs preventDefault so the
 * browser doesn't close the tab, but we still bail out fast when the
 * user is mid-edit.
 */

import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { usePanesStore, PANE_1, PANE_2 } from '@/stores/panes-store'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const ceProp = target.contentEditable
  if (ceProp === 'true' || ceProp === 'plaintext-only') return true
  const ceAttr = target.getAttribute('contenteditable')
  if (ceAttr === '' || ceAttr === 'true' || ceAttr === 'plaintext-only') {
    return true
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function usePaneHotkeys(): void {
  const params = useParams<{ vaultId: string }>()
  const vaultId = params.vaultId
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!vaultId) return

    function handle(event: KeyboardEvent): void {
      const meta = event.metaKey
      const ctrl = event.ctrlKey
      if (!(meta || ctrl)) return
      if (event.altKey) return
      if (isEditableTarget(event.target)) return

      const store = usePanesStore.getState()
      if (!vaultId) return
      const state = store.panesByVault[vaultId]

      // ⌘\ split
      if (event.key === '\\' && !event.shiftKey) {
        event.preventDefault()
        if (!state || state.viewMode === 'single') {
          void store.splitPane(vaultId)
        }
        return
      }
      // ⌘W close active pane
      if ((event.key === 'w' || event.key === 'W') && !event.shiftKey) {
        if (state?.viewMode === 'dual') {
          event.preventDefault()
          const activeId = state.activePaneId
          void store.closePane(vaultId, activeId)
          // Sync URL to survivor's path.
          const survivor =
            usePanesStore.getState().panesByVault[vaultId]?.panes[0]
              ?.currentPath ?? ''
          if (survivor) {
            void navigate(`/app/${vaultId}/${encodePathForUrl(survivor)}`)
          }
        }
        return
      }
      // ⌘1 / ⌘2 focus pane
      if ((event.key === '1' || event.key === '2') && !event.shiftKey) {
        const paneId = event.key === '1' ? PANE_1 : PANE_2
        if (paneId === PANE_2 && state?.viewMode !== 'dual') {
          return
        }
        event.preventDefault()
        void store.focusPane(vaultId, paneId)
        // Sync URL to the focused pane's path so back/forward make sense.
        const target =
          usePanesStore
            .getState()
            .panesByVault[vaultId]?.panes.find((p) => p.id === paneId)
            ?.currentPath ?? ''
        if (target) {
          void navigate(`/app/${vaultId}/${encodePathForUrl(target)}`)
        }
      }
    }

    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
    }
  }, [vaultId, navigate])
}
