import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetDbForTests } from '@/core/persistence/db'
import {
  deleteBatch,
  forgetVault,
  getBatch,
  getCardsForBatch,
  listBatches,
  persistBatch,
  purgeExpired,
} from './card-store'
import type { ReviewBatch, ReviewCard } from './types'

// Far enough in the future that the 24h default TTL never expires
// against the real wall clock — `getBatch` lazy-purges on access.
const FIXED_NOW = new Date('2099-05-09T10:00:00Z')

function makeBatch(overrides: Partial<ReviewBatch> = {}): ReviewBatch {
  return {
    id: 'batch-1',
    vaultId: 'vault-a',
    sourcePaths: ['react.md'],
    label: 'react.md',
    providerLabel: 'Claude',
    createdAt: FIXED_NOW,
    expiresAt: new Date(FIXED_NOW.getTime() + 24 * 3600 * 1000),
    ...overrides,
  }
}

function makeCards(batchId: string, count: number): ReviewCard[] {
  const batch = makeBatch({ id: batchId })
  return Array.from({ length: count }, (_, i) => ({
    id: `${batchId}-card-${String(i)}`,
    batchId,
    vaultId: batch.vaultId,
    order: i,
    question: `Q${String(i)}`,
    answer: `A${String(i)}`,
    explanation: `E${String(i)}`,
    sourcePath: 'react.md',
    createdAt: batch.createdAt,
    expiresAt: batch.expiresAt,
  }))
}

beforeEach(async () => {
  await __resetDbForTests()
})

afterEach(async () => {
  await __resetDbForTests()
})

describe('review card-store', () => {
  it('round-trips a batch + cards', async () => {
    const batch = makeBatch()
    const cards = makeCards('batch-1', 3)
    await persistBatch(batch, cards)

    const stored = await getBatch('batch-1')
    expect(stored?.label).toBe('react.md')
    expect(stored?.sourcePaths).toEqual(['react.md'])

    const storedCards = await getCardsForBatch('batch-1')
    expect(storedCards.map((c) => c.question)).toEqual(['Q0', 'Q1', 'Q2'])
  })

  it('returns cards in display order regardless of insertion order', async () => {
    const cards = makeCards('batch-1', 5).reverse()
    await persistBatch(makeBatch(), cards)
    const stored = await getCardsForBatch('batch-1')
    expect(stored.map((c) => c.order)).toEqual([0, 1, 2, 3, 4])
  })

  it('lists batches for a vault newest-first and skips other vaults', async () => {
    await persistBatch(
      makeBatch({
        id: 'a',
        vaultId: 'vault-a',
        createdAt: new Date('2026-05-09T08:00:00Z'),
      }),
      [],
    )
    await persistBatch(
      makeBatch({
        id: 'b',
        vaultId: 'vault-a',
        createdAt: new Date('2026-05-09T09:00:00Z'),
      }),
      [],
    )
    await persistBatch(makeBatch({ id: 'c', vaultId: 'vault-b' }), [])

    const list = await listBatches('vault-a')
    expect(list.map((b) => b.id)).toEqual(['b', 'a'])
  })

  it('deleteBatch removes the batch and cascades to its cards', async () => {
    await persistBatch(makeBatch(), makeCards('batch-1', 4))
    await deleteBatch('batch-1')
    expect(await getBatch('batch-1')).toBeNull()
    expect((await getCardsForBatch('batch-1')).length).toBe(0)
  })

  it('forgetVault clears every batch + card for a vault', async () => {
    await persistBatch(
      makeBatch({ id: 'a', vaultId: 'vault-a' }),
      makeCards('a', 2),
    )
    await persistBatch(
      makeBatch({ id: 'b', vaultId: 'vault-a' }),
      makeCards('b', 2),
    )
    await persistBatch(
      makeBatch({ id: 'c', vaultId: 'vault-other' }),
      makeCards('c', 2),
    )

    await forgetVault('vault-a')
    expect((await listBatches('vault-a')).length).toBe(0)
    expect((await getCardsForBatch('a')).length).toBe(0)
    // Untouched vault keeps its data.
    expect((await listBatches('vault-other')).length).toBe(1)
  })

  it('purgeExpired drops batches and cascades their cards', async () => {
    // Times must be relative to FIXED_NOW (year 2099) rather than 2026, so
    // `getBatch`'s lazy-purge — which compares against the real wall clock —
    // doesn't drop the "future" batch out from under the assertion.
    const expired = new Date(FIXED_NOW.getTime() - 24 * 3600 * 1000)
    const future = new Date(FIXED_NOW.getTime() + 24 * 3600 * 1000)
    await persistBatch(
      makeBatch({ id: 'old', expiresAt: expired }),
      makeCards('old', 3).map((c) => ({ ...c, expiresAt: expired })),
    )
    await persistBatch(
      makeBatch({ id: 'new', expiresAt: future }),
      makeCards('new', 3).map((c) => ({ ...c, expiresAt: future })),
    )

    await purgeExpired(FIXED_NOW.getTime())
    expect(await getBatch('old')).toBeNull()
    expect((await getCardsForBatch('old')).length).toBe(0)
    expect(await getBatch('new')).not.toBeNull()
    expect((await getCardsForBatch('new')).length).toBe(3)
  })

  it('purgeExpired is a no-op when nothing has expired', async () => {
    await persistBatch(makeBatch(), makeCards('batch-1', 2))
    // `now` predates every expiry — nothing should be touched.
    await purgeExpired(new Date('2026-05-09T00:00:00Z').getTime())
    expect((await getCardsForBatch('batch-1')).length).toBe(2)
  })

  it('getBatch lazily purges if the batch is already past its expiry', async () => {
    const expired = new Date('2026-05-08T00:00:00Z')
    await persistBatch(
      makeBatch({ id: 'stale', expiresAt: expired }),
      makeCards('stale', 1).map((c) => ({ ...c, expiresAt: expired })),
    )
    // No explicit purge call — getBatch should self-heal at access.
    expect(await getBatch('stale')).toBeNull()
  })
})
