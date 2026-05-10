import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerVaultDeletionHook,
  runVaultDeletionHooks,
  __getVaultLifecycleHookCountForTests,
  __resetVaultLifecycleHooksForTests,
} from './vault-lifecycle'

afterEach(() => {
  __resetVaultLifecycleHooksForTests()
})

describe('vault-lifecycle', () => {
  it('runs every registered hook with the vault id', async () => {
    const a = vi.fn()
    const b = vi.fn()
    registerVaultDeletionHook(a)
    registerVaultDeletionHook(b)

    await runVaultDeletionHooks('vault-x')
    expect(a).toHaveBeenCalledWith('vault-x')
    expect(b).toHaveBeenCalledWith('vault-x')
  })

  it('awaits async hooks before resolving', async () => {
    const order: string[] = []
    registerVaultDeletionHook(async (id) => {
      await new Promise((r) => setTimeout(r, 10))
      order.push(`async:${id}`)
    })
    registerVaultDeletionHook((id) => {
      order.push(`sync:${id}`)
    })

    await runVaultDeletionHooks('v')
    // Sync hook lands first (microtask), async resolves after the
    // setTimeout, but both must be present when runVaultDeletionHooks
    // resolves.
    expect(order).toContain('sync:v')
    expect(order).toContain('async:v')
  })

  it('isolates a failing hook so other hooks still run', async () => {
    const survivor = vi.fn()
    registerVaultDeletionHook(() => {
      throw new Error('boom')
    })
    registerVaultDeletionHook(survivor)

    // Should not throw — the failure is swallowed (warned in dev).
    await expect(runVaultDeletionHooks('v')).resolves.toBeUndefined()
    expect(survivor).toHaveBeenCalledWith('v')
  })

  it('isolates an async-rejected hook the same way', async () => {
    const survivor = vi.fn()
    registerVaultDeletionHook(async () => {
      await Promise.resolve()
      throw new Error('async boom')
    })
    registerVaultDeletionHook(survivor)

    await expect(runVaultDeletionHooks('v')).resolves.toBeUndefined()
    expect(survivor).toHaveBeenCalled()
  })

  it('returns an unregister function', async () => {
    const hook = vi.fn()
    const off = registerVaultDeletionHook(hook)
    expect(__getVaultLifecycleHookCountForTests()).toBe(1)

    off()
    expect(__getVaultLifecycleHookCountForTests()).toBe(0)
    await runVaultDeletionHooks('v')
    expect(hook).not.toHaveBeenCalled()
  })

  it('runs hooks in parallel — one slow hook does not block the next', async () => {
    const start = Date.now()
    registerVaultDeletionHook(() => new Promise((r) => setTimeout(r, 50)))
    registerVaultDeletionHook(() => new Promise((r) => setTimeout(r, 50)))
    await runVaultDeletionHooks('v')
    const elapsed = Date.now() - start
    // Sequential would be ~100ms. Allow generous slack for jsdom timer
    // jitter — anything under 90ms confirms they ran in parallel.
    expect(elapsed).toBeLessThan(90)
  })
})
