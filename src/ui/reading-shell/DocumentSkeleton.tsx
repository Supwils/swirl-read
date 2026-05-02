/**
 * DocumentSkeleton (RX7) — stable column-width loading placeholder.
 *
 * Replaces the previous plain "Reading…" line during the brief window
 * between path navigation and the rendered document arriving. The
 * skeleton occupies the same horizontal measure as the article column
 * (driven by `--reader-content-width`) so there is zero layout jump
 * when content takes over.
 *
 * Visual design: a few horizontal blocks at decreasing widths that
 * mimic an h1 title + a couple of paragraphs. No animated shimmer —
 * the project's design philosophy values calm over visual activity,
 * and a soft static placeholder reads as "loading, please wait" without
 * adding motion noise.
 *
 * Accessibility: the wrapper carries `role="status"` + `aria-busy` so
 * assistive tech announces the loading state. Visible text is sr-only
 * so sighted users get the visual rhythm without redundant copy.
 */

import { type ReactNode } from 'react'

const PARAGRAPH_LINE_WIDTHS = [
  '95%',
  '88%',
  '92%',
  '70%',
  '94%',
  '86%',
  '60%',
] as const

export function DocumentSkeleton(): ReactNode {
  return (
    <div
      className="swilread-doc-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading document"
    >
      <div className="swilread-doc-skeleton__title" />
      <div className="swilread-doc-skeleton__subtitle" />
      <div className="swilread-doc-skeleton__paragraph">
        {PARAGRAPH_LINE_WIDTHS.map((width, idx) => (
          <div
            key={`${String(idx)}-${width}`}
            className="swilread-doc-skeleton__line"
            style={{ width }}
          />
        ))}
      </div>
      <span className="sr-only">Reading…</span>
    </div>
  )
}
