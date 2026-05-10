/**
 * Review-card domain types.
 *
 * A {@link ReviewBatch} is a single AI-generation run — one or more
 * source notes in, N flashcards out. Cards live in {@link ReviewCard}
 * rows joined back by `batchId`. Both rows carry a `expiresAt` so the
 * TTL purge can drop them via a single range query without walking the
 * cards individually.
 *
 * The whole subsystem is local-first: nothing here ever talks to a
 * server beyond the user's configured AI provider, and the storage is
 * Dexie. Cards are temporary by design — they let the user quiz
 * themselves on something they just read, then disappear.
 */

import type { VaultId, VaultPath } from '@/core/vault'

export interface ReviewCard {
  id: string
  batchId: string
  vaultId: VaultId
  order: number
  question: string
  answer: string
  explanation: string
  sourcePath: VaultPath
  createdAt: Date
  expiresAt: Date
}

export interface ReviewBatch {
  id: string
  vaultId: VaultId
  /** One entry for single-file batches; many for multi-file. */
  sourcePaths: VaultPath[]
  /** Display label — typically the source basename or "N selected files". */
  label: string
  /** Provider id label at generation time, surfaced in the review header
   *  so the user knows whose answers they're reviewing. */
  providerLabel: string
  createdAt: Date
  expiresAt: Date
}

/** Default time-to-live for new batches. The user's request is "1 day";
 *  we surface this constant so the Settings UI can override it later. */
export const DEFAULT_REVIEW_TTL_MS = 24 * 60 * 60 * 1000

/** Tunables for a single generation request. Defaults are picked to
 *  keep token cost reasonable on the largest documents we see in
 *  Wilson's vault while still giving the user a meaningful quiz. */
export interface GenerationOptions {
  /** How many cards to ask the model for. Hard ceiling at 25 — past
   *  that the prompt + response start eating real tokens. */
  cardCount?: number
  /** Override the default TTL. */
  ttlMs?: number
}

export const DEFAULT_CARD_COUNT = 10
export const MAX_CARD_COUNT = 25
