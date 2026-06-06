/**
 * LocalGraphPanel — the *expanded body* of the document-foot local-graph panel.
 *
 * Sibling to {@link BacklinksPanel}: where backlinks answer "what links *to*
 * me", this answers "what is my immediate neighbourhood" as a tiny live graph,
 * reusing the full knowledge-graph engine ({@link getVaultGraph} +
 * {@link selectGraphView} + {@link GraphCanvas}).
 *
 * This component (and the heavy graph engine + canvas chunk it pulls in) is
 * lazy-loaded by DocumentBodyView and only mounted when the panel is expanded
 * — the collapsed header row lives in DocumentBodyView, so a collapsed panel
 * costs nothing. Expanded/collapsed state is persisted in
 * `useUIStore().localGraphOpen`.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  DEFAULT_LOCAL_DEPTH,
  getVaultGraph,
  selectGraphView,
  type VaultGraph,
} from '@/core/graph'
import type { VaultId, VaultPath } from '@/core/vault'
import { getAdapter, useVaultStore } from '@/stores/vault-store'
import { useTabsStore } from '@/stores/tabs-store'
import { GraphCanvas } from '@/ui/graph/GraphCanvas'

const MIN_DEPTH = 1
const MAX_DEPTH = 2

interface LocalGraphPanelProps {
  vaultId: VaultId
  currentPath: VaultPath
}

type GraphState =
  | { kind: 'loading' }
  | { kind: 'ready'; graph: VaultGraph }
  | { kind: 'error'; message: string }

function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function clampDepth(depth: number): number {
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, depth))
}

export function LocalGraphPanel({
  vaultId,
  currentPath,
}: LocalGraphPanelProps): ReactNode {
  const navigate = useNavigate()
  const [depth, setDepth] = useState(DEFAULT_LOCAL_DEPTH)
  const [state, setState] = useState<GraphState>({ kind: 'loading' })
  // Subscribe to the per-vault content revision so a background poll that
  // rebuilds the graph refreshes the neighbourhood in place.
  const contentRevision = useVaultStore(
    (s) => s.contentRevisionByVault[vaultId] ?? 0,
  )

  useEffect(() => {
    const adapter = getAdapter(vaultId)
    if (!adapter) {
      setState({ kind: 'error', message: 'Vault unavailable' })
      return
    }
    let cancelled = false
    void getVaultGraph(adapter)
      .then((graph) => {
        if (cancelled) return
        // getVaultGraph returns a reference-stable object on a no-op poll, so
        // skip the state write when nothing changed to avoid re-animation.
        setState((prev) =>
          prev.kind === 'ready' && prev.graph === graph
            ? prev
            : { kind: 'ready', graph },
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to build graph',
        })
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, contentRevision])

  const view = useMemo(() => {
    if (state.kind !== 'ready') return null
    return selectGraphView(state.graph, {
      mode: 'local',
      focus: currentPath,
      depth,
    })
  }, [state, currentPath, depth])

  const fullGraphHref = `/app/${vaultId}/__graph__?mode=local&focus=${encodeURIComponent(
    currentPath,
  )}&depth=${depth}`

  const handleOpen = (path: VaultPath, opts: { newPane: boolean }): void => {
    if (opts.newPane) {
      void useTabsStore.getState().openOrFocus(vaultId, path, { pin: true })
    }
    void navigate(`/app/${vaultId}/${encodePathForUrl(path)}`)
  }

  return (
    <div className="swirlread-localgraph__body">
      <div className="swirlread-localgraph__controls">
        <div
          className="swirlread-localgraph__depth"
          role="group"
          aria-label="Graph depth"
        >
          <span className="swirlread-localgraph__depth-label">Depth</span>
          <button
            type="button"
            aria-label="Decrease depth"
            disabled={depth <= MIN_DEPTH}
            onClick={() => {
              setDepth((d) => clampDepth(d - 1))
            }}
          >
            −
          </button>
          <span className="swirlread-localgraph__depth-value">{depth}</span>
          <button
            type="button"
            aria-label="Increase depth"
            disabled={depth >= MAX_DEPTH}
            onClick={() => {
              setDepth((d) => clampDepth(d + 1))
            }}
          >
            +
          </button>
        </div>
        <Link className="swirlread-localgraph__full" to={fullGraphHref}>
          Open full graph
        </Link>
      </div>

      {state.kind === 'loading' && (
        <p className="swirlread-localgraph__status">Building local graph…</p>
      )}

      {state.kind === 'error' && (
        <p className="swirlread-localgraph__status" role="alert">
          Couldn&apos;t load the local graph: {state.message}
        </p>
      )}

      {state.kind === 'ready' &&
        view !== null &&
        (view.nodes.length <= 1 ? (
          <p className="swirlread-localgraph__empty">
            This note isn&apos;t linked yet. Add <code>[[wikilinks]]</code> to
            connect it, then it&apos;ll appear here.
          </p>
        ) : (
          <div className="swirlread-localgraph__canvas">
            <GraphCanvas
              view={view}
              vaultId={vaultId}
              currentPath={currentPath}
              onOpen={handleOpen}
              compact
            />
          </div>
        ))}
    </div>
  )
}
