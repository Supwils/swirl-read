import { describe, it, expect } from 'vitest'
import { FSAPIVaultAdapter } from './fsapi-adapter'
import {
  VaultFileNotFoundError,
  VaultWriteError,
  type VaultEntry,
  type VaultFile,
} from './types'
import { mockRoot } from './__test-helpers__/mock-fs'

function buildAdapter(opts?: { permission?: PermissionState }) {
  const root = mockRoot(
    'supwil',
    {
      'index.md': '# Wilson Knowledge OS\n\nWelcome.',
      'README.md': 'Project README.',
      career: {
        'career-map.md': '# Career Map',
        me: {
          'me.md': '# About Me',
          'experience.md': '# Experience',
        },
      },
      knowledge: {
        'knowledge-map.md': '# Knowledge',
        软件: {
          前端: {
            'react.md': '# React notes\n\n详细内容…',
          },
        },
      },
      images: {
        'logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      },
    },
    opts,
  )
  return FSAPIVaultAdapter.fromHandle(root, {
    id: 'supwil-test',
    name: 'supwil',
  })
}

describe('FSAPIVaultAdapter — identity', () => {
  it('uses provided id and name when wrapping a handle', () => {
    const adapter = buildAdapter()
    expect(adapter.id).toBe('supwil-test')
    expect(adapter.name).toBe('supwil')
  })

  it('falls back to generated id and handle.name', () => {
    const root = mockRoot('my-vault', { 'a.md': 'a' })
    const adapter = FSAPIVaultAdapter.fromHandle(root)
    expect(adapter.name).toBe('my-vault')
    expect(adapter.id).toMatch(/^my-vault-[a-z0-9]{4}$/)
  })
})

describe('FSAPIVaultAdapter — list', () => {
  it('lists root entries with directories first, then files (case-insensitive alphabetical)', async () => {
    const adapter = buildAdapter()
    const entries = await adapter.list('')
    expect(entries.map((e) => e.name)).toEqual([
      'career',
      'images',
      'knowledge',
      'index.md',
      'README.md',
    ])
  })

  it('returns paths joined relative to vault root', async () => {
    const adapter = buildAdapter()
    const entries = await adapter.list('career/me')
    expect(entries.map((e) => e.path).sort()).toEqual([
      'career/me/experience.md',
      'career/me/me.md',
    ])
  })

  it('marks directories with isDirectory: true', async () => {
    const adapter = buildAdapter()
    const entries = await adapter.list('')
    const career = entries.find((e) => e.name === 'career')
    expect(career?.isDirectory).toBe(true)
  })

  it('exposes file size and extension on file entries', async () => {
    const adapter = buildAdapter()
    const entries = await adapter.list('career/me')
    const me = entries.find((e) => e.name === 'me.md')
    if (!me || me.isDirectory) throw new Error('expected a file entry')
    const fileEntry = me satisfies VaultEntry
    if (fileEntry.isDirectory) throw new Error('unexpected dir')
    expect(fileEntry.extension).toBe('.md')
    expect(fileEntry.size).toBe('# About Me'.length)
  })

  it('throws VaultFileNotFoundError for unknown directory', async () => {
    const adapter = buildAdapter()
    await expect(adapter.list('does/not/exist')).rejects.toBeInstanceOf(
      VaultFileNotFoundError,
    )
  })
})

describe('FSAPIVaultAdapter — walk', () => {
  it('yields every file in the vault, with vault-relative paths', async () => {
    const adapter = buildAdapter()
    const paths: string[] = []
    for await (const file of adapter.walk()) {
      paths.push(file.path)
    }
    expect(paths.sort()).toEqual([
      'README.md',
      'career/career-map.md',
      'career/me/experience.md',
      'career/me/me.md',
      'images/logo.png',
      'index.md',
      'knowledge/knowledge-map.md',
      'knowledge/软件/前端/react.md',
    ])
  })

  it('preserves Unicode path segments', async () => {
    const adapter = buildAdapter()
    const files: VaultFile[] = []
    for await (const f of adapter.walk()) files.push(f)
    expect(files.some((f) => f.path === 'knowledge/软件/前端/react.md')).toBe(
      true,
    )
  })

  it('does not yield directories', async () => {
    const adapter = buildAdapter()
    for await (const entry of adapter.walk()) {
      expect(entry.isDirectory).toBe(false)
    }
  })
})

describe('FSAPIVaultAdapter — readText / readBinary', () => {
  it('reads text content', async () => {
    const adapter = buildAdapter()
    expect(await adapter.readText('index.md')).toBe(
      '# Wilson Knowledge OS\n\nWelcome.',
    )
  })

  it('reads nested files', async () => {
    const adapter = buildAdapter()
    expect(await adapter.readText('career/me/me.md')).toBe('# About Me')
  })

  it('reads Unicode paths', async () => {
    const adapter = buildAdapter()
    const text = await adapter.readText('knowledge/软件/前端/react.md')
    expect(text).toContain('React notes')
    expect(text).toContain('详细内容')
  })

  it('reads binary as Uint8Array', async () => {
    const adapter = buildAdapter()
    const bytes = await adapter.readBinary('images/logo.png')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(bytes)).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('throws VaultFileNotFoundError for missing files', async () => {
    const adapter = buildAdapter()
    await expect(adapter.readText('does-not-exist.md')).rejects.toBeInstanceOf(
      VaultFileNotFoundError,
    )
  })
})

describe('FSAPIVaultAdapter — stat', () => {
  it('returns directory entry for empty path (root)', async () => {
    const adapter = buildAdapter()
    const entry = await adapter.stat('')
    expect(entry.isDirectory).toBe(true)
    expect(entry.name).toBe('supwil')
  })

  it('returns file metadata for a file path', async () => {
    const adapter = buildAdapter()
    const entry = await adapter.stat('career/me/me.md')
    expect(entry.isDirectory).toBe(false)
    if (entry.isDirectory) throw new Error('unreachable')
    expect(entry.name).toBe('me.md')
    expect(entry.extension).toBe('.md')
  })

  it('throws for unknown paths', async () => {
    const adapter = buildAdapter()
    await expect(adapter.stat('nope.md')).rejects.toBeInstanceOf(
      VaultFileNotFoundError,
    )
  })
})

describe('FSAPIVaultAdapter — permission', () => {
  it('reports granted permission', async () => {
    const adapter = buildAdapter()
    expect(await adapter.hasPermission()).toBe(true)
  })

  it('reports denied permission for prompt state', async () => {
    const adapter = buildAdapter({ permission: 'prompt' })
    expect(await adapter.hasPermission()).toBe(false)
  })

  it('requestPermission returns true when granted', async () => {
    const adapter = buildAdapter({ permission: 'prompt' })
    expect(await adapter.requestPermission()).toBe(true)
    expect(await adapter.hasPermission()).toBe(true)
  })
})

describe('FSAPIVaultAdapter — writeText (Phase 2A)', () => {
  it('writes utf-8 content back to an existing file', async () => {
    const root = mockRoot('vault', { 'index.md': '# Original' })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'vault',
    })
    await adapter.writeText('index.md', '# Updated\n\nbody')
    expect(await adapter.readText('index.md')).toBe('# Updated\n\nbody')
  })

  it('rejects with VaultFileNotFoundError when the path does not exist', async () => {
    const root = mockRoot('vault', { 'index.md': '#' })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'vault',
    })
    await expect(
      adapter.writeText('does/not/exist.md', '#'),
    ).rejects.toBeInstanceOf(VaultFileNotFoundError)
  })

  it('rejects with VaultWriteError if createWritable rejects', async () => {
    const root = mockRoot('vault', { 'index.md': '#' })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'vault',
    })
    // Patch the underlying file handle's createWritable to throw a generic
    // failure (not a permission error) — adapter should wrap it.
    const original = root.getFileHandle.bind(root)
    Object.defineProperty(root, 'getFileHandle', {
      configurable: true,
      writable: true,
      value: async (name: string) => {
        const h = await original(name)
        ;(h as { createWritable: () => Promise<unknown> }).createWritable =
          () => Promise.reject(new Error('disk full'))
        return h
      },
    })
    await expect(adapter.writeText('index.md', 'x')).rejects.toBeInstanceOf(
      VaultWriteError,
    )
  })

  it('hasWritePermission tracks the readwrite query state', async () => {
    const root = mockRoot('vault', { 'index.md': '#' })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'vault',
    })
    expect(await adapter.hasWritePermission()).toBe(false) // default 'prompt'
    expect(await adapter.requestWritePermission()).toBe(true)
    expect(await adapter.hasWritePermission()).toBe(true)
  })
})
