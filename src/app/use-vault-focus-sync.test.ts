import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { VaultFileSystem } from '@/core/vault'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'
import { useVaultFocusSync } from './use-vault-focus-sync'

function fakeAdapter(id: string): VaultFileSystem {
  return {
    id,
    name: id,
    isReadOnly: false,
    list() {
      return Promise.resolve([])
    },
    async *walk() {
      // no files
    },
    stat() {
      return Promise.resolve({ path: '', name: id, isDirectory: true })
    },
    readText() {
      return Promise.resolve('')
    },
    readBinary() {
      return Promise.resolve(new Uint8Array())
    },
    writeText() {
      return Promise.resolve()
    },
    getBlobURL() {
      return Promise.resolve('blob:mock')
    },
    hasPermission() {
      return Promise.resolve(true)
    },
    requestPermission() {
      return Promise.resolve(true)
    },
  }
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
}

function focusWindow(): void {
  window.dispatchEvent(new FocusEvent('focus'))
}

function showDocument(): void {
  setVisibility('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-04T12:00:00Z'))
  __resetAdaptersForTests()
  setVisibility('visible')
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
    adapterRevision: 0,
    contentRevisionByVault: {},
  })
})

afterEach(() => {
  vi.useRealTimers()
  __resetAdaptersForTests()
  setVisibility('visible')
})

describe('useVaultFocusSync', () => {
  it('refreshes the active vault when the window regains focus', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))
    useVaultStore.setState({ activeVaultId: 'v1' })

    renderHook(() => useVaultFocusSync())
    focusWindow()
    await vi.runAllTimersAsync()

    expect(refreshVaultContent).toHaveBeenCalledTimes(1)
    expect(refreshVaultContent).toHaveBeenCalledWith('v1')
  })

  it('refreshes when the document becomes visible again', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))
    useVaultStore.setState({ activeVaultId: 'v1' })

    renderHook(() => useVaultFocusSync())
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    showDocument()
    await vi.runAllTimersAsync()

    expect(refreshVaultContent).toHaveBeenCalledTimes(1)
  })

  it('does not refresh without an active vault', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))

    renderHook(() => useVaultFocusSync())
    focusWindow()
    await vi.runAllTimersAsync()

    expect(refreshVaultContent).not.toHaveBeenCalled()
  })

  it('does not refresh when the active vault has no live adapter', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({
      activeVaultId: 'v1',
      refreshVaultContent,
    })

    renderHook(() => useVaultFocusSync())
    focusWindow()
    await vi.runAllTimersAsync()

    expect(refreshVaultContent).not.toHaveBeenCalled()
  })

  it('coalesces duplicate focus and visibility events during the cooldown', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))
    useVaultStore.setState({ activeVaultId: 'v1' })

    renderHook(() => useVaultFocusSync())
    focusWindow()
    showDocument()
    await vi.runAllTimersAsync()

    expect(refreshVaultContent).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1_999)
    focusWindow()
    await vi.runAllTimersAsync()
    expect(refreshVaultContent).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    focusWindow()
    await vi.runAllTimersAsync()
    expect(refreshVaultContent).toHaveBeenCalledTimes(2)
  })

  it('removes listeners on unmount', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))
    useVaultStore.setState({ activeVaultId: 'v1' })

    const { unmount } = renderHook(() => useVaultFocusSync())
    unmount()
    focusWindow()
    await vi.runAllTimersAsync()

    expect(refreshVaultContent).not.toHaveBeenCalled()
  })
})
