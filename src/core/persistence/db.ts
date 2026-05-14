/**
 * Dexie schema for SwirlRead's persistent state.
 *
 * Tables:
 *   - `vaults`           — vault metadata records (one row per registered vault)
 *   - `preferences`      — global key-value preference store (theme, font, ...)
 *   - `recentFiles`      — per-vault recent file paths for navigation surfaces
 *   - `backlinks`        — per-vault resolved wikilink edges
 *   - `scrollPositions`  — per-file scroll memory (M2.7)
 *   - `hintsSeen`        — per-hint id "you've seen this" flag (M9.4)
 *   - `openTabs`         — per-vault open document tabs (multi-tab UI)
 *   - `aiKeys`           — provider-keyed encrypted API keys (Phase 3)
 *   - `reviewBatches`    — AI-generated flashcard batches (Phase 3 review)
 *   - `reviewCards`      — individual review cards inside a batch
 *   - `panes`            — per-vault pane state (single|dual mode, active id,
 *                          each pane's current document path) for Workspace
 *
 * Handle persistence (binary `FileSystemDirectoryHandle` blobs) lives in a
 * separate idb-keyval store; see `core/vault/handle-storage.ts`. Splitting
 * them keeps the structured-cloneable handles isolated from the rich
 * indexed-record schema, which simplifies migrations.
 */

import Dexie, { type EntityTable } from 'dexie'
import type { VaultMeta } from '@/core/vault'

/** Stored as `{ id, name, registeredAtMs, lastOpenedAtMs }`. We serialize
 *  Date → number at the boundary to keep IDB-friendly value shapes. */
export interface StoredVault {
  id: string
  name: string
  registeredAtMs: number
  lastOpenedAtMs: number
  fileCount?: number
}

/** Generic preference row. Value is JSON-serializable. */
export interface PreferenceRow {
  key: string
  value: unknown
}

/** One recent-file row, keyed by `vaultId::path` via `id`. */
export interface RecentFileRow {
  id: string
  vaultId: string
  path: string
  openedAtMs: number
}

/** One resolved wikilink edge, keyed by `vaultId::sourcePath::targetPath`. */
export interface BacklinkRow {
  id: string
  vaultId: string
  targetPath: string
  sourcePath: string
  rawTarget: string
  context: string
  updatedAtMs: number
}

/** One scroll-position row, keyed by `vaultId::path` via `id`. */
export interface ScrollPositionRow {
  id: string
  vaultId: string
  path: string
  scrollY: number
  updatedAtMs: number
}

/** One "user has seen this hint" row, keyed by hint id (M9.4). */
export interface HintSeenRow {
  id: string
  seenAtMs: number
}

/** One open-tab row. `id` is `vaultId::path` so re-opening a tab is an
 *  upsert. `order` carries the display index within the vault; lower
 *  numbers come first. */
export interface OpenTabRow {
  id: string
  vaultId: string
  path: string
  pinned: boolean
  order: number
  openedAtMs: number
}

/** One AES-GCM-encrypted API key row, keyed by `provider`. The decryption
 *  key lives in the `preferences` table under `ai:masterKey` as a
 *  non-extractable CryptoKey, so the ciphertext at rest is unreadable
 *  even with full Dexie inspection. */
export interface AIKeyRow {
  provider: string
  ciphertext: ArrayBuffer
  iv: Uint8Array
  /** Free-form provider config that doesn't carry secrets — e.g.
   *  the OpenAI-compatible base URL or the model id override. */
  meta?: Record<string, string>
}

/** One AI-generated review batch (Phase 3 spaced-repetition surface).
 *  Cards live in {@link ReviewCardRow}, joined by `batchId`. Both rows
 *  carry an `expiresAtMs` so the TTL purge can drop them in a single
 *  bulkDelete without walking each card individually. */
export interface ReviewBatchRow {
  id: string
  vaultId: string
  /** Vault paths the batch was generated from. Single-source batches
   *  carry one entry; multi-file batches carry many. */
  sourcePaths: string[]
  /** Display label — e.g. the source basename or "3 selected files". */
  label: string
  /** Human-friendly hint of which AI provider generated the batch. */
  providerLabel: string
  createdAtMs: number
  expiresAtMs: number
}

/** One review card inside a batch. Indexed by `batchId` so we can pull
 *  every card for a batch in one range query. */
export interface ReviewCardRow {
  id: string
  batchId: string
  vaultId: string
  /** Position within the batch. Lower numbers come first; immutable
   *  for the lifetime of the card. */
  order: number
  question: string
  answer: string
  explanation: string
  /** Path of the source note this card was distilled from. Lets us
   *  link "Source" back into the reading shell on the answer side. */
  sourcePath: string
  createdAtMs: number
  expiresAtMs: number
}

/** One pane-state row, keyed by `vaultId`. Persisted so reloads restore
 *  both panes' current documents, split ratio, and active focus. */
export interface PaneStateRow {
  vaultId: string
  panes: { id: string; currentPath: string | null }[]
  activePaneId: string
  viewMode: 'single' | 'dual'
}

interface SwirlReadDB extends Dexie {
  vaults: EntityTable<StoredVault, 'id'>
  preferences: EntityTable<PreferenceRow, 'key'>
  recentFiles: EntityTable<RecentFileRow, 'id'>
  backlinks: EntityTable<BacklinkRow, 'id'>
  scrollPositions: EntityTable<ScrollPositionRow, 'id'>
  hintsSeen: EntityTable<HintSeenRow, 'id'>
  openTabs: EntityTable<OpenTabRow, 'id'>
  aiKeys: EntityTable<AIKeyRow, 'provider'>
  reviewBatches: EntityTable<ReviewBatchRow, 'id'>
  reviewCards: EntityTable<ReviewCardRow, 'id'>
  panes: EntityTable<PaneStateRow, 'vaultId'>
}

function buildDb(): SwirlReadDB {
  const db = new Dexie('swirlread') as SwirlReadDB
  db.version(1).stores({
    // Indexes: id (primary), name (queryable), lastOpenedAtMs (sortable)
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
  })
  db.version(2).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
  })
  db.version(3).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
    backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs',
  })
  db.version(4).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
    backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs',
    scrollPositions: 'id, vaultId, updatedAtMs',
  })
  db.version(5).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
    backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs',
    scrollPositions: 'id, vaultId, updatedAtMs',
    hintsSeen: 'id, seenAtMs',
  })
  db.version(6).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
    backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs',
    scrollPositions: 'id, vaultId, updatedAtMs',
    hintsSeen: 'id, seenAtMs',
    openTabs: 'id, vaultId, [vaultId+order], openedAtMs',
  })
  db.version(7).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
    backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs',
    scrollPositions: 'id, vaultId, updatedAtMs',
    hintsSeen: 'id, seenAtMs',
    openTabs: 'id, vaultId, [vaultId+order], openedAtMs',
    aiKeys: 'provider',
  })
  db.version(8).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
    backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs',
    scrollPositions: 'id, vaultId, updatedAtMs',
    hintsSeen: 'id, seenAtMs',
    openTabs: 'id, vaultId, [vaultId+order], openedAtMs',
    aiKeys: 'provider',
    // Range-indexed by `expiresAtMs` so the TTL purge can grab every
    // expired row in one query. `vaultId` is indexed so vault deletion
    // can fan out a forget-all in O(matched-rows).
    reviewBatches: 'id, vaultId, expiresAtMs, createdAtMs',
    reviewCards: 'id, batchId, vaultId, [batchId+order], expiresAtMs',
  })
  db.version(9).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
    backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs',
    scrollPositions: 'id, vaultId, updatedAtMs',
    hintsSeen: 'id, seenAtMs',
    openTabs: 'id, vaultId, [vaultId+order], openedAtMs',
    aiKeys: 'provider',
    reviewBatches: 'id, vaultId, expiresAtMs, createdAtMs',
    reviewCards: 'id, batchId, vaultId, [batchId+order], expiresAtMs',
  })
  // Panes table: one row per vault holds both panes' state (current doc,
  // active focus, view mode). Tabs remain per-vault and window-shared;
  // adding pane state alongside without touching openTabs keeps the
  // migration trivial — no row rewriting, no compound keys.
  db.version(10).stores({
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
    recentFiles: 'id, vaultId, openedAtMs',
    backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs',
    scrollPositions: 'id, vaultId, updatedAtMs',
    hintsSeen: 'id, seenAtMs',
    openTabs: 'id, vaultId, [vaultId+order], openedAtMs',
    aiKeys: 'provider',
    reviewBatches: 'id, vaultId, expiresAtMs, createdAtMs',
    reviewCards: 'id, batchId, vaultId, [batchId+order], expiresAtMs',
    panes: 'vaultId',
  })
  return db
}

export const db: SwirlReadDB = buildDb()

/* ─── conversion helpers between StoredVault and VaultMeta ───────────── */

export function storedToMeta(stored: StoredVault): VaultMeta {
  return {
    id: stored.id,
    name: stored.name,
    registeredAt: new Date(stored.registeredAtMs),
    lastOpenedAt: new Date(stored.lastOpenedAtMs),
    ...(stored.fileCount !== undefined && { fileCount: stored.fileCount }),
  }
}

export function metaToStored(meta: VaultMeta): StoredVault {
  return {
    id: meta.id,
    name: meta.name,
    registeredAtMs: meta.registeredAt.getTime(),
    lastOpenedAtMs: meta.lastOpenedAt.getTime(),
    ...(meta.fileCount !== undefined && { fileCount: meta.fileCount }),
  }
}

/** Test-only: clear all rows so the next test starts from an empty store.
 *  We deliberately do NOT delete the Dexie instance — that would leave the
 *  module-level `db` reference pointing at a closed connection. */
export async function __resetDbForTests(): Promise<void> {
  if (!db.isOpen()) await db.open()
  await db.transaction(
    'rw',
    [
      db.vaults,
      db.preferences,
      db.recentFiles,
      db.backlinks,
      db.scrollPositions,
      db.hintsSeen,
      db.openTabs,
      db.aiKeys,
      db.reviewBatches,
      db.reviewCards,
      db.panes,
    ],
    async () => {
      await db.vaults.clear()
      await db.preferences.clear()
      await db.recentFiles.clear()
      await db.backlinks.clear()
      await db.scrollPositions.clear()
      await db.hintsSeen.clear()
      await db.openTabs.clear()
      await db.aiKeys.clear()
      await db.reviewBatches.clear()
      await db.reviewCards.clear()
      await db.panes.clear()
    },
  )
}
