/**
 * File System Access API adapter — primary `VaultFileSystem` implementation.
 *
 * Wraps a `FileSystemDirectoryHandle` and exposes vault-shaped operations.
 * Lives entirely in the browser; no network calls, no cloud.
 *
 * The adapter does NOT persist its own handle — that's the registry's job
 * (see {@link ./handle-storage}). Construct via {@link FSAPIVaultAdapter.pick}
 * for the first-run case, or via the constructor with a restored handle.
 */

import './fsapi-types'

import type {
  VaultDirectory,
  VaultEntry,
  VaultFile,
  VaultFileSystem,
  VaultId,
  VaultPath,
} from './types'
import {
  VaultFileNotFoundError,
  VaultPermissionDeniedError,
  VaultReadError,
} from './types'
import { generateVaultId } from './id'
import { extname, joinPath, splitPath } from './path'

export interface FSAPIVaultAdapterInit {
  id: VaultId
  name: string
  rootHandle: FileSystemDirectoryHandle
}

export class FSAPIVaultAdapter implements VaultFileSystem {
  readonly id: VaultId
  readonly name: string
  readonly rootHandle: FileSystemDirectoryHandle

  /** Cache of blob URLs by path so repeated reads of the same image are cheap. */
  private readonly blobURLs = new Map<VaultPath, string>()

  constructor(init: FSAPIVaultAdapterInit) {
    this.id = init.id
    this.name = init.name
    this.rootHandle = init.rootHandle
  }

  /**
   * Show the browser's directory picker and wrap the result.
   *
   * Must be called from a user gesture (button click); throws
   * `AbortError` if the user dismisses the picker.
   */
  static async pick(): Promise<FSAPIVaultAdapter> {
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    return FSAPIVaultAdapter.fromHandle(handle)
  }

  /**
   * Wrap an existing handle. Use this when restoring a previously-registered
   * vault from IndexedDB.
   */
  static fromHandle(
    rootHandle: FileSystemDirectoryHandle,
    opts?: { id?: VaultId; name?: string },
  ): FSAPIVaultAdapter {
    const name = opts?.name ?? rootHandle.name
    const id = opts?.id ?? generateVaultId(rootHandle.name)
    return new FSAPIVaultAdapter({ id, name, rootHandle })
  }

  async hasPermission(): Promise<boolean> {
    const state = await this.rootHandle.queryPermission({ mode: 'read' })
    return state === 'granted'
  }

  async requestPermission(): Promise<boolean> {
    const queried = await this.rootHandle.queryPermission({ mode: 'read' })
    if (queried === 'granted') return true
    const requested = await this.rootHandle.requestPermission({ mode: 'read' })
    return requested === 'granted'
  }

  async list(path: VaultPath): Promise<VaultEntry[]> {
    const dirHandle = await this.resolveDirectoryHandle(path)
    const entries: VaultEntry[] = []
    for await (const handle of dirHandle.values()) {
      const childPath = joinPath(path, handle.name)
      entries.push(await this.handleToEntry(handle, childPath))
    }
    return entries.sort(compareEntries)
  }

  async *walk(): AsyncIterable<VaultFile> {
    yield* walkRecursive(this.rootHandle, '')
  }

  async stat(path: VaultPath): Promise<VaultEntry> {
    if (path === '') {
      return {
        path: '',
        name: this.rootHandle.name,
        isDirectory: true,
      }
    }
    const segments = splitPath(path)
    const last = segments.pop()
    if (!last) throw new VaultFileNotFoundError(path)
    const parent = await this.resolveDirectoryHandle(segments.join('/'))
    const handle = await getChildHandle(parent, last, path)
    return this.handleToEntry(handle, path)
  }

  async readText(path: VaultPath): Promise<string> {
    const file = await this.getFile(path)
    try {
      return await file.text()
    } catch (cause) {
      throw new VaultReadError(path, { cause })
    }
  }

  async readBinary(path: VaultPath): Promise<Uint8Array> {
    const file = await this.getFile(path)
    try {
      const buffer = await file.arrayBuffer()
      return new Uint8Array(buffer)
    } catch (cause) {
      throw new VaultReadError(path, { cause })
    }
  }

  async getBlobURL(path: VaultPath): Promise<string> {
    const cached = this.blobURLs.get(path)
    if (cached) return cached
    const file = await this.getFile(path)
    const url = URL.createObjectURL(file)
    this.blobURLs.set(path, url)
    return url
  }

  /** Revoke all cached blob URLs. Call when the vault is being deactivated. */
  dispose(): void {
    for (const url of this.blobURLs.values()) {
      URL.revokeObjectURL(url)
    }
    this.blobURLs.clear()
  }

  /* ─── internals ─────────────────────────────────────────────────────── */

  private async resolveDirectoryHandle(
    path: VaultPath,
  ): Promise<FileSystemDirectoryHandle> {
    let current = this.rootHandle
    for (const segment of splitPath(path)) {
      current = await getDirectoryChild(current, segment, path)
    }
    return current
  }

  private async getFile(path: VaultPath): Promise<File> {
    const segments = splitPath(path)
    const filename = segments.pop()
    if (!filename) throw new VaultFileNotFoundError(path)
    const dir = await this.resolveDirectoryHandle(segments.join('/'))
    const fileHandle = await getFileChild(dir, filename, path)
    try {
      return await fileHandle.getFile()
    } catch (cause) {
      if (isPermissionDenied(cause)) {
        throw new VaultPermissionDeniedError()
      }
      throw new VaultReadError(path, { cause })
    }
  }

  private async handleToEntry(
    handle: FileSystemHandle,
    path: VaultPath,
  ): Promise<VaultEntry> {
    if (handle.kind === 'directory') {
      const dir: VaultDirectory = {
        path,
        name: handle.name,
        isDirectory: true,
      }
      return dir
    }
    const file = await (handle as FileSystemFileHandle).getFile()
    const fileEntry: VaultFile = {
      path,
      name: handle.name,
      extension: extname(handle.name),
      size: file.size,
      modifiedAt: new Date(file.lastModified),
      isDirectory: false,
    }
    return fileEntry
  }
}

/* ─── module-level helpers ────────────────────────────────────────────── */

async function* walkRecursive(
  dir: FileSystemDirectoryHandle,
  basePath: VaultPath,
): AsyncIterable<VaultFile> {
  for await (const handle of dir.values()) {
    const childPath = joinPath(basePath, handle.name)
    if (handle.kind === 'directory') {
      yield* walkRecursive(handle as FileSystemDirectoryHandle, childPath)
    } else {
      const file = await (handle as FileSystemFileHandle).getFile()
      yield {
        path: childPath,
        name: handle.name,
        extension: extname(handle.name),
        size: file.size,
        modifiedAt: new Date(file.lastModified),
        isDirectory: false,
      }
    }
  }
}

async function getChildHandle(
  dir: FileSystemDirectoryHandle,
  name: string,
  fullPath: VaultPath,
): Promise<FileSystemHandle> {
  for await (const handle of dir.values()) {
    if (handle.name === name) return handle
  }
  throw new VaultFileNotFoundError(fullPath)
}

async function getDirectoryChild(
  dir: FileSystemDirectoryHandle,
  name: string,
  fullPath: VaultPath,
): Promise<FileSystemDirectoryHandle> {
  try {
    return await dir.getDirectoryHandle(name)
  } catch (cause) {
    if (isNotFound(cause)) throw new VaultFileNotFoundError(fullPath)
    if (isPermissionDenied(cause)) throw new VaultPermissionDeniedError()
    throw new VaultReadError(fullPath, { cause })
  }
}

async function getFileChild(
  dir: FileSystemDirectoryHandle,
  name: string,
  fullPath: VaultPath,
): Promise<FileSystemFileHandle> {
  try {
    return await dir.getFileHandle(name)
  } catch (cause) {
    if (isNotFound(cause)) throw new VaultFileNotFoundError(fullPath)
    if (isPermissionDenied(cause)) throw new VaultPermissionDeniedError()
    throw new VaultReadError(fullPath, { cause })
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotFoundError'
}

function isPermissionDenied(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotAllowedError'
}

/** Sort: directories first, then files; both alphabetical. */
function compareEntries(a: VaultEntry, b: VaultEntry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return a.name.localeCompare(b.name)
}
