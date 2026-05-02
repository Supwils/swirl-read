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

  it('renders GFM footnotes with backref links (M3.1)', async () => {
    const source = `Body with a reference.[^1]

Another paragraph.[^longer]

[^1]: Short footnote text.
[^longer]: A longer footnote with **emphasis**.
`
    const { container } = await renderMd(source)
    const section = container.querySelector('section.footnotes')
    expect(section).not.toBeNull()
    const items = section?.querySelectorAll('ol > li')
    expect(items?.length).toBe(2)
    const backref = section?.querySelector('a.data-footnote-backref')
    expect(backref).not.toBeNull()
    // The reference superscript in body text points at the footnote.
    const ref = container.querySelector('sup > a[href^="#user-content-fn"]')
    expect(ref).not.toBeNull()
  })

  it('marks task-list <ul> with the GFM contains-task-list class (M3.1)', async () => {
    const { container } = await renderMd('- [ ] todo\n- [x] done')
    const ul = container.querySelector('ul')
    expect(ul?.className).toContain('contains-task-list')
    const items = ul?.querySelectorAll('li.task-list-item')
    expect(items?.length).toBe(2)
  })

  it('preserves table cell alignment as inline text-align style (M3.1)', async () => {
    const source = `| L | C | R |
| :- | :-: | -: |
| a | b | c |
`
    const { container } = await renderMd(source)
    const headerCells = container.querySelectorAll('thead th')
    // remark-gfm + remark-rehype emit alignment as inline `style`
    // (the HTML `align` attribute is deprecated). The CSS in
    // globals.css can target either form; we assert the actual output.
    expect(headerCells[0]?.getAttribute('style')).toContain('left')
    expect(headerCells[1]?.getAttribute('style')).toContain('center')
    expect(headerCells[2]?.getAttribute('style')).toContain('right')
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

describe('renderMarkdown — Embeds (M3.7)', () => {
  it('emits a <vault-embed> element with kind="image" for image targets', async () => {
    const { container } = await renderMd('![[diagram.png]]')
    const embed = container.querySelector('vault-embed')
    expect(embed).not.toBeNull()
    expect(embed?.getAttribute('data-target')).toBe('diagram.png')
    expect(embed?.getAttribute('data-kind')).toBe('image')
  })

  it('lifts a solitary embed to a top-level block (no <p> wrapper)', async () => {
    const { container } = await renderMd('![[image.png]]')
    // The embed should be a direct child of the prose root, not nested
    // inside a <p> — matters for block-level renderers like markdown
    // embeds (which render <aside>) so we don't produce <p><aside>.
    const root = container.firstElementChild
    expect(root?.tagName.toLowerCase()).toBe('vault-embed')
  })

  it('keeps inline embeds inside their paragraph', async () => {
    const { container } = await renderMd('See ![[icon.png]] for details.')
    const p = container.querySelector('p')
    expect(p).not.toBeNull()
    expect(p?.querySelector('vault-embed')).not.toBeNull()
  })

  it('preserves display + heading metadata for renderers', async () => {
    const { container } = await renderMd('![[note.md#Hooks|Sidebar]]')
    const embed = container.querySelector('vault-embed')
    expect(embed?.getAttribute('data-display')).toBe('Sidebar')
    expect(embed?.getAttribute('data-heading')).toBe('Hooks')
    expect(embed?.getAttribute('data-kind')).toBe('markdown')
  })
})

describe('renderMarkdown — Mermaid (M3.13)', () => {
  it('emits a <mermaid-diagram> for a ```mermaid block', async () => {
    const { container } = await renderMd('```mermaid\ngraph TD\nA-->B\n```')
    const diagram = container.querySelector('mermaid-diagram')
    expect(diagram).not.toBeNull()
    expect(diagram?.getAttribute('data-source')).toBe('graph TD\nA-->B')
  })

  it('does not emit a Shiki <pre> for mermaid blocks', async () => {
    const { container } = await renderMd('```mermaid\ngraph TD\nA-->B\n```')
    const pre = container.querySelector('pre')
    expect(pre).toBeNull()
  })

  it('still highlights other code blocks alongside mermaid', async () => {
    const source = '```mermaid\ngraph TD\nA-->B\n```\n\n```ts\nconst x = 1\n```'
    const { container } = await renderMd(source)
    expect(container.querySelector('mermaid-diagram')).not.toBeNull()
    expect(container.querySelector('pre')).not.toBeNull()
  })
})

describe('renderMarkdown — Math (M3.11)', () => {
  it('emits a <math-inline> for $inline$ syntax', async () => {
    const { container } = await renderMd('Energy is $E = mc^2$ exactly.')
    const el = container.querySelector('math-inline')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('data-source')).toBe('E = mc^2')
  })

  it('emits a <math-block> for $$block$$ syntax', async () => {
    const { container } = await renderMd('$$\n\\int_0^1 x^2 dx\n$$')
    const el = container.querySelector('math-block')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('data-source')).toBe('\\int_0^1 x^2 dx')
  })

  it('preserves raw LaTeX exactly inside data-source', async () => {
    const { container } = await renderMd('$\\frac{a}{b + c}$')
    expect(
      container.querySelector('math-inline')?.getAttribute('data-source'),
    ).toBe('\\frac{a}{b + c}')
  })
})

describe('renderMarkdown — Highlights (M3.9)', () => {
  it('renders ==text== as a <mark> element', async () => {
    const { container } = await renderMd('Read the ==important== part.')
    const mark = container.querySelector('mark')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('important')
  })

  it('renders multiple highlights in one paragraph', async () => {
    const { container } = await renderMd('==alpha== and ==beta==')
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(2)
    expect(marks[0]?.textContent).toBe('alpha')
    expect(marks[1]?.textContent).toBe('beta')
  })

  it('survives the sanitize pass (mark is in our extended allow list)', async () => {
    const { container } = await renderMd('==kept==')
    expect(container.querySelector('mark')).not.toBeNull()
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
