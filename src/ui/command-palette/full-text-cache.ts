/**
 * Per-vault full-text index cache (M5.4).
 *
 * Mirrors `walked-files-cache.ts` and `tag-index-cache.ts`: build once,
 * reuse for the lifetime of the vault adapter. Failed builds evicted so
 * a retry can succeed. `removeVault` calls `invalidateFullTextIndex`
 * via the same fan-out pattern as the other per-vault caches.
 */

import { buildFullTextIndex, type FullTextIndex } from '@/core/search/full-text'
import type { VaultFileSystem, VaultId } from '@/core/vault'

const cache = new Map<VaultId, Promise<FullTextIndex>>()

export function getFullTextIndex(
  vault: VaultFileSystem,
): Promise<FullTextIndex> {
  const cached = cache.get(vault.id)
  if (cached) return cached
  const promise = buildFullTextIndex(vault).catch((err: unknown) => {
    cache.delete(vault.id)
    throw err
  })
  cache.set(vault.id, promise)
  return promise
}

export function invalidateFullTextIndex(vaultId: VaultId): void {
  cache.delete(vaultId)
}

/** Test-only — clears the cache between cases. */
export function __resetFullTextCacheForTests(): void {
  cache.clear()
}
