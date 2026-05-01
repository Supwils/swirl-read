import { useContext, type ReactNode } from 'react'
import { Link } from 'react-router'
import { resolveWikilink } from '@/core/navigation/wikilink-resolver'
import { WikilinkContext } from './wikilink-context'

interface WikilinkProps {
  'data-target'?: string
  'data-alias'?: string
  'data-heading'?: string
  'data-block-id'?: string
  children?: ReactNode
}

/**
 * Render a parsed `[[wikilink]]` node.
 *
 * Resolution happens synchronously from the {@link WikilinkContext} index.
 * The pipeline emits `data-target`, `data-alias`, etc. attributes; this
 * component reads them and produces either:
 *
 *   - a React Router `<Link>` to the resolved file
 *   - a styled "broken link" `<span>` if no match in the index
 *
 * If the index hasn't loaded yet (`null`) we render in a "pending" style
 * that's still readable — the link upgrades to clickable when the index
 * arrives.
 */
export function Wikilink(props: WikilinkProps): ReactNode {
  const ctx = useContext(WikilinkContext)
  const target = props['data-target']
  const heading = props['data-heading']
  const blockId = props['data-block-id']
  const label = props.children

  if (!target) {
    return (
      <span className="swilread-wikilink swilread-wikilink--broken">
        {label}
      </span>
    )
  }

  if (!ctx?.index) {
    return (
      <span
        className="swilread-wikilink swilread-wikilink--pending"
        data-target={target}
        title="Resolving link…"
      >
        {label}
      </span>
    )
  }

  const resolved = resolveWikilink(target, ctx.index, ctx.currentPath)
  if (!resolved) {
    return (
      <span
        className="swilread-wikilink swilread-wikilink--broken"
        data-target={target}
        title={`No file found for "${target}"`}
      >
        {label}
      </span>
    )
  }

  const hash = blockId ? `#^${blockId}` : heading ? `#${heading}` : ''
  const to = `/app/${ctx.vaultId}/${resolved}${hash}`

  return (
    <Link
      to={to}
      className="swilread-wikilink swilread-wikilink--resolved"
      data-target={target}
    >
      {label}
    </Link>
  )
}
