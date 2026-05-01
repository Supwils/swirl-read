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
}

function isLeafContent(value: unknown): value is string | Uint8Array {
  return typeof value === 'string' || value instanceof Uint8Array
}

function makeFile(name: string, content: string | Uint8Array, modifiedAt = 0) {
  const bytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : content
  return {
    name,
    size: bytes.byteLength,
    lastModified: modifiedAt,
    type: '',
    async text(): Promise<string> {
      return new TextDecoder().decode(bytes)
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      // Return a fresh copy so tests can't accidentally see internal mutation
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
  content: string | Uint8Array,
  state: MockState,
): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    async getFile() {
      return makeFile(name, content)
    },
    async queryPermission() {
      return state.permission
    },
    async requestPermission() {
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
        return buildFileHandle(childName, value, state)
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
      return buildFileHandle(childName, child, state)
    },

    async queryPermission() {
      return state.permission
    },

    async requestPermission() {
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
  options: { permission?: PermissionState } = {},
): FileSystemDirectoryHandle {
  const state: MockState = {
    permission: options.permission ?? 'granted',
  }
  return buildDirectoryHandle(rootName, tree, state)
}
