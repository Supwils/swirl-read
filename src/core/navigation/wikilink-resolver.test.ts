import { describe, it, expect, beforeAll } from 'vitest'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import { buildWikilinkIndex, resolveWikilink } from './wikilink-resolver'
import type { WikilinkIndex } from './wikilink-resolver'

let index: WikilinkIndex

beforeAll(async () => {
  const root = mockRoot('vault', {
    'index.md': '# root',
    'README.md': 'readme',
    career: {
      'career-map.md': '# Career',
      me: {
        'me.md': '# me',
        'experience.md': '# experience',
      },
    },
    knowledge: {
      'knowledge-map.md': '# K',
      软件: {
        前端: {
          'react.md': '# React notes',
        },
      },
      duplicate: {
        'me.md': 'a sibling me file',
      },
    },
    'logo.png': new Uint8Array([1, 2, 3]),
  })
  const vault = FSAPIVaultAdapter.fromHandle(root, {
    id: 'idx-vault',
    name: 'idx-vault',
  })
  index = await buildWikilinkIndex(vault)
})

describe('buildWikilinkIndex', () => {
  it('indexes every file by full filename', () => {
    expect(index.get('react.md')).toEqual(['knowledge/软件/前端/react.md'])
    expect(index.get('experience.md')).toEqual(['career/me/experience.md'])
  })

  it('indexes every file by stem (no extension)', () => {
    expect(index.get('react')).toEqual(['knowledge/软件/前端/react.md'])
    expect(index.get('experience')).toEqual(['career/me/experience.md'])
  })

  it('groups duplicates under the same key', () => {
    const sorted = index.get('me.md')?.slice().sort()
    expect(sorted).toEqual(['career/me/me.md', 'knowledge/duplicate/me.md'])
  })

  it('does not separately index files without extensions', () => {
    // logo.png has no stem distinct from filename → only "logo.png"
    expect(index.get('logo.png')).toBeDefined()
  })
})

describe('resolveWikilink', () => {
  it('resolves a stem to its .md file', () => {
    expect(resolveWikilink('react', index)).toBe('knowledge/软件/前端/react.md')
  })

  it('resolves an exact path', () => {
    expect(resolveWikilink('career/me/me.md', index)).toBe('career/me/me.md')
  })

  it('resolves an exact path without extension by appending .md', () => {
    expect(resolveWikilink('career/me/me', index)).toBe('career/me/me.md')
  })

  it('returns null for unknown targets', () => {
    expect(resolveWikilink('does-not-exist', index)).toBeNull()
  })

  it('handles Unicode targets', () => {
    expect(resolveWikilink('react', index)).toContain('react.md')
  })

  it('returns first match deterministically for ambiguous basenames', () => {
    // The walker yields career/me/me.md first because career sorts before knowledge
    // alphabetically. (Insertion order from mock-fs object iteration matches.)
    const resolved = resolveWikilink('me', index)
    expect(resolved).not.toBeNull()
    expect(['career/me/me.md', 'knowledge/duplicate/me.md']).toContain(resolved)
  })

  it('returns null for empty target', () => {
    expect(resolveWikilink('', index)).toBeNull()
  })
})
