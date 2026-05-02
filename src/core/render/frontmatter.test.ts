import { describe, it, expect } from 'vitest'
import {
  extractFrontmatter,
  selectMetadata,
  formatFrontmatterValue,
} from './frontmatter'

describe('extractFrontmatter — YAML', () => {
  it('returns empty + body when there is no frontmatter', () => {
    const fm = extractFrontmatter('# Hello\n\nBody.')
    expect(fm.present).toBe(false)
    expect(fm.format).toBeNull()
    expect(fm.data).toEqual({})
    expect(fm.body).toBe('# Hello\n\nBody.')
  })

  it('parses simple key/value pairs', () => {
    const fm = extractFrontmatter(
      `---\ntitle: My Note\nauthor: Wilson\n---\n# Body\n`,
    )
    expect(fm.format).toBe('yaml')
    expect(fm.data).toEqual({ title: 'My Note', author: 'Wilson' })
    expect(fm.body).toBe('# Body\n')
  })

  it('handles single- and double-quoted strings', () => {
    const fm = extractFrontmatter(
      `---\ntitle: "Hello, World"\nslug: 'hello-world'\n---\n`,
    )
    expect(fm.data.title).toBe('Hello, World')
    expect(fm.data.slug).toBe('hello-world')
  })

  it('parses booleans, null, and numbers', () => {
    const fm = extractFrontmatter(
      `---\ndraft: true\npublic: false\nempty: null\nyear: 2026\nratio: 0.5\n---\n`,
    )
    expect(fm.data.draft).toBe(true)
    expect(fm.data.public).toBe(false)
    expect(fm.data.empty).toBeNull()
    expect(fm.data.year).toBe(2026)
    expect(fm.data.ratio).toBe(0.5)
  })

  it('parses inline arrays', () => {
    const fm = extractFrontmatter(`---\ntags: [react, "ui design", hooks]\n---`)
    expect(fm.data.tags).toEqual(['react', 'ui design', 'hooks'])
  })

  it('parses block arrays with indented dashes', () => {
    const fm = extractFrontmatter(
      `---\ntags:\n  - one\n  - two\n  - "three four"\n---\n`,
    )
    expect(fm.data.tags).toEqual(['one', 'two', 'three four'])
  })

  it('keeps unknown values as plain strings', () => {
    const fm = extractFrontmatter(`---\ndate: 2026-05-01\n---\n`)
    expect(fm.data.date).toBe('2026-05-01')
  })

  it('survives windows-style line endings', () => {
    const fm = extractFrontmatter(`---\r\ntitle: Hi\r\n---\r\n# Body\r\n`)
    expect(fm.format).toBe('yaml')
    expect(fm.data.title).toBe('Hi')
    expect(fm.body).toBe('# Body\r\n')
  })

  it('strips trailing # comments on unquoted scalars', () => {
    const fm = extractFrontmatter(`---\ntitle: Hello # the greeting\n---`)
    expect(fm.data.title).toBe('Hello')
  })

  it('preserves # inside quoted scalars', () => {
    const fm = extractFrontmatter(`---\ntag: "#nested/path"\n---`)
    expect(fm.data.tag).toBe('#nested/path')
  })

  it('skips full-line YAML comments', () => {
    const fm = extractFrontmatter(
      `---\n# top comment\ntitle: Hi\n# trailing\n---`,
    )
    expect(fm.data).toEqual({ title: 'Hi' })
  })
})

describe('extractFrontmatter — TOML', () => {
  it('parses top-level TOML key = value', () => {
    const fm = extractFrontmatter(
      `+++\ntitle = "My Note"\nauthor = "Wilson"\n+++\n# Body\n`,
    )
    expect(fm.format).toBe('toml')
    expect(fm.data).toEqual({ title: 'My Note', author: 'Wilson' })
    expect(fm.body).toBe('# Body\n')
  })

  it('parses TOML inline arrays', () => {
    const fm = extractFrontmatter(`+++\ntags = ["a", "b"]\n+++`)
    expect(fm.data.tags).toEqual(['a', 'b'])
  })

  it('ignores keys inside [section] tables (flat-only)', () => {
    const fm = extractFrontmatter(
      `+++\ntitle = "Top"\n[section]\nignored = "yes"\n+++`,
    )
    expect(fm.data).toEqual({ title: 'Top' })
  })
})

describe('extractFrontmatter — edge cases', () => {
  it('handles a frontmatter-only document', () => {
    const fm = extractFrontmatter(`---\ntitle: Empty\n---\n`)
    expect(fm.body).toBe('')
  })

  it('returns empty for malformed delimiters', () => {
    const fm = extractFrontmatter(`---\ntitle: nope`)
    expect(fm.present).toBe(false)
  })

  it('does not treat mid-document --- as frontmatter', () => {
    const source = `# Hello\n\n---\n\nBody`
    const fm = extractFrontmatter(source)
    expect(fm.present).toBe(false)
    expect(fm.body).toBe(source)
  })
})

describe('selectMetadata', () => {
  it('selects standard fields and bucket the rest into extras', () => {
    const meta = selectMetadata({
      title: 'A Note',
      description: 'A summary',
      date: '2026-05-01',
      author: 'Wilson',
      tags: ['react', 'ui'],
      aliases: ['rxnotes'],
      custom: 'value',
    })
    expect(meta.title).toBe('A Note')
    expect(meta.description).toBe('A summary')
    expect(meta.date).toBe('2026-05-01')
    expect(meta.author).toBe('Wilson')
    expect(meta.tags).toEqual(['react', 'ui'])
    expect(meta.aliases).toEqual(['rxnotes'])
    expect(meta.extras).toEqual({ custom: 'value' })
  })

  it('joins multi-author arrays with commas', () => {
    const meta = selectMetadata({ authors: ['Ada', 'Grace'] })
    expect(meta.author).toBe('Ada, Grace')
  })

  it('splits tag strings on whitespace and commas', () => {
    const meta = selectMetadata({ tags: 'react, ui hooks' })
    expect(meta.tags).toEqual(['react', 'ui', 'hooks'])
  })

  it('falls back through synonyms (name → title)', () => {
    const meta = selectMetadata({ name: 'Fallback' })
    expect(meta.title).toBe('Fallback')
  })

  it('ignores empty strings and null', () => {
    const meta = selectMetadata({
      title: '',
      description: null,
      date: '   ',
      tags: [],
    })
    expect(meta.title).toBeUndefined()
    expect(meta.description).toBeUndefined()
    expect(meta.date).toBeUndefined()
    expect(meta.tags).toEqual([])
  })
})

describe('formatFrontmatterValue', () => {
  it('prints arrays comma-joined', () => {
    expect(formatFrontmatterValue(['a', 'b', 'c'])).toBe('a, b, c')
  })

  it('prints scalars as strings', () => {
    expect(formatFrontmatterValue('x')).toBe('x')
    expect(formatFrontmatterValue(42)).toBe('42')
    expect(formatFrontmatterValue(true)).toBe('true')
  })

  it('prints null as em dash', () => {
    expect(formatFrontmatterValue(null)).toBe('—')
  })
})
