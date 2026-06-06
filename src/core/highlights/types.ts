/**
 * Highlights — local-first text highlights & annotations over rendered
 * Markdown. Feature E first cut.
 *
 * Anchoring (see `anchor.ts`) is W3C-style quote anchoring over the
 * RENDERED PLAIN TEXT of `.swirlread-prose` — the exact text the user
 * selects — never the Markdown source. This survives edits made elsewhere
 * in the document (a paragraph inserted above shifts source offsets but
 * the quote + surrounding context still resolves), and stays decoupled
 * from the source-to-render transform entirely.
 */

import type { VaultId, VaultPath } from '@/core/vault'

/** Closed colour union. Stored by NAME; CSS maps each to theme-aware
 *  variables so a highlight reads correctly in light/sepia/dark/oled. */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
] as const

export function isHighlightColor(value: unknown): value is HighlightColor {
  return (
    typeof value === 'string' &&
    (HIGHLIGHT_COLORS as readonly string[]).includes(value)
  )
}

/**
 * Anchor resolution outcome for a stored highlight.
 *   - `anchored` — resolved to a live Range and painted inline.
 *   - `orphaned` — the quote no longer occurs in the rendered text. The
 *      highlight is KEPT (surfaced in the list, deletable) but renders
 *      nothing inline. We never silently delete the user's annotation.
 */
export type HighlightStatus = 'anchored' | 'orphaned'

/**
 * W3C-style quote anchor over the rendered plain text.
 *   - `quote`     — the exact selected plain text.
 *   - `prefix`    — up to 32 chars of plain text immediately before the quote.
 *   - `suffix`    — up to 32 chars of plain text immediately after the quote.
 *   - `startHint` — plain-text start offset at capture time (approximate;
 *                    used only to disambiguate duplicate quotes by nearness).
 *   - `endHint`   — plain-text end offset at capture time (approximate).
 */
export interface Anchor {
  quote: string
  prefix: string
  suffix: string
  startHint: number
  endHint: number
}

export interface Highlight {
  id: string
  vaultId: VaultId
  path: VaultPath
  color: HighlightColor
  /** Optional short reader note. Empty string means "no note". */
  note: string
  anchor: Anchor
  /** Last resolution outcome. Recomputed on each decorate pass. */
  status: HighlightStatus
  createdAtMs: number
  updatedAtMs: number
}
