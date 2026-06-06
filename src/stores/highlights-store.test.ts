import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetDbForTests, db } from '@/core/persistence/db'
import type { Anchor } from '@/core/highlights/types'
import { useVaultStore } from './vault-store'
import { useHighlightsStore, docKey } from './highlights-store'
import { runVaultDeletionHooks } from './vault-lifecycle'

function registerTestVault(id: string): void {
  const now = new Date()
  useVaultStore.setState((s) => ({
    registeredVaults: [
      ...s.registeredVaults.filter((v) => v.id !== id),
      { id, name: id, registeredAt: now, lastOpenedAt: now },
    ],
  }))
}

function anchor(quote: string): Anchor {
  return {
    quote,
    prefix: 'before ',
    suffix: ' after',
    startHint: 7,
    endHint: 7 + quote.length,
  }
}

beforeEach(async () => {
  await __resetDbForTests()
  useHighlightsStore.setState({ byDoc: {}, ready: true })
  useVaultStore.setState({ registeredVaults: [] })
  registerTestVault('v')
})

afterEach(async () => {
  await __resetDbForTests()
})

describe('highlights-store', () => {
  it('add persists a highlight and getForDoc returns it', async () => {
    const hl = await useHighlightsStore
      .getState()
      .add('v', 'doc.md', anchor('hello'), 'yellow', 'a note')
    expect(hl).not.toBeNull()

    const fromStore = useHighlightsStore.getState().getForDoc('v', 'doc.md')
    expect(fromStore).toHaveLength(1)
    expect(fromStore[0]?.anchor.quote).toBe('hello')
    expect(fromStore[0]?.color).toBe('yellow')
    expect(fromStore[0]?.note).toBe('a note')

    const row = await db.highlights.get(hl!.id)
    expect(row?.path).toBe('doc.md')
    expect(row?.anchor.quote).toBe('hello')
  })

  it('add no-ops for an unregistered (removed) vault', async () => {
    useVaultStore.setState({ registeredVaults: [] })
    const hl = await useHighlightsStore
      .getState()
      .add('v', 'doc.md', anchor('late'), 'blue')
    expect(hl).toBeNull()
    expect(useHighlightsStore.getState().getForDoc('v', 'doc.md')).toHaveLength(
      0,
    )
    expect(await db.highlights.count()).toBe(0)
  })

  it('setColor and setNote update memory + Dexie', async () => {
    const hl = (await useHighlightsStore
      .getState()
      .add('v', 'doc.md', anchor('x'), 'yellow'))!
    await useHighlightsStore.getState().setColor(hl.id, 'green')
    await useHighlightsStore.getState().setNote(hl.id, 'edited')

    const updated = useHighlightsStore.getState().getForDoc('v', 'doc.md')[0]
    expect(updated?.color).toBe('green')
    expect(updated?.note).toBe('edited')

    const row = await db.highlights.get(hl.id)
    expect(row?.color).toBe('green')
    expect(row?.note).toBe('edited')
  })

  it('remove drops the highlight from memory + Dexie', async () => {
    const hl = (await useHighlightsStore
      .getState()
      .add('v', 'doc.md', anchor('y'), 'pink'))!
    await useHighlightsStore.getState().remove(hl.id)
    expect(useHighlightsStore.getState().getForDoc('v', 'doc.md')).toHaveLength(
      0,
    )
    expect(await db.highlights.get(hl.id)).toBeUndefined()
  })

  it('survives a re-init: persisted highlights re-hydrate keyed by document', async () => {
    await useHighlightsStore
      .getState()
      .add('v', 'a.md', anchor('one'), 'yellow')
    await useHighlightsStore.getState().add('v', 'b.md', anchor('two'), 'blue')

    // Reset in-memory state and re-init from Dexie.
    useHighlightsStore.setState({ byDoc: {}, ready: false })
    await useHighlightsStore.getState().init()

    expect(useHighlightsStore.getState().getForDoc('v', 'a.md')).toHaveLength(1)
    expect(useHighlightsStore.getState().getForDoc('v', 'b.md')).toHaveLength(1)
    expect(
      useHighlightsStore.getState().byDoc[docKey('v', 'a.md')],
    ).toBeDefined()
  })

  it('forgetVault clears in-memory + Dexie rows for that vault only', async () => {
    registerTestVault('w')
    await useHighlightsStore
      .getState()
      .add('v', 'a.md', anchor('keep'), 'yellow')
    await useHighlightsStore.getState().add('w', 'a.md', anchor('drop'), 'blue')

    useHighlightsStore.getState().forgetVault('w')
    // Give the fire-and-forget Dexie delete a tick.
    await new Promise((r) => setTimeout(r, 0))

    expect(useHighlightsStore.getState().getForDoc('w', 'a.md')).toHaveLength(0)
    expect(useHighlightsStore.getState().getForDoc('v', 'a.md')).toHaveLength(1)
    const remaining = await db.highlights.where('vaultId').equals('w').count()
    expect(remaining).toBe(0)
    const kept = await db.highlights.where('vaultId').equals('v').count()
    expect(kept).toBe(1)
  })

  it('is wired into the vault-deletion hook registry', async () => {
    await useHighlightsStore.getState().add('v', 'a.md', anchor('z'), 'purple')
    await runVaultDeletionHooks('v')
    await new Promise((r) => setTimeout(r, 0))
    expect(useHighlightsStore.getState().getForDoc('v', 'a.md')).toHaveLength(0)
    expect(await db.highlights.where('vaultId').equals('v').count()).toBe(0)
  })
})
