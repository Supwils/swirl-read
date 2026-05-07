/**
 * WikilinkPreview LRU cache (small).
 *
 * Hover popovers that fire `vault.readText(...)` on every open are wasteful
 * for the common "user repeatedly hovers the same handful of links while
 * scanning a document" case. Memoise the rendered snippet for a small
 * working set (10 entries) so repeat hovers are instant.
 *
 * Keys are `${vaultId}::${path}`. Insertion order in JS Map equals access
 * order, so we delete-and-reinsert on every hit to push the entry to the
 * tail; eviction simply takes Map's first key.
 *
 * Invalidation: when `refreshVaultContent` fires (P0 / P1 / P3 sync), the
 * vault-store fan-out calls `invalidateWikilinkPreviewCache(vaultId)` so
 * the next hover re-fetches.
 */

import type { VaultId, VaultPath } from '@/core/vault'

const MAX_ENTRIES = 10

const cache = new Map<string, string>()

function key(vaultId: VaultId, resolved: VaultPath): string {
  return `${vaultId}::${resolved}`
}

export function getCachedPreview(
  vaultId: VaultId,
  resolved: VaultPath,
): string | null {
  const k = key(vaultId, resolved)
  const value = cache.get(k)
  if (value === undefined) return null
  // Promote to most-recently-used.
  cache.delete(k)
  cache.set(k, value)
  return value
}

export function setCachedPreview(
  vaultId: VaultId,
  resolved: VaultPath,
  snippet: string,
): void {
  const k = key(vaultId, resolved)
  if (cache.has(k)) cache.delete(k)
  cache.set(k, snippet)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/**
 * Drop every cached entry that belongs to the given vault. Called by
 * `vault-store.refreshVaultContent` and `removeVault` so a content
 * refresh or eviction never serves stale snippets.
 */
export function invalidateWikilinkPreviewCache(vaultId: VaultId): void {
  const prefix = `${vaultId}::`
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k)
  }
}

/** Test-only — clear the entire cache between cases. */
export function __resetWikilinkPreviewCacheForTests(): void {
  cache.clear()
}
