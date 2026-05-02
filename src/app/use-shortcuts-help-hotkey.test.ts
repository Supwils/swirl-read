import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useShortcutsHelpHotkey } from './use-shortcuts-help-hotkey'
import { useUIStore } from '@/stores/ui-store'

beforeEach(() => {
  useUIStore.setState({ shortcutsHelpOpen: false })
})

afterEach(() => {
  useUIStore.setState({ shortcutsHelpOpen: false })
})

function press(
  key: string,
  options: KeyboardEventInit & { target?: EventTarget | null } = {},
): boolean {
  const { target = window, ...init } = options
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  ;(target ?? window).dispatchEvent(event)
  return event.defaultPrevented
}

describe('useShortcutsHelpHotkey', () => {
  it('toggles the overlay on `?`', () => {
    renderHook(() => useShortcutsHelpHotkey())
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
    expect(press('?')).toBe(true)
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(true)
    expect(press('?')).toBe(true)
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
  })

  it('ignores `?` with a modifier (preserves browser shortcuts)', () => {
    renderHook(() => useShortcutsHelpHotkey())
    expect(press('?', { metaKey: true })).toBe(false)
    expect(press('?', { ctrlKey: true })).toBe(false)
    expect(press('?', { altKey: true })).toBe(false)
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
  })

  it('does not hijack `?` typed inside an <input>', () => {
    renderHook(() => useShortcutsHelpHotkey())
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      const prevented = press('?', { target: input })
      expect(prevented).toBe(false)
      expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
    } finally {
      input.remove()
    }
  })

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useShortcutsHelpHotkey())
    unmount()
    press('?')
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
  })
})
