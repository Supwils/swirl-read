import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import remarkEmbed, {
  detectKind,
  parseEmbedBody,
  type EmbedNode,
} from './remark-embed'
import remarkWikilink from './remark-wikilink'

function parseMd(source: string): Root {
  const tree = unified().use(remarkParse).parse(source)
  return unified().use(remarkEmbed).runSync(tree)
}

function parseMdWithWikilink(source: string): Root {
  const tree = unified().use(remarkParse).parse(source)
  // Same plugin order as the production pipeline: embed before wikilink.
  return unified().use(remarkEmbed).use(remarkWikilink).runSync(tree)
}

function findAllEmbeds(tree: Root): EmbedNode[] {
  const out: EmbedNode[] = []
  function walk(node: { type: string; children?: unknown }): void {
    if (node.type === 'embed') {
      out.push(node as unknown as EmbedNode)
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

describe('detectKind', () => {
  it('classifies image extensions', () => {
    expect(detectKind('logo.png')).toBe('image')
    expect(detectKind('photo.JPG')).toBe('image')
    expect(detectKind('icon.svg')).toBe('image')
  })

  it('classifies video extensions', () => {
    expect(detectKind('clip.mp4')).toBe('video')
    expect(detectKind('movie.webm')).toBe('video')
  })

  it('classifies audio extensions', () => {
    expect(detectKind('song.mp3')).toBe('audio')
    expect(detectKind('voice.wav')).toBe('audio')
  })

  it('classifies markdown extensions and bare names', () => {
    expect(detectKind('note.md')).toBe('markdown')
    expect(detectKind('note.mdx')).toBe('markdown')
    expect(detectKind('note')).toBe('markdown')
  })

  it('classifies pdf', () => {
    expect(detectKind('paper.pdf')).toBe('pdf')
  })

  it('falls through to "other" for unknown extensions', () => {
    expect(detectKind('archive.zip')).toBe('other')
    expect(detectKind('data.bin')).toBe('other')
  })
})

describe('parseEmbedBody', () => {
  it('parses a plain target', () => {
    expect(parseEmbedBody('image.png')).toEqual({
      target: 'image.png',
      kind: 'image',
    })
  })

  it('parses target with display arg', () => {
    expect(parseEmbedBody('image.png|400')).toEqual({
      target: 'image.png',
      display: '400',
      kind: 'image',
    })
  })

  it('parses target with width × height', () => {
    expect(parseEmbedBody('image.png|400x300')).toEqual({
      target: 'image.png',
      display: '400x300',
      kind: 'image',
    })
  })

  it('parses heading reference for markdown', () => {
    expect(parseEmbedBody('note.md#Introduction')).toEqual({
      target: 'note.md',
      heading: 'Introduction',
      kind: 'markdown',
    })
  })

  it('parses block reference', () => {
    expect(parseEmbedBody('note^abc-123')).toEqual({
      target: 'note',
      blockId: 'abc-123',
      kind: 'markdown',
    })
  })

  it('preserves Unicode in target and display', () => {
    expect(parseEmbedBody('知识/前端|前端笔记')).toEqual({
      target: '知识/前端',
      display: '前端笔记',
      kind: 'markdown',
    })
  })

  it('trims whitespace around segments', () => {
    expect(parseEmbedBody('  image.png  |  300  ')).toEqual({
      target: 'image.png',
      display: '300',
      kind: 'image',
    })
  })
})

describe('remarkEmbed plugin', () => {
  it('extracts a single embed from a paragraph', () => {
    const tree = parseMd('See ![[diagram.png]] for the layout.')
    const embeds = findAllEmbeds(tree)
    expect(embeds).toHaveLength(1)
    expect(embeds[0]?.target).toBe('diagram.png')
    expect(embeds[0]?.kind).toBe('image')
  })

  it('extracts multiple embeds from one paragraph', () => {
    const tree = parseMd(
      'Compare ![[a.png]] with ![[b.mp4]] and ![[c.md|Notes]].',
    )
    const embeds = findAllEmbeds(tree)
    expect(embeds).toHaveLength(3)
    expect(embeds.map((e) => e.kind)).toEqual(['image', 'video', 'markdown'])
    expect(embeds[2]?.display).toBe('Notes')
  })

  it('lifts a solitary embed paragraph to a top-level block', () => {
    const tree = parseMd('Before\n\n![[image.png]]\n\nAfter')
    // After the lift pass the embed should be a direct child of the root.
    const topLevelTypes = tree.children.map((c) => c.type)
    expect(topLevelTypes).toContain('embed')
    // And the surrounding paragraphs are still there.
    expect(topLevelTypes.filter((t) => t === 'paragraph')).toHaveLength(2)
  })

  it('keeps inline embeds nested inside their paragraph', () => {
    const tree = parseMd('Inline ![[icon.png]] still here.')
    expect(tree.children[0]?.type).toBe('paragraph')
    const embeds = findAllEmbeds(tree)
    expect(embeds).toHaveLength(1)
  })

  it('preserves surrounding text around an inline embed', () => {
    const tree = parseMd('before ![[icon.png]] after')
    const para = tree.children[0] as {
      children: { type: string; value?: string }[]
    }
    expect(para.children.map((c) => c.type)).toEqual(['text', 'embed', 'text'])
    expect(para.children[0]?.value).toBe('before ')
    expect(para.children[2]?.value).toBe(' after')
  })

  it('attaches hast hints (hName + data attrs)', () => {
    const tree = parseMd('![[note.md#Hooks|Sidebar]]')
    const embed = findAllEmbeds(tree)[0]
    expect(embed?.data?.hName).toBe('vault-embed')
    const props = embed?.data?.hProperties ?? {}
    expect(props['data-target']).toBe('note.md')
    expect(props['data-kind']).toBe('markdown')
    expect(props['data-display']).toBe('Sidebar')
    expect(props['data-heading']).toBe('Hooks')
  })

  it('does not match across newlines', () => {
    const tree = parseMd('![[unclosed\nstill open]]')
    expect(findAllEmbeds(tree)).toHaveLength(0)
  })
})

describe('remarkEmbed + remarkWikilink interaction', () => {
  it('embed claims `![[x]]` so wikilink does not match the inner brackets', () => {
    const tree = parseMdWithWikilink('See ![[image.png]] and [[reference]].')
    const embeds = findAllEmbeds(tree)
    expect(embeds).toHaveLength(1)
    expect(embeds[0]?.target).toBe('image.png')

    // And there's still exactly one wikilink for the bare `[[reference]]`.
    let wikilinkCount = 0
    function walk(n: { type: string; children?: unknown }): void {
      if (n.type === 'wikilink') wikilinkCount++
      if (Array.isArray((n as { children?: unknown[] }).children)) {
        for (const c of (n as { children: unknown[] }).children) {
          walk(c as { type: string })
        }
      }
    }
    walk(tree)
    expect(wikilinkCount).toBe(1)
  })
})
