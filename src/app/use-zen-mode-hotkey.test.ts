import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useZenModeHotkey } from './use-zen-mode-hotkey'
import { useUIStore } from '@/stores/ui-store'

beforeEach(() => {
  useUIStore.setState({ zenMode: false })
})

afterEach(() => {
  useUIStore.setState({ zenMode: false })
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

describe('useZenModeHotkey', () => {
  it('toggles zenMode on F', () => {
    renderHook(() => useZenModeHotkey())
    expect(useUIStore.getState().zenMode).toBe(false)

    expect(press('f')).toBe(true)
    expect(useUIStore.getState().zenMode).toBe(true)

    expect(press('f')).toBe(true)
    expect(useUIStore.getState().zenMode).toBe(false)
  })

  it('accepts uppercase F (caps lock)', () => {
    renderHook(() => useZenModeHotkey())
    press('F')
    expect(useUIStore.getState().zenMode).toBe(true)
  })

  it('exits zen mode on Escape', () => {
    renderHook(() => useZenModeHotkey())
    useUIStore.getState().setZenMode(true)

    expect(press('Escape')).toBe(true)
    expect(useUIStore.getState().zenMode).toBe(false)
  })

  it('does not respond to Escape when zen mode is already off', () => {
    renderHook(() => useZenModeHotkey())
    expect(useUIStore.getState().zenMode).toBe(false)

    expect(press('Escape')).toBe(false)
    expect(useUIStore.getState().zenMode).toBe(false)
  })

  it('ignores F with a modifier (preserves Cmd+F / Ctrl+F)', () => {
    renderHook(() => useZenModeHotkey())

    expect(press('f', { metaKey: true })).toBe(false)
    expect(useUIStore.getState().zenMode).toBe(false)
    expect(press('f', { ctrlKey: true })).toBe(false)
    expect(useUIStore.getState().zenMode).toBe(false)
    expect(press('f', { altKey: true })).toBe(false)
    expect(useUIStore.getState().zenMode).toBe(false)
  })

  it('does not hijack F typed inside an <input>', () => {
    renderHook(() => useZenModeHotkey())
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      const prevented = press('f', { target: input })
      expect(prevented).toBe(false)
      expect(useUIStore.getState().zenMode).toBe(false)
    } finally {
      input.remove()
    }
  })

  it('does not hijack F inside a contenteditable element', () => {
    renderHook(() => useZenModeHotkey())
    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)
    try {
      press('f', { target: div })
      expect(useUIStore.getState().zenMode).toBe(false)
    } finally {
      div.remove()
    }
  })

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useZenModeHotkey())
    unmount()
    press('f')
    expect(useUIStore.getState().zenMode).toBe(false)
  })
})
