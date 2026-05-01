/**
 * Dexie schema for SwilRead's persistent state.
 *
 * Tables:
 *   - `vaults`         — vault metadata records (one row per registered vault)
 *   - `preferences`    — global key-value preference store (theme, font, ...)
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

interface SwilReadDB extends Dexie {
  vaults: EntityTable<StoredVault, 'id'>
  preferences: EntityTable<PreferenceRow, 'key'>
}

function buildDb(): SwilReadDB {
  const db = new Dexie('swilread') as SwilReadDB
  db.version(1).stores({
    // Indexes: id (primary), name (queryable), lastOpenedAtMs (sortable)
    vaults: 'id, name, lastOpenedAtMs',
    preferences: 'key',
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
  await db.transaction('rw', db.vaults, db.preferences, async () => {
    await db.vaults.clear()
    await db.preferences.clear()
  })
}
