import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerVault,
  getVault,
  listVaults,
  unregisterVault,
  subscribe,
  __resetRegistryForTests,
} from './registry'
import type { VaultFileSystem } from './types'

function makeFakeVault(id: string, name = id): VaultFileSystem {
  return {
    id,
    name,
    list: vi.fn(),
    walk: vi.fn(),
    stat: vi.fn(),
    readText: vi.fn(),
    readBinary: vi.fn(),
    getBlobURL: vi.fn(),
    hasPermission: vi.fn(),
    requestPermission: vi.fn(),
  }
}

describe('vault registry', () => {
  beforeEach(() => {
    __resetRegistryForTests()
  })

  it('registers and retrieves vaults by id', () => {
    const v = makeFakeVault('alpha-1234')
    registerVault(v)
    expect(getVault('alpha-1234')).toBe(v)
  })

  it('returns undefined for unknown ids', () => {
    expect(getVault('does-not-exist')).toBeUndefined()
  })

  it('lists all registered vaults in insertion order', () => {
    const a = makeFakeVault('a-1111')
    const b = makeFakeVault('b-2222')
    const c = makeFakeVault('c-3333')
    registerVault(a)
    registerVault(b)
    registerVault(c)
    expect(listVaults().map((v) => v.id)).toEqual([
      'a-1111',
      'b-2222',
      'c-3333',
    ])
  })

  it('replaces an existing entry on duplicate id', () => {
    const first = makeFakeVault('x-1', 'first')
    const second = makeFakeVault('x-1', 'second')
    registerVault(first)
    registerVault(second)
    expect(getVault('x-1')?.name).toBe('second')
    expect(listVaults()).toHaveLength(1)
  })

  it('unregister removes a vault', () => {
    const v = makeFakeVault('to-remove-9999')
    registerVault(v)
    unregisterVault('to-remove-9999')
    expect(getVault('to-remove-9999')).toBeUndefined()
  })

  it('notifies subscribers on register and unregister', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    registerVault(makeFakeVault('event-1'))
    expect(listener).toHaveBeenCalledTimes(1)

    unregisterVault('event-1')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    registerVault(makeFakeVault('event-2'))
    expect(listener).toHaveBeenCalledTimes(2) // no further calls after unsub
  })
})
