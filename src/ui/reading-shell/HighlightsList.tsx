/**
 * HighlightsList — calm document-bottom section listing this document's
 * highlights (sibling to BacklinksPanel). Each row shows a colour chip, the
 * quote snippet, and the optional note; clicking an anchored row scrolls to
 * its inline mark. Orphaned highlights (quote no longer found in the
 * rendered text) are surfaced in a distinct group so they're never lost —
 * and remain deletable.
 *
 * Hides itself entirely when there are no highlights, so a clean document
 * keeps a clean ending.
 */

import { type ReactNode } from 'react'
import { Highlighter, Trash2, Unlink } from 'lucide-react'
import type { Highlight } from '@/core/highlights/types'

interface HighlightsListProps {
  highlights: Highlight[]
  /** ids the last decorate pass could not resolve. */
  orphanedIds: Set<string>
  onScrollTo: (id: string) => void
  onRemove: (id: string) => void
}

const SNIPPET_MAX = 140

export function HighlightsList({
  highlights,
  orphanedIds,
  onScrollTo,
  onRemove,
}: HighlightsListProps): ReactNode {
  if (highlights.length === 0) return null

  const anchored = highlights.filter((h) => !orphanedIds.has(h.id))
  const orphaned = highlights.filter((h) => orphanedIds.has(h.id))

  return (
    <section
      className="swirlread-highlights"
      aria-labelledby="highlights-title"
    >
      <h2 id="highlights-title" className="swirlread-highlights__title">
        <Highlighter size={16} aria-hidden="true" />
        Highlights
        <span className="swirlread-highlights__count">{highlights.length}</span>
      </h2>

      {anchored.length > 0 && (
        <ul className="swirlread-highlights__list">
          {anchored.map((hl) => (
            <HighlightRow
              key={hl.id}
              highlight={hl}
              orphaned={false}
              onScrollTo={onScrollTo}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {orphaned.length > 0 && (
        <div className="swirlread-highlights__orphans">
          <p className="swirlread-highlights__orphan-note">
            <Unlink size={13} aria-hidden="true" />
            These highlights no longer match the document text. They&apos;re
            kept here so you can review or remove them.
          </p>
          <ul className="swirlread-highlights__list">
            {orphaned.map((hl) => (
              <HighlightRow
                key={hl.id}
                highlight={hl}
                orphaned
                onScrollTo={onScrollTo}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function HighlightRow({
  highlight,
  orphaned,
  onScrollTo,
  onRemove,
}: {
  highlight: Highlight
  orphaned: boolean
  onScrollTo: (id: string) => void
  onRemove: (id: string) => void
}): ReactNode {
  const snippet = truncate(highlight.anchor.quote, SNIPPET_MAX)
  return (
    <li
      className={
        'swirlread-highlights__item' +
        (orphaned ? ' swirlread-highlights__item--orphaned' : '')
      }
    >
      <button
        type="button"
        className="swirlread-highlights__hit"
        onClick={() => {
          if (!orphaned) onScrollTo(highlight.id)
        }}
        disabled={orphaned}
        title={orphaned ? 'Orphaned — cannot scroll' : 'Scroll to highlight'}
      >
        <span
          className="swirlread-highlights__chip"
          data-hl-color={highlight.color}
          aria-hidden="true"
        />
        <span className="swirlread-highlights__quote">{snippet}</span>
      </button>
      {highlight.note.trim() !== '' && (
        <p className="swirlread-highlights__row-note">{highlight.note}</p>
      )}
      <button
        type="button"
        className="swirlread-highlights__delete"
        aria-label="Remove highlight"
        onClick={() => {
          onRemove(highlight.id)
        }}
      >
        <Trash2 size={13} aria-hidden="true" />
      </button>
    </li>
  )
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).trimEnd() + '…'
}
