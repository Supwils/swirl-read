/**
 * Global `?` binding for the keyboard shortcuts help overlay (M9.4).
 *
 * Mounted once in `AppShell`. `?` toggles the overlay; respects the
 * usual editable-target guard so typing `?` in an input still types
 * a literal `?`. No modifier required (matches GitHub / Linear / VS
 * Code conventions for the help overlay).
 */

import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'

export function useShortcutsHelpHotkey(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    function handle(event: KeyboardEvent): void {
      if (event.key !== '?') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      useUIStore.getState().toggleShortcutsHelp()
    }

    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
    }
  }, [])
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
