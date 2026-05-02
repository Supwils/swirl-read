/**
 * Per-vault tag-index promise cache (M3.14).
 *
 * Mirrors `walked-files-cache.ts`: build the index on first request,
 * reuse the same promise for subsequent calls. Failed builds are
 * evicted so a retry can succeed.
 */

import { buildTagIndex, type TagIndex } from '@/core/navigation/tag-index'
import type { VaultFileSystem, VaultId } from '@/core/vault'

const cache = new Map<VaultId, Promise<TagIndex>>()

export function getTagIndex(vault: VaultFileSystem): Promise<TagIndex> {
  const cached = cache.get(vault.id)
  if (cached) return cached
  const promise = buildTagIndex(vault).catch((err: unknown) => {
    cache.delete(vault.id)
    throw err
  })
  cache.set(vault.id, promise)
  return promise
}

export function invalidateTagIndex(vaultId: VaultId): void {
  cache.delete(vaultId)
}

/** Test-only — clears the cache between cases. */
export function __resetTagIndexCacheForTests(): void {
  cache.clear()
}
