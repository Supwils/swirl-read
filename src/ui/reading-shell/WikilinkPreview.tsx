/**
 * WikilinkPreview — hover popover for resolved wikilinks (M3.4).
 *
 * State machine:
 *   idle ──hover──▶ delaying (400 ms)
 *   delaying ──unhover──▶ idle (cancel)
 *   delaying ──delay elapsed──▶ open ──fetch──▶ rendered/error
 *   open ──unhover (with safePolygon grace)──▶ idle
 *
 * Implementation details:
 *   - Floating UI's `useHover` provides the open/close timing + the
 *     `safePolygon` so the user can move their cursor onto the popover
 *     without it disappearing.
 *   - The text fetch only fires once the popover decides to open
 *     (delay elapsed) — no work happens for hovers that are dismissed
 *     within the 400 ms grace window.
 *   - Cancellation: an in-flight fetch is dropped if the popover closes
 *     before it resolves, so we never `setState` on an unmounted node.
 *   - The trigger is a React Router `<Link>`. Floating UI mounts onto its
 *     DOM node via the ref callback returned by `setReference`.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { previewSnippet } from '@/core/render/preview-snippet'
import { getAdapter } from '@/stores/vault-store'
import type { VaultId, VaultPath } from '@/core/vault'
import { getCachedPreview, setCachedPreview } from './wikilink-preview-cache'

interface WikilinkPreviewProps {
  /** Already-built `/app/:vaultId/:path` URL — kept opaque to this component. */
  to: string
  /** Resolved file path inside the vault (used to fetch preview text). */
  resolved: VaultPath
  /** The vault to read from — passed in (rather than via context) so the
   *  test surface stays small. */
  vaultId: VaultId
  /** Pass-through `data-target` for tests / inspection. */
  dataTarget: string
  /** Hover delay in ms. Defaults to 400 (per spec); overridable for tests. */
  delayMs?: number
  className?: string
  children: ReactNode
}

const DEFAULT_DELAY_MS = 400
const SNIPPET_MAX_CHARS = 220

export function WikilinkPreview({
  to,
  resolved,
  vaultId,
  dataTarget,
  delayMs = DEFAULT_DELAY_MS,
  className,
  children,
}: WikilinkPreviewProps): ReactNode {
  const [open, setOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  const hover = useHover(context, {
    delay: { open: delayMs, close: 120 },
    handleClose: safePolygon({ buffer: 1 }),
    move: false,
  })
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'tooltip' })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    dismiss,
    role,
  ])

  return (
    <>
      <Link
        ref={refs.setReference}
        to={to}
        className={className}
        data-target={dataTarget}
        {...getReferenceProps()}
      >
        {children}
      </Link>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="swirlread-wikilink-preview"
            data-target={dataTarget}
            {...getFloatingProps()}
          >
            <PreviewBody vaultId={vaultId} resolved={resolved} />
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

function PreviewBody({
  vaultId,
  resolved,
}: {
  vaultId: VaultId
  resolved: VaultPath
}): ReactNode {
  // Seed from the LRU cache so a repeat hover paints synchronously
  // without a pending flash. A miss still falls back to the same fetch
  // path; on success we populate the cache for the next hover.
  const [text, setText] = useState<string | null>(() =>
    getCachedPreview(vaultId, resolved),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const cached = getCachedPreview(vaultId, resolved)
    setText(cached)
    setError(null)
    if (cached !== null) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setError('Vault unavailable')
      return
    }
    vault
      .readText(resolved)
      .then((raw) => {
        if (cancelled) return
        const snippet = previewSnippet(raw, SNIPPET_MAX_CHARS)
        setCachedPreview(vaultId, resolved, snippet)
        setText(snippet)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, resolved])

  return (
    <>
      <header className="swirlread-wikilink-preview__header">{resolved}</header>
      <div className="swirlread-wikilink-preview__body">
        {error && (
          <span className="swirlread-wikilink-preview__error">{error}</span>
        )}
        {!error && text === null && (
          <span className="swirlread-wikilink-preview__pending">Reading…</span>
        )}
        {!error && text !== null && text.length === 0 && (
          <span className="swirlread-wikilink-preview__pending">
            (empty file)
          </span>
        )}
        {!error && text !== null && text.length > 0 && text}
      </div>
    </>
  )
}
