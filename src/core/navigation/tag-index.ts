/**
 * Tag index (M3.14) — for every `#tag` referenced anywhere in a vault,
 * remember which markdown files mention it.
 *
 * Sources of tags per file:
 *
 *   1. **Body** — every match of the same regex used by the `remark-tag`
 *      render plugin (`findTagsInText`). Code spans / fenced blocks are
 *      naturally excluded because we strip them with a cheap pre-pass
 *      before scanning. Frontmatter is removed first so YAML-quoted
 *      `#hash` strings don't double-count.
 *   2. **Frontmatter** — `tags:` / `tag:` / `keywords:` (whatever
 *      `selectMetadata` understood) are added with the same normalization.
 *
 * The result is a `Map<tag, Set<path>>` and the inverse `Map<path, Set<tag>>`
 * — both directions are useful (tags-for-file vs files-for-tag).
 *
 * Walking is bounded by `walkAllFiles`'s default cap (5_000 files); each
 * file is read once. The output is cached per vault — see `tag-store.ts`.
 */

import { walkAllFiles } from '@/core/vault'
import type { VaultFileSystem, VaultPath } from '@/core/vault'
import { extractFrontmatter, selectMetadata } from '@/core/render/frontmatter'
import { findTagsInText, normalizeTag } from '@/core/render/plugins/remark-tag'

export interface TagIndex {
  /** Tag value (normalized) → set of file paths that reference it. */
  filesByTag: Map<string, Set<VaultPath>>
  /** File path → set of tag values that file references. */
  tagsByFile: Map<VaultPath, Set<string>>
  /** Total number of unique tags. Convenience for empty-state UI. */
  totalTags: number
}

/** Return every tag that file `text` references (body + frontmatter). */
export function tagsInMarkdownSource(text: string): string[] {
  const fm = extractFrontmatter(text)
  const fromBody = findTagsInText(stripCodeForTagScan(fm.body))
  const fromFrontmatter = fm.present
    ? selectMetadata(fm.data).tags.map((t) => normalizeTag(stripLeadingHash(t)))
    : []
  // Deduplicate while preserving first-occurrence order. Repeats inside
  // the same file are not interesting for the index.
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of [...fromBody, ...fromFrontmatter]) {
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

/**
 * Build a tag index for an entire vault by walking every markdown file
 * and accumulating the per-file tag sets. Throws if `walkAllFiles`
 * itself throws (e.g. permission revoked at the vault root); per-file
 * read failures are swallowed so one bad file doesn't blank the index.
 */
export async function buildTagIndex(vault: VaultFileSystem): Promise<TagIndex> {
  const files = await walkAllFiles(vault, {
    includeExtensions: new Set(['.md', '.mdx']),
  })
  const filesByTag = new Map<string, Set<VaultPath>>()
  const tagsByFile = new Map<VaultPath, Set<string>>()

  await Promise.all(
    files.map(async (file) => {
      let raw: string
      try {
        raw = await vault.readText(file.path)
      } catch {
        return
      }
      const tags = tagsInMarkdownSource(raw)
      if (tags.length === 0) return
      tagsByFile.set(file.path, new Set(tags))
      for (const tag of tags) {
        let bucket = filesByTag.get(tag)
        if (!bucket) {
          bucket = new Set()
          filesByTag.set(tag, bucket)
        }
        bucket.add(file.path)
      }
    }),
  )

  return { filesByTag, tagsByFile, totalTags: filesByTag.size }
}

/** Return files referencing a tag. Empty set if the tag is unknown. */
export function filesForTag(index: TagIndex, tag: string): VaultPath[] {
  const set = index.filesByTag.get(normalizeTag(stripLeadingHash(tag)))
  if (!set) return []
  // Stable alphabetical for display; callers can re-sort by recency etc.
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

/** Return tags referenced by a file. Empty array if the file has none. */
export function tagsForFile(index: TagIndex, path: VaultPath): string[] {
  const set = index.tagsByFile.get(path)
  if (!set) return []
  return Array.from(set).sort()
}

function stripLeadingHash(value: string): string {
  return value.startsWith('#') ? value.slice(1) : value
}

/**
 * Cheap `inlineCode` / fenced-code stripper. We don't need a real parser
 * here — replacing every backtick-fenced span with an equal-length
 * sequence of dots leaves character offsets stable and prevents the
 * tag regex from matching `#tag` inside code samples.
 */
function stripCodeForTagScan(source: string): string {
  // Fenced code blocks: ``` ... ``` (with optional language tag).
  let out = source.replace(/```[^\n]*\n[\s\S]*?\n```/g, (block) =>
    block.replace(/[^\n]/g, '.'),
  )
  // Inline code: `...`. Use a non-greedy match so consecutive spans
  // don't collapse together.
  out = out.replace(/`[^`\n]+`/g, (span) => span.replace(/[^\n]/g, '.'))
  return out
}
