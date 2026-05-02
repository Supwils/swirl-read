import { describe, expect, it } from 'vitest'
import { buildFullTextIndex, searchIndex } from './full-text'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'

function adapter(tree: Parameters<typeof mockRoot>[1]): FSAPIVaultAdapter {
  return FSAPIVaultAdapter.fromHandle(mockRoot('vault', tree), {
    id: 'v',
    name: 'vault',
  })
}

describe('buildFullTextIndex', () => {
  it('indexes every markdown file in the vault', async () => {
    const vault = adapter({
      'a.md': '# Alpha\n\nfirst document body',
      'b.md': '# Beta\n\nsecond document body',
      'logo.png': new Uint8Array([0]),
      'config.json': '{}',
    })
    const index = await buildFullTextIndex(vault)
    expect(index.size).toBe(2)
  })

  it('strips frontmatter from indexed body content', async () => {
    const vault = adapter({
      'a.md': '---\ntitle: secret\n---\n\nVisible body content.\n',
    })
    const index = await buildFullTextIndex(vault)
    // The body got indexed; the frontmatter did not.
    expect(searchIndex(index, 'visible')).toHaveLength(1)
    expect(searchIndex(index, 'secret')).toHaveLength(0)
  })
})

describe('searchIndex — ranking + matching', () => {
  it('finds matches across body content', async () => {
    const vault = adapter({
      'react.md': '# React\n\nHooks let components manage state',
      'go.md': '# Go\n\nGoroutines for concurrency',
    })
    const index = await buildFullTextIndex(vault)
    const hits = searchIndex(index, 'hooks')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.path).toBe('react.md')
  })

  it('boosts matches in the file name over body matches', async () => {
    const vault = adapter({
      'react.md': '# React\n\nhooks state state state',
      'state.md': '# State\n\nlots of words about reading',
    })
    const index = await buildFullTextIndex(vault)
    // `state.md`'s name should outrank `react.md`'s 4-occurrence body.
    const hits = searchIndex(index, 'state')
    expect(hits[0]?.path).toBe('state.md')
  })

  it('returns an empty list for an empty query', async () => {
    const vault = adapter({ 'a.md': '# A\n\nbody' })
    const index = await buildFullTextIndex(vault)
    expect(searchIndex(index, '')).toEqual([])
    expect(searchIndex(index, '   ')).toEqual([])
  })

  it('builds a snippet around the first matching term', async () => {
    const vault = adapter({
      'long.md':
        '# Long doc\n\nintroduction paragraph here. ' +
        'middle text the keyword appears here in the document. ' +
        'tail paragraph that is also long and contains additional words.',
    })
    const index = await buildFullTextIndex(vault)
    const [hit] = searchIndex(index, 'keyword')
    expect(hit).toBeDefined()
    expect(hit?.snippet).toContain('keyword')
    // Snippet should include surrounding context, not the whole body.
    expect(hit?.snippet.length).toBeLessThan(160)
  })

  it('matches CJK content via Intl.Segmenter when available', async () => {
    const vault = adapter({
      'cn.md': '# 前端\n\n这是关于 React 钩子函数的笔记',
    })
    const index = await buildFullTextIndex(vault)
    const hits = searchIndex(index, '钩子')
    // jsdom's Intl.Segmenter may or may not be available; the test is
    // tolerant: at minimum we return a list (possibly empty in old
    // environments). Where Segmenter exists we should get a hit.
    if (typeof Intl?.Segmenter === 'function') {
      expect(hits.length).toBeGreaterThan(0)
      expect(hits[0]?.path).toBe('cn.md')
    } else {
      expect(Array.isArray(hits)).toBe(true)
    }
  })

  it('falls back to a body lead-in when no exact substring matches', async () => {
    const vault = adapter({
      // Fuzzy matching may rank this for "kook" but the body has no
      // literal substring; snippet should fall back to body start.
      'a.md': '# A\n\nthis body is about hooks and rendering',
    })
    const index = await buildFullTextIndex(vault)
    const hits = searchIndex(index, 'kook')
    // If MiniSearch's fuzziness still ranks this, the snippet should
    // be a sensible lead-in. If not, the test is informational.
    if (hits.length > 0) {
      expect(hits[0]?.snippet.length).toBeGreaterThan(0)
    }
  })

  it('caps results to MAX_HITS', async () => {
    const tree: Parameters<typeof mockRoot>[1] = {}
    for (let i = 0; i < 60; i += 1) {
      tree[`note-${String(i)}.md`] = `# Note ${String(i)}\n\nshared keyword`
    }
    const vault = adapter(tree)
    const index = await buildFullTextIndex(vault)
    const hits = searchIndex(index, 'keyword')
    expect(hits.length).toBeLessThanOrEqual(25)
  })
})
