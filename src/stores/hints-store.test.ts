import { describe, it, expect, beforeEach } from 'vitest'
import { __resetDbForTests, db } from '@/core/persistence/db'
import { useHintsStore } from './hints-store'

beforeEach(async () => {
  await __resetDbForTests()
  useHintsStore.setState({ seen: new Set<string>(), ready: false })
})

describe('useHintsStore (M9.4)', () => {
  it('starts with no hints seen', () => {
    expect(useHintsStore.getState().isSeen('first-vault')).toBe(false)
  })

  it('markSeen persists to Dexie and updates the in-memory set', async () => {
    await useHintsStore.getState().markSeen('first-vault')
    expect(useHintsStore.getState().isSeen('first-vault')).toBe(true)
    const rows = await db.hintsSeen.toArray()
    expect(rows.map((r) => r.id)).toContain('first-vault')
  })

  it('markSeen is idempotent', async () => {
    await useHintsStore.getState().markSeen('first-vault')
    await useHintsStore.getState().markSeen('first-vault')
    const rows = await db.hintsSeen.toArray()
    expect(rows.length).toBe(1)
  })

  it('init hydrates the seen set from Dexie', async () => {
    await db.hintsSeen.put({ id: 'first-vault', seenAtMs: Date.now() })
    await db.hintsSeen.put({ id: 'second-thing', seenAtMs: Date.now() })
    await useHintsStore.getState().init()
    expect(useHintsStore.getState().isSeen('first-vault')).toBe(true)
    expect(useHintsStore.getState().isSeen('second-thing')).toBe(true)
  })

  it('clearAll wipes both Dexie and the in-memory set', async () => {
    await useHintsStore.getState().markSeen('a')
    await useHintsStore.getState().markSeen('b')
    await useHintsStore.getState().clearAll()
    expect(useHintsStore.getState().seen.size).toBe(0)
    expect(await db.hintsSeen.count()).toBe(0)
  })
})
