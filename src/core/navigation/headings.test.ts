import { describe, it, expect } from 'vitest'
import { extractHeadings, slugify } from './headings'

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('slugify', () => {
  it('lowercases and dashes ASCII headings', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('collapses runs of punctuation to a single dash', () => {
    expect(slugify('foo --- bar !! baz')).toBe('foo-bar-baz')
  })

  it('preserves Unicode letters (CJK)', () => {
    expect(slugify('中文 标题')).toBe('中文-标题')
  })

  it('falls back to "section" for empty input', () => {
    expect(slugify('')).toBe('section')
    expect(slugify('   ')).toBe('section')
    expect(slugify('!!!')).toBe('section')
  })
})

describe('extractHeadings', () => {
  it('returns headings in document order with levels', () => {
    const root = makeRoot(`
      <h1>Intro</h1>
      <h2>First</h2>
      <h3>Detail</h3>
      <h2>Second</h2>
    `)
    const headings = extractHeadings(root)
    expect(headings.map((h) => `${h.level}:${h.text}`)).toEqual([
      '1:Intro',
      '2:First',
      '3:Detail',
      '2:Second',
    ])
  })

  it('assigns generated ids when missing', () => {
    const root = makeRoot('<h2>Click Handlers</h2>')
    const [h] = extractHeadings(root)
    expect(h?.id).toBe('click-handlers')
    expect(root.querySelector('h2')?.id).toBe('click-handlers')
  })

  it('preserves existing ids on headings', () => {
    const root = makeRoot('<h2 id="custom-anchor">Click Handlers</h2>')
    const [h] = extractHeadings(root)
    expect(h?.id).toBe('custom-anchor')
  })

  it('disambiguates duplicate slugs', () => {
    const root = makeRoot(`
      <h2>Setup</h2>
      <h2>Setup</h2>
      <h2>Setup</h2>
    `)
    const headings = extractHeadings(root)
    expect(headings.map((h) => h.id)).toEqual(['setup', 'setup-2', 'setup-3'])
  })

  it('disambiguates duplicate existing ids', () => {
    const root = makeRoot(`
      <h2 id="topic">A</h2>
      <h2 id="topic">B</h2>
    `)
    const headings = extractHeadings(root)
    expect(headings[0]?.id).toBe('topic')
    expect(headings[1]?.id).not.toBe('topic')
  })

  it('respects the maxLevel option', () => {
    const root = makeRoot(`
      <h1>One</h1>
      <h2>Two</h2>
      <h3>Three</h3>
      <h4>Four</h4>
    `)
    const headings = extractHeadings(root, { maxLevel: 2 })
    expect(headings.map((h) => h.level)).toEqual([1, 2])
  })

  it('normalizes inner whitespace from rich heading content', () => {
    const root = makeRoot('<h2>Click   <em>Handlers</em>\n  Are Cool</h2>')
    const [h] = extractHeadings(root)
    expect(h?.text).toBe('Click Handlers Are Cool')
  })

  it('returns an empty array for documents with no headings', () => {
    const root = makeRoot('<p>Just a paragraph.</p>')
    expect(extractHeadings(root)).toEqual([])
  })
})
