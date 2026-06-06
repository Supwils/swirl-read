/**
 * GraphPage — `/app/:vaultId/__graph__` — the full-window knowledge map.
 *
 * Two modes (locked first-cut scope, notes only):
 *   - `global` — the whole vault graph, degree-culled to the node cap.
 *   - `local`  — a breadth-first neighbourhood around a focus note (`?focus=`),
 *     out to an adjustable depth. This is the reading-centric view.
 *
 * Mode / focus / depth live in the URL search params so the view is shareable
 * and survives back/forward. Heavy work (graph build + the SVG canvas chunk)
 * is lazy: the route only mounts when the user opens the map.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Network, X } from 'lucide-react'
import {
  DEFAULT_LOCAL_DEPTH,
  DEFAULT_MAX_NODES,
  getVaultGraph,
  selectGraphView,
  type GraphViewMode,
  type VaultGraph,
} from '@/core/graph'
import { getAdapter, useVaultStore } from '@/stores/vault-store'
import { useTabsStore } from '@/stores/tabs-store'
import { basename, type VaultPath } from '@/core/vault'
import { GraphCanvas } from './GraphCanvas'

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; graph: VaultGraph }

function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

const MAX_LOCAL_DEPTH = 4

export function GraphPage(): ReactNode {
  const { vaultId } = useParams<{ vaultId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const contentRevision = useVaultStore((s) =>
    vaultId ? (s.contentRevisionByVault[vaultId] ?? 0) : 0,
  )

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  // The vault whose graph is currently shown. Lets a background content poll
  // refresh the graph in place without flashing the loading screen + remount.
  const readyVaultRef = useRef<string | null>(null)

  const mode: GraphViewMode =
    searchParams.get('mode') === 'local' ? 'local' : 'global'
  const focus = searchParams.get('focus') ?? undefined
  // Highlight-only "where I came from" for global mode. Decoupled from `focus`
  // (which drives local-view selection), so it never changes which view shows.
  const from = searchParams.get('from') ?? undefined
  const depth = clampDepth(
    Number(searchParams.get('depth')) || DEFAULT_LOCAL_DEPTH,
  )

  useEffect(() => {
    if (!vaultId) {
      setPhase({ kind: 'error', message: 'No vault selected' })
      return
    }
    const vault = getAdapter(vaultId)
    if (!vault) {
      setPhase({ kind: 'error', message: 'Vault unavailable' })
      return
    }
    let cancelled = false
    // Loading screen only when we don't already have THIS vault's graph
    // (initial open / vault switch). A background content re-poll keeps the
    // current graph on screen instead of flashing loading + remounting.
    if (readyVaultRef.current !== vaultId) {
      setPhase({ kind: 'loading' })
    }
    void getVaultGraph(vault)
      .then((graph) => {
        if (cancelled) return
        readyVaultRef.current = vaultId
        // getVaultGraph hands back a reference-stable object when the vault is
        // structurally unchanged, so a no-op poll keeps `phase` (and the
        // derived `view`) identical — no re-animation, no pan/zoom reset.
        setPhase((prev) =>
          prev.kind === 'ready' && prev.graph === graph
            ? prev
            : { kind: 'ready', graph },
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        readyVaultRef.current = null
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to build graph',
        })
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, contentRevision])

  const view = useMemo(() => {
    if (phase.kind !== 'ready') return null
    return selectGraphView(phase.graph, {
      mode,
      focus,
      depth,
      maxNodes: DEFAULT_MAX_NODES,
    })
  }, [phase, mode, focus, depth])

  // Esc leaves the map — matches the review surface. Guarded against editable
  // targets so typing Esc inside a future inline input doesn't bounce out.
  useEffect(() => {
    function handle(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      void navigate(vaultId ? `/app/${vaultId}` : '/app')
    }
    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
    }
  }, [navigate, vaultId])

  const setParam = (next: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(next)) {
          if (value === null) params.delete(key)
          else params.set(key, value)
        }
        return params
      },
      { replace: true },
    )
  }

  const handleOpen = (path: VaultPath, opts: { newPane: boolean }) => {
    if (!vaultId) return
    if (opts.newPane) {
      void useTabsStore.getState().openOrFocus(vaultId, path, { pin: true })
    }
    void navigate(`/app/${vaultId}/${encodePathForUrl(path)}`)
  }

  const exit = () => {
    void navigate(vaultId ? `/app/${vaultId}` : '/app')
  }

  if (phase.kind === 'loading') {
    return (
      <GraphShell onExit={exit}>
        <div className="swirlread-graphmap__status">
          Building knowledge map…
        </div>
      </GraphShell>
    )
  }

  if (phase.kind === 'error') {
    return (
      <GraphShell onExit={exit}>
        <div className="swirlread-graphmap__status swirlread-graphmap__status--error">
          {phase.message}
        </div>
      </GraphShell>
    )
  }

  if (!view || view.nodes.length === 0) {
    const localOrphan = mode === 'local' && !!focus
    return (
      <GraphShell onExit={exit}>
        <div className="swirlread-graphmap__empty">
          <Network size={28} aria-hidden="true" />
          <p className="swirlread-graphmap__empty-title">
            {localOrphan
              ? 'This note has no links yet.'
              : 'No connections to map yet.'}
          </p>
          <p className="swirlread-graphmap__empty-body">
            Add <code>[[wikilinks]]</code> between your notes and they’ll appear
            here as a living web.
          </p>
          {localOrphan && (
            <button
              type="button"
              className="swirlread-graphmap__btn"
              onClick={() => setParam({ mode: 'global', focus: null })}
            >
              View the whole vault
            </button>
          )}
        </div>
      </GraphShell>
    )
  }

  return (
    <GraphShell
      onExit={exit}
      controls={
        <>
          <div
            className="swirlread-graphmap__seg"
            role="group"
            aria-label="Graph scope"
          >
            <button
              type="button"
              data-active={mode === 'global' ? 'true' : undefined}
              onClick={() => setParam({ mode: 'global' })}
            >
              Global
            </button>
            <button
              type="button"
              data-active={mode === 'local' ? 'true' : undefined}
              onClick={() => setParam({ mode: 'local' })}
              disabled={!focus}
              title={
                focus ? undefined : 'Open from a note to see its local graph'
              }
            >
              Local
            </button>
          </div>

          {mode === 'local' && focus && (
            <div className="swirlread-graphmap__depth">
              <span className="swirlread-graphmap__depth-label">
                {basename(focus)} · depth
              </span>
              <button
                type="button"
                aria-label="Decrease depth"
                disabled={depth <= 1}
                onClick={() => setParam({ depth: String(depth - 1) })}
              >
                −
              </button>
              <span className="swirlread-graphmap__depth-value">{depth}</span>
              <button
                type="button"
                aria-label="Increase depth"
                disabled={depth >= MAX_LOCAL_DEPTH}
                onClick={() => setParam({ depth: String(depth + 1) })}
              >
                +
              </button>
            </div>
          )}

          <span className="swirlread-graphmap__count">
            {view.hiddenCount > 0
              ? `${view.nodes.length} of ${view.totalNodes} notes`
              : `${view.nodes.length} notes`}
          </span>
        </>
      }
    >
      <GraphCanvas
        key={`${mode}:${focus ?? ''}:${depth}`}
        view={view}
        vaultId={vaultId ?? ''}
        currentPath={(mode === 'local' ? focus : from) ?? ''}
        onOpen={handleOpen}
      />
    </GraphShell>
  )
}

function GraphShell({
  children,
  controls,
  onExit,
}: {
  children: ReactNode
  controls?: ReactNode
  onExit: () => void
}): ReactNode {
  return (
    <div className="swirlread-graphmap">
      <header className="swirlread-graphmap__bar">
        <div className="swirlread-graphmap__bar-title">
          <Network size={15} aria-hidden="true" />
          <span>Knowledge graph</span>
        </div>
        <div className="swirlread-graphmap__bar-controls">{controls}</div>
        <button
          type="button"
          className="swirlread-graphmap__exit"
          onClick={onExit}
          aria-label="Close graph"
          title="Close graph"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {children}
    </div>
  )
}

function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) return DEFAULT_LOCAL_DEPTH
  return Math.max(1, Math.min(MAX_LOCAL_DEPTH, Math.round(depth)))
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
