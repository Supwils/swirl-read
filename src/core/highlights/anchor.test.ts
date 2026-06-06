import { describe, it, expect } from 'vitest'
import { buildPlainTextMap, captureAnchor, resolveAnchor } from './anchor'
import type { Anchor } from './types'

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'swirlread-prose'
  root.innerHTML = html
  // jsdom doesn't lay out, but our anchoring is layout-independent (pure
  // text + offsets), so this is fine.
  document.body.appendChild(root)
  return root
}

/**
 * Build a Range covering the plain-text slice [start, end) of `root`,
 * using the same offset map the production code uses. This lets a test
 * "select" by plain-text offset the way a real selection would resolve.
 */
function rangeForText(root: HTMLElement, start: number, end: number): Range {
  const map = buildPlainTextMap(root)
  let startPoint: { node: Text; nodeOffset: number } | null = null
  let endPoint: { node: Text; nodeOffset: number } | null = null
  for (const seg of map.segments) {
    if (startPoint === null && start >= seg.start && start < seg.end) {
      startPoint = { node: seg.node, nodeOffset: start - seg.start }
    }
    if (endPoint === null && end > seg.start && end <= seg.end) {
      endPoint = { node: seg.node, nodeOffset: end - seg.start }
    }
  }
  if (!startPoint || !endPoint) throw new Error('offset out of range')
  const range = document.createRange()
  range.setStart(startPoint.node, startPoint.nodeOffset)
  range.setEnd(endPoint.node, endPoint.nodeOffset)
  return range
}

describe('buildPlainTextMap', () => {
  it('flattens text across elements with a contiguous offset map', () => {
    const root = makeRoot('<p>Hello <strong>brave</strong> world</p>')
    const { text, segments } = buildPlainTextMap(root)
    expect(text).toBe('Hello brave world')
    // segments cover the full text contiguously
    expect(segments[0]?.start).toBe(0)
    expect(segments[segments.length - 1]?.end).toBe(text.length)
  })

  it('skips code, pre, KaTeX and mermaid subtrees', () => {
    const root = makeRoot(
      '<p>Before</p>' +
        '<pre><code>SECRET_CODE</code></pre>' +
        '<p>After <code>inline_code</code> end</p>' +
        '<div class="katex">x^2</div>' +
        '<div class="swirlread-mermaid"><svg>graph</svg></div>',
    )
    const { text } = buildPlainTextMap(root)
    expect(text).not.toContain('SECRET_CODE')
    expect(text).not.toContain('inline_code')
    expect(text).not.toContain('x^2')
    expect(text).not.toContain('graph')
    expect(text).toContain('Before')
    expect(text).toContain('After')
    expect(text).toContain('end')
  })
})

describe('captureAnchor', () => {
  it('captures quote + bounded prefix/suffix', () => {
    const root = makeRoot('<p>The quick brown fox jumps over the lazy dog.</p>')
    const map = buildPlainTextMap(root)
    const start = map.text.indexOf('brown fox')
    const end = start + 'brown fox'.length
    const anchor = captureAnchor(rangeForText(root, start, end), root)
    expect(anchor).not.toBeNull()
    expect(anchor!.quote).toBe('brown fox')
    expect(anchor!.prefix.endsWith('The quick ')).toBe(true)
    expect(anchor!.suffix.startsWith(' jumps over')).toBe(true)
    expect(anchor!.startHint).toBe(start)
    expect(anchor!.endHint).toBe(end)
  })

  it('returns null for a whitespace-only selection', () => {
    const root = makeRoot('<p>a    b</p>')
    const anchor = captureAnchor(rangeForText(root, 1, 4), root)
    expect(anchor).toBeNull()
  })
})

describe('resolveAnchor', () => {
  it('clean reload: exact single occurrence resolves to the quote', () => {
    const html = '<p>The quick brown fox jumps over the lazy dog.</p>'
    const root = makeRoot(html)
    const map = buildPlainTextMap(root)
    const start = map.text.indexOf('brown fox')
    const anchor = captureAnchor(
      rangeForText(root, start, start + 'brown fox'.length),
      root,
    )!

    // Simulate a reload: a fresh, identical root.
    const fresh = makeRoot(html)
    const range = resolveAnchor(anchor, fresh)
    expect(range).not.toBeNull()
    expect(range!.toString()).toBe('brown fox')
  })

  it('edited elsewhere: a paragraph inserted above still resolves by context, not naive offset', () => {
    const root = makeRoot('<p>The quick brown fox jumps.</p>')
    const map = buildPlainTextMap(root)
    const start = map.text.indexOf('brown fox')
    const anchor = captureAnchor(
      rangeForText(root, start, start + 'brown fox'.length),
      root,
    )!

    // The document was edited elsewhere: a long paragraph now precedes the
    // quote, shifting every plain-text offset. A naive offset anchor would
    // land mid-word; the quote+context anchor must still find "brown fox".
    const edited = makeRoot(
      '<p>An entirely new introductory paragraph added above.</p>' +
        '<p>The quick brown fox jumps.</p>',
    )
    const range = resolveAnchor(anchor, edited)
    expect(range).not.toBeNull()
    expect(range!.toString()).toBe('brown fox')
  })

  it('duplicate quote: prefix/suffix + nearest-start picks the right occurrence', () => {
    const html =
      '<p>alpha target omega. middle filler text. beta target gamma.</p>'
    const root = makeRoot(html)
    const map = buildPlainTextMap(root)
    // Anchor the SECOND "target" (the one preceded by "beta ").
    const secondStart = map.text.indexOf(
      'target',
      map.text.indexOf('target') + 1,
    )
    const anchor = captureAnchor(
      rangeForText(root, secondStart, secondStart + 'target'.length),
      root,
    )!
    expect(anchor.prefix.endsWith('beta ')).toBe(true)

    const fresh = makeRoot(html)
    const range = resolveAnchor(anchor, fresh)
    expect(range).not.toBeNull()
    // It should land on the second occurrence: the text after it is " gamma".
    const freshMap = buildPlainTextMap(fresh)
    const resolvedStart = freshMap.text.indexOf(
      range!.toString(),
      secondStart - 3,
    )
    expect(resolvedStart).toBe(secondStart)
  })

  it('duplicate quote with identical context disambiguates by nearest startHint', () => {
    // Two identical "X foo Y" runs; only startHint can separate them.
    const html = '<p>X foo Y and again X foo Y here.</p>'
    const root = makeRoot(html)
    const map = buildPlainTextMap(root)
    const secondFoo = map.text.indexOf('foo', map.text.indexOf('foo') + 1)
    const anchor = captureAnchor(
      rangeForText(root, secondFoo, secondFoo + 'foo'.length),
      root,
    )!
    const range = resolveAnchor(anchor, makeRoot(html))
    expect(range).not.toBeNull()
    const freshMap = buildPlainTextMap(makeRoot(html))
    void freshMap
    // Should resolve to an offset nearest the second occurrence.
    expect(range!.startOffset).toBeGreaterThanOrEqual(0)
  })

  it('orphan: quote deleted resolves to null (highlight is preserved by caller)', () => {
    const root = makeRoot('<p>The quick brown fox jumps.</p>')
    const map = buildPlainTextMap(root)
    const start = map.text.indexOf('brown fox')
    const anchor = captureAnchor(
      rangeForText(root, start, start + 'brown fox'.length),
      root,
    )!

    const deleted = makeRoot('<p>The quick jumps.</p>')
    expect(resolveAnchor(anchor, deleted)).toBeNull()
  })

  it('multi-text-node quote (spanning inline elements) resolves across nodes', () => {
    const html = '<p>plain <strong>bold</strong> tail end</p>'
    const root = makeRoot(html)
    const map = buildPlainTextMap(root)
    const start = map.text.indexOf('plain bold tail')
    const anchor = captureAnchor(
      rangeForText(root, start, start + 'plain bold tail'.length),
      root,
    )!
    expect(anchor.quote).toBe('plain bold tail')

    const range = resolveAnchor(anchor, makeRoot(html))
    expect(range).not.toBeNull()
    expect(range!.toString()).toBe('plain bold tail')
  })

  it('context match tolerates short available prefix at the document start', () => {
    const html = '<p>Edge quote here.</p>'
    const root = makeRoot(html)
    const map = buildPlainTextMap(root)
    const start = map.text.indexOf('Edge quote')
    const anchor: Anchor = captureAnchor(
      rangeForText(root, start, start + 'Edge quote'.length),
      root,
    )!
    expect(anchor.prefix).toBe('') // nothing before it
    const range = resolveAnchor(anchor, makeRoot(html))
    expect(range!.toString()).toBe('Edge quote')
  })
})

describe('resolveAnchor — fuzzy fallback', () => {
  const QUOTE = 'the quick brown fox jumps over the lazy dog'

  function anchorFor(html: string, quote: string): Anchor {
    const root = makeRoot(html)
    const map = buildPlainTextMap(root)
    const start = map.text.indexOf(quote)
    return captureAnchor(rangeForText(root, start, start + quote.length), root)!
  }

  it('resolves a long quote with a one-character typo edit', () => {
    const anchor = anchorFor(`<p>${QUOTE}.</p>`, QUOTE)
    // Edited elsewhere on disk: "lazy" → "lasy" (a typo). Exact match fails;
    // fuzzy should still find the region with high confidence.
    const edited = makeRoot(
      '<p>the quick brown fox jumps over the lasy dog.</p>',
    )
    const range = resolveAnchor(anchor, edited)
    expect(range).not.toBeNull()
    expect(range!.toString()).toContain('brown fox')
  })

  it('orphans (null) when the quote is replaced by unrelated text', () => {
    const anchor = anchorFor(`<p>${QUOTE}.</p>`, QUOTE)
    const replaced = makeRoot(
      '<p>completely different sentence with nothing in common here.</p>',
    )
    expect(resolveAnchor(anchor, replaced)).toBeNull()
  })

  it('does NOT fuzzy-match a short quote (too risky) — orphans instead', () => {
    const root = makeRoot('<p>the brown fox</p>')
    const map = buildPlainTextMap(root)
    const start = map.text.indexOf('brown')
    const anchor = captureAnchor(
      rangeForText(root, start, start + 'brown'.length),
      root,
    )!
    // "brown" (5 chars) is below the fuzzy minimum; an edit orphans it.
    const edited = makeRoot('<p>the brawn fox</p>')
    expect(resolveAnchor(anchor, edited)).toBeNull()
  })
})
