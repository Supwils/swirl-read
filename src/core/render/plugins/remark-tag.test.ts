import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import remarkTag, { findTagsInText, normalizeTag } from './remark-tag'

function parse(source: string): Root {
  return unified().use(remarkParse).use(remarkTag).parse(source)
}

function transform(source: string): Root {
  const processor = unified().use(remarkParse).use(remarkTag)
  const tree = processor.parse(source)
  return processor.runSync(tree)
}

interface NodeLike {
  type: string
  children?: unknown[]
  value?: string
  data?: unknown
}

function tagsIn(tree: Root): string[] {
  const out: string[] = []
  function walk(node: NodeLike): void {
    if (node.type === 'tag' && typeof node.value === 'string')
      out.push(node.value)
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child as NodeLike)
    }
  }
  walk(tree)
  return out
}

describe('findTagsInText', () => {
  it('finds simple tags', () => {
    expect(findTagsInText('hello #foo and #bar')).toEqual(['foo', 'bar'])
  })

  it('finds nested tags', () => {
    expect(findTagsInText('#career/me')).toEqual(['career/me'])
  })

  it('preserves CJK characters', () => {
    expect(findTagsInText('#中文 #knowledge/前端')).toEqual([
      '中文',
      'knowledge/前端',
    ])
  })

  it('lowercases ASCII letters', () => {
    expect(findTagsInText('#Foo #BAR/Baz')).toEqual(['foo', 'bar/baz'])
  })

  it('rejects URL fragments', () => {
    expect(findTagsInText('https://example.com#section')).toEqual([])
    expect(findTagsInText('/path#frag')).toEqual([])
    expect(findTagsInText('word#anchor')).toEqual([])
  })

  it('rejects ATX-heading-like leftovers (## is not a tag)', () => {
    expect(findTagsInText('##doubled')).toEqual([])
  })

  it('returns empty for input without `#`', () => {
    expect(findTagsInText('plain text only')).toEqual([])
  })

  it('strips trailing dashes/slashes', () => {
    expect(findTagsInText('#tag- #tag/')).toEqual(['tag', 'tag'])
  })

  it('preserves duplicates in order', () => {
    expect(findTagsInText('#a #a #b #a')).toEqual(['a', 'a', 'b', 'a'])
  })
})

describe('normalizeTag', () => {
  it('lowercases ASCII', () => {
    expect(normalizeTag('FooBar')).toBe('foobar')
  })

  it('preserves CJK', () => {
    expect(normalizeTag('中文')).toBe('中文')
  })

  it('strips trailing punctuation', () => {
    expect(normalizeTag('foo--')).toBe('foo')
    expect(normalizeTag('foo/')).toBe('foo')
  })
})

describe('remark-tag plugin', () => {
  it('rewrites a single tag in a paragraph', () => {
    const tree = transform('hello #foo world')
    expect(tagsIn(tree)).toEqual(['foo'])
  })

  it('handles multiple tags in one paragraph', () => {
    const tree = transform('see #a then #b/c finally #d')
    expect(tagsIn(tree)).toEqual(['a', 'b/c', 'd'])
  })

  it('does not tag inside inline code', () => {
    const tree = transform('use the `#tag` syntax')
    expect(tagsIn(tree)).toEqual([])
  })

  it('does not tag inside fenced code blocks', () => {
    const tree = transform('```\nlook at #tag here\n```')
    expect(tagsIn(tree)).toEqual([])
  })

  it('does not tag inside link labels', () => {
    const tree = transform('[#tag-in-label](https://x.com)')
    expect(tagsIn(tree)).toEqual([])
  })

  it('does not tag inside image alt text', () => {
    const tree = transform('![#alt-tag](image.png)')
    expect(tagsIn(tree)).toEqual([])
  })

  it('parses tags inside emphasis when present at the top of a paragraph', () => {
    // Emphasis is a phrasing parent that holds text children — visit reaches them.
    const tree = transform('*hello #foo*')
    expect(tagsIn(tree)).toEqual(['foo'])
  })

  it('emits a tag node with a data-tag hProperty', () => {
    const tree = transform('hi #career/me')
    function find(node: NodeLike): Record<string, unknown> | null {
      if (node.type === 'tag') return node.data as Record<string, unknown>
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const hit = find(child as NodeLike)
          if (hit) return hit
        }
      }
      return null
    }
    const data = find(tree)
    expect(data).not.toBeNull()
    expect((data as { hName: string }).hName).toBe('tag')
    const props = (data as { hProperties: Record<string, string> }).hProperties
    expect(props['data-tag']).toBe('career/me')
  })

  it('leaves the parse tree unchanged when no tags are present', () => {
    const tree = parse('plain old prose with no tag-like markers')
    expect(tagsIn(tree)).toEqual([])
  })

  it('preserves surrounding text when splitting a paragraph', () => {
    const tree = transform('before #foo after')
    function collectTextRuns(node: NodeLike): string[] {
      if (node.type === 'text' && typeof node.value === 'string')
        return [node.value]
      if (node.type === 'tag' && typeof node.value === 'string')
        return [`#${node.value}`]
      if (Array.isArray(node.children)) {
        return node.children.flatMap((c) => collectTextRuns(c as NodeLike))
      }
      return []
    }
    expect(collectTextRuns(tree as NodeLike)).toEqual([
      'before ',
      '#foo',
      ' after',
    ])
  })
})
