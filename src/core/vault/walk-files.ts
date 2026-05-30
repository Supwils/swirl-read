/**
 * Recursive vault walker — flat list of every file in a vault.
 *
 * Used by the command palette's file-search mode (M5.2). The walk is
 * breadth-first over directories so the resulting list is broadly
 * stable across runs (sibling order matches the adapter; depth order is
 * level-by-level), which makes "open the same file twice in a row from
 * the palette" feel deterministic.
 *
 * Errors on individual directories are swallowed — a single permission
 * blip on one folder shouldn't blank out the entire palette. The
 * top-level call's error still bubbles up.
 */

import type { VaultEntry, VaultFile, VaultFileSystem } from './types'
import { isSystemFolder } from './folder-weight'

export interface WalkOptions {
  /** When set, only files whose extension is in this set are returned
   *  (lowercased compare, leading dot included — `.md`, `.png`, …). */
  includeExtensions?: ReadonlySet<string>
  /**
   * Hard cap on the number of files returned. Walks stop once the cap
   * is reached. Defaults to 5_000 — enough for any realistic personal
   * vault and small enough that cmdk's per-keystroke filtering stays
   * snappy.
   */
  maxFiles?: number
  /**
   * When `true`, descend into system / hidden folders (`.git`,
   * `.obsidian`, `node_modules`, …). Defaults to `false` so search and the
   * command palette see the user's actual notes, not `.git` internals — on
   * a real Obsidian/git vault those would otherwise eat the file cap and
   * push real documents out of the results.
   */
  includeSystemFolders?: boolean
}

const DEFAULT_MAX_FILES = 5_000

export async function walkAllFiles(
  vault: VaultFileSystem,
  options: WalkOptions = {},
): Promise<VaultFile[]> {
  const max = options.maxFiles ?? DEFAULT_MAX_FILES
  const ext = options.includeExtensions
  const includeSystem = options.includeSystemFolders ?? false
  const out: VaultFile[] = []

  // BFS keeps the result level-ordered (top-level files before nested
  // ones), which matches the way humans scan the file tree visually.
  const queue: string[] = ['']
  while (queue.length > 0 && out.length < max) {
    const dir = queue.shift() ?? ''
    let entries: VaultEntry[]
    try {
      entries = await vault.list(dir)
    } catch {
      // Per-directory failures are non-fatal — keep walking.
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (!includeSystem && isSystemFolder(entry.name)) continue
        queue.push(entry.path)
      } else {
        if (ext && !ext.has(entry.extension.toLowerCase())) continue
        out.push(entry)
        if (out.length >= max) break
      }
    }
  }
  return out
}
