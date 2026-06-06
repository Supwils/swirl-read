import { describe, it, expect } from 'vitest'
import { decorate, unwrapAll, HL_CLASS } from './decorate'
import { buildPlainTextMap, captureAnchor } from './anchor'
import type { Anchor, Highlight, HighlightColor } from './types'

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'swirlread-prose'
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

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

function anchorForQuote(root: HTMLElement, quote: string): Anchor {
  const map = buildPlainTextMap(root)
  const start = map.text.indexOf(quote)
  if (start < 0) throw new Error(`quote not found: ${quote}`)
  return captureAnchor(rangeForText(root, start, start + quote.length), root)!
}

function makeHighlight(
  anchor: Anchor,
  color: HighlightColor = 'yellow',
  id = 'h1',
): Highlight {
  const now = Date.now()
  return {
    id,
    vaultId: 'v',
    path: 'doc.md',
    color,
    note: '',
    anchor,
    status: 'anchored',
    createdAtMs: now,
    updatedAtMs: now,
  }
}

describe('decorate', () => {
  it('wraps the resolved quote in a swirlread-hl span carrying id + color', () => {
    const root = makeRoot('<p>The quick brown fox.</p>')
    const anchor = anchorForQuote(root, 'brown fox')
    const result = decorate(root, [makeHighlight(anchor, 'green')])
    expect(result.anchored.has('h1')).toBe(true)
    const span = root.querySelector<HTMLElement>(`span.${HL_CLASS}`)
    expect(span).not.toBeNull()
    expect(span!.textContent).toBe('brown fox')
    expect(span!.getAttribute('data-hl-id')).toBe('h1')
    expect(span!.getAttribute('data-hl-color')).toBe('green')
    result.cleanup()
  })

  it('round trip: innerHTML is identical before decorate and after cleanup', () => {
    const root = makeRoot(
      '<p>Hello <strong>brave</strong> world, the quick brown fox jumps.</p>' +
        '<p>Another paragraph with brown fox repeated.</p>',
    )
    const before = root.innerHTML
    const a1 = anchorForQuote(root, 'brave')
    const a2 = anchorForQuote(root, 'quick brown fox')
    const result = decorate(root, [
      makeHighlight(a1, 'yellow', 'h1'),
      makeHighlight(a2, 'blue', 'h2'),
    ])
    // It actually painted something.
    expect(root.querySelectorAll(`span.${HL_CLASS}`).length).toBeGreaterThan(0)
    result.cleanup()
    expect(root.innerHTML).toBe(before)
  })

  it('multi-text-node selection wraps each intersected text node with the same id', () => {
    const root = makeRoot('<p>plain <strong>bold</strong> tail end</p>')
    const anchor = anchorForQuote(root, 'plain bold tail')
    const result = decorate(root, [makeHighlight(anchor, 'pink', 'multi')])
    const spans = root.querySelectorAll<HTMLElement>(
      `span.${HL_CLASS}[data-hl-id="multi"]`,
    )
    // Crosses three text nodes: "plain ", "bold", " tail" → at least 2 spans
    // (the bold lives in its own element, so it can't be one span).
    expect(spans.length).toBeGreaterThanOrEqual(2)
    const joined = Array.from(spans)
      .map((s) => s.textContent)
      .join('')
    expect(joined).toBe('plain bold tail')
    result.cleanup()
  })

  it('orphaned highlight is reported and paints nothing, leaving DOM untouched', () => {
    const html = '<p>The quick jumps.</p>'
    const root = makeRoot(html)
    const before = root.innerHTML
    // Anchor a quote that does NOT exist in this root.
    const orphanAnchor: Anchor = {
      quote: 'missing phrase',
      prefix: 'The ',
      suffix: ' jumps',
      startHint: 4,
      endHint: 18,
    }
    const result = decorate(root, [makeHighlight(orphanAnchor, 'yellow', 'o1')])
    expect(result.orphaned.has('o1')).toBe(true)
    expect(result.anchored.size).toBe(0)
    expect(root.querySelectorAll(`span.${HL_CLASS}`).length).toBe(0)
    expect(root.innerHTML).toBe(before)
    result.cleanup()
  })

  it('mixed set: anchored + orphaned partition correctly', () => {
    const root = makeRoot('<p>alpha beta gamma.</p>')
    const good = anchorForQuote(root, 'beta')
    const bad: Anchor = {
      quote: 'zzz',
      prefix: '',
      suffix: '',
      startHint: 0,
      endHint: 3,
    }
    const result = decorate(root, [
      makeHighlight(good, 'yellow', 'good'),
      makeHighlight(bad, 'blue', 'bad'),
    ])
    expect(result.anchored.has('good')).toBe(true)
    expect(result.orphaned.has('bad')).toBe(true)
    result.cleanup()
  })

  it('never wraps inside a skipped code/math subtree a highlight spans across', () => {
    // The code text is excluded from the plain text (anchoring skip set), so a
    // quote can bracket an inline <code> — but wrapping must not inject a
    // foreign span into the renderer-owned code subtree.
    const root = makeRoot('<p>alpha <code>SKIP</code> beta</p>')
    const anchor = anchorForQuote(root, 'alpha  beta')
    const result = decorate(root, [makeHighlight(anchor, 'yellow', 'span1')])
    expect(result.anchored.has('span1')).toBe(true)
    expect(root.querySelector(`code span.${HL_CLASS}`)).toBeNull()
    expect(root.querySelector('code')!.textContent).toBe('SKIP')
    result.cleanup()
    expect(root.querySelector('code')!.textContent).toBe('SKIP')
  })

  it('handles two overlapping highlights resolved against one pre-wrap map', () => {
    // Guards the "build the map once, resolve all, then wrap" path: the second
    // highlight's live Range must survive the first highlight's text-node split.
    const root = makeRoot('<p>the quick brown fox jumps</p>')
    const before = root.innerHTML
    const a1 = anchorForQuote(root, 'quick brown')
    const a2 = anchorForQuote(root, 'brown fox') // overlaps on "brown"
    const result = decorate(root, [
      makeHighlight(a1, 'yellow', 'h1'),
      makeHighlight(a2, 'blue', 'h2'),
    ])
    expect(result.anchored.has('h1')).toBe(true)
    expect(result.anchored.has('h2')).toBe(true)
    expect(
      root.querySelectorAll(`span.${HL_CLASS}[data-hl-id="h1"]`).length,
    ).toBeGreaterThan(0)
    expect(
      root.querySelectorAll(`span.${HL_CLASS}[data-hl-id="h2"]`).length,
    ).toBeGreaterThan(0)
    // Text content is intact despite the nested wrapping.
    expect(root.textContent).toBe('the quick brown fox jumps')
    result.cleanup()
    expect(root.innerHTML).toBe(before)
  })

  it('unwrapAll is idempotent and a no-op when there is nothing to unwrap', () => {
    const root = makeRoot('<p>nothing to do here</p>')
    const before = root.innerHTML
    unwrapAll(root)
    unwrapAll(root)
    expect(root.innerHTML).toBe(before)
  })

  it('two passes (unwrap-then-decorate) are stable — repeated decoration does not duplicate', () => {
    const html = '<p>repeat the word fox and fox again.</p>'
    const root = makeRoot(html)
    const anchor = anchorForQuote(root, 'word fox')

    // Pass 1
    let result = decorate(root, [makeHighlight(anchor, 'yellow', 'h1')])
    const afterFirst = root.querySelectorAll(`span.${HL_CLASS}`).length
    result.cleanup()

    // Discipline: unwrap then re-decorate (mirrors the layout effect).
    unwrapAll(root)
    result = decorate(root, [makeHighlight(anchor, 'yellow', 'h1')])
    const afterSecond = root.querySelectorAll(`span.${HL_CLASS}`).length
    expect(afterSecond).toBe(afterFirst)
    result.cleanup()
    expect(root.innerHTML).toBe(html)
  })
})
