/**
 * Global F-key zen mode binding (M2.6).
 *
 * Mounted once at AppShell. Pressing F outside any text-entry surface
 * toggles `zenMode`. Pressing Escape while in zen mode exits.
 *
 * Why F (and not, say, Ctrl+Shift+F): zen mode is a reader gesture —
 * the user has already committed to reading. Single-key chords are
 * the right ergonomics for that mode (cf. Vim's `f` for "find char";
 * the convention "press a letter to switch reading focus" is well
 * established). The editable-target guard makes sure typing `f` in an
 * input still types a literal `f`.
 */

import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'

export function useZenModeHotkey(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    function handle(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        useUIStore.getState().toggleZenMode()
        return
      }

      if (event.key === 'Escape' && useUIStore.getState().zenMode) {
        event.preventDefault()
        useUIStore.getState().setZenMode(false)
      }
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
