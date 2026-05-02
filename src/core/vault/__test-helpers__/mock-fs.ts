/**
 * In-memory implementation of File System Access API directory & file
 * handles, used to drive {@link FSAPIVaultAdapter} tests without a real
 * browser filesystem.
 *
 * Implements only the surface that the adapter actually calls:
 *   - `kind`, `name`
 *   - `values()` async iterator
 *   - `getDirectoryHandle(name)`, `getFileHandle(name)`
 *   - `getFile()` returning a `File`-like object with `text()`, `arrayBuffer()`,
 *     `size`, `lastModified`
 *   - `queryPermission()`, `requestPermission()` returning a configurable state
 *
 * Anything not listed throws explicitly so tests fail loud on unintended use.
 */

export interface MockTreeNode {
  [name: string]: string | Uint8Array | MockTreeNode
}

interface MockState {
  permission: PermissionState
  writePermission: PermissionState
}

function isLeafContent(value: unknown): value is string | Uint8Array {
  return typeof value === 'string' || value instanceof Uint8Array
}

function makeFile(name: string, content: string | Uint8Array, modifiedAt = 0) {
  const bytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : content
  // jsdom's `File` is missing `.text()` / `.arrayBuffer()` (Vitest 3
  // ships an older jsdom), so we hand-roll a duck-typed File. A test-
  // only `URL.createObjectURL` shim in `setup-tests.ts` recognises this
  // shape so embed tests still get a `blob:` src.
  return {
    name,
    size: bytes.byteLength,
    lastModified: modifiedAt,
    type: '',
    async text(): Promise<string> {
      return new TextDecoder().decode(bytes)
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      const out = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(out).set(bytes)
      return out
    },
  } as File
}

function notFound(name: string): DOMException {
  return new DOMException(`Mock FS: ${name} not found`, 'NotFoundError')
}

function buildFileHandle(
  name: string,
  parentTree: MockTreeNode,
  state: MockState,
): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    async getFile() {
      const current = parentTree[name]
      if (!isLeafContent(current)) throw notFound(name)
      return makeFile(name, current)
    },
    /**
     * Writable stream stub. Accumulates `write()` chunks and commits the
     * concatenated bytes back to the parent tree on `close()`. Mirrors
     * the FSAPI surface that {@link FSAPIVaultAdapter.writeText} exercises:
     * `createWritable()` → `write(...)` → `close()`.
     */
    async createWritable() {
      const chunks: (string | Uint8Array)[] = []
      return {
        async write(chunk: string | Uint8Array) {
          chunks.push(chunk)
        },
        async close() {
          // Concatenate as utf-8 bytes for a deterministic write path —
          // matches what the real FSAPI does for string chunks.
          const encoder = new TextEncoder()
          const buffers = chunks.map((c) =>
            typeof c === 'string' ? encoder.encode(c) : c,
          )
          const total = buffers.reduce((acc, b) => acc + b.byteLength, 0)
          const merged = new Uint8Array(total)
          let offset = 0
          for (const b of buffers) {
            merged.set(b, offset)
            offset += b.byteLength
          }
          // Round-trip through a string when the entire write is text-y
          // so callers reading it back via .text() see a stable utf-8
          // string. This matches the real FSAPI semantics for writeText.
          parentTree[name] = new TextDecoder().decode(merged)
        },
        async abort() {
          // No-op for the mock: nothing's been committed yet.
        },
      }
    },
    async queryPermission(opts?: { mode?: 'read' | 'readwrite' }) {
      const mode = opts?.mode ?? 'read'
      if (mode === 'readwrite') return state.writePermission
      return state.permission
    },
    async requestPermission(opts?: { mode?: 'read' | 'readwrite' }) {
      const mode = opts?.mode ?? 'read'
      if (mode === 'readwrite') {
        state.writePermission = 'granted'
        return 'granted'
      }
      state.permission = 'granted'
      return 'granted'
    },
  } as unknown as FileSystemFileHandle
}

function buildDirectoryHandle(
  name: string,
  tree: MockTreeNode,
  state: MockState,
): FileSystemDirectoryHandle {
  const entryHandles = (): FileSystemHandle[] => {
    return Object.entries(tree).map(([childName, value]) => {
      if (isLeafContent(value)) {
        return buildFileHandle(childName, tree, state)
      }
      return buildDirectoryHandle(childName, value, state)
    })
  }

  const handle = {
    kind: 'directory',
    name,

    async *values(): AsyncIterableIterator<FileSystemHandle> {
      for (const child of entryHandles()) {
        yield child
      }
    },

    async getDirectoryHandle(
      childName: string,
    ): Promise<FileSystemDirectoryHandle> {
      const child = tree[childName]
      if (child === undefined || isLeafContent(child)) {
        throw notFound(childName)
      }
      return buildDirectoryHandle(childName, child, state)
    },

    async getFileHandle(childName: string): Promise<FileSystemFileHandle> {
      const child = tree[childName]
      if (child === undefined || !isLeafContent(child)) {
        throw notFound(childName)
      }
      return buildFileHandle(childName, tree, state)
    },

    async queryPermission(opts?: { mode?: 'read' | 'readwrite' }) {
      const mode = opts?.mode ?? 'read'
      return mode === 'readwrite' ? state.writePermission : state.permission
    },

    async requestPermission(opts?: { mode?: 'read' | 'readwrite' }) {
      const mode = opts?.mode ?? 'read'
      if (mode === 'readwrite') {
        state.writePermission = 'granted'
        return 'granted'
      }
      state.permission = 'granted'
      return 'granted'
    },
  }

  return handle as unknown as FileSystemDirectoryHandle
}

/**
 * Build a mock root directory handle from a nested object tree.
 *
 * @example
 *   const root = mockRoot('vault', {
 *     'index.md': '# Hello',
 *     career: { 'me.md': '# Me' },
 *   })
 */
export function mockRoot(
  rootName: string,
  tree: MockTreeNode,
  options: {
    permission?: PermissionState
    writePermission?: PermissionState
  } = {},
): FileSystemDirectoryHandle {
  const state: MockState = {
    permission: options.permission ?? 'granted',
    // Tests that exercise write paths flip this to 'granted' explicitly.
    // Default is 'prompt' so a Phase 2 write attempt actually exercises
    // the request flow, matching the real FSAPI behaviour.
    writePermission: options.writePermission ?? 'prompt',
  }
  return buildDirectoryHandle(rootName, tree, state)
}
