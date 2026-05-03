/**
 * Frontmatter — renders the parsed frontmatter for a Markdown document.
 *
 * Three display modes (driven by `useUIStore.frontmatterDisplay`):
 *
 *   - `metadata` (default) — a curated rail with description (subtitle)
 *     and a muted line of date · author · tags. Title is intentionally
 *     omitted — RX1 promoted it to the document header so this panel
 *     no longer needs to repeat it.
 *   - `raw`                — every parsed key/value rendered in a definition
 *     list. Useful for power readers who want to inspect structure.
 *   - `hidden`             — render nothing.
 *
 * The component is read-only. It receives the already-parsed
 * {@link Frontmatter} object so the caller (DocumentPage) extracts once and
 * the metadata bar updates synchronously with display preferences.
 */

import { Calendar, Tag, User } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  formatFrontmatterValue,
  selectMetadata,
  type Frontmatter,
} from '@/core/render/frontmatter'
import type { FrontmatterDisplay } from '@/stores/ui-store'

interface FrontmatterPanelProps {
  frontmatter: Frontmatter
  display: FrontmatterDisplay
}

export function FrontmatterPanel({
  frontmatter,
  display,
}: FrontmatterPanelProps): ReactNode {
  if (!frontmatter.present || display === 'hidden') return null

  if (display === 'raw') {
    return <RawFrontmatter frontmatter={frontmatter} />
  }

  const meta = selectMetadata(frontmatter.data)
  // Title is owned by the document header (RX1) — omit it from the
  // metadata rail so it doesn't render twice. Description / date /
  // author / tags remain because they don't compete with the page title.
  const hasAnything =
    Boolean(meta.description) ||
    Boolean(meta.date) ||
    Boolean(meta.author) ||
    meta.tags.length > 0

  if (!hasAnything) return null

  return (
    <section
      className="swirlread-frontmatter swirlread-frontmatter--metadata"
      aria-label="Document metadata"
    >
      {meta.description && (
        <p className="swirlread-frontmatter__description">{meta.description}</p>
      )}
      {(meta.date ?? meta.author ?? meta.tags.length > 0) && (
        <ul className="swirlread-frontmatter__meta">
          {meta.date && (
            <li className="swirlread-frontmatter__meta-item">
              <Calendar size={13} aria-hidden="true" />
              <time>{meta.date}</time>
            </li>
          )}
          {meta.author && (
            <li className="swirlread-frontmatter__meta-item">
              <User size={13} aria-hidden="true" />
              <span>{meta.author}</span>
            </li>
          )}
          {meta.tags.length > 0 && (
            <li className="swirlread-frontmatter__meta-item swirlread-frontmatter__meta-item--tags">
              <Tag size={13} aria-hidden="true" />
              <ul className="swirlread-frontmatter__tags">
                {meta.tags.map((tag) => (
                  <li key={tag} className="swirlread-frontmatter__tag">
                    {tag}
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function RawFrontmatter({
  frontmatter,
}: {
  frontmatter: Frontmatter
}): ReactNode {
  const entries = Object.entries(frontmatter.data)
  if (entries.length === 0) return null

  return (
    <section
      className="swirlread-frontmatter swirlread-frontmatter--raw"
      aria-label="Document frontmatter"
    >
      <header className="swirlread-frontmatter__raw-header">
        <span className="swirlread-frontmatter__raw-label">Frontmatter</span>
        <span className="swirlread-frontmatter__raw-format">
          {frontmatter.format}
        </span>
      </header>
      <dl className="swirlread-frontmatter__raw-list">
        {entries.map(([key, value]) => (
          <div key={key} className="swirlread-frontmatter__raw-row">
            <dt className="swirlread-frontmatter__raw-key">{key}</dt>
            <dd className="swirlread-frontmatter__raw-value">
              {formatFrontmatterValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
