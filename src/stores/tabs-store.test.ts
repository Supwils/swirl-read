import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDbForTests, db } from '@/core/persistence/db'
import { MAX_TABS_PER_VAULT, useTabsStore } from './tabs-store'

beforeEach(async () => {
  await __resetDbForTests()
  useTabsStore.setState({
    tabsByVault: {},
    recentlyClosedByVault: {},
    ready: false,
  })
})

afterEach(async () => {
  await __resetDbForTests()
})

describe('tabs-store — openOrFocus rules', () => {
  it('first opens go in as a preview tab', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md')
    const tabs = useTabsStore.getState().tabsByVault.v ?? []
    expect(tabs.map((t) => t.path)).toEqual(['a.md'])
    expect(tabs[0]!.pinned).toBe(false)
  })

  it('a second preview replaces the first preview', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md')
    await useTabsStore.getState().openOrFocus('v', 'b.md')
    const tabs = useTabsStore.getState().tabsByVault.v ?? []
    expect(tabs.map((t) => t.path)).toEqual(['b.md'])
  })

  it('Cmd-click pins, and the next preview opens alongside it', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    await useTabsStore.getState().openOrFocus('v', 'b.md')
    const tabs = useTabsStore.getState().tabsByVault.v ?? []
    expect(tabs.map((t) => t.path)).toEqual(['a.md', 'b.md'])
    expect(tabs[0]!.pinned).toBe(true)
    expect(tabs[1]!.pinned).toBe(false)
  })

  it('opening an already-open path is idempotent', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    const before = useTabsStore.getState().tabsByVault.v
    await useTabsStore.getState().openOrFocus('v', 'a.md')
    expect(useTabsStore.getState().tabsByVault.v).toBe(before)
  })

  it('Cmd-clicking an already-preview tab promotes it to pinned', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md')
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    expect(useTabsStore.getState().tabsByVault.v?.[0]?.pinned).toBe(true)
  })

  it('caps tabs per vault to MAX_TABS_PER_VAULT', async () => {
    // Use pinned tabs because the public API only ever holds at most one
    // preview tab — successive previews replace each other in place, so
    // the cap can only be reached with pinned opens.
    for (let i = 0; i < MAX_TABS_PER_VAULT + 5; i += 1) {
      await useTabsStore
        .getState()
        .openOrFocus('v', `f${String(i)}.md`, { pin: true })
    }
    const tabs = useTabsStore.getState().tabsByVault.v ?? []
    expect(tabs.length).toBe(MAX_TABS_PER_VAULT)
    // The most recent opens survive — the eviction policy drops the
    // oldest entry when only pinned tabs are present.
    expect(tabs[tabs.length - 1]!.path).toBe(
      `f${String(MAX_TABS_PER_VAULT + 4)}.md`,
    )
  })

  it('persists open tabs to Dexie', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    const rows = await db.openTabs.where('vaultId').equals('v').toArray()
    expect(rows.map((r) => r.path)).toEqual(['a.md'])
  })
})

describe('tabs-store — closeTab', () => {
  it('removes a tab and pushes it onto the recently-closed stack', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    await useTabsStore.getState().openOrFocus('v', 'b.md', { pin: true })
    await useTabsStore.getState().closeTab('v', 'a.md')
    expect(useTabsStore.getState().tabsByVault.v?.map((t) => t.path)).toEqual([
      'b.md',
    ])
    expect(
      useTabsStore.getState().recentlyClosedByVault.v?.map((t) => t.path),
    ).toEqual(['a.md'])
  })

  it('reopenLastClosed restores the most recently closed tab', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    await useTabsStore.getState().closeTab('v', 'a.md')
    const reopened = useTabsStore.getState().reopenLastClosed('v')
    expect(reopened).toBe('a.md')
    // The reopen path runs openOrFocus asynchronously; flush the
    // microtask queue so the tab lands back in state.
    await Promise.resolve()
    expect(useTabsStore.getState().tabsByVault.v?.[0]?.path).toBe('a.md')
    expect(useTabsStore.getState().recentlyClosedByVault.v).toEqual([])
  })

  it('reopenLastClosed returns null on an empty stack', () => {
    expect(useTabsStore.getState().reopenLastClosed('v')).toBeNull()
  })
})

describe('tabs-store — pinTab', () => {
  it('promotes a preview tab to pinned', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md')
    await useTabsStore.getState().pinTab('v', 'a.md')
    expect(useTabsStore.getState().tabsByVault.v?.[0]?.pinned).toBe(true)
  })

  it('is idempotent on already-pinned tabs', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    const before = useTabsStore.getState().tabsByVault.v
    await useTabsStore.getState().pinTab('v', 'a.md')
    expect(useTabsStore.getState().tabsByVault.v).toBe(before)
  })
})

describe('tabs-store — reorderTabs', () => {
  beforeEach(async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    await useTabsStore.getState().openOrFocus('v', 'b.md', { pin: true })
    await useTabsStore.getState().openOrFocus('v', 'c.md', { pin: true })
  })

  it('moves a tab from one position to another', async () => {
    await useTabsStore.getState().reorderTabs('v', 0, 2)
    expect(useTabsStore.getState().tabsByVault.v?.map((t) => t.path)).toEqual([
      'b.md',
      'c.md',
      'a.md',
    ])
  })

  it('no-ops on identical indices', async () => {
    const before = useTabsStore.getState().tabsByVault.v
    await useTabsStore.getState().reorderTabs('v', 1, 1)
    expect(useTabsStore.getState().tabsByVault.v).toBe(before)
  })

  it('no-ops on out-of-range indices', async () => {
    const before = useTabsStore.getState().tabsByVault.v
    await useTabsStore.getState().reorderTabs('v', 0, 99)
    expect(useTabsStore.getState().tabsByVault.v).toBe(before)
  })

  it('persists the new order to Dexie (after debounce)', async () => {
    await useTabsStore.getState().reorderTabs('v', 0, 2)
    // reorderTabs debounces the Dexie write by 200 ms (A.L1).
    await new Promise<void>((resolve) => setTimeout(resolve, 350))
    const rows = await db.openTabs.where('vaultId').equals('v').toArray()
    const sorted = [...rows].sort((a, b) => a.order - b.order)
    expect(sorted.map((r) => r.path)).toEqual(['b.md', 'c.md', 'a.md'])
  })
})

describe('tabs-store — A.L1 debounced reorder persistence', () => {
  it('10 rapid reorders produce at most 1 Dexie bulkPut', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    await useTabsStore.getState().openOrFocus('v', 'b.md', { pin: true })
    await useTabsStore.getState().openOrFocus('v', 'c.md', { pin: true })

    const bulkPutSpy = vi.spyOn(db.openTabs, 'bulkPut')

    // Fire 10 reorders without awaiting — simulates rapid drag events.
    for (let i = 0; i < 10; i++) {
      void useTabsStore.getState().reorderTabs('v', 0, 1)
    }

    // Wait past the 200 ms debounce window.
    await new Promise<void>((resolve) => setTimeout(resolve, 350))

    expect(bulkPutSpy).toHaveBeenCalledTimes(1)
    bulkPutSpy.mockRestore()
  })
})

describe('tabs-store — init + forgetVault', () => {
  it('init hydrates tabs from Dexie sorted by order', async () => {
    await db.openTabs.bulkPut([
      {
        id: '["v","b.md"]',
        vaultId: 'v',
        path: 'b.md',
        pinned: true,
        order: 1,
        openedAtMs: 100,
      },
      {
        id: '["v","a.md"]',
        vaultId: 'v',
        path: 'a.md',
        pinned: false,
        order: 0,
        openedAtMs: 200,
      },
    ])
    await useTabsStore.getState().init()
    expect(useTabsStore.getState().tabsByVault.v?.map((t) => t.path)).toEqual([
      'a.md',
      'b.md',
    ])
  })

  it('forgetVault drops in-memory state for a vault', async () => {
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    useTabsStore.getState().forgetVault('v')
    expect(useTabsStore.getState().tabsByVault.v).toBeUndefined()
    expect(useTabsStore.getState().recentlyClosedByVault.v).toBeUndefined()
  })
})
