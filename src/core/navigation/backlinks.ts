/**
 * Backlinks index — resolved wikilink edges, cached in memory + IndexedDB.
 *
 * The index is updated incrementally as files are read, and can also be built
 * for a whole vault by walking Markdown files.
 */

import { db, type BacklinkRow } from '@/core/persistence/db'
import { isMarkdown, normalizePath, splitPath } from '@/core/vault'
import type { VaultFileSystem, VaultId, VaultPath } from '@/core/vault'
import { parseWikilinkBody } from '@/core/render/plugins/remark-wikilink'
import {
  buildWikilinkIndex,
  resolveWikilink,
  type WikilinkIndex,
} from './wikilink-resolver'

export interface WikilinkReference {
  rawTarget: string
  target: string
  alias?: string
  heading?: string
  blockId?: string
  context: string
  offset: number
}

export interface Backlink {
  vaultId: VaultId
  /** File being linked to. */
  targetPath: VaultPath
  /** File containing the wikilink. */
  sourcePath: VaultPath
  /** Original user-written target inside `[[...]]`, before resolution. */
  rawTarget: string
  /** Compact surrounding text, suitable for a future preview row. */
  context: string
  updatedAt: Date
}

interface BacklinkCache {
  hydrated: boolean
  byTarget: Map<VaultPath, Backlink[]>
  bySource: Map<VaultPath, Backlink[]>
}

const caches = new Map<VaultId, BacklinkCache>()

const WIKILINK_RE = /\[\[([^\]\n]+)]]/g
const FENCE_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g
const INLINE_CODE_RE = /`[^`\n]+`/g
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const CONTEXT_CHARS = 50

/** Extract non-embed wikilinks from Markdown-ish source text. */
export function extractWikilinkReferences(source: string): WikilinkReference[] {
  const ignored = ignoredRanges(source)
  const references: WikilinkReference[] = []
  WIKILINK_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = WIKILINK_RE.exec(source)) !== null) {
    const body = match[1]
    if (body === undefined) continue
    if (source[match.index - 1] === '!') continue
    if (isIgnoredOffset(match.index, ignored)) continue

    const parsed = parseWikilinkBody(body)
    references.push({
      rawTarget: body,
      target: parsed.target,
      ...(parsed.alias !== undefined && { alias: parsed.alias }),
      ...(parsed.heading !== undefined && { heading: parsed.heading }),
      ...(parsed.blockId !== undefined && { blockId: parsed.blockId }),
      context: buildContext(source, match.index, match.index + match[0].length),
      offset: match.index,
    })
  }

  return references
}

/**
 * Re-index one source file. Existing backlinks from that source are replaced
 * in both IndexedDB and memory so removed/renamed links don't linger.
 */
export async function indexBacklinksForFile(
  vaultId: VaultId,
  sourcePath: VaultPath,
  source: string,
  wikilinkIndex: WikilinkIndex,
): Promise<Backlink[]> {
  const normalizedSource = normalizePath(sourcePath)
  if (!normalizedSource) return []

  const now = Date.now()
  const deduped = new Map<VaultPath, BacklinkRow>()
  for (const ref of extractWikilinkReferences(source)) {
    const resolved = resolveWikilink(
      ref.target,
      wikilinkIndex,
      normalizedSource,
    )
    if (!resolved) continue
    const targetPath = normalizePath(resolved)
    const id = backlinkId(vaultId, normalizedSource, targetPath)
    if (deduped.has(targetPath)) continue
    deduped.set(targetPath, {
      id,
      vaultId,
      targetPath,
      sourcePath: normalizedSource,
      rawTarget: ref.rawTarget,
      context: ref.context,
      updatedAtMs: now,
    })
  }

  const existing = await db.backlinks
    .where('vaultId')
    .equals(vaultId)
    .and((row) => row.sourcePath === normalizedSource)
    .toArray()
  if (existing.length > 0) {
    await db.backlinks.bulkDelete(existing.map((row) => row.id))
  }

  const rows = [...deduped.values()]
  if (rows.length > 0) await db.backlinks.bulkPut(rows)

  const cache = await hydrateBacklinks(vaultId)
  replaceSourceInCache(cache, normalizedSource, rows.map(rowToBacklink))

  return rows.map(rowToBacklink)
}

/** Get every known source file that links to `targetPath`. */
export async function getBacklinksForFile(
  vaultId: VaultId,
  targetPath: VaultPath,
): Promise<Backlink[]> {
  const cache = await hydrateBacklinks(vaultId)
  const normalizedTarget = normalizePath(targetPath)
  return sortBacklinks(cache.byTarget.get(normalizedTarget) ?? [])
}

/** Build / refresh backlinks for every Markdown file in a vault. */
export async function buildBacklinksIndex(
  vault: VaultFileSystem,
  wikilinkIndex?: WikilinkIndex,
): Promise<void> {
  const index = wikilinkIndex ?? (await buildWikilinkIndex(vault))
  for await (const file of vault.walk()) {
    if (!isMarkdown(file.path)) continue
    const source = await vault.readText(file.path)
    await indexBacklinksForFile(vault.id, file.path, source, index)
  }
}

async function hydrateBacklinks(vaultId: VaultId): Promise<BacklinkCache> {
  const existing = caches.get(vaultId)
  if (existing?.hydrated) return existing

  const cache = existing ?? {
    hydrated: false,
    byTarget: new Map<VaultPath, Backlink[]>(),
    bySource: new Map<VaultPath, Backlink[]>(),
  }

  const rows = await db.backlinks.where('vaultId').equals(vaultId).toArray()
  cache.byTarget.clear()
  cache.bySource.clear()
  for (const row of rows) {
    addToCache(cache, rowToBacklink(row))
  }
  cache.hydrated = true
  caches.set(vaultId, cache)
  return cache
}

function replaceSourceInCache(
  cache: BacklinkCache,
  sourcePath: VaultPath,
  next: Backlink[],
): void {
  const previous = cache.bySource.get(sourcePath) ?? []
  for (const backlink of previous) {
    const targetBacklinks = cache.byTarget.get(backlink.targetPath) ?? []
    const filtered = targetBacklinks.filter(
      (item) => item.sourcePath !== sourcePath,
    )
    if (filtered.length > 0) {
      cache.byTarget.set(backlink.targetPath, filtered)
    } else {
      cache.byTarget.delete(backlink.targetPath)
    }
  }
  cache.bySource.delete(sourcePath)

  for (const backlink of next) {
    addToCache(cache, backlink)
  }
}

function addToCache(cache: BacklinkCache, backlink: Backlink): void {
  const sourceItems = cache.bySource.get(backlink.sourcePath) ?? []
  sourceItems.push(backlink)
  cache.bySource.set(backlink.sourcePath, sortBacklinks(sourceItems))

  const targetItems = cache.byTarget.get(backlink.targetPath) ?? []
  targetItems.push(backlink)
  cache.byTarget.set(backlink.targetPath, sortBacklinks(targetItems))
}

function rowToBacklink(row: BacklinkRow): Backlink {
  return {
    vaultId: row.vaultId,
    targetPath: row.targetPath,
    sourcePath: row.sourcePath,
    rawTarget: row.rawTarget,
    context: row.context,
    updatedAt: new Date(row.updatedAtMs),
  }
}

function backlinkId(
  vaultId: VaultId,
  sourcePath: VaultPath,
  targetPath: VaultPath,
): string {
  return JSON.stringify([vaultId, sourcePath, targetPath])
}

function sortBacklinks(backlinks: Backlink[]): Backlink[] {
  return [...backlinks].sort((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, {
      sensitivity: 'base',
    }),
  )
}

export interface BacklinkRankOptions {
  /**
   * Source paths in recency order (most-recent first). Sources the user has
   * opened lately float to the top — they're already top of mind, so they're
   * the likeliest "next read."
   */
  recentSourcePaths?: VaultPath[]
  /**
   * The path being viewed. Sources sharing the same top-level section as the
   * current document rank ahead of cross-section sources at the same recency
   * tier.
   */
  currentPath?: VaultPath
}

/**
 * Reorder `backlinks` for reading-continuation usefulness:
 *
 * 1. Sources the reader has opened recently (preserving recency order).
 * 2. Sources in the same top-level section as the current document.
 * 3. Alphabetical by source path (locale-aware) as a stable fallback.
 *
 * Pure function — no DB / no store reads — so callers can pass whatever
 * recents snapshot they want and tests stay deterministic.
 */
export function rankBacklinks(
  backlinks: Backlink[],
  options: BacklinkRankOptions = {},
): Backlink[] {
  const { recentSourcePaths = [], currentPath } = options

  const recencyRank = new Map<VaultPath, number>()
  for (let i = 0; i < recentSourcePaths.length; i++) {
    const path = recentSourcePaths[i]
    if (path === undefined) continue
    const normalized = normalizePath(path)
    if (normalized === '' || recencyRank.has(normalized)) continue
    recencyRank.set(normalized, i)
  }

  const targetSection = currentPath ? splitPath(currentPath)[0] : undefined

  return [...backlinks].sort((a, b) => {
    const ar = recencyRank.get(a.sourcePath) ?? Number.POSITIVE_INFINITY
    const br = recencyRank.get(b.sourcePath) ?? Number.POSITIVE_INFINITY
    if (ar !== br) return ar - br

    if (targetSection !== undefined) {
      const aSame = splitPath(a.sourcePath)[0] === targetSection ? 0 : 1
      const bSame = splitPath(b.sourcePath)[0] === targetSection ? 0 : 1
      if (aSame !== bSame) return aSame - bSame
    }

    return a.sourcePath.localeCompare(b.sourcePath, undefined, {
      sensitivity: 'base',
    })
  })
}

function ignoredRanges(source: string): { start: number; end: number }[] {
  return [
    ...rangesFor(source, HTML_COMMENT_RE),
    ...rangesFor(source, FENCE_RE),
    ...rangesFor(source, INLINE_CODE_RE),
  ].sort((a, b) => a.start - b.start)
}

function rangesFor(
  source: string,
  regex: RegExp,
): { start: number; end: number }[] {
  regex.lastIndex = 0
  const ranges: { start: number; end: number }[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(source)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

function isIgnoredOffset(
  offset: number,
  ranges: { start: number; end: number }[],
): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end)
}

function buildContext(source: string, start: number, end: number): string {
  const from = Math.max(0, start - CONTEXT_CHARS)
  const to = Math.min(source.length, end + CONTEXT_CHARS)
  const prefix = from > 0 ? '…' : ''
  const suffix = to < source.length ? '…' : ''
  return `${prefix}${source.slice(from, to)}${suffix}`
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Drop the in-memory backlinks cache for a single vault. Persisted
 * Dexie rows are NOT touched here — call from `removeVault` (which
 * already wipes the rows) so the in-memory map doesn't outlive them.
 */
export function invalidateBacklinks(vaultId: VaultId): void {
  caches.delete(vaultId)
}

export function __resetBacklinksForTests(): void {
  caches.clear()
}
