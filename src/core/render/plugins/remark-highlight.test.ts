import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import remarkHighlight, { type HighlightNode } from './remark-highlight'

function parseMd(source: string): Root {
  const tree = unified().use(remarkParse).parse(source)
  return unified().use(remarkHighlight).runSync(tree)
}

function findAllHighlights(tree: Root): HighlightNode[] {
  const out: HighlightNode[] = []
  function walk(node: { type: string; children?: unknown }): void {
    if (node.type === 'highlight') {
      out.push(node as unknown as HighlightNode)
      return
    }
    if (Array.isArray((node as { children?: unknown[] }).children)) {
      for (const child of (node as { children: unknown[] }).children) {
        walk(child as { type: string })
      }
    }
  }
  walk(tree)
  return out
}

describe('remarkHighlight plugin', () => {
  it('extracts a single highlight from a paragraph', () => {
    const tree = parseMd('Read this ==important== sentence.')
    const marks = findAllHighlights(tree)
    expect(marks).toHaveLength(1)
    expect(marks[0]?.value).toBe('important')
  })

  it('extracts multiple highlights from one paragraph', () => {
    const tree = parseMd('==alpha== and ==beta== then ==gamma==.')
    const marks = findAllHighlights(tree)
    expect(marks.map((m) => m.value)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('matches lazily — adjacent highlights stay separate', () => {
    const tree = parseMd('==first== ==second==')
    const marks = findAllHighlights(tree)
    expect(marks).toHaveLength(2)
    expect(marks[0]?.value).toBe('first')
    expect(marks[1]?.value).toBe('second')
  })

  it('preserves surrounding text', () => {
    const tree = parseMd('before ==middle== after')
    const para = tree.children[0] as {
      children: { type: string; value?: string }[]
    }
    expect(para.children.map((c) => c.type)).toEqual([
      'text',
      'highlight',
      'text',
    ])
    expect(para.children[0]?.value).toBe('before ')
    expect(para.children[2]?.value).toBe(' after')
  })

  it('attaches hast hints (hName=mark + hChildren)', () => {
    const tree = parseMd('==highlighted==')
    const mark = findAllHighlights(tree)[0]
    expect(mark?.data?.hName).toBe('mark')
    expect(mark?.data?.hChildren?.[0]).toMatchObject({
      type: 'text',
      value: 'highlighted',
    })
  })

  it('preserves Unicode content', () => {
    const tree = parseMd('==重要== 概念')
    const marks = findAllHighlights(tree)
    expect(marks).toHaveLength(1)
    expect(marks[0]?.value).toBe('重要')
  })

  it('does not match across newlines', () => {
    const tree = parseMd('==line one\nline two==')
    expect(findAllHighlights(tree)).toHaveLength(0)
  })

  it('does not match an empty highlight', () => {
    const tree = parseMd('a ==== b')
    expect(findAllHighlights(tree)).toHaveLength(0)
  })

  it('does not match comparison expressions with surrounding spaces', () => {
    // `x == 5` is a comparison, not a highlight. Our `\S…\S` anchor
    // requires non-whitespace at both ends of the inner content.
    const tree = parseMd('check x == 5 == y')
    expect(findAllHighlights(tree)).toHaveLength(0)
  })

  it('handles a highlight at the start of a paragraph', () => {
    const tree = parseMd('==leading== then more')
    const para = tree.children[0] as {
      children: { type: string; value?: string }[]
    }
    expect(para.children[0]?.type).toBe('highlight')
    expect(para.children[1]?.value).toBe(' then more')
  })

  it('handles a highlight at the end of a paragraph', () => {
    const tree = parseMd('trailing then ==final==')
    const para = tree.children[0] as {
      children: { type: string; value?: string }[]
    }
    expect(para.children[para.children.length - 1]?.type).toBe('highlight')
  })
})
