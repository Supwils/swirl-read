/**
 * Dexie schema for SwilRead's persistent state.
 *
 * Tables:
 *   - `vaults`           — vault metadata records (one row per registered vault)
 *   - `preferences`      — global key-value preference store (theme, font, ...)
 *   - `recentFiles`      — per-vault recent file paths for navigation surfaces
 *   - `backlinks`        — per-vault resolved wikilink edges
 *   - `scrollPositions`  — per-file scroll memory (M2.7)
 *   - `hintsSeen`        — per-hint id "you've seen this" flag (M9.4)
 *   - `openTabs`         — per-vault open document tabs (multi-tab UI)
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

interface SwilReadDB extends Dexie {
  vaults: EntityTable<StoredVault, 'id'>
  preferences: EntityTable<PreferenceRow, 'key'>
  recentFiles: EntityTable<RecentFileRow, 'id'>
  backlinks: EntityTable<BacklinkRow, 'id'>
  scrollPositions: EntityTable<ScrollPositionRow, 'id'>
  hintsSeen: EntityTable<HintSeenRow, 'id'>
  openTabs: EntityTable<OpenTabRow, 'id'>
}

function buildDb(): SwilReadDB {
  const db = new Dexie('swilread') as SwilReadDB
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
  return db
}

export const db: SwilReadDB = buildDb()

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
    ],
    async () => {
      await db.vaults.clear()
      await db.preferences.clear()
      await db.recentFiles.clear()
      await db.backlinks.clear()
      await db.scrollPositions.clear()
      await db.hintsSeen.clear()
      await db.openTabs.clear()
    },
  )
}
