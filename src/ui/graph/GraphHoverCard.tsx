/**
 * GraphHoverCard — the floating "basic content" preview for a graph node.
 *
 * Mounted once per canvas and driven imperatively (see {@link GraphHoverHandle})
 * so hovering across nodes never re-renders the node list. On `show` it fetches
 * the target note's excerpt — reusing the same LRU cache + `previewSnippet`
 * extractor the inline wikilink popover uses, so a note hovered in the graph
 * and then in the prose paints from one cache.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { previewSnippet } from '@/core/render/preview-snippet'
import { getAdapter } from '@/stores/vault-store'
import type { VaultId } from '@/core/vault'
import {
  getCachedPreview,
  setCachedPreview,
} from '@/ui/reading-shell/wikilink-preview-cache'
import type { GraphNode } from '@/core/graph'

export interface GraphHoverHandle {
  show: (node: GraphNode, screenX: number, screenY: number) => void
  hide: () => void
}

interface HoverState {
  node: GraphNode
  x: number
  y: number
}

const SNIPPET_MAX_CHARS = 200

export const GraphHoverCard = forwardRef<
  GraphHoverHandle,
  { vaultId: VaultId }
>(function GraphHoverCard({ vaultId }, ref): ReactNode {
  const [hover, setHover] = useState<HoverState | null>(null)
  const [snippet, setSnippet] = useState<string | null>(null)
  const reqIdRef = useRef(0)

  useImperativeHandle(
    ref,
    () => ({
      show: (node, screenX, screenY) => {
        setHover({ node, x: screenX, y: screenY })
      },
      hide: () => {
        setHover(null)
      },
    }),
    [],
  )

  const path = hover?.node.id
  useEffect(() => {
    if (!path) {
      setSnippet(null)
      return
    }
    const reqId = ++reqIdRef.current
    const cached = getCachedPreview(vaultId, path)
    if (cached !== null) {
      setSnippet(cached)
      return
    }
    setSnippet(null)
    const vault = getAdapter(vaultId)
    if (!vault) return
    void vault
      .readText(path)
      .then((raw) => {
        if (reqId !== reqIdRef.current) return
        const text = previewSnippet(raw, SNIPPET_MAX_CHARS)
        setCachedPreview(vaultId, path, text)
        setSnippet(text)
      })
      .catch(() => {
        if (reqId !== reqIdRef.current) return
        setSnippet(null)
      })
  }, [vaultId, path])

  if (!hover) return null

  const { node, x, y } = hover
  return (
    <div
      className="swirlread-graphmap__card"
      style={{ left: x, top: y }}
      role="tooltip"
    >
      <div className="swirlread-graphmap__card-title">{node.label}</div>
      <div className="swirlread-graphmap__card-meta">
        {node.section || 'root'} · {node.inDegree} in · {node.outDegree} out
      </div>
      {snippet === null ? (
        <div className="swirlread-graphmap__card-body swirlread-graphmap__card-body--muted">
          Reading…
        </div>
      ) : snippet.length === 0 ? (
        <div className="swirlread-graphmap__card-body swirlread-graphmap__card-body--muted">
          (empty note)
        </div>
      ) : (
        <div className="swirlread-graphmap__card-body">{snippet}</div>
      )}
    </div>
  )
})
