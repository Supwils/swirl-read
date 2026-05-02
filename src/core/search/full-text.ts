/**
 * Full-text search index over a vault (M5.4 / M5.5).
 *
 * Wraps MiniSearch. Walks every `.md`/`.mdx` file via `walkAllFiles`,
 * reads its text, strips frontmatter, and feeds it to a MiniSearch
 * instance. The result is queryable with `searchIndex(query)` which
 * returns ranked hits with a small surrounding-text snippet for the
 * palette to display.
 *
 * Tokenization
 * ────────────
 * Default MiniSearch tokenization splits on whitespace and ASCII
 * punctuation, which doesn't segment CJK at all (Chinese has no
 * spaces). We provide a custom tokenizer that uses `Intl.Segmenter`
 * when available — that gives us word-level segmentation for CJK
 * scripts and falls back to MiniSearch's default behavior elsewhere.
 *
 * Threading
 * ─────────
 * Currently builds in-thread. For the 5_000-file walk cap (set in
 * `walkAllFiles`) total cost is well under one frame on a modern
 * laptop. M5.3's Web Worker upgrade can land later as a transparent
 * perf optimization — the public API here doesn't change.
 */

import MiniSearch from 'minisearch'
import { isMarkdown, walkAllFiles } from '@/core/vault'
import type { VaultFileSystem, VaultPath } from '@/core/vault'
import { extractFrontmatter } from '@/core/render/frontmatter'

export interface SearchHit {
  /** File path. */
  path: VaultPath
  /** Display name (basename). */
  name: string
  /** MiniSearch's relevance score; higher is better. */
  score: number
  /** Compact preview snippet around the first match. */
  snippet: string
}

interface IndexedDoc {
  id: string
  path: VaultPath
  name: string
  content: string
}

export interface FullTextIndex {
  miniSearch: MiniSearch<IndexedDoc>
  /** path → raw body text (frontmatter-stripped), used for snippet building. */
  bodies: Map<VaultPath, string>
  /** Number of documents indexed. */
  size: number
}

const SEARCH_FIELDS = ['name', 'content']
const SNIPPET_RADIUS = 60
const MAX_HITS = 25

/**
 * Walk a vault and build a fresh in-memory full-text index. Per-file
 * read failures are swallowed so one bad file doesn't blank the index.
 */
export async function buildFullTextIndex(
  vault: VaultFileSystem,
): Promise<FullTextIndex> {
  const files = await walkAllFiles(vault, {
    includeExtensions: new Set(['.md', '.mdx']),
  })

  const docs: IndexedDoc[] = []
  const bodies = new Map<VaultPath, string>()

  await Promise.all(
    files.map(async (file) => {
      if (!isMarkdown(file.path)) return
      let raw: string
      try {
        raw = await vault.readText(file.path)
      } catch {
        return
      }
      const fm = extractFrontmatter(raw)
      const body = fm.present ? fm.body : raw
      docs.push({
        id: file.path,
        path: file.path,
        name: file.name,
        content: body,
      })
      bodies.set(file.path, body)
    }),
  )

  const miniSearch = new MiniSearch<IndexedDoc>({
    fields: SEARCH_FIELDS,
    storeFields: ['path', 'name'],
    idField: 'id',
    tokenize: cjkAwareTokenize,
    searchOptions: {
      tokenize: cjkAwareTokenize,
      // Boost name matches over body; fuzzy at 20 % helps with typos
      // but stays tight enough that "react" doesn't match "racket".
      boost: { name: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  })
  miniSearch.addAll(docs)

  return { miniSearch, bodies, size: docs.length }
}

/**
 * Run a query against a built index. Returns up to `MAX_HITS` results
 * ranked by relevance, each with a short snippet around the first
 * match for the palette to display.
 */
export function searchIndex(index: FullTextIndex, query: string): SearchHit[] {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const raw = index.miniSearch.search(trimmed)
  const hits: SearchHit[] = []
  for (const result of raw.slice(0, MAX_HITS)) {
    const path = typeof result.path === 'string' ? result.path : ''
    if (!path) continue
    const name = typeof result.name === 'string' ? result.name : path
    const body = index.bodies.get(path) ?? ''
    hits.push({
      path,
      name,
      score: result.score,
      snippet: buildSnippet(body, trimmed),
    })
  }
  return hits
}

/**
 * Build a small text excerpt centred on the first occurrence of any
 * query term, for the search-result row's secondary line. Falls back
 * to the start of the body if no exact substring match is found
 * (MiniSearch's tokenizer + fuzziness can rank a doc that has no
 * literal substring; we just show the lead-in in that case).
 */
function buildSnippet(body: string, query: string): string {
  if (body === '') return ''
  const lcBody = body.toLowerCase()
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
  let bestIdx = -1
  for (const term of terms) {
    const idx = lcBody.indexOf(term)
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx
  }
  const center = bestIdx === -1 ? 0 : bestIdx
  const start = Math.max(0, center - SNIPPET_RADIUS)
  const end = Math.min(body.length, center + SNIPPET_RADIUS)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < body.length ? '…' : ''
  return `${prefix}${body.slice(start, end)}${suffix}`
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * CJK-aware tokenizer. Uses `Intl.Segmenter` when available to break
 * Chinese / Japanese / Korean strings into words. Other scripts fall
 * through to MiniSearch's default whitespace + punctuation split.
 */
function cjkAwareTokenize(text: string): string[] {
  if (!text) return []
  // Cheap heuristic: any character outside basic Latin / common
  // punctuation ranges pulls the whole text through Intl.Segmenter.
  // For pure ASCII we keep MiniSearch's behavior (faster for big
  // English corpora).
  const hasNonAscii = !/^[\x20-\x7e]*$/.test(text)
  if (!hasNonAscii) {
    return text
      .toLowerCase()
      .split(/[\s\p{P}\p{S}]+/u)
      .filter((token) => token.length > 0)
  }
  const segmenter = getSegmenter()
  if (!segmenter) {
    return text
      .toLowerCase()
      .split(/[\s\p{P}\p{S}]+/u)
      .filter((token) => token.length > 0)
  }
  const tokens: string[] = []
  for (const segment of segmenter.segment(text)) {
    if (!segment.isWordLike) continue
    const value = segment.segment.toLowerCase().trim()
    if (value.length > 0) tokens.push(value)
  }
  return tokens
}

let cachedSegmenter: Intl.Segmenter | null | undefined = undefined
function getSegmenter(): Intl.Segmenter | null {
  if (cachedSegmenter !== undefined) return cachedSegmenter
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    cachedSegmenter = null
    return null
  }
  try {
    cachedSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  } catch {
    cachedSegmenter = null
  }
  return cachedSegmenter
}
