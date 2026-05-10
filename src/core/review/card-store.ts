/**
 * Dexie-backed CRUD for review batches + cards.
 *
 * Two-table layout: `reviewBatches` carries the metadata, `reviewCards`
 * carries the per-card text. Joining by `batchId` keeps "list batches"
 * O(batches) and "open batch" O(cards-in-batch) without scanning the
 * whole card pool.
 *
 * TTL is enforced by `purgeExpired()` which the app calls on startup
 * and on every batch read. We deliberately don't run a `setInterval` —
 * that would tick after the tab is closed (it doesn't), drift across
 * suspends, and create the kind of "why is this still in memory"
 * mystery we want to avoid.
 */

import {
  db,
  type ReviewBatchRow,
  type ReviewCardRow,
} from '@/core/persistence/db'
import type { VaultId } from '@/core/vault'
import { registerVaultDeletionHook } from '@/stores/vault-lifecycle'
import type { ReviewBatch, ReviewCard } from './types'

/** Upsert an entire batch + its cards in a single transaction. The
 *  generator builds both before persisting so a partial write is never
 *  visible — either every card lands or none. */
export async function persistBatch(
  batch: ReviewBatch,
  cards: ReviewCard[],
): Promise<void> {
  await db.transaction('rw', [db.reviewBatches, db.reviewCards], async () => {
    await db.reviewBatches.put(batchToRow(batch))
    if (cards.length > 0) {
      await db.reviewCards.bulkPut(cards.map(cardToRow))
    }
  })
}

export async function getBatch(batchId: string): Promise<ReviewBatch | null> {
  await purgeExpired()
  const row = await db.reviewBatches.get(batchId)
  return row ? rowToBatch(row) : null
}

/** Return every active batch for a vault, newest first. Expired batches
 *  are purged inline so callers never see stale rows. */
export async function listBatches(vaultId: VaultId): Promise<ReviewBatch[]> {
  await purgeExpired()
  const rows = await db.reviewBatches.where('vaultId').equals(vaultId).toArray()
  rows.sort((a, b) => b.createdAtMs - a.createdAtMs)
  return rows.map(rowToBatch)
}

/** Return cards for a batch in display order. */
export async function getCardsForBatch(batchId: string): Promise<ReviewCard[]> {
  const rows = await db.reviewCards
    .where('[batchId+order]')
    .between([batchId, 0], [batchId, Number.POSITIVE_INFINITY])
    .toArray()
  return rows.map(rowToCard)
}

/** Drop a batch + all of its cards. Used by the manual delete UI and
 *  by the TTL purge. */
export async function deleteBatch(batchId: string): Promise<void> {
  await db.transaction('rw', [db.reviewBatches, db.reviewCards], async () => {
    await db.reviewBatches.delete(batchId)
    await db.reviewCards.where('batchId').equals(batchId).delete()
  })
}

/** Forget every batch + card for a vault. Wired into the vault-removal
 *  fan-out so deleting a vault doesn't leave orphan review state. */
export async function forgetVault(vaultId: VaultId): Promise<void> {
  await db.transaction('rw', [db.reviewBatches, db.reviewCards], async () => {
    await db.reviewBatches.where('vaultId').equals(vaultId).delete()
    await db.reviewCards.where('vaultId').equals(vaultId).delete()
  })
}

/** Drop every batch whose `expiresAtMs <= now`, plus every orphan card.
 *  Cheap when called frequently because the index is range-queried. */
export async function purgeExpired(now: number = Date.now()): Promise<void> {
  const expiredBatchIds = await db.reviewBatches
    .where('expiresAtMs')
    .belowOrEqual(now)
    .primaryKeys()
  const expiredCardIds = await db.reviewCards
    .where('expiresAtMs')
    .belowOrEqual(now)
    .primaryKeys()
  if (expiredBatchIds.length === 0 && expiredCardIds.length === 0) return
  await db.transaction('rw', [db.reviewBatches, db.reviewCards], async () => {
    if (expiredBatchIds.length > 0) {
      await db.reviewBatches.bulkDelete(expiredBatchIds)
      // Cascade: drop every card that points at one of these batches —
      // the batch row may have expired before the cards if their TTLs
      // somehow drifted apart (they shouldn't, but be defensive).
      await db.reviewCards.where('batchId').anyOf(expiredBatchIds).delete()
    }
    if (expiredCardIds.length > 0) {
      await db.reviewCards.bulkDelete(expiredCardIds)
    }
  })
}

/* ─── row ↔ domain conversions ──────────────────────────────────────── */

function batchToRow(b: ReviewBatch): ReviewBatchRow {
  return {
    id: b.id,
    vaultId: b.vaultId,
    sourcePaths: b.sourcePaths,
    label: b.label,
    providerLabel: b.providerLabel,
    createdAtMs: b.createdAt.getTime(),
    expiresAtMs: b.expiresAt.getTime(),
  }
}

function rowToBatch(r: ReviewBatchRow): ReviewBatch {
  return {
    id: r.id,
    vaultId: r.vaultId,
    sourcePaths: r.sourcePaths,
    label: r.label,
    providerLabel: r.providerLabel,
    createdAt: new Date(r.createdAtMs),
    expiresAt: new Date(r.expiresAtMs),
  }
}

function cardToRow(c: ReviewCard): ReviewCardRow {
  return {
    id: c.id,
    batchId: c.batchId,
    vaultId: c.vaultId,
    order: c.order,
    question: c.question,
    answer: c.answer,
    explanation: c.explanation,
    sourcePath: c.sourcePath,
    createdAtMs: c.createdAt.getTime(),
    expiresAtMs: c.expiresAt.getTime(),
  }
}

function rowToCard(r: ReviewCardRow): ReviewCard {
  return {
    id: r.id,
    batchId: r.batchId,
    vaultId: r.vaultId,
    order: r.order,
    question: r.question,
    answer: r.answer,
    explanation: r.explanation,
    sourcePath: r.sourcePath,
    createdAt: new Date(r.createdAtMs),
    expiresAt: new Date(r.expiresAtMs),
  }
}

// The review subsystem has no in-memory store — cards are loaded fresh
// per page — so the deletion hook just runs the table-level cleanup.
registerVaultDeletionHook(async (vaultId) => {
  await forgetVault(vaultId)
})
