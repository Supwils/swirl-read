/**
 * Folder weight — recursive descendant file count for a vault directory.
 *
 * Used by the browse UI (Pebble Garden) to size folder cards: heavier
 * folders get a larger visual footprint. The count is capped early so
 * we never walk arbitrarily deep vaults just for a UI hint.
 *
 * System / hidden directories (dot-prefixed, `.git`, `node_modules`, …)
 * are skipped so embedded tooling folders don't inflate the weight of a
 * content folder that happens to contain them.
 */

import type { VaultFileSystem, VaultPath } from './types'
import { registerVaultDeletionHook } from '@/stores/vault-lifecycle'

// ─── System-folder denylist ────────────────────────────────────────────────

/**
 * Canonical denylist of folder *names* (last path segment) that are
 * considered system / tooling directories and excluded from weight walks.
 *
 * Dot-prefixed names are also treated as system folders by {@link isSystemFolder}
 * regardless of whether they appear here — this list covers non-dot names
 * that are still unambiguously tooling directories.
 */
export const SYSTEM_FOLDER_NAMES: ReadonlySet<string> = new Set([
  '.git',
  '.obsidian',
  '.trash',
  'node_modules',
  '.vscode',
  '.idea',
  '.DS_Store',
  '.cache',
])

/**
 * Returns `true` if the folder name should be treated as a system /
 * tooling directory and excluded from weight walks.
 *
 * A name is considered "system" when it either starts with `.`
 * (dotfile / dotfolder convention) or is explicitly listed in
 * {@link SYSTEM_FOLDER_NAMES}.
 *
 * @param name - The last path segment (folder display name), NOT a full path.
 */
export function isSystemFolder(name: string): boolean {
  return name.startsWith('.') || SYSTEM_FOLDER_NAMES.has(name)
}

// ─── Cache ─────────────────────────────────────────────────────────────────

// Keyed by `${vaultId}::${folderPath}`. We cache the Promise itself so
// concurrent callers for the same key share a single in-flight walk.
// On rejection we delete the key so a subsequent call can retry cleanly.
const weightCache = new Map<string, Promise<number>>()

function cacheKey(vaultId: string, folderPath: VaultPath): string {
  return `${vaultId}::${folderPath}`
}

/**
 * Drop all cached weights for a vault. Safe to call multiple times with
 * the same id (idempotent).
 */
export function invalidateFolderWeights(vaultId: string): void {
  const prefix = `${vaultId}::`
  for (const key of weightCache.keys()) {
    if (key.startsWith(prefix)) {
      weightCache.delete(key)
    }
  }
}

/** Test-only — clear the entire cache so tests start from a clean slate. */
export function __resetFolderWeightCacheForTests(): void {
  weightCache.clear()
}

// ─── Wire into vault-lifecycle ─────────────────────────────────────────────

registerVaultDeletionHook((vaultId) => {
  invalidateFolderWeights(vaultId)
})

// ─── Core walk ─────────────────────────────────────────────────────────────

const DEFAULT_CEILING = 120

/**
 * Recursive count of descendant FILES under `folderPath` (BFS over subdirs).
 *
 * - Skips any subdirectory whose name {@link isSystemFolder} returns `true`
 *   so embedded `.git` / `node_modules` do not inflate content weights.
 * - Stops once the running count reaches `opts.ceiling` (default 120) —
 *   exact values beyond the ceiling don't matter for size-bucketing.
 * - Swallows per-directory `list()` errors so a permission blip on one
 *   subdir does not abort the whole count.
 *
 * Results are cached per `(vault.id, folderPath)` pair. Call
 * {@link invalidateFolderWeights} to evict a vault's entries.
 */
export function folderWeight(
  vault: VaultFileSystem,
  folderPath: VaultPath,
  opts?: { ceiling?: number },
): Promise<number> {
  const key = cacheKey(vault.id, folderPath)
  const cached = weightCache.get(key)
  if (cached !== undefined) return cached

  const ceiling = opts?.ceiling ?? DEFAULT_CEILING

  const promise = computeWeight(vault, folderPath, ceiling)

  // Delete the key on rejection so the next call retries the walk.
  promise.catch(() => {
    weightCache.delete(key)
  })

  weightCache.set(key, promise)
  return promise
}

async function computeWeight(
  vault: VaultFileSystem,
  folderPath: VaultPath,
  ceiling: number,
): Promise<number> {
  let count = 0
  const queue: VaultPath[] = [folderPath]

  while (queue.length > 0 && count < ceiling) {
    const dir = queue.shift()!
    let entries
    try {
      entries = await vault.list(dir)
    } catch {
      // Per-directory failures are non-fatal — keep walking.
      continue
    }

    for (const entry of entries) {
      if (entry.isDirectory) {
        if (!isSystemFolder(entry.name)) {
          queue.push(entry.path)
        }
      } else {
        count += 1
        if (count >= ceiling) break
      }
    }
  }

  return count
}
