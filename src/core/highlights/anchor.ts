/**
 * Anchoring — W3C-style quote anchoring over the rendered plain text of a
 * `.swirlread-prose` root.
 *
 * Why over the rendered plain text and not the Markdown source: the user
 * selects rendered text, and the source-to-render transform is lossy and
 * non-monotonic (a `==mark==` becomes `<mark>`, a wikilink becomes an
 * `<a>`, an embed expands a whole other file inline). A character offset
 * into the source has no stable meaning in the rendered DOM. By anchoring
 * over exactly what the user selected — plus a window of surrounding
 * context — an edit elsewhere in the document (e.g. a paragraph inserted
 * above) shifts offsets but leaves the quote + context intact, so the
 * highlight re-resolves correctly rather than landing on stale bytes.
 *
 * The plain-text + offset map is built with a single TreeWalker that SKIPS
 * `pre`, `code`, KaTeX (`.katex`), and Mermaid (`.swirlread-mermaid`, `svg`)
 * subtrees, so anchors can never land inside tokenized code/math where the
 * DOM structure is an implementation detail of the renderer.
 *
 * This module is PURE (DOM-reading only, no store / no React) and is the
 * most heavily unit-tested part of the feature.
 */

import type { Anchor } from './types'

/** Max chars of plain-text context captured on each side of the quote. */
export const CONTEXT_LENGTH = 32

interface TextSegment {
  node: Text
  /** Inclusive plain-text offset where this node's text begins. */
  start: number
  /** Exclusive plain-text offset where this node's text ends. */
  end: number
}

/**
 * The flattened plain text of a prose root plus the segment map needed to
 * translate a plain-text offset back into a concrete `{ node, nodeOffset }`.
 * Built once per resolution pass; cheap (a single TreeWalker traversal).
 */
export interface PlainTextMap {
  text: string
  segments: TextSegment[]
}

export const SKIP_SELECTOR = 'pre, code, .katex, .swirlread-mermaid, svg'

/** True when `el` is (or lives inside) a subtree we never anchor into. */
function isSkippedElement(el: Element): boolean {
  return el.matches(SKIP_SELECTOR)
}

/**
 * Walk `root` and produce its rendered plain text together with the
 * offset→text-node segment map. Text inside skipped subtrees (code, math,
 * mermaid) is excluded entirely, so its characters do not appear in the
 * plain text and can never be selected by an offset.
 */
export function buildPlainTextMap(root: HTMLElement): PlainTextMap {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node: Node): number {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Reject the whole subtree of a skipped element so its text
          // nodes are never visited. FILTER_REJECT prunes descendants;
          // FILTER_SKIP would still descend.
          return isSkippedElement(node as Element)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP
        }
        // Text node — keep it (even whitespace; offsets must be exact).
        return NodeFilter.FILTER_ACCEPT
      },
    },
  )

  const segments: TextSegment[] = []
  let text = ''
  let current = walker.nextNode()
  while (current) {
    const textNode = current as Text
    const value = textNode.data
    if (value.length > 0) {
      segments.push({
        node: textNode,
        start: text.length,
        end: text.length + value.length,
      })
      text += value
    }
    current = walker.nextNode()
  }

  return { text, segments }
}

/**
 * Locate the text node + intra-node offset for a plain-text offset. Returns
 * `null` when the offset is out of range or falls in a gap (which cannot
 * happen for offsets produced from this same map, but we stay defensive).
 *
 * For an offset that sits exactly on a segment boundary we prefer the
 * segment that STARTS there (so a range end lands at the head of the next
 * node rather than the tail of the previous one); this keeps `surroundable`
 * single-node ranges intact.
 */
function locateOffset(
  map: PlainTextMap,
  offset: number,
  preferStart: boolean,
): { node: Text; nodeOffset: number } | null {
  for (const seg of map.segments) {
    if (preferStart) {
      if (offset >= seg.start && offset < seg.end) {
        return { node: seg.node, nodeOffset: offset - seg.start }
      }
    } else if (offset > seg.start && offset <= seg.end) {
      return { node: seg.node, nodeOffset: offset - seg.start }
    }
  }
  // Boundary fallbacks: offset 0 → head of first segment; offset === length
  // → tail of last segment.
  const first = map.segments[0]
  const last = map.segments[map.segments.length - 1]
  if (preferStart && offset === first?.start) {
    return { node: first.node, nodeOffset: 0 }
  }
  if (!preferStart && offset === last?.end) {
    return { node: last.node, nodeOffset: last.node.data.length }
  }
  return null
}

/**
 * Capture an anchor from a live selection Range confined to `root`.
 * Returns `null` for a collapsed/empty selection or one that falls
 * entirely inside a skipped subtree (so the quote would be empty).
 */
export function captureAnchor(range: Range, root: HTMLElement): Anchor | null {
  const map = buildPlainTextMap(root)
  const start = offsetOfPoint(map, range.startContainer, range.startOffset)
  const end = offsetOfPoint(map, range.endContainer, range.endOffset)
  if (start === null || end === null) return null
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  const quote = map.text.slice(lo, hi)
  if (quote.trim() === '') return null

  const prefix = map.text.slice(Math.max(0, lo - CONTEXT_LENGTH), lo)
  const suffix = map.text.slice(
    hi,
    Math.min(map.text.length, hi + CONTEXT_LENGTH),
  )

  return {
    quote,
    prefix,
    suffix,
    startHint: lo,
    endHint: hi,
  }
}

/**
 * Translate a DOM point `{ container, offset }` into a plain-text offset
 * within `map`. Handles both text-node containers (the common case) and
 * element containers (selection endpoints can land on an element when the
 * boundary sits between children). Returns `null` when the point lies in a
 * skipped subtree.
 */
function offsetOfPoint(
  map: PlainTextMap,
  container: Node,
  offset: number,
): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const seg = map.segments.find((s) => s.node === container)
    if (!seg) return null
    return seg.start + Math.min(offset, (container as Text).data.length)
  }
  // Element container: `offset` indexes its child nodes. Resolve to the
  // plain-text position at the start of child[offset], or the end of the
  // element's text if offset is past the last child.
  const el = container as Element
  const child = el.childNodes[offset] ?? null
  if (child) {
    const seg = firstSegmentInside(map, child)
    if (seg) return seg.start
  }
  // Past the last child — use the end of the last segment inside the element.
  const last = lastSegmentInside(map, el)
  return last ? last.end : null
}

function firstSegmentInside(map: PlainTextMap, node: Node): TextSegment | null {
  for (const seg of map.segments) {
    if (node === seg.node || node.contains(seg.node)) return seg
  }
  return null
}

function lastSegmentInside(map: PlainTextMap, node: Node): TextSegment | null {
  let found: TextSegment | null = null
  for (const seg of map.segments) {
    if (node === seg.node || node.contains(seg.node)) found = seg
  }
  return found
}

/** All start offsets where `quote` occurs in `text`. */
function findOccurrences(text: string, quote: string): number[] {
  if (quote === '') return []
  const out: number[] = []
  let from = 0
  for (;;) {
    const idx = text.indexOf(quote, from)
    if (idx === -1) break
    out.push(idx)
    from = idx + 1
  }
  return out
}

/**
 * Resolve an anchor against the current rendered text of `root`, returning
 * a live Range or `null` (orphaned).
 *
 * Resolution order (no fuzzy/Levenshtein in the first cut — orphan instead):
 *   (a) exact quote occurrences filtered to those whose surrounding text
 *       matches the stored prefix/suffix; if several survive, pick the one
 *       whose start offset is nearest `startHint`.
 *   (b) if no occurrence matches prefix/suffix, fall back to exact-quote
 *       occurrences and pick the one nearest `startHint` (approximate).
 *   (c) no occurrence at all → `null` (caller marks the highlight orphaned).
 */
export function resolveAnchor(anchor: Anchor, root: HTMLElement): Range | null {
  return resolveAnchorInMap(anchor, buildPlainTextMap(root))
}

/**
 * Resolve against an ALREADY-BUILT {@link PlainTextMap}. `decorate` builds the
 * map once per pass and resolves every highlight against it (the rendered text
 * is identical before/after wrapping — wrapping only inserts `<span>`s around
 * existing text — so one map is valid for all reads), avoiding an O(H·N)
 * rebuild per highlight.
 */
export function resolveAnchorInMap(
  anchor: Anchor,
  map: PlainTextMap,
): Range | null {
  const occurrences = findOccurrences(map.text, anchor.quote)
  if (occurrences.length === 0) {
    // No exact match — the quote was lightly edited. Try a CONSERVATIVE fuzzy
    // pass near the hint before giving up; if it can't find a high-confidence
    // region, orphan (never paint a wrong span).
    const fuzzy = fuzzyResolve(map.text, anchor)
    if (!fuzzy) return null
    const range = rangeForOffsets(map, fuzzy.start, fuzzy.end)
    // Reject a window that bridges a skipped subtree (code/math): `map.text`
    // joins text across those gaps with no separator, so a fuzzy window could
    // straddle one and its DOM range would then WRAP the skipped subtree. Such
    // a range's rendered text runs much longer than the quote — orphan it.
    if (range && range.toString().length > anchor.quote.length * 1.5) {
      return null
    }
    return range
  }

  const contextMatches = occurrences.filter((start) =>
    contextMatchesAt(map.text, start, anchor),
  )
  const candidates = contextMatches.length > 0 ? contextMatches : occurrences
  const chosen = nearest(candidates, anchor.startHint)
  if (chosen === null) return null

  return rangeForOffsets(map, chosen, chosen + anchor.quote.length)
}

// Fuzzy fallback tuning. Deliberately conservative: only quotes long enough to
// be distinctive, a high similarity bar, and a bounded search window near the
// original offset — a wrong highlight is worse than an orphaned one (orphans
// are surfaced in the list and recoverable).
const FUZZY_MIN_QUOTE = 12
const FUZZY_MAX_QUOTE = 400
const FUZZY_THRESHOLD = 0.9
const FUZZY_RADIUS = 600

/**
 * Find the best near-the-hint window whose Dice-coefficient similarity to the
 * quote clears {@link FUZZY_THRESHOLD}. Returns `null` (→ orphan) otherwise.
 */
function fuzzyResolve(
  text: string,
  anchor: Anchor,
): { start: number; end: number } | null {
  const quote = anchor.quote
  if (quote.length < FUZZY_MIN_QUOTE || quote.length > FUZZY_MAX_QUOTE) {
    return null
  }
  const win = quote.length
  const lo = Math.max(0, anchor.startHint - FUZZY_RADIUS)
  const hi = Math.min(text.length, anchor.startHint + FUZZY_RADIUS + win)
  if (hi - lo < win) return null

  const quoteBigrams = bigramCounts(quote)
  let bestStart = -1
  let bestScore = FUZZY_THRESHOLD
  for (let i = lo; i + win <= hi; i++) {
    const score = diceCoefficient(quoteBigrams, text.slice(i, i + win))
    if (score > bestScore + 1e-9) {
      bestScore = score
      bestStart = i
    } else if (
      bestStart >= 0 &&
      Math.abs(score - bestScore) <= 1e-9 &&
      Math.abs(i - anchor.startHint) < Math.abs(bestStart - anchor.startHint)
    ) {
      // Tie on similarity → prefer the window nearest the original offset
      // (mirrors the exact-match path's nearest-hint disambiguation, so a
      // lightly-edited near-duplicate doesn't grab the wrong occurrence).
      bestStart = i
    }
  }
  return bestStart < 0 ? null : { start: bestStart, end: bestStart + win }
}

function bigramCounts(s: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2)
    counts.set(bg, (counts.get(bg) ?? 0) + 1)
  }
  return counts
}

/** Sørensen–Dice coefficient between a precomputed bigram bag and a string. */
function diceCoefficient(aBigrams: Map<string, number>, b: string): number {
  if (b.length < 2) return 0
  const bBigrams = bigramCounts(b)
  let overlap = 0
  let aTotal = 0
  for (const n of aBigrams.values()) aTotal += n
  let bTotal = 0
  for (const [bg, n] of bBigrams) {
    bTotal += n
    const inA = aBigrams.get(bg)
    if (inA !== undefined) overlap += Math.min(inA, n)
  }
  if (aTotal + bTotal === 0) return 0
  return (2 * overlap) / (aTotal + bTotal)
}

/**
 * True when the text immediately before/after `start` matches the anchor's
 * stored prefix/suffix. We compare the OVERLAP — the shorter of the stored
 * context and the available context — so a quote near the document edge
 * (short available prefix) still matches. An empty stored side always
 * matches (nothing to contradict).
 */
function contextMatchesAt(
  text: string,
  start: number,
  anchor: Anchor,
): boolean {
  const end = start + anchor.quote.length
  const beforeAvail = text.slice(
    Math.max(0, start - anchor.prefix.length),
    start,
  )
  const afterAvail = text.slice(end, end + anchor.suffix.length)
  const prefixOk =
    anchor.prefix === '' || endsWithOverlap(beforeAvail, anchor.prefix)
  const suffixOk =
    anchor.suffix === '' || startsWithOverlap(afterAvail, anchor.suffix)
  return prefixOk && suffixOk
}

/** True when `avail` ends with the overlapping tail of `stored`. */
function endsWithOverlap(avail: string, stored: string): boolean {
  const n = Math.min(avail.length, stored.length)
  if (n === 0) return true
  return avail.slice(avail.length - n) === stored.slice(stored.length - n)
}

/** True when `avail` starts with the overlapping head of `stored`. */
function startsWithOverlap(avail: string, stored: string): boolean {
  const n = Math.min(avail.length, stored.length)
  if (n === 0) return true
  return avail.slice(0, n) === stored.slice(0, n)
}

function nearest(candidates: number[], hint: number): number | null {
  if (candidates.length === 0) return null
  let best = candidates[0]!
  let bestDist = Math.abs(best - hint)
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i]!
    const dist = Math.abs(c - hint)
    if (dist < bestDist) {
      best = c
      bestDist = dist
    }
  }
  return best
}

/** Build a live Range spanning plain-text `[start, end)` within `root`. */
function rangeForOffsets(
  map: PlainTextMap,
  start: number,
  end: number,
): Range | null {
  if (map.segments.length === 0) return null
  const startPoint = locateOffset(map, start, true)
  const endPoint = locateOffset(map, end, false)
  if (!startPoint || !endPoint) return null
  const range = map.segments[0]!.node.ownerDocument.createRange()
  range.setStart(startPoint.node, startPoint.nodeOffset)
  range.setEnd(endPoint.node, endPoint.nodeOffset)
  return range
}
