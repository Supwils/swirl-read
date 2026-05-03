/**
 * BacklinksPanel — document-bottom view of files that link here.
 *
 * M4.4 owns the index. RX5 turns this surface from a database row list into
 * a "what should I read next?" continuation cue: backlinks are ranked by
 * recency + same-section affinity, the wikilink reference inside each snippet
 * is emphasized so the eye lands on the connection, and the panel hides
 * itself entirely when there's nothing to suggest (no more "No backlinks yet."
 * interrupting a clean reading flow).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Link2 } from 'lucide-react'
import {
  getBacklinksForFile,
  rankBacklinks,
  type Backlink,
} from '@/core/navigation/backlinks'
import { basename } from '@/core/vault'
import type { VaultId, VaultPath } from '@/core/vault'
import { useReaderStore } from '@/stores/reader-store'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; backlinks: Backlink[] }
  | { kind: 'error'; message: string }

interface BacklinksPanelProps {
  vaultId: VaultId
  currentPath: VaultPath
}

export function BacklinksPanel({
  vaultId,
  currentPath,
}: BacklinksPanelProps): ReactNode {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const recentForVault = useReaderStore((store) => store.recentByVault[vaultId])

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    getBacklinksForFile(vaultId, currentPath)
      .then((backlinks) => {
        if (!cancelled) setState({ kind: 'ready', backlinks })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, currentPath])

  const ranked = useMemo(() => {
    if (state.kind !== 'ready') return []
    const recentSourcePaths = (recentForVault ?? [])
      .map((entry) => entry.path)
      .filter((path) => path !== currentPath)
    return rankBacklinks(state.backlinks, {
      recentSourcePaths,
      currentPath,
    })
  }, [state, recentForVault, currentPath])

  // RX5: when there's nothing to suggest, take the whole panel offline rather
  // than show a status row that competes with the document's actual ending.
  if (state.kind === 'ready' && ranked.length === 0) return null

  return (
    <section className="swirlread-backlinks" aria-labelledby="backlinks-title">
      <h2 id="backlinks-title" className="swirlread-backlinks__title">
        <Link2 size={16} aria-hidden="true" />
        Backlinks
      </h2>

      {state.kind === 'loading' && (
        <p className="swirlread-backlinks__status">Looking for backlinks…</p>
      )}

      {state.kind === 'error' && (
        <p className="swirlread-backlinks__status" role="alert">
          Couldn&apos;t load backlinks: {state.message}
        </p>
      )}

      {state.kind === 'ready' && ranked.length > 0 && (
        <ul className="swirlread-backlinks__list">
          {ranked.map((backlink) => (
            <BacklinkItem key={backlink.sourcePath} backlink={backlink} />
          ))}
        </ul>
      )}
    </section>
  )
}

function BacklinkItem({ backlink }: { backlink: Backlink }): ReactNode {
  return (
    <li className="swirlread-backlinks__item">
      <Link
        to={`/app/${backlink.vaultId}/${backlink.sourcePath}`}
        className="swirlread-backlinks__link"
        title={backlink.sourcePath}
      >
        {basename(backlink.sourcePath) || backlink.sourcePath}
      </Link>
      <p className="swirlread-backlinks__path">{backlink.sourcePath}</p>
      <p className="swirlread-backlinks__context">
        {renderSnippet(backlink.context)}
      </p>
    </li>
  )
}

const WIKILINK_RE = /\[\[([^\]\n]+)]]/g

/**
 * Render a backlink snippet as plain text with `<mark>` segments wrapping any
 * `[[wikilink]]` references. The backlinks index already trims to a compact
 * window around the reference, so we just need to highlight where the link
 * actually is — the eye should land on the connection in under a second.
 */
function renderSnippet(context: string): ReactNode {
  if (!context.includes('[[')) return context

  const parts: ReactNode[] = []
  let cursor = 0
  let key = 0
  WIKILINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WIKILINK_RE.exec(context)) !== null) {
    if (match.index > cursor) {
      parts.push(context.slice(cursor, match.index))
    }
    parts.push(
      <mark key={key++} className="swirlread-backlinks__mark">
        {match[0]}
      </mark>,
    )
    cursor = match.index + match[0].length
  }
  if (cursor < context.length) parts.push(context.slice(cursor))
  return parts
}
