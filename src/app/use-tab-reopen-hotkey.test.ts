import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { useTabsStore } from '@/stores/tabs-store'
import { useVaultStore } from '@/stores/vault-store'
import { useTabReopenHotkey } from './use-tab-reopen-hotkey'

let reopenSpy: MockInstance<(vaultId: string) => string | null>

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

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, children)
}

beforeEach(() => {
  useVaultStore.setState({ activeVaultId: 'v1' })
  reopenSpy = vi
    .spyOn(useTabsStore.getState(), 'reopenLastClosed')
    .mockReturnValue('docs/intro.md')
})

afterEach(() => {
  reopenSpy.mockRestore()
  useVaultStore.setState({ activeVaultId: null })
})

describe('useTabReopenHotkey', () => {
  it('reopens the last closed tab on ⌘+Shift+T (mac)', () => {
    renderHook(() => useTabReopenHotkey(), { wrapper })
    const prevented = press('t', { metaKey: true, shiftKey: true })
    expect(prevented).toBe(true)
    expect(reopenSpy).toHaveBeenCalledWith('v1')
  })

  it('reopens the last closed tab on Ctrl+Shift+T (windows / linux)', () => {
    renderHook(() => useTabReopenHotkey(), { wrapper })
    press('t', { ctrlKey: true, shiftKey: true })
    expect(reopenSpy).toHaveBeenCalledWith('v1')
  })

  it('accepts uppercase T (caps lock)', () => {
    renderHook(() => useTabReopenHotkey(), { wrapper })
    press('T', { metaKey: true, shiftKey: true })
    expect(reopenSpy).toHaveBeenCalledWith('v1')
  })

  it('does nothing when the recently-closed stack is empty', () => {
    reopenSpy.mockReturnValue(null)
    renderHook(() => useTabReopenHotkey(), { wrapper })
    const prevented = press('t', { metaKey: true, shiftKey: true })
    // When there is nothing to reopen we let the browser's own
    // Cmd+Shift+T behaviour pass through.
    expect(prevented).toBe(false)
  })

  it('does not fire without Shift', () => {
    renderHook(() => useTabReopenHotkey(), { wrapper })
    press('t', { metaKey: true })
    expect(reopenSpy).not.toHaveBeenCalled()
  })

  it('does not fire without Cmd / Ctrl', () => {
    renderHook(() => useTabReopenHotkey(), { wrapper })
    press('t', { shiftKey: true })
    expect(reopenSpy).not.toHaveBeenCalled()
  })

  it('does not fire without an active vault', () => {
    useVaultStore.setState({ activeVaultId: null })
    renderHook(() => useTabReopenHotkey(), { wrapper })
    press('t', { metaKey: true, shiftKey: true })
    expect(reopenSpy).not.toHaveBeenCalled()
  })

  it('does not hijack ⌘+Shift+T typed inside an <input>', () => {
    renderHook(() => useTabReopenHotkey(), { wrapper })
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      const prevented = press('t', {
        metaKey: true,
        shiftKey: true,
        target: input,
      })
      expect(prevented).toBe(false)
      expect(reopenSpy).not.toHaveBeenCalled()
    } finally {
      input.remove()
    }
  })

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useTabReopenHotkey(), { wrapper })
    unmount()
    press('t', { metaKey: true, shiftKey: true })
    expect(reopenSpy).not.toHaveBeenCalled()
  })
})
