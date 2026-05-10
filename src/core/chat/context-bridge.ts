import type { ContextChunk } from '@/core/ai/types'
import { extractWikilinkTargets } from '@/core/navigation/wikilink-extractor'
import {
  buildWikilinkIndex,
  isMarkdownTarget,
  resolveWikilink,
  type WikilinkIndex,
} from '@/core/navigation/wikilink-resolver'
import {
  basename,
  type VaultFileSystem,
  type VaultId,
  type VaultPath,
} from '@/core/vault'
import type { ChatContextRef, ChatContextRefDraft } from './types'

const DEFAULT_LINKED_LIMIT = 4
const DEFAULT_MAX_FILE_CHARS = 8_000
const DEFAULT_MAX_TOTAL_LINKED_CHARS = 30_000

export interface ReadingContextOptions {
  vaultId: VaultId
  adapter: VaultFileSystem
  currentPath?: VaultPath | null
  selectionText?: string | null
  includeCurrentDocument?: boolean
  includeLinkedDocuments?: boolean
  linkedLimit?: number
  maxLinkedFileChars?: number
  maxLinkedTotalChars?: number
  prebuiltIndex?: WikilinkIndex | null
}

export interface LoadContextChunksOptions {
  resolveVault: (vaultId: VaultId) => VaultFileSystem | null
  maxFileChars?: number
}

/** Build explicit, persistable context refs from the current reading surface.
 *
 * File-backed refs intentionally do not carry content snapshots. Chat stores
 * the source identity; the send path re-reads the file from the live vault.
 */
export async function buildReadingContextRefs(
  options: ReadingContextOptions,
): Promise<ChatContextRefDraft[]> {
  const refs: ChatContextRefDraft[] = []
  const seenPaths = new Set<VaultPath>()
  const currentPath = options.currentPath ?? null
  const includeCurrentDocument = options.includeCurrentDocument ?? true

  if (currentPath && includeCurrentDocument) {
    refs.push(fileRef(options.vaultId, currentPath, 'current-document'))
    seenPaths.add(currentPath)
  }

  const selection = options.selectionText?.trim()
  if (selection) {
    refs.push({
      vaultId: options.vaultId,
      sourceType: 'selection',
      label: currentPath
        ? `Selection from ${basename(currentPath)}`
        : 'Selection',
      path: currentPath,
      pinned: true,
      contentSnapshot: selection,
    })
  }

  if (currentPath && (options.includeLinkedDocuments ?? false)) {
    const linked = await loadLinkedDocumentRefs(options, currentPath, seenPaths)
    refs.push(...linked)
  }

  return refs
}

/** Convert stored context refs into model-ready chunks.
 *
 * Snapshot refs are used as-is. File refs are read from the current vault so
 * chat sees the latest file contents without copying the vault into IndexedDB.
 */
export async function loadContextChunksForRefs(
  refs: ChatContextRef[],
  options: LoadContextChunksOptions,
): Promise<ContextChunk[]> {
  const maxFileChars = options.maxFileChars ?? DEFAULT_MAX_FILE_CHARS
  const chunks: ContextChunk[] = []

  for (const ref of refs) {
    if (ref.contentSnapshot) {
      chunks.push({
        source: ref.label,
        content: ref.contentSnapshot,
      })
      continue
    }

    if (!ref.path) continue
    const adapter = options.resolveVault(ref.vaultId)
    if (!adapter) continue

    try {
      const content = await adapter.readText(ref.path)
      chunks.push({
        source: `${ref.label} (${ref.path})`,
        content: truncate(content, maxFileChars),
      })
    } catch {
      // Permission changes and file deletion should not break the entire chat
      // send; the UI can surface missing chips separately.
    }
  }

  return chunks
}

async function loadLinkedDocumentRefs(
  options: ReadingContextOptions,
  currentPath: VaultPath,
  seenPaths: Set<VaultPath>,
): Promise<ChatContextRefDraft[]> {
  let source: string
  try {
    source = await options.adapter.readText(currentPath)
  } catch {
    return []
  }

  const targets = extractWikilinkTargets(source)
  if (targets.length === 0) return []

  let index = options.prebuiltIndex ?? null
  if (!index) {
    try {
      index = await buildWikilinkIndex(options.adapter)
    } catch {
      return []
    }
  }

  const limit = options.linkedLimit ?? DEFAULT_LINKED_LIMIT
  const maxFileChars = options.maxLinkedFileChars ?? DEFAULT_MAX_FILE_CHARS
  const maxTotalChars =
    options.maxLinkedTotalChars ?? DEFAULT_MAX_TOTAL_LINKED_CHARS
  const refs: ChatContextRefDraft[] = []
  let totalChars = 0

  for (const target of targets) {
    if (refs.length >= limit) break
    const resolved = resolveWikilink(target, index, currentPath)
    if (!resolved || seenPaths.has(resolved) || !isMarkdownTarget(resolved)) {
      continue
    }

    try {
      const text = await options.adapter.readText(resolved)
      const nextChars = Math.min(text.length, maxFileChars)
      if (totalChars + nextChars > maxTotalChars) break
      refs.push(fileRef(options.vaultId, resolved, 'linked-document'))
      seenPaths.add(resolved)
      totalChars += nextChars
    } catch {
      // Skip unreadable neighbours. The explicit current-document ref remains.
    }
  }

  return refs
}

function fileRef(
  vaultId: VaultId,
  path: VaultPath,
  sourceType: 'current-document' | 'linked-document' | 'manual-file',
): ChatContextRefDraft {
  return {
    vaultId,
    sourceType,
    label: basename(path),
    path,
    pinned: sourceType === 'current-document',
    contentSnapshot: null,
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated]...`
}
