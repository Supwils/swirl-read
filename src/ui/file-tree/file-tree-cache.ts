/**
 * Module-level listing cache for the file tree.
 *
 * Lives outside `FileTree.tsx` so the component file only exports React
 * components (keeps Vite's fast-refresh boundary happy).
 *
 * Promises are cached so collapsing then re-expanding a folder doesn't
 * re-walk it. Failed listings are evicted so a retry can succeed.
 */

import type { VaultEntry, VaultFileSystem, VaultPath } from '@/core/vault'

const listingCache = new Map<string, Promise<VaultEntry[]>>()

export function getListing(
  vault: VaultFileSystem,
  dirPath: VaultPath,
): Promise<VaultEntry[]> {
  const key = `${vault.id}::${dirPath}`
  const cached = listingCache.get(key)
  if (cached) return cached
  const promise = vault.list(dirPath).catch((err: unknown) => {
    listingCache.delete(key)
    throw err
  })
  listingCache.set(key, promise)
  return promise
}

/**
 * Drop every cached listing for a single vault. Called on `removeVault`
 * so a re-registration of the same id doesn't see stale folder shapes.
 * No-op if the vault has nothing cached yet.
 */
export function invalidateFileTreeListings(vaultId: string): void {
  const prefix = `${vaultId}::`
  for (const key of listingCache.keys()) {
    if (key.startsWith(prefix)) listingCache.delete(key)
  }
}

/** Test-only — clears the cache so tests don't leak state between cases. */
export function __resetFileTreeCacheForTests(): void {
  listingCache.clear()
}

export function sortEntries(entries: VaultEntry[]): VaultEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}
