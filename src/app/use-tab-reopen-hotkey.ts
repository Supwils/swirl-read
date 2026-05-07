/**
 * Reopen-last-closed-tab hotkey (Cmd+Shift+T / Ctrl+Shift+T).
 *
 * Mounted once at AppShell. Pulls the last-closed entry off the active
 * vault's recently-closed stack (maintained by `useTabsStore.closeTab`)
 * and routes the URL to it, which is what triggers `DocumentPage` to
 * focus or recreate the tab. No-op when there is no active vault, the
 * stack is empty, or the user is typing in an editable surface.
 *
 * Cmd+Shift+T is the standard browser binding for "reopen closed tab"
 * across Chrome / Safari / Firefox / Edge. Hijacking it inside our
 * single-page app is the right call — the alternative would reopen
 * whatever the host browser remembers (often nothing useful for an SPA).
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTabsStore } from '@/stores/tabs-store'
import { useVaultStore } from '@/stores/vault-store'

export function useTabReopenHotkey(): void {
  const navigate = useNavigate()
  const activeVaultId = useVaultStore((s) => s.activeVaultId)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!activeVaultId) return

    function handle(event: KeyboardEvent): void {
      if (event.key !== 't' && event.key !== 'T') return
      if (!event.shiftKey) return
      // Require Cmd (mac) or Ctrl (everywhere else) — exactly one.
      const meta = event.metaKey
      const ctrl = event.ctrlKey
      if (!(meta || ctrl)) return
      if (event.altKey) return

      if (isEditableTarget(event.target)) return

      const vaultId = activeVaultId
      if (!vaultId) return

      const reopened = useTabsStore.getState().reopenLastClosed(vaultId)
      if (!reopened) return

      event.preventDefault()
      void navigate(`/app/${vaultId}/${reopened}`)
    }

    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
    }
  }, [activeVaultId, navigate])
}

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
