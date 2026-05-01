/**
 * Wikilink resolution — turn a `[[target]]` string into a real `VaultPath`.
 *
 * Strategy:
 *   1. Build an index of every file in the vault: basename → list of paths
 *      (for both the full filename and the stem without extension)
 *   2. Resolution checks, in order:
 *      a. Is `target` an exact existing path?
 *      b. Does `target.md` (or `.mdx`) exist as an exact path?
 *      c. Does the basename match anything in the index?
 *
 * Building the index is O(N) over the vault; queries are O(1). The index is
 * built per-document by `DocumentPage`; M3.4+ may move it into the store
 * for cross-document caching.
 */

import type { VaultFileSystem, VaultPath } from '@/core/vault'
import { basename, isMarkdown, normalizePath } from '@/core/vault'

/**
 * Maps a "lookup key" (filename or stem) to every full vault path that ends
 * with that key. A single key can map to multiple paths if the user has
 * sibling files with the same basename in different folders.
 */
export type WikilinkIndex = Map<string, VaultPath[]>

/** Build a wikilink index by walking every file in the vault. */
export async function buildWikilinkIndex(
  vault: VaultFileSystem,
): Promise<WikilinkIndex> {
  const index: WikilinkIndex = new Map()
  for await (const file of vault.walk()) {
    const filename = basename(file.path)
    addToIndex(index, filename, file.path)
    const stem = stripExtension(filename)
    if (stem !== filename) addToIndex(index, stem, file.path)
  }
  return index
}

/**
 * Resolve a wikilink target to a concrete vault path, or `null` if no match.
 *
 * `currentPath` is the vault-relative path of the document containing the
 * wikilink — used to disambiguate when the index has multiple matches by
 * preferring the closest sibling. (Phase-2 polish; for now we just take the
 * first match.)
 */
export function resolveWikilink(
  target: string,
  index: WikilinkIndex,
  _currentPath?: VaultPath,
): VaultPath | null {
  const normalized = normalizePath(target)
  if (!normalized) return null

  // Exact path with extension
  if (containsAnyMatch(index, normalized)) {
    return normalized
  }

  // Try with `.md` / `.mdx` appended if the target has no extension
  if (!hasExtension(normalized)) {
    for (const ext of ['.md', '.mdx']) {
      const withExt = normalized + ext
      if (containsAnyMatch(index, withExt)) {
        return withExt
      }
    }
  }

  // Basename or stem lookup
  const lookupKey = basename(normalized)
  const matches = index.get(lookupKey)
  if (matches && matches.length > 0) {
    // First match wins (deterministic: insertion order from walk).
    // Cross-document disambiguation against `currentPath` lands in M3.x polish.
    return matches[0] ?? null
  }

  // Try with extension on the basename
  if (!hasExtension(lookupKey)) {
    for (const ext of ['.md', '.mdx']) {
      const withExt = lookupKey + ext
      const matchesWithExt = index.get(withExt)
      if (matchesWithExt && matchesWithExt.length > 0) {
        return matchesWithExt[0] ?? null
      }
    }
  }

  return null
}

/** Whether the resolved target is renderable as Markdown vs raw fallback. */
export function isMarkdownTarget(path: VaultPath): boolean {
  return isMarkdown(path)
}

/* ─── helpers ────────────────────────────────────────────────────────── */

function addToIndex(index: WikilinkIndex, key: string, path: VaultPath): void {
  const existing = index.get(key)
  if (existing) {
    existing.push(path)
  } else {
    index.set(key, [path])
  }
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return name
  return name.slice(0, dot)
}

function hasExtension(path: string): boolean {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  return dot > 0
}

function containsAnyMatch(index: WikilinkIndex, path: VaultPath): boolean {
  for (const paths of index.values()) {
    if (paths.includes(path)) return true
  }
  return false
}
