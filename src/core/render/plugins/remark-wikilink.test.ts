import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import remarkWikilink, {
  parseWikilinkBody,
  type WikilinkNode,
} from './remark-wikilink'

function parseMd(source: string): Root {
  const tree = unified().use(remarkParse).use(remarkWikilink).parse(source)
  return unified().use(remarkWikilink).runSync(tree)
}

function findAllWikilinks(tree: Root): WikilinkNode[] {
  const out: WikilinkNode[] = []
  function walk(node: { type: string; children?: unknown }): void {
    if (node.type === 'wikilink') {
      out.push(node as unknown as WikilinkNode)
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

describe('parseWikilinkBody', () => {
  it('handles plain target', () => {
    expect(parseWikilinkBody('page')).toEqual({ target: 'page' })
  })

  it('handles target with alias', () => {
    expect(parseWikilinkBody('page|Display Text')).toEqual({
      target: 'page',
      alias: 'Display Text',
    })
  })

  it('handles target with heading', () => {
    expect(parseWikilinkBody('page#section')).toEqual({
      target: 'page',
      heading: 'section',
    })
  })

  it('handles target with heading and alias', () => {
    expect(parseWikilinkBody('page#section|Display')).toEqual({
      target: 'page',
      heading: 'section',
      alias: 'Display',
    })
  })

  it('handles target with block id', () => {
    expect(parseWikilinkBody('page^abc-123')).toEqual({
      target: 'page',
      blockId: 'abc-123',
    })
  })

  it('handles block id with alias', () => {
    expect(parseWikilinkBody('page^abc|Quote')).toEqual({
      target: 'page',
      blockId: 'abc',
      alias: 'Quote',
    })
  })

  it('preserves Unicode in target and alias', () => {
    expect(parseWikilinkBody('知识/前端|前端笔记')).toEqual({
      target: '知识/前端',
      alias: '前端笔记',
    })
  })

  it('trims whitespace around segments', () => {
    expect(parseWikilinkBody('  page  |  Alias  ')).toEqual({
      target: 'page',
      alias: 'Alias',
    })
  })
})

describe('remarkWikilink plugin', () => {
  it('extracts a single wikilink from a paragraph', () => {
    const tree = parseMd('See [[react]] for details.')
    const links = findAllWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]?.target).toBe('react')
  })

  it('extracts multiple wikilinks from one paragraph', () => {
    const tree = parseMd('Compare [[a]] with [[b]] and [[c|see C]].')
    const links = findAllWikilinks(tree)
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.target)).toEqual(['a', 'b', 'c'])
    expect(links[2]?.alias).toBe('see C')
  })

  it('preserves surrounding text', () => {
    const tree = parseMd('before [[link]] after')
    const para = (
      tree.children[0] as { children: { type: string; value?: string }[] }
    ).children
    expect(para).toHaveLength(3)
    expect(para[0]).toMatchObject({ type: 'text', value: 'before ' })
    expect(para[1]).toMatchObject({ type: 'wikilink' })
    expect(para[2]).toMatchObject({ type: 'text', value: ' after' })
  })

  it('attaches hast hints (hName, hProperties, hChildren)', () => {
    const tree = parseMd('See [[knowledge/react|React notes]].')
    const link = findAllWikilinks(tree)[0]
    expect(link?.data?.hName).toBe('wikilink')
    expect(link?.data?.hProperties?.['data-target']).toBe('knowledge/react')
    expect(link?.data?.hProperties?.['data-alias']).toBe('React notes')
    expect(link?.data?.hChildren?.[0]).toMatchObject({
      type: 'text',
      value: 'React notes',
    })
  })

  it('uses target as label when no alias provided', () => {
    const tree = parseMd('[[react]]')
    const link = findAllWikilinks(tree)[0]
    expect(link?.data?.hChildren?.[0]?.value).toBe('react')
  })

  it('renders heading-only label as "target > heading"', () => {
    const tree = parseMd('[[react#hooks]]')
    const link = findAllWikilinks(tree)[0]
    expect(link?.data?.hChildren?.[0]?.value).toBe('react > hooks')
  })

  it('does not match across newlines', () => {
    const tree = parseMd('start [[unclosed\nstill open]]')
    expect(findAllWikilinks(tree)).toHaveLength(0)
  })

  it('handles Unicode targets and aliases', () => {
    const tree = parseMd('See [[知识/前端|前端笔记]] for context.')
    const link = findAllWikilinks(tree)[0]
    expect(link?.target).toBe('知识/前端')
    expect(link?.alias).toBe('前端笔记')
  })
})
