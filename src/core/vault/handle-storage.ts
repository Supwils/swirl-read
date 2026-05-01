/**
 * Persistent storage for File System Access API directory handles.
 *
 * Directory handles are structured-cloneable, so we can stash them in
 * IndexedDB and restore them across page reloads. The browser remembers
 * the user's grant; we only need to keep the handle.
 *
 * We use idb-keyval (a thin wrapper) rather than Dexie for this layer
 * because the schema is trivial (id → handle). Richer per-vault metadata
 * lives in a separate Dexie store later (M1.4 / M6.1).
 */

import { createStore, get, set, del, keys } from 'idb-keyval'
import type { VaultId } from './types'

const HANDLE_DB = 'swilread-vaults'
const HANDLE_STORE = 'directory-handles'

const store = createStore(HANDLE_DB, HANDLE_STORE)

/** Persist a directory handle under the given vault ID. Idempotent. */
export async function saveHandle(
  id: VaultId,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await set(id, handle, store)
}

/**
 * Restore a previously-saved directory handle.
 * Returns `undefined` if the ID is unknown.
 *
 * Note: the returned handle still requires `requestPermission()` before
 * it can be read; the browser revokes its grant per session by default.
 */
export async function loadHandle(
  id: VaultId,
): Promise<FileSystemDirectoryHandle | undefined> {
  return (await get<FileSystemDirectoryHandle>(id, store)) ?? undefined
}

/** Remove a saved handle. No-op if the ID is unknown. */
export async function deleteHandle(id: VaultId): Promise<void> {
  await del(id, store)
}

/** List all stored vault IDs. Order is implementation-defined. */
export async function listHandleIds(): Promise<VaultId[]> {
  return await keys<VaultId>(store)
}
