/**
 * Per-vault flat file-list cache for the command palette (M5.2).
 *
 * Walks the entire vault on first request and memoizes the resulting
 * promise so subsequent ⌘K opens reuse the work. The cache is keyed by
 * vault id; switching vaults uses a different entry.
 *
 * Failed walks are evicted so a retry can succeed.
 */

import { walkAllFiles } from '@/core/vault'
import type { VaultFile, VaultFileSystem, VaultId } from '@/core/vault'

const cache = new Map<VaultId, Promise<VaultFile[]>>()

/**
 * Default extension allowlist: every renderable / referenceable file in
 * Phase 1. Markdown is the obvious case; the others ride along so the
 * palette can also navigate to embedded images, configs, and code that
 * the universal-file-reader (M7) will eventually open.
 */
const PALETTE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.csv',
  '.tsv',
  '.html',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg',
])

export function getWalkedFiles(vault: VaultFileSystem): Promise<VaultFile[]> {
  const cached = cache.get(vault.id)
  if (cached) return cached
  const promise = walkAllFiles(vault, {
    includeExtensions: PALETTE_EXTENSIONS,
  }).catch((err: unknown) => {
    cache.delete(vault.id)
    throw err
  })
  cache.set(vault.id, promise)
  return promise
}

/** Drop the cached walk for a vault (e.g. when content is known to have
 *  changed — currently unused in Phase 1 but ready for M9 watchers). */
export function invalidateWalkedFiles(vaultId: VaultId): void {
  cache.delete(vaultId)
}

/** Test-only — clears the cache between test cases. */
export function __resetWalkedFilesCacheForTests(): void {
  cache.clear()
}
