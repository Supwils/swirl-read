import { describe, it, expect } from 'vitest'
import { previewSnippet } from './preview-snippet'

describe('previewSnippet', () => {
  it('returns the body unchanged when short', () => {
    expect(previewSnippet('Just a sentence.', 200)).toBe('Just a sentence.')
  })

  it('strips YAML frontmatter', () => {
    const source = `---
title: Example
tags: [a, b]
---

The actual content.`
    expect(previewSnippet(source)).toBe('The actual content.')
  })

  it('strips TOML frontmatter', () => {
    const source = `+++
title = "Example"
+++

Body lives here.`
    expect(previewSnippet(source)).toBe('Body lives here.')
  })

  it('strips a leading H1 (treats it as the title)', () => {
    const source = `# Page Title

First paragraph of content.`
    expect(previewSnippet(source)).toBe('First paragraph of content.')
  })

  it('drops fenced code blocks', () => {
    const source = `Intro line.

\`\`\`ts
const x = 1
\`\`\`

After the code.`
    expect(previewSnippet(source)).toBe('Intro line. After the code.')
  })

  it('keeps inline-code text but drops backticks', () => {
    expect(previewSnippet('Use `useEffect` for side effects.')).toBe(
      'Use useEffect for side effects.',
    )
  })

  it('collapses wikilinks to their alias when present', () => {
    expect(previewSnippet('See [[react|React notes]] for details.')).toBe(
      'See React notes for details.',
    )
  })

  it('collapses wikilinks to their target when no alias', () => {
    expect(previewSnippet('See [[react]] for details.')).toBe(
      'See react for details.',
    )
  })

  it('collapses image embeds to their target name', () => {
    expect(previewSnippet('Cover: ![[diagram.png]] yo.')).toBe(
      'Cover: diagram.png yo.',
    )
  })

  it('strips emphasis markers but keeps words', () => {
    expect(previewSnippet('This is **bold** and *italic* and ==hot==.')).toBe(
      'This is bold and italic and hot.',
    )
  })

  it('flattens markdown links to label text', () => {
    expect(previewSnippet('Read [Anthropic](https://anthropic.com).')).toBe(
      'Read Anthropic.',
    )
  })

  it('truncates with ellipsis without splitting words', () => {
    const long = `${'word '.repeat(80).trim()}.`
    const out = previewSnippet(long, 60)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(61)
    // Doesn't end mid-word (no half "wor")
    expect(out).not.toMatch(/wor…$/)
  })

  it('preserves Unicode content', () => {
    const source = `# 标题

中文内容里有 ==重点== 也有 [[链接|别名]]。`
    expect(previewSnippet(source)).toBe('中文内容里有 重点 也有 别名。')
  })

  it('survives an empty document', () => {
    expect(previewSnippet('')).toBe('')
  })

  it('survives a document that is only frontmatter', () => {
    expect(previewSnippet('---\ntitle: Empty\n---\n')).toBe('')
  })
})
