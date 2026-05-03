import { useContext, useState, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router'
import { resolveWikilink } from '@/core/navigation/wikilink-resolver'
import { WikilinkContext } from './wikilink-context'
import type { VaultId, VaultPath } from '@/core/vault'

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
 *
 * M9.1 perf: the resolved branch defaults to a plain `<Link>` and only
 * dynamic-imports the heavier `WikilinkPreview` (Floating UI runtime ~17KB
 * gz) the first time the user hovers a link. A reader who never hovers
 * never downloads the popover machinery.
 */
export function Wikilink(props: WikilinkProps): ReactNode {
  const ctx = useContext(WikilinkContext)
  const target = props['data-target']
  const heading = props['data-heading']
  const blockId = props['data-block-id']
  const label = props.children

  if (!target) {
    return (
      <span className="swirlread-wikilink swirlread-wikilink--broken">
        {label}
      </span>
    )
  }

  if (!ctx?.index) {
    return (
      <span
        className="swirlread-wikilink swirlread-wikilink--pending"
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
        className="swirlread-wikilink swirlread-wikilink--broken"
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
    <ResolvedWikilink
      to={to}
      resolved={resolved}
      vaultId={ctx.vaultId}
      dataTarget={target}
    >
      {label}
    </ResolvedWikilink>
  )
}

interface ResolvedProps {
  to: string
  resolved: VaultPath
  vaultId: VaultId
  dataTarget: string
  children: ReactNode
}

// Module-scoped cache — first hover anywhere on the page triggers the
// import; every subsequent <ResolvedWikilink> instance reuses the loaded
// module synchronously.
let previewPromise: Promise<ComponentType<PreviewComponentProps>> | null = null

interface PreviewComponentProps {
  to: string
  resolved: VaultPath
  vaultId: VaultId
  dataTarget: string
  className?: string
  children: ReactNode
}

function loadPreview(): Promise<ComponentType<PreviewComponentProps>> {
  previewPromise ??= import('./WikilinkPreview').then((m) => m.WikilinkPreview)
  return previewPromise
}

function ResolvedWikilink({
  to,
  resolved,
  vaultId,
  dataTarget,
  children,
}: ResolvedProps): ReactNode {
  const [Preview, setPreview] =
    useState<ComponentType<PreviewComponentProps> | null>(null)

  if (Preview) {
    return (
      <Preview
        to={to}
        resolved={resolved}
        vaultId={vaultId}
        dataTarget={dataTarget}
        className="swirlread-wikilink swirlread-wikilink--resolved"
      >
        {children}
      </Preview>
    )
  }

  return (
    <Link
      to={to}
      data-target={dataTarget}
      className="swirlread-wikilink swirlread-wikilink--resolved"
      onMouseEnter={() => {
        void loadPreview().then((Component) => {
          setPreview(() => Component)
        })
      }}
      onFocus={() => {
        // Keyboard users get the same upgrade path so they don't lose the
        // preview affordance.
        void loadPreview().then((Component) => {
          setPreview(() => Component)
        })
      }}
    >
      {children}
    </Link>
  )
}
