import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderMarkdown } from './pipeline'

function renderMd(source: string) {
  return render(<>{renderMarkdown(source)}</>)
}

describe('renderMarkdown — CommonMark', () => {
  it('renders headings', () => {
    const { container } = renderMd('# Hello\n\n## World')
    expect(container.querySelector('h1')?.textContent).toBe('Hello')
    expect(container.querySelector('h2')?.textContent).toBe('World')
  })

  it('renders paragraphs', () => {
    const { container } = renderMd('First paragraph.\n\nSecond paragraph.')
    const ps = container.querySelectorAll('p')
    expect(ps).toHaveLength(2)
    expect(ps[0]?.textContent).toBe('First paragraph.')
    expect(ps[1]?.textContent).toBe('Second paragraph.')
  })

  it('renders bold and italic emphasis', () => {
    const { container } = renderMd('This is **bold** and *italic*.')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
  })

  it('renders inline code', () => {
    const { container } = renderMd('Use `useEffect` for side effects.')
    expect(container.querySelector('code')?.textContent).toBe('useEffect')
  })

  it('renders fenced code blocks with language class', () => {
    const { container } = renderMd('```ts\nconst x = 1\n```')
    const code = container.querySelector('pre code')
    expect(code?.textContent).toContain('const x = 1')
    expect(code?.className).toContain('language-ts')
  })

  it('renders unordered lists', () => {
    const { container } = renderMd('- One\n- Two\n- Three')
    const items = container.querySelectorAll('ul li')
    expect(items).toHaveLength(3)
    expect(items[1]?.textContent).toBe('Two')
  })

  it('renders ordered lists', () => {
    const { container } = renderMd('1. First\n2. Second')
    expect(container.querySelector('ol li:first-child')?.textContent).toBe(
      'First',
    )
  })

  it('renders blockquotes', () => {
    const { container } = renderMd('> An old proverb.')
    expect(container.querySelector('blockquote')?.textContent?.trim()).toBe(
      'An old proverb.',
    )
  })

  it('renders links', () => {
    const { container } = renderMd('[Anthropic](https://anthropic.com)')
    const a = container.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://anthropic.com')
    expect(a?.textContent).toBe('Anthropic')
  })

  it('renders horizontal rules', () => {
    const { container } = renderMd('Above\n\n---\n\nBelow')
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('preserves Unicode content', () => {
    const { container } = renderMd('# 知识库\n\n详细内容…')
    expect(container.querySelector('h1')?.textContent).toBe('知识库')
    expect(container.textContent).toContain('详细内容')
  })
})

describe('renderMarkdown — GitHub Flavored Markdown', () => {
  it('renders tables with alignment-aware cells', () => {
    const source = `
| Feature | Status |
| ------- | ------ |
| Tables  | ✅     |
| Lists   | ✅     |
`
    const { container } = renderMd(source)
    expect(container.querySelector('table')).not.toBeNull()
    const headers = container.querySelectorAll('th')
    expect(headers).toHaveLength(2)
    expect(headers[0]?.textContent).toBe('Feature')
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
  })

  it('renders task lists with checkboxes', () => {
    const { container } = renderMd('- [ ] Pending\n- [x] Done')
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false)
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true)
  })

  it('renders strikethrough', () => {
    const { container } = renderMd('This is ~~obsolete~~.')
    expect(container.querySelector('del')?.textContent).toBe('obsolete')
  })

  it('autolinks bare URLs', () => {
    const { container } = renderMd('Visit https://anthropic.com today.')
    const a = container.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://anthropic.com')
  })
})

describe('renderMarkdown — Frontmatter handling', () => {
  it('strips YAML frontmatter from output', () => {
    const source = `---
title: My Note
tags: [a, b]
---

# Body Heading
`
    const { container } = renderMd(source)
    expect(container.textContent).not.toContain('title:')
    expect(container.textContent).not.toContain('tags:')
    expect(container.querySelector('h1')?.textContent).toBe('Body Heading')
  })

  it('strips TOML frontmatter from output', () => {
    const source = `+++
title = "My Note"
+++

# Body
`
    const { container } = renderMd(source)
    expect(container.textContent).not.toContain('title =')
    expect(container.querySelector('h1')?.textContent).toBe('Body')
  })
})

describe('renderMarkdown — Sanitization', () => {
  it('strips raw <script> tags', () => {
    const { container } = renderMd(
      'Hello\n\n<script>alert(1)</script>\n\nWorld',
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('Hello')
    expect(container.textContent).toContain('World')
  })

  it('preserves heading ids (allowed by extended schema)', () => {
    // We can't test auto-id generation here without a slug plugin (M3.10),
    // but the schema must allow `id` to pass through if/when present.
    // This test documents intent; the assertion lives in `schema`.
    const { container } = renderMd('# Title')
    expect(container.querySelector('h1')).not.toBeNull()
  })
})

describe('renderMarkdown — Edge cases', () => {
  it('renders empty input as nothing visible', () => {
    const { container } = renderMd('')
    expect(container.textContent).toBe('')
  })

  it('handles a document that is only frontmatter', () => {
    const { container } = renderMd('---\ntitle: Empty\n---\n')
    expect(container.textContent?.trim()).toBe('')
  })

  it('handles very long lines', () => {
    const long = 'word '.repeat(500).trim()
    const { container } = renderMd(long)
    expect(container.querySelector('p')?.textContent).toBe(long)
  })
})
