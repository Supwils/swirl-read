/**
 * Decorate — wrap resolved highlight ranges in `<span class="swirlread-hl">`
 * elements and provide an exact inverse (unwrap) so the DOM can be restored
 * byte-for-byte to what React believes it owns.
 *
 * THE REACT-DOM-SAFETY CONTRACT (critical):
 *
 * The prose subtree is React-rendered (`{state.content}` in
 * DocumentBodyView). React assumes it exclusively owns those nodes. If we
 * leave foreign `<span>` wrappers in place when React tries to replace the
 * content (new document, re-render), React's reconciler will attempt to
 * `removeChild` a node whose parent no longer matches its expectation and
 * throw. So:
 *
 *   1. `decorate()` returns a cleanup function that FULLY unwraps every
 *      `.swirlread-hl` span it (or anyone) created and `normalize()`s the
 *      touched parents so adjacent text nodes re-merge — leaving the DOM
 *      structurally identical to the pre-decorate state.
 *   2. The caller (a `useLayoutEffect`) runs an unwrap-everything pass
 *      FIRST, then re-applies the full current set fresh (idempotent,
 *      full-set, not incremental), and returns the cleanup so React never
 *      sees a wrapper when it replaces the content.
 *
 * A round-trip test asserts `root.innerHTML` is identical before decorate
 * and after cleanup.
 *
 * Multi-block selections: `Range.surroundContents` throws when the range
 * crosses element boundaries, so we split the range per intersected text
 * node and wrap each piece in its own span sharing the same `data-hl-id`.
 */

import type { Highlight, HighlightColor } from './types'
import { buildPlainTextMap, resolveAnchorInMap, SKIP_SELECTOR } from './anchor'

export const HL_CLASS = 'swirlread-hl'
export const HL_ID_ATTR = 'data-hl-id'
export const HL_COLOR_ATTR = 'data-hl-color'

/** A highlight paired with its resolution outcome for one decorate pass. */
export interface DecorateResult {
  /** Cleanup — fully unwrap everything this pass created. Idempotent. */
  cleanup: () => void
  /** ids that resolved to a live range and were painted. */
  anchored: Set<string>
  /** ids that failed to resolve (orphaned). */
  orphaned: Set<string>
}

/**
 * Remove EVERY `.swirlread-hl` span inside `root`, replacing each with its
 * own text content and re-merging split text nodes via `normalize()`. Safe
 * to call when there are none (no-op). This is the single source of truth
 * for "restore the DOM to React's view".
 */
export function unwrapAll(root: HTMLElement): void {
  const spans = Array.from(
    root.querySelectorAll<HTMLElement>(`span.${HL_CLASS}`),
  )
  const touchedParents = new Set<Node>()
  for (const span of spans) {
    const parent = span.parentNode
    if (!parent) continue
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span)
    }
    parent.removeChild(span)
    touchedParents.add(parent)
  }
  for (const parent of touchedParents) {
    parent.normalize()
  }
}

/**
 * Apply the full highlight set to `root` and return the cleanup + the
 * anchored/orphaned partition.
 *
 * Caller discipline: run `unwrapAll(root)` immediately before calling this
 * so the starting DOM matches React's view, then call `decorate`. The
 * returned `cleanup` is the same `unwrapAll(root)` under the hood — keep it
 * and run it on effect teardown.
 */
export function decorate(
  root: HTMLElement,
  highlights: Highlight[],
): DecorateResult {
  const anchored = new Set<string>()
  const orphaned = new Set<string>()

  // Build the plain-text map ONCE and resolve every highlight against it
  // (read-only) before any wrapping — wrapping only inserts <span>s around
  // existing text, so the rendered text (and thus the map) is unchanged, and
  // the live Ranges adjust automatically as later wraps split text nodes.
  const map = buildPlainTextMap(root)
  const resolved: { hl: Highlight; range: Range }[] = []
  for (const hl of highlights) {
    const range = resolveAnchorInMap(hl.anchor, map)
    if (range) resolved.push({ hl, range })
    else orphaned.add(hl.id)
  }

  for (const { hl, range } of resolved) {
    if (wrapRange(root, range, hl.id, hl.color)) anchored.add(hl.id)
    else orphaned.add(hl.id)
  }

  return {
    anchored,
    orphaned,
    cleanup: () => {
      unwrapAll(root)
    },
  }
}

/**
 * Wrap a resolved range in one or more `.swirlread-hl` spans (one per
 * intersected text node, all sharing `id`). Returns true when at least one
 * span was created.
 *
 * We collect the affected text nodes BEFORE mutating, then wrap each — so
 * the live DOM mutation can't perturb the iteration. Because each wrap only
 * splits a single text node and inserts its span in place, offsets within
 * the OTHER pending nodes stay valid.
 */
function wrapRange(
  root: HTMLElement,
  range: Range,
  id: string,
  color: HighlightColor,
): boolean {
  const pieces = collectTextPieces(root, range)
  let any = false
  for (const piece of pieces) {
    if (wrapPiece(piece, id, color)) any = true
  }
  return any
}

interface TextPiece {
  node: Text
  start: number
  end: number
}

/**
 * Enumerate the `{ textNode, start, end }` pieces a range covers. A single
 * TreeWalker over text nodes; for each node we intersect its full span with
 * the range's start/end boundaries.
 */
function collectTextPieces(root: HTMLElement, range: Range): TextPiece[] {
  const pieces: TextPiece[] = []
  // Same skip set as the anchor's plain-text map: never wrap inside
  // code/math/mermaid/svg subtrees (their text is excluded from anchoring, so
  // a quote that brackets an inline code/math span must not inject a foreign
  // <span> into the renderer-owned subtree).
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(n: Node): number {
        if (n.nodeType === Node.ELEMENT_NODE) {
          return (n as Element).matches(SKIP_SELECTOR)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP
        }
        return NodeFilter.FILTER_ACCEPT
      },
    },
  )
  let node = walker.nextNode()
  while (node) {
    const textNode = node as Text
    if (range.intersectsNode(textNode)) {
      const len = textNode.data.length
      let start = 0
      let end = len
      if (textNode === range.startContainer) start = range.startOffset
      if (textNode === range.endContainer) end = range.endOffset
      start = Math.max(0, Math.min(start, len))
      end = Math.max(0, Math.min(end, len))
      if (end > start) {
        pieces.push({ node: textNode, start, end })
      }
    }
    node = walker.nextNode()
  }
  return pieces
}

/** Split `piece.node` to isolate `[start, end)` and wrap it in a span. */
function wrapPiece(
  piece: TextPiece,
  id: string,
  color: HighlightColor,
): boolean {
  const { node, start, end } = piece
  if (end <= start) return false
  const doc = node.ownerDocument
  // Isolate the target slice as its own text node.
  let target = node
  if (start > 0) {
    target = target.splitText(start)
  }
  if (end - start < target.data.length) {
    target.splitText(end - start)
  }
  const span = doc.createElement('span')
  span.className = HL_CLASS
  span.setAttribute(HL_ID_ATTR, id)
  span.setAttribute(HL_COLOR_ATTR, color)
  const parent = target.parentNode
  if (!parent) return false
  parent.insertBefore(span, target)
  span.appendChild(target)
  return true
}
