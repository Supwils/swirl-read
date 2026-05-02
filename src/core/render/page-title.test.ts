import { describe, expect, it } from 'vitest'
import { cleanFilename, derivePageTitle, firstAtxH1 } from './page-title'
import { extractFrontmatter } from './frontmatter'

function sources(input: { filePath: string; raw: string }): {
  filePath: string
  raw: string
  frontmatter: ReturnType<typeof extractFrontmatter>
} {
  return {
    filePath: input.filePath,
    raw: input.raw,
    frontmatter: extractFrontmatter(input.raw),
  }
}

describe('cleanFilename', () => {
  it('strips the directory and extension', () => {
    expect(cleanFilename('career/me.md')).toBe('Me')
  })

  it('replaces dashes and underscores with spaces and title-cases', () => {
    expect(cleanFilename('career-map.md')).toBe('Career Map')
    expect(cleanFilename('weekly_review_2026.md')).toBe('Weekly Review 2026')
  })

  it('preserves CJK characters verbatim', () => {
    expect(cleanFilename('knowledge/软件/前端/react.md')).toBe('React')
    expect(cleanFilename('知识/中文笔记.md')).toBe('中文笔记')
  })

  it('does not case-mangle already-cased ASCII tokens', () => {
    expect(cleanFilename('NASA-mission.md')).toBe('NASA Mission')
  })

  it('handles files without an extension', () => {
    expect(cleanFilename('Makefile')).toBe('Makefile')
    expect(cleanFilename('career/Makefile')).toBe('Makefile')
  })

  it('returns the basename for an empty/edge input', () => {
    expect(cleanFilename('')).toBe('')
    expect(cleanFilename('.md')).toBe('.md')
  })
})

describe('firstAtxH1', () => {
  it('finds a leading H1', () => {
    expect(firstAtxH1('# Hello\n\nbody')).toBe('Hello')
  })

  it('finds an H1 after a blank line', () => {
    expect(firstAtxH1('\n\n# Title\n\nbody')).toBe('Title')
  })

  it('strips a closing GFM hash run', () => {
    expect(firstAtxH1('# Title #\n\nbody')).toBe('Title')
    expect(firstAtxH1('# Title ###\n\nbody')).toBe('Title')
  })

  it('does not match H2 / H3 / etc.', () => {
    expect(firstAtxH1('## Subtitle\n\nbody')).toBeNull()
    expect(firstAtxH1('### Section\n\nbody')).toBeNull()
  })

  it('does not match `#tag` (no space after hash)', () => {
    expect(firstAtxH1('#tag and stuff')).toBeNull()
  })

  it('skips H1-looking lines inside fenced code blocks', () => {
    const source = '```bash\n# this is a comment\n```\n\n# Real Title'
    expect(firstAtxH1(source)).toBe('Real Title')
  })

  it('returns null when there is no H1', () => {
    expect(firstAtxH1('just a paragraph')).toBeNull()
    expect(firstAtxH1('')).toBeNull()
  })

  it('preserves CJK in the heading', () => {
    expect(firstAtxH1('# 标题\n\nbody')).toBe('标题')
  })
})

describe('derivePageTitle', () => {
  it('prefers frontmatter title when present', () => {
    const result = derivePageTitle(
      sources({
        filePath: 'career/me.md',
        raw: `---
title: Front Matter Wins
---

# Body Heading
`,
      }),
    )
    expect(result).toEqual({
      title: 'Front Matter Wins',
      source: 'frontmatter',
    })
  })

  it('falls back to the first H1 when no frontmatter title', () => {
    const result = derivePageTitle(
      sources({
        filePath: 'career/me.md',
        raw: '# A Considered Note\n\nBody',
      }),
    )
    expect(result).toEqual({ title: 'A Considered Note', source: 'body-h1' })
  })

  it('falls back to a cleaned filename when no H1 or title', () => {
    const result = derivePageTitle(
      sources({
        filePath: 'career/career-map.md',
        raw: 'No headings here, just prose.',
      }),
    )
    expect(result).toEqual({ title: 'Career Map', source: 'filename' })
  })

  it('preserves CJK in derived titles from each source', () => {
    expect(
      derivePageTitle(sources({ filePath: 'a.md', raw: '# 知识地图\n\nbody' }))
        .title,
    ).toBe('知识地图')
    expect(
      derivePageTitle(sources({ filePath: 'knowledge/中文.md', raw: '' }))
        .title,
    ).toBe('中文')
  })

  it('does not pick H1-shaped content inside fenced code as the title', () => {
    const result = derivePageTitle(
      sources({
        filePath: 'demo.md',
        raw: '```bash\n# not a title\n```\n\n# Real Title',
      }),
    )
    expect(result).toEqual({ title: 'Real Title', source: 'body-h1' })
  })
})
