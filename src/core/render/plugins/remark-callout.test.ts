import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import remarkCallout, { type CalloutNode } from './remark-callout'

function parseMd(source: string): Root {
  const tree = unified().use(remarkParse).parse(source)
  return unified().use(remarkCallout).runSync(tree)
}

function findCallouts(tree: Root): CalloutNode[] {
  const out: CalloutNode[] = []
  function walk(node: { type: string; children?: unknown }): void {
    if (node.type === 'callout') {
      out.push(node as unknown as CalloutNode)
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

describe('remark-callout — header recognition', () => {
  it('recognizes a basic callout with no title', () => {
    const tree = parseMd('> [!note]\n> Body content here.')
    const callouts = findCallouts(tree)
    expect(callouts).toHaveLength(1)
    expect(callouts[0]?.calloutType).toBe('note')
    expect(callouts[0]?.title).toBeUndefined()
  })

  it('recognizes a callout with an inline title', () => {
    const tree = parseMd('> [!warning] Be careful here\n> The fix is tricky.')
    const callouts = findCallouts(tree)
    expect(callouts).toHaveLength(1)
    expect(callouts[0]?.calloutType).toBe('warning')
    expect(callouts[0]?.title).toBe('Be careful here')
  })

  it('lowercases the type', () => {
    const tree = parseMd('> [!WARNING]\n> body')
    expect(findCallouts(tree)[0]?.calloutType).toBe('warning')
  })

  it('accepts foldable markers but does not act on them yet', () => {
    const tree1 = parseMd('> [!note]+\n> open by default')
    const tree2 = parseMd('> [!note]-\n> closed by default')
    expect(findCallouts(tree1)[0]?.calloutType).toBe('note')
    expect(findCallouts(tree2)[0]?.calloutType).toBe('note')
  })

  it('recognizes all standard Obsidian types', () => {
    const types = [
      'note',
      'info',
      'tip',
      'success',
      'question',
      'warning',
      'failure',
      'danger',
      'bug',
      'example',
      'quote',
      'abstract',
      'summary',
      'todo',
    ]
    for (const type of types) {
      const tree = parseMd(`> [!${type}]\n> body`)
      expect(findCallouts(tree)[0]?.calloutType).toBe(type)
    }
  })

  it('falls through for unknown types (still produces a callout)', () => {
    const tree = parseMd('> [!my-custom-type]\n> body')
    expect(findCallouts(tree)[0]?.calloutType).toBe('my-custom-type')
  })

  it('ignores blockquotes that do not start with [!type]', () => {
    const tree = parseMd('> Just a normal blockquote.')
    expect(findCallouts(tree)).toHaveLength(0)
  })

  it('ignores blockquotes whose first line has [!type] mid-paragraph', () => {
    // The header MUST be at position 0 of the first text node.
    const tree = parseMd('> Some prefix [!note]\n> body')
    expect(findCallouts(tree)).toHaveLength(0)
  })
})

describe('remark-callout — body extraction', () => {
  it('preserves single-paragraph body content', () => {
    const tree = parseMd('> [!note]\n> First line\n> Second line')
    const callout = findCallouts(tree)[0]
    expect(callout?.children).toHaveLength(1)
    expect(callout?.children[0]).toMatchObject({ type: 'paragraph' })
  })

  it('preserves multi-paragraph body content', () => {
    const tree = parseMd('> [!note]\n> First paragraph\n>\n> Second paragraph')
    const callout = findCallouts(tree)[0]
    expect(callout?.children).toHaveLength(2)
  })

  it('preserves nested markdown inside the body (lists, code)', () => {
    const tree = parseMd('> [!tip]\n> - one\n> - two\n>\n> ```ts\n> x\n> ```')
    const callout = findCallouts(tree)[0]
    const types = callout?.children.map((c) => c.type)
    expect(types).toContain('list')
    expect(types).toContain('code')
  })

  it('handles a header with empty body gracefully', () => {
    const tree = parseMd('> [!note]')
    const callout = findCallouts(tree)[0]
    expect(callout?.children).toHaveLength(0)
  })
})

describe('remark-callout — hast hints', () => {
  it('emits a `callout` element with data-callout-type', () => {
    const tree = parseMd('> [!warning] Heads up\n> Body')
    const callout = findCallouts(tree)[0]
    expect(callout?.data?.hName).toBe('callout')
    expect(callout?.data?.hProperties?.['data-callout-type']).toBe('warning')
    expect(callout?.data?.hProperties?.['data-callout-title']).toBe('Heads up')
  })

  it('omits data-callout-title when no inline title is provided', () => {
    const tree = parseMd('> [!note]\n> body')
    const callout = findCallouts(tree)[0]
    expect(callout?.data?.hProperties?.['data-callout-title']).toBeUndefined()
  })
})
