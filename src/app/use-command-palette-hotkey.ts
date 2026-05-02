/**
 * Global ⌘K / Ctrl+K binding (M5.1).
 *
 * Mounted once at the AppShell level. The handler is intentionally
 * minimal: it only triggers on the chord, refuses to fire when the user
 * is typing in an input/textarea/contenteditable element (so editor
 * shortcuts in upcoming text fields aren't hijacked), and skips when a
 * modifier OTHER than the platform-correct meta/ctrl is held.
 *
 * The palette itself owns Esc-to-close — Radix Dialog handles that.
 */

import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'

export function useCommandPaletteHotkey(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    function handle(event: KeyboardEvent): void {
      if (event.key !== 'k' && event.key !== 'K') return
      // Require exactly one of meta (mac) / ctrl (everywhere else).
      // Reject combos with shift/alt because power users may bind those.
      const meta = event.metaKey
      const ctrl = event.ctrlKey
      if (!(meta || ctrl)) return
      if (event.shiftKey || event.altKey) return

      // Don't hijack typing surfaces. We deliberately allow the palette
      // to open from the search input (cmdk's input is inside the
      // dialog, but at fire time the dialog isn't mounted yet).
      const target = event.target
      if (isEditableTarget(target)) return

      event.preventDefault()
      useUIStore.getState().toggleCommandPalette()
    }

    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
    }
  }, [])
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  // `isContentEditable` is the canonical accessor in browsers, but jsdom
  // doesn't always populate it. Check the `contentEditable` property and
  // the underlying attribute as fallbacks so the guard is robust in both
  // environments.
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
