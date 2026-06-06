/**
 * Seam for a future "generate review cards from my highlights" flow.
 *
 * First cut defines the SIGNATURE only — the body is a thin stub. When the
 * review pipeline grows a highlights entry point it can consume this without
 * a breaking change: collapse each highlight's quote (and optional note)
 * into a compact source string the card generator already understands.
 */

import type { Highlight } from './types'

export interface HighlightReviewSource {
  path: string
  /** Plain-text body distilled from the highlights, ready for the card
   *  generator. One block per highlight: the quote, then the note. */
  text: string
  /** Number of highlights folded into `text`. */
  count: number
}

/**
 * Collapse a document's highlights into a single review source.
 *
 * Stub: concatenates anchored + orphaned highlights (orphaned still carry a
 * useful quote) into a newline-separated body. The richer shaping — section
 * grouping, note weighting, dedupe — lands when the review side wires this in.
 */
export function highlightsToReviewSource(
  path: string,
  highlights: Highlight[],
): HighlightReviewSource {
  const blocks = highlights.map((hl) =>
    hl.note.trim() === ''
      ? hl.anchor.quote
      : `${hl.anchor.quote}\n— ${hl.note.trim()}`,
  )
  return {
    path,
    text: blocks.join('\n\n'),
    count: highlights.length,
  }
}
