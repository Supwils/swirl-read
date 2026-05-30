import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FSAPIVaultAdapter } from './fsapi-adapter'
import { mockRoot, type MockTreeNode } from './__test-helpers__/mock-fs'
import {
  isSystemFolder,
  folderWeight,
  invalidateFolderWeights,
  __resetFolderWeightCacheForTests,
  SYSTEM_FOLDER_NAMES,
} from './folder-weight'
import { __resetVaultLifecycleHooksForTests } from '@/stores/vault-lifecycle'

function adapter(id: string, tree: MockTreeNode): FSAPIVaultAdapter {
  return FSAPIVaultAdapter.fromHandle(mockRoot('vault', tree), { id, name: id })
}

beforeEach(() => {
  __resetFolderWeightCacheForTests()
  __resetVaultLifecycleHooksForTests()
})

// ─── isSystemFolder ──────────────────────────────────────────────────────────

describe('isSystemFolder', () => {
  it('returns true for dot-prefixed names', () => {
    expect(isSystemFolder('.git')).toBe(true)
    expect(isSystemFolder('.obsidian')).toBe(true)
    expect(isSystemFolder('.hiddenDir')).toBe(true)
    expect(isSystemFolder('.')).toBe(true)
  })

  it('returns true for names in the denylist regardless of dot prefix', () => {
    for (const name of SYSTEM_FOLDER_NAMES) {
      expect(isSystemFolder(name)).toBe(true)
    }
  })

  it('returns true for node_modules (non-dot denylist entry)', () => {
    expect(isSystemFolder('node_modules')).toBe(true)
  })

  it('returns false for ordinary folder names', () => {
    expect(isSystemFolder('knowledge')).toBe(false)
    expect(isSystemFolder('career')).toBe(false)
    expect(isSystemFolder('notes')).toBe(false)
    expect(isSystemFolder('软件')).toBe(false)
  })
})

// ─── folderWeight: recursive count ───────────────────────────────────────────

describe('folderWeight — recursive count', () => {
  it('counts files across nested subfolders', async () => {
    const vault = adapter('v1', {
      docs: {
        'a.md': '# A',
        sub: {
          'b.md': '# B',
          deep: {
            'c.md': '# C',
          },
        },
      },
    })

    const w = await folderWeight(vault, 'docs')
    expect(w).toBe(3)
  })

  it('counts only files in the target subtree, not siblings', async () => {
    const vault = adapter('v2', {
      docs: {
        'a.md': '# A',
        'b.md': '# B',
      },
      other: {
        'c.md': '# C',
      },
    })

    expect(await folderWeight(vault, 'docs')).toBe(2)
    expect(await folderWeight(vault, 'other')).toBe(1)
  })

  it('returns 0 for an empty folder', async () => {
    const vault = adapter('v3', {
      empty: {},
    })
    expect(await folderWeight(vault, 'empty')).toBe(0)
  })

  it('counts files at the top level (root path)', async () => {
    const vault = adapter('v4', {
      'index.md': '# Home',
      'readme.md': '# Readme',
      sub: { 'nested.md': '# Nested' },
    })
    expect(await folderWeight(vault, '')).toBe(3)
  })
})

// ─── folderWeight: system dir exclusion ──────────────────────────────────────

describe('folderWeight — system directory exclusion', () => {
  it('does not descend into .git', async () => {
    const vault = adapter('v5', {
      content: {
        'note.md': '# Note',
        '.git': {
          HEAD: 'ref: refs/heads/main',
          objects: { abc123: 'blob' },
        },
      },
    })
    expect(await folderWeight(vault, 'content')).toBe(1)
  })

  it('does not descend into node_modules', async () => {
    const vault = adapter('v6', {
      project: {
        'index.md': '# Project',
        node_modules: {
          react: { 'index.js': 'module.exports = {}' },
          'lodash.js': 'content',
        },
      },
    })
    expect(await folderWeight(vault, 'project')).toBe(1)
  })

  it('does not descend into any dot-prefixed subdirectory', async () => {
    const vault = adapter('v7', {
      vault: {
        'note.md': '# Note',
        '.obsidian': {
          config: '{}',
          plugins: { 'plugin.js': 'code' },
        },
        '.trash': {
          'deleted.md': '# Deleted',
        },
      },
    })
    expect(await folderWeight(vault, 'vault')).toBe(1)
  })

  it('counts files in non-system siblings of a system folder', async () => {
    const vault = adapter('v8', {
      mix: {
        'a.md': '# A',
        'b.md': '# B',
        '.hidden': { 'secret.md': '# Secret' },
        legit: { 'c.md': '# C' },
      },
    })
    expect(await folderWeight(vault, 'mix')).toBe(3)
  })
})

// ─── folderWeight: ceiling early-stop ────────────────────────────────────────

describe('folderWeight — ceiling', () => {
  it('caps result at the default ceiling of 120', async () => {
    const tree: MockTreeNode = {}
    for (let i = 0; i < 150; i++) {
      tree[`note-${i}.md`] = '# Note'
    }
    const vault = adapter('v9', { big: tree })
    expect(await folderWeight(vault, 'big')).toBe(120)
  })

  it('caps result at a custom ceiling', async () => {
    const tree: MockTreeNode = {}
    for (let i = 0; i < 50; i++) {
      tree[`file-${i}.md`] = '# File'
    }
    const vault = adapter('v10', { folder: tree })
    expect(await folderWeight(vault, 'folder', { ceiling: 10 })).toBe(10)
  })

  it('returns exact count when below the ceiling', async () => {
    const vault = adapter('v11', {
      small: {
        'a.md': '# A',
        'b.md': '# B',
        'c.md': '# C',
      },
    })
    expect(await folderWeight(vault, 'small', { ceiling: 50 })).toBe(3)
  })
})

// ─── folderWeight: caching ────────────────────────────────────────────────────

describe('folderWeight — caching', () => {
  it('returns the same Promise on a second call (no re-walk)', async () => {
    const tree: MockTreeNode = {
      docs: {
        'a.md': '# A',
        'b.md': '# B',
      },
    }
    const vault = adapter('vc1', tree)

    const spy = vi.spyOn(vault, 'list')

    const p1 = folderWeight(vault, 'docs')
    const p2 = folderWeight(vault, 'docs')

    expect(p1).toBe(p2)

    const result = await p1
    expect(result).toBe(2)

    const callCountAfterFirst = spy.mock.calls.length

    // A third call should still return the cached value — no new list() calls.
    const p3 = folderWeight(vault, 'docs')
    expect(p3).toBe(p1)
    await p3
    expect(spy.mock.calls.length).toBe(callCountAfterFirst)
  })

  it('re-walks after invalidateFolderWeights clears the vault cache', async () => {
    const tree: MockTreeNode = {
      docs: { 'a.md': '# A' },
    }
    const vault = adapter('vc2', tree)
    const spy = vi.spyOn(vault, 'list')

    const first = await folderWeight(vault, 'docs')
    expect(first).toBe(1)
    const callsAfterFirst = spy.mock.calls.length

    invalidateFolderWeights('vc2')

    // After invalidation the cache is empty — a new call must re-walk.
    const second = await folderWeight(vault, 'docs')
    expect(second).toBe(1)
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('invalidateFolderWeights only clears the targeted vault', async () => {
    const vaultA = adapter('va', { dir: { 'x.md': '# X' } })
    const vaultB = adapter('vb', { dir: { 'y.md': '# Y', 'z.md': '# Z' } })

    const spyB = vi.spyOn(vaultB, 'list')

    await folderWeight(vaultA, 'dir')
    await folderWeight(vaultB, 'dir')

    const callsB = spyB.mock.calls.length

    invalidateFolderWeights('va')

    // Vault B cache must still be hot — no new list() calls.
    const p = folderWeight(vaultB, 'dir')
    await p
    expect(spyB.mock.calls.length).toBe(callsB)
  })

  it('caches results for different paths within the same vault independently', async () => {
    const vault = adapter('vc3', {
      docs: { 'a.md': '# A', 'b.md': '# B' },
      notes: { 'c.md': '# C' },
    })

    expect(await folderWeight(vault, 'docs')).toBe(2)
    expect(await folderWeight(vault, 'notes')).toBe(1)

    // Both are independently cached.
    const pDocs = folderWeight(vault, 'docs')
    const pNotes = folderWeight(vault, 'notes')
    expect(pDocs).not.toBe(pNotes)
    expect(await pDocs).toBe(2)
    expect(await pNotes).toBe(1)
  })
})
