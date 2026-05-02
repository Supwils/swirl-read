/**
 * SampleVaultAdapter (M8.2).
 *
 * In-memory `VaultFileSystem` backed by a static path → contents map.
 * Used for the "Try sample vault" CTA on the landing page so a fresh user
 * can see SwilRead render without granting File System Access permission
 * to a real folder.
 *
 * Permission API is trivially `true` (the bytes ship with the bundle).
 * `getBlobURL()` constructs blob URLs lazily and caches them; `dispose()`
 * revokes them so a removed sample vault doesn't leak.
 */

import {
  VaultFileNotFoundError,
  VaultReadError,
  VaultWriteError,
  type VaultDirectory,
  type VaultEntry,
  type VaultFile,
  type VaultFileSystem,
  type VaultId,
  type VaultPath,
} from './types'
import { extname, normalizePath } from './path'

export type SampleFileContent = string | Uint8Array

export interface SampleVaultSpec {
  /** Stable id used in URLs and persistence. */
  id: VaultId
  /** Display name. */
  name: string
  /** Map from path (forward-slash separated, no leading `/`) to contents. */
  files: Record<string, SampleFileContent>
  /** Optional fixed `modifiedAt` so tests are deterministic. */
  modifiedAt?: Date
}

export class SampleVaultAdapter implements VaultFileSystem {
  readonly id: VaultId
  readonly name: string

  /** Path → bytes (string treated as utf-8). */
  private readonly files: Map<VaultPath, SampleFileContent>
  /** Set of every directory implied by the file paths (including ""). */
  private readonly directories: Set<VaultPath>
  private readonly modifiedAt: Date
  private readonly blobURLs = new Map<VaultPath, string>()

  constructor(spec: SampleVaultSpec) {
    this.id = spec.id
    this.name = spec.name
    this.modifiedAt = spec.modifiedAt ?? new Date('2026-01-01T00:00:00Z')

    this.files = new Map()
    this.directories = new Set([''])
    for (const [rawPath, content] of Object.entries(spec.files)) {
      const path = normalizePath(rawPath)
      if (path === '') continue
      this.files.set(path, content)
      // Walk up the segments to register every implied directory.
      const segments = path.split('/')
      for (let i = 0; i < segments.length - 1; i++) {
        this.directories.add(segments.slice(0, i + 1).join('/'))
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async list(path: VaultPath): Promise<VaultEntry[]> {
    const dir = normalizePath(path)
    if (!this.directories.has(dir)) {
      throw new VaultFileNotFoundError(dir)
    }
    const prefix = dir === '' ? '' : `${dir}/`
    const seen = new Set<string>()
    const entries: VaultEntry[] = []

    // Direct child files.
    for (const [filePath, content] of this.files) {
      if (!filePath.startsWith(prefix)) continue
      const relative = filePath.slice(prefix.length)
      if (relative.includes('/')) continue
      if (seen.has(relative)) continue
      seen.add(relative)
      entries.push(this.makeFileEntry(filePath, content))
    }

    // Direct child directories.
    for (const dirPath of this.directories) {
      if (dirPath === dir) continue
      if (!dirPath.startsWith(prefix)) continue
      const relative = dirPath.slice(prefix.length)
      if (relative === '' || relative.includes('/')) continue
      if (seen.has(relative)) continue
      seen.add(relative)
      const directoryEntry: VaultDirectory = {
        path: dirPath,
        name: relative,
        isDirectory: true,
      }
      entries.push(directoryEntry)
    }

    // Directories first, then alphabetical.
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return entries
  }

  walk(): AsyncIterable<VaultFile> {
    const entries: VaultFile[] = []
    for (const [path, content] of this.files) {
      entries.push(this.makeFileEntry(path, content))
    }
    return {
      [Symbol.asyncIterator](): AsyncIterator<VaultFile> {
        let index = 0
        return {
          next(): Promise<IteratorResult<VaultFile>> {
            if (index >= entries.length) {
              return Promise.resolve({ value: undefined, done: true })
            }
            const entry = entries[index++]
            if (entry === undefined) {
              return Promise.resolve({ value: undefined, done: true })
            }
            return Promise.resolve({ value: entry, done: false })
          },
        }
      },
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async stat(path: VaultPath): Promise<VaultEntry> {
    const normalized = normalizePath(path)
    if (this.files.has(normalized)) {
      const content = this.files.get(normalized)
      if (content === undefined) {
        throw new VaultFileNotFoundError(normalized)
      }
      return this.makeFileEntry(normalized, content)
    }
    if (this.directories.has(normalized)) {
      const segments = normalized === '' ? [] : normalized.split('/')
      const name = segments.length === 0 ? this.name : (segments.at(-1) ?? '')
      const directory: VaultDirectory = {
        path: normalized,
        name,
        isDirectory: true,
      }
      return directory
    }
    throw new VaultFileNotFoundError(normalized)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async readText(path: VaultPath): Promise<string> {
    const content = this.requireFile(path)
    if (typeof content === 'string') return content
    try {
      return new TextDecoder('utf-8').decode(content)
    } catch (err) {
      throw new VaultReadError(path, { cause: err })
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async readBinary(path: VaultPath): Promise<Uint8Array> {
    const content = this.requireFile(path)
    if (typeof content === 'string') {
      return new TextEncoder().encode(content)
    }
    return content
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getBlobURL(path: VaultPath): Promise<string> {
    const normalized = normalizePath(path)
    const cached = this.blobURLs.get(normalized)
    if (cached) return cached
    const content = this.requireFile(normalized)
    const bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : content
    // Copy into a fresh ArrayBuffer so the Blob constructor's strict type
    // accepts it (Uint8Array<ArrayBufferLike> can in principle wrap a
    // SharedArrayBuffer, which BlobPart rejects).
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    const blob = new Blob([buffer], { type: guessMimeType(normalized) })
    const url = URL.createObjectURL(blob)
    this.blobURLs.set(normalized, url)
    return url
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async hasPermission(): Promise<boolean> {
    return true
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async requestPermission(): Promise<boolean> {
    return true
  }

  /**
   * Phase 2: the sample vault is a read-only fixture bundled with the
   * app. Writing would only mutate in-memory state that vanishes on
   * reload, which is more confusing than helpful — fail loudly so the
   * editor surface can route the user to "open my vault" instead.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async writeText(path: VaultPath, _content: string): Promise<void> {
    throw new VaultWriteError(path, {
      reason: 'Sample vault is read-only — open your own vault to edit',
    })
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async hasWritePermission(): Promise<boolean> {
    return false
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async requestWritePermission(): Promise<boolean> {
    return false
  }

  dispose(): void {
    for (const url of this.blobURLs.values()) {
      URL.revokeObjectURL(url)
    }
    this.blobURLs.clear()
  }

  private requireFile(path: VaultPath): SampleFileContent {
    const normalized = normalizePath(path)
    const content = this.files.get(normalized)
    if (content === undefined) {
      throw new VaultFileNotFoundError(normalized)
    }
    return content
  }

  private makeFileEntry(
    path: VaultPath,
    content: SampleFileContent,
  ): VaultFile {
    const segments = path.split('/')
    const name = segments.at(-1) ?? path
    const size =
      typeof content === 'string'
        ? new TextEncoder().encode(content).byteLength
        : content.byteLength
    return {
      path,
      name,
      extension: extname(path),
      size,
      modifiedAt: this.modifiedAt,
      isDirectory: false,
    }
  }
}

const MIME_TABLE: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
}

function guessMimeType(path: VaultPath): string {
  return MIME_TABLE[extname(path)] ?? 'application/octet-stream'
}
