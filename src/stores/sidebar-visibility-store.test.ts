import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetDbForTests, db } from '@/core/persistence/db'
import { useSidebarVisibilityStore } from './sidebar-visibility-store'

beforeEach(async () => {
  await __resetDbForTests()
  // Reset zustand state without disturbing the actions.
  useSidebarVisibilityStore.setState({ hiddenByVault: {}, ready: false })
  await useSidebarVisibilityStore.getState().init()
})

afterEach(async () => {
  useSidebarVisibilityStore.setState({ hiddenByVault: {}, ready: false })
  await __resetDbForTests()
})

describe('sidebar-visibility-store', () => {
  it('starts empty and reports nothing hidden', () => {
    const store = useSidebarVisibilityStore.getState()
    expect(store.isHidden('v', 'a.md')).toBe(false)
    expect(store.hiddenCount('v')).toBe(0)
  })

  it('hides a path and persists it across reloads', async () => {
    await useSidebarVisibilityStore.getState().hide('v', 'notes/junk')
    expect(
      useSidebarVisibilityStore.getState().isHidden('v', 'notes/junk'),
    ).toBe(true)
    expect(useSidebarVisibilityStore.getState().hiddenCount('v')).toBe(1)

    // Simulate a page reload by resetting the in-memory state and
    // re-initialising from Dexie.
    useSidebarVisibilityStore.setState({ hiddenByVault: {}, ready: false })
    await useSidebarVisibilityStore.getState().init()
    expect(
      useSidebarVisibilityStore.getState().isHidden('v', 'notes/junk'),
    ).toBe(true)
  })

  it('treats descendants of a hidden directory as hidden too', async () => {
    await useSidebarVisibilityStore.getState().hide('v', 'archive')
    const { isHidden } = useSidebarVisibilityStore.getState()
    expect(isHidden('v', 'archive')).toBe(true)
    expect(isHidden('v', 'archive/2024.md')).toBe(true)
    expect(isHidden('v', 'archive/sub/deep.md')).toBe(true)
    // Sibling outside the hidden subtree stays visible.
    expect(isHidden('v', 'archived.md')).toBe(false)
  })

  it('isolates hidden state per vault', async () => {
    await useSidebarVisibilityStore.getState().hide('v1', 'shared.md')
    expect(
      useSidebarVisibilityStore.getState().isHidden('v1', 'shared.md'),
    ).toBe(true)
    expect(
      useSidebarVisibilityStore.getState().isHidden('v2', 'shared.md'),
    ).toBe(false)
  })

  it('unhide reveals a single path', async () => {
    await useSidebarVisibilityStore.getState().hide('v', 'a')
    await useSidebarVisibilityStore.getState().hide('v', 'b')
    await useSidebarVisibilityStore.getState().unhide('v', 'a')
    const { isHidden } = useSidebarVisibilityStore.getState()
    expect(isHidden('v', 'a')).toBe(false)
    expect(isHidden('v', 'b')).toBe(true)
  })

  it('reset clears every hidden path for the vault but leaves siblings alone', async () => {
    await useSidebarVisibilityStore.getState().hide('v1', 'a')
    await useSidebarVisibilityStore.getState().hide('v1', 'b')
    await useSidebarVisibilityStore.getState().hide('v2', 'c')
    await useSidebarVisibilityStore.getState().reset('v1')
    const store = useSidebarVisibilityStore.getState()
    expect(store.hiddenCount('v1')).toBe(0)
    expect(store.hiddenCount('v2')).toBe(1)
    expect(store.isHidden('v2', 'c')).toBe(true)
  })

  it('forgetVault drops state and persists the removal', async () => {
    await useSidebarVisibilityStore.getState().hide('v1', 'a')
    await useSidebarVisibilityStore.getState().forgetVault('v1')
    expect(useSidebarVisibilityStore.getState().hiddenCount('v1')).toBe(0)
    // Persisted form: the row should no longer carry v1.
    const row = await db.preferences.get('sidebar:hiddenByVault')
    const value = row?.value as Record<string, unknown> | undefined
    expect(value && 'v1' in value).toBeFalsy()
  })

  it('skips re-hiding an already-hidden path (idempotent)', async () => {
    await useSidebarVisibilityStore.getState().hide('v', 'a')
    await useSidebarVisibilityStore.getState().hide('v', 'a')
    expect(useSidebarVisibilityStore.getState().hiddenCount('v')).toBe(1)
  })

  it('init self-heals if the persisted shape is junk', async () => {
    await db.preferences.put({ key: 'sidebar:hiddenByVault', value: 'oops' })
    useSidebarVisibilityStore.setState({ hiddenByVault: {}, ready: false })
    await useSidebarVisibilityStore.getState().init()
    expect(useSidebarVisibilityStore.getState().hiddenByVault).toEqual({})
  })
})
