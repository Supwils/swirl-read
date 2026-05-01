import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderMarkdown } from './pipeline'

async function renderMd(source: string) {
  const tree = await renderMarkdown(source)
  return render(<>{tree}</>)
}

describe('renderMarkdown — CommonMark', () => {
  it('renders headings', async () => {
    const { container } = await renderMd('# Hello\n\n## World')
    expect(container.querySelector('h1')?.textContent).toBe('Hello')
    expect(container.querySelector('h2')?.textContent).toBe('World')
  })

  it('renders paragraphs', async () => {
    const { container } = await renderMd(
      'First paragraph.\n\nSecond paragraph.',
    )
    const ps = container.querySelectorAll('p')
    expect(ps).toHaveLength(2)
    expect(ps[0]?.textContent).toBe('First paragraph.')
    expect(ps[1]?.textContent).toBe('Second paragraph.')
  })

  it('renders bold and italic emphasis', async () => {
    const { container } = await renderMd('This is **bold** and *italic*.')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
  })

  it('renders inline code', async () => {
    const { container } = await renderMd('Use `useEffect` for side effects.')
    expect(container.querySelector('code')?.textContent).toBe('useEffect')
  })

  it('renders fenced code blocks (Shiki-highlighted)', async () => {
    const { container } = await renderMd('```ts\nconst x = 1\n```')
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    // Shiki emits per-token <span> elements styled via CSS variables —
    // identifying signal is `--shiki-light` / `--shiki-dark` in the inline style.
    expect(pre?.getAttribute('style')).toContain('--shiki-light')
    expect(pre?.querySelectorAll('span').length).toBeGreaterThan(1)
    expect(pre?.textContent).toContain('const x = 1')
  })

  it('falls back gracefully for unknown languages', async () => {
    const { container } = await renderMd(
      '```not-a-real-language\nplain text\n```',
    )
    const pre = container.querySelector('pre')
    expect(pre?.textContent).toContain('plain text')
  })

  it('renders unordered lists', async () => {
    const { container } = await renderMd('- One\n- Two\n- Three')
    const items = container.querySelectorAll('ul li')
    expect(items).toHaveLength(3)
    expect(items[1]?.textContent).toBe('Two')
  })

  it('renders ordered lists', async () => {
    const { container } = await renderMd('1. First\n2. Second')
    expect(container.querySelector('ol li:first-child')?.textContent).toBe(
      'First',
    )
  })

  it('renders blockquotes', async () => {
    const { container } = await renderMd('> An old proverb.')
    expect(container.querySelector('blockquote')?.textContent?.trim()).toBe(
      'An old proverb.',
    )
  })

  it('renders links', async () => {
    const { container } = await renderMd('[Anthropic](https://anthropic.com)')
    const a = container.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://anthropic.com')
    expect(a?.textContent).toBe('Anthropic')
  })

  it('renders horizontal rules', async () => {
    const { container } = await renderMd('Above\n\n---\n\nBelow')
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('preserves Unicode content', async () => {
    const { container } = await renderMd('# 知识库\n\n详细内容…')
    expect(container.querySelector('h1')?.textContent).toBe('知识库')
    expect(container.textContent).toContain('详细内容')
  })
})

describe('renderMarkdown — GitHub Flavored Markdown', () => {
  it('renders tables with alignment-aware cells', async () => {
    const source = `
| Feature | Status |
| ------- | ------ |
| Tables  | ✅     |
| Lists   | ✅     |
`
    const { container } = await renderMd(source)
    expect(container.querySelector('table')).not.toBeNull()
    const headers = container.querySelectorAll('th')
    expect(headers).toHaveLength(2)
    expect(headers[0]?.textContent).toBe('Feature')
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
  })

  it('renders task lists with checkboxes', async () => {
    const { container } = await renderMd('- [ ] Pending\n- [x] Done')
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false)
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true)
  })

  it('renders strikethrough', async () => {
    const { container } = await renderMd('This is ~~obsolete~~.')
    expect(container.querySelector('del')?.textContent).toBe('obsolete')
  })

  it('autolinks bare URLs', async () => {
    const { container } = await renderMd('Visit https://anthropic.com today.')
    const a = container.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://anthropic.com')
  })
})

describe('renderMarkdown — Frontmatter handling', () => {
  it('strips YAML frontmatter from output', async () => {
    const source = `---
title: My Note
tags: [a, b]
---

# Body Heading
`
    const { container } = await renderMd(source)
    expect(container.textContent).not.toContain('title:')
    expect(container.textContent).not.toContain('tags:')
    expect(container.querySelector('h1')?.textContent).toBe('Body Heading')
  })

  it('strips TOML frontmatter from output', async () => {
    const source = `+++
title = "My Note"
+++

# Body
`
    const { container } = await renderMd(source)
    expect(container.textContent).not.toContain('title =')
    expect(container.querySelector('h1')?.textContent).toBe('Body')
  })
})

describe('renderMarkdown — Sanitization', () => {
  it('strips raw <script> tags', async () => {
    const { container } = await renderMd(
      'Hello\n\n<script>alert(1)</script>\n\nWorld',
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('Hello')
    expect(container.textContent).toContain('World')
  })

  it('preserves heading ids (allowed by extended schema)', async () => {
    const { container } = await renderMd('# Title')
    expect(container.querySelector('h1')).not.toBeNull()
  })
})

describe('renderMarkdown — Edge cases', () => {
  it('renders empty input as nothing visible', async () => {
    const { container } = await renderMd('')
    expect(container.textContent).toBe('')
  })

  it('handles a document that is only frontmatter', async () => {
    const { container } = await renderMd('---\ntitle: Empty\n---\n')
    expect(container.textContent?.trim()).toBe('')
  })

  it('handles very long lines', async () => {
    const long = 'word '.repeat(500).trim()
    const { container } = await renderMd(long)
    expect(container.querySelector('p')?.textContent).toBe(long)
  })
})
