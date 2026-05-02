import { describe, it, expect } from 'vitest'
import { FSAPIVaultAdapter } from './fsapi-adapter'
import { mockRoot } from './__test-helpers__/mock-fs'
import { walkAllFiles } from './walk-files'

function adapter(tree: Parameters<typeof mockRoot>[1]): FSAPIVaultAdapter {
  return FSAPIVaultAdapter.fromHandle(mockRoot('vault', tree), {
    id: 'v',
    name: 'vault',
  })
}

describe('walkAllFiles', () => {
  it('returns every file in the vault, level-ordered', async () => {
    const vault = adapter({
      'index.md': '# Home',
      career: {
        'me.md': '# Me',
        deep: { 'deeper.md': '# Deeper' },
      },
      knowledge: {
        'react.md': '# React',
      },
    })

    const files = await walkAllFiles(vault)
    expect(files.map((f) => f.path).sort()).toEqual(
      [
        'career/deep/deeper.md',
        'career/me.md',
        'index.md',
        'knowledge/react.md',
      ].sort(),
    )
  })

  it('returns top-level files before nested ones (BFS order)', async () => {
    const vault = adapter({
      'a.md': 'top',
      sub: { 'b.md': 'nested' },
    })

    const files = await walkAllFiles(vault)
    const aIdx = files.findIndex((f) => f.path === 'a.md')
    const bIdx = files.findIndex((f) => f.path === 'sub/b.md')
    expect(aIdx).toBeLessThan(bIdx)
  })

  it('filters by extension when includeExtensions is provided', async () => {
    const vault = adapter({
      'note.md': '# Note',
      'logo.png': new Uint8Array([0]),
      data: { 'config.json': '{}' },
    })

    const mdOnly = await walkAllFiles(vault, {
      includeExtensions: new Set(['.md']),
    })
    expect(mdOnly.map((f) => f.path)).toEqual(['note.md'])

    const both = await walkAllFiles(vault, {
      includeExtensions: new Set(['.md', '.json']),
    })
    expect(both.map((f) => f.path).sort()).toEqual([
      'data/config.json',
      'note.md',
    ])
  })

  it('stops once maxFiles is reached', async () => {
    const tree: Record<string, unknown> = {}
    for (let i = 0; i < 50; i += 1) tree[`note-${i}.md`] = '#'
    const vault = adapter(tree as Parameters<typeof mockRoot>[1])

    const files = await walkAllFiles(vault, { maxFiles: 10 })
    expect(files).toHaveLength(10)
  })

  it('returns an empty array for an empty vault', async () => {
    const vault = adapter({})
    expect(await walkAllFiles(vault)).toEqual([])
  })

  it('includes Unicode (CJK) paths verbatim', async () => {
    const vault = adapter({
      knowledge: {
        软件: {
          前端: { 'react.md': '# React' },
        },
      },
    })
    const files = await walkAllFiles(vault)
    expect(files.map((f) => f.path)).toContain('knowledge/软件/前端/react.md')
  })
})
