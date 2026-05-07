import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { VaultFileSystem } from '@/core/vault'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'
import { useVaultPollSync } from './use-vault-poll-sync'

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

function emitVisibilityChange(): void {
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-07T12:00:00Z'))
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

describe('useVaultPollSync', () => {
  it('refreshes the active vault on the 30s interval while visible', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))
    useVaultStore.setState({ activeVaultId: 'v1' })

    renderHook(() => useVaultPollSync())

    expect(refreshVaultContent).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(refreshVaultContent).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(refreshVaultContent).toHaveBeenCalledTimes(2)
  })

  it('does not fire while the document is hidden', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))
    useVaultStore.setState({ activeVaultId: 'v1' })

    setVisibility('hidden')
    renderHook(() => useVaultPollSync())

    await vi.advanceTimersByTimeAsync(60_000)
    expect(refreshVaultContent).not.toHaveBeenCalled()
  })

  it('starts polling when the tab becomes visible and stops when hidden again', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))
    useVaultStore.setState({ activeVaultId: 'v1' })

    setVisibility('hidden')
    renderHook(() => useVaultPollSync())

    setVisibility('visible')
    emitVisibilityChange()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refreshVaultContent).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    emitVisibilityChange()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(refreshVaultContent).toHaveBeenCalledTimes(1)
  })

  it('does not poll without an active vault', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })

    renderHook(() => useVaultPollSync())
    await vi.advanceTimersByTimeAsync(60_000)

    expect(refreshVaultContent).not.toHaveBeenCalled()
  })

  it('skips refresh when the active vault has no live adapter', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent, activeVaultId: 'v1' })

    renderHook(() => useVaultPollSync())
    await vi.advanceTimersByTimeAsync(30_000)

    expect(refreshVaultContent).not.toHaveBeenCalled()
  })

  it('clears the interval on unmount', async () => {
    const refreshVaultContent = vi.fn().mockResolvedValue(undefined)
    useVaultStore.setState({ refreshVaultContent })
    useVaultStore.getState().attachAdapter(fakeAdapter('v1'))
    useVaultStore.setState({ activeVaultId: 'v1' })

    const { unmount } = renderHook(() => useVaultPollSync())
    unmount()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(refreshVaultContent).not.toHaveBeenCalled()
  })
})
