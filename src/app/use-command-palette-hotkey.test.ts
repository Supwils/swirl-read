import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCommandPaletteHotkey } from './use-command-palette-hotkey'
import { useUIStore } from '@/stores/ui-store'

beforeEach(() => {
  useUIStore.setState({ commandPaletteOpen: false })
})

afterEach(() => {
  useUIStore.setState({ commandPaletteOpen: false })
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
  // jsdom dispatches via target; default to window so the global handler
  // sees a non-editable target.
  ;(target ?? window).dispatchEvent(event)
  return event.defaultPrevented
}

describe('useCommandPaletteHotkey', () => {
  it('toggles the palette on ⌘K (mac)', () => {
    renderHook(() => useCommandPaletteHotkey())
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)

    const prevented = press('k', { metaKey: true })

    expect(prevented).toBe(true)
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
  })

  it('toggles the palette on Ctrl+K (windows / linux)', () => {
    renderHook(() => useCommandPaletteHotkey())
    press('k', { ctrlKey: true })
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    press('k', { ctrlKey: true })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('accepts uppercase K (caps lock)', () => {
    renderHook(() => useCommandPaletteHotkey())
    press('K', { metaKey: true })
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
  })

  it('ignores plain k without a modifier', () => {
    renderHook(() => useCommandPaletteHotkey())
    const prevented = press('k')
    expect(prevented).toBe(false)
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('ignores ⌘+Shift+K (reserved for future bindings)', () => {
    renderHook(() => useCommandPaletteHotkey())
    press('k', { metaKey: true, shiftKey: true })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('ignores ⌘+Alt+K', () => {
    renderHook(() => useCommandPaletteHotkey())
    press('k', { metaKey: true, altKey: true })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('does not hijack ⌘K typed inside an <input>', () => {
    renderHook(() => useCommandPaletteHotkey())
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      const prevented = press('k', { metaKey: true, target: input })
      expect(prevented).toBe(false)
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    } finally {
      input.remove()
    }
  })

  it('does not hijack ⌘K inside a contenteditable element', () => {
    renderHook(() => useCommandPaletteHotkey())
    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)
    try {
      press('k', { metaKey: true, target: div })
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    } finally {
      div.remove()
    }
  })

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useCommandPaletteHotkey())
    unmount()
    press('k', { metaKey: true })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })
})
