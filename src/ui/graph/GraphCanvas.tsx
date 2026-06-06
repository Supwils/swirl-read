/**
 * GraphCanvas — the SVG knowledge map.
 *
 * Rendering strategy (the important part):
 *   - React owns *structure* (the list of `<line>` / node `<g>` elements,
 *     keyed by id) and low-frequency chrome (world pan/zoom transform).
 *   - The animation owns *position*. A `requestAnimationFrame` loop ticks the
 *     force simulation and writes `transform` / `x1…y2` attributes directly to
 *     the DOM via id-keyed element refs, bypassing React reconciliation. This
 *     keeps the 60 fps settle path allocation-free even at the node cap.
 *   - Node/edge positions live only in the DOM attributes we set imperatively;
 *     they are NOT React props, so a pan/zoom/label re-render never clobbers
 *     them. We therefore apply positions exactly where they can change: once
 *     synchronously when the sim is (re)built, then per frame while it settles.
 *   - Hover never re-renders the node list. Neighbour-focus dimming is applied
 *     imperatively via `classList`; the preview card is a single sibling
 *     component driven through an imperative handle.
 *
 * Element refs are keyed by node id / edge id (not array index) so a change to
 * the node set (e.g. a file added/removed while the map is open) can never
 * desync the refs from the simulation.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  buildSimulation,
  DEFAULT_FORCE_PARAMS,
  type ForceParams,
  type ForceSimulation,
  type GraphNode,
  type GraphView,
} from '@/core/graph'
import type { VaultId, VaultPath } from '@/core/vault'
import { GraphHoverCard, type GraphHoverHandle } from './GraphHoverCard'

interface WorldTransform {
  x: number
  y: number
  k: number
}

interface GraphCanvasProps {
  view: GraphView
  vaultId: VaultId
  currentPath: VaultPath
  /** Navigate to a node. `newPane` mirrors a ⌘/Ctrl-click intent. */
  onOpen: (path: VaultPath, opts: { newPane: boolean }) => void
  /**
   * Tighter layout for the small document-foot panel: shorter links, lower
   * repulsion, labels visible at any zoom, and a hidden/shrunk zoom cluster
   * (CSS via the `--compact` modifier). Default false → the full-window map
   * behaves exactly as before.
   */
  compact?: boolean
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 6
const LABEL_ZOOM_THRESHOLD = 1.35
// Compact panels are small and read at a glance, so labels should always show.
const COMPACT_LABEL_ZOOM_THRESHOLD = 0
const DRAG_THRESHOLD_PX = 3

// Tighter force tuning for the cramped foot panel: shorter springs pull the
// neighbourhood close, and lower repulsion keeps it from sprawling past the
// small viewport.
const COMPACT_FORCE_PARAMS: ForceParams = {
  ...DEFAULT_FORCE_PARAMS,
  repulsion: 600,
  linkDistance: 38,
  centerStrength: 0.05,
}
const TICKS_PER_FRAME = 1
const FALLBACK_W = 900
const FALLBACK_H = 640

// NUL can never appear in a vault path, so it's a collision-proof separator
// for the composite edge id used as the React key and the edge ref-map key.
const EDGE_SEP = String.fromCharCode(0)
function edgeKey(edge: { source: VaultPath; target: VaultPath }): string {
  return edge.source + EDGE_SEP + edge.target
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** jsdom (and some older browsers) may not implement pointer capture. */
function capturePointer(el: Element, pointerId: number): void {
  if (typeof el.setPointerCapture === 'function') {
    try {
      el.setPointerCapture(pointerId)
    } catch {
      // Ignore — capture is a nicety, not a correctness requirement.
    }
  }
}

export function GraphCanvas({
  view,
  vaultId,
  currentPath,
  onOpen,
  compact = false,
}: GraphCanvasProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  // Element refs keyed by id (not index) so a node-set change can't desync
  // them from the simulation. Self-cleaning: the ref callback deletes on
  // unmount (called with null).
  const nodeEls = useRef<Map<VaultPath, SVGGElement>>(new Map())
  const edgeEls = useRef<Map<string, SVGLineElement>>(new Map())
  const hoverRef = useRef<GraphHoverHandle | null>(null)

  const simRef = useRef<ForceSimulation | null>(null)
  const rafRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const prevPositionsRef = useRef<
    Map<string, { x: number; y: number; fx: number | null; fy: number | null }>
  >(new Map())

  const [size, setSize] = useState<{ w: number; h: number }>({
    w: FALLBACK_W,
    h: FALLBACK_H,
  })
  const [transform, setTransform] = useState<WorldTransform>({
    x: 0,
    y: 0,
    k: 1,
  })
  const transformRef = useRef(transform)
  transformRef.current = transform

  const labelZoomThreshold = compact
    ? COMPACT_LABEL_ZOOM_THRESHOLD
    : LABEL_ZOOM_THRESHOLD
  const showAllLabels = transform.k >= labelZoomThreshold

  // id → 1-hop neighbour set (including self), for hover focus dimming.
  const neighborMap = useMemo(() => {
    const map = new Map<VaultPath, Set<VaultPath>>()
    for (const node of view.nodes) map.set(node.id, new Set([node.id]))
    for (const edge of view.edges) {
      map.get(edge.source)?.add(edge.target)
      map.get(edge.target)?.add(edge.source)
    }
    return map
  }, [view])

  // Hubs always show their label even at low zoom — they're the landmarks.
  const hubIds = useMemo(() => {
    const sorted = [...view.nodes].sort((a, b) => b.degree - a.degree)
    const cut = Math.max(1, Math.ceil(sorted.length * 0.06))
    return new Set(sorted.slice(0, cut).map((n) => n.id))
  }, [view])

  /* ── measure ────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const w = Math.round(rect.width) || FALLBACK_W
      const h = Math.round(rect.height) || FALLBACK_H
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [])

  /* ── write simulation positions to the DOM ──────────────────────── */
  const applyPositions = useCallback(() => {
    const sim = simRef.current
    if (!sim) return
    const nodes = sim.nodes
    const nodeMap = nodeEls.current
    for (const n of nodes) {
      const el = nodeMap.get(n.id)
      if (el) el.setAttribute('transform', `translate(${n.x},${n.y})`)
    }
    const edgeMap = edgeEls.current
    for (const link of sim.links) {
      const s = nodes[link.source]
      const t = nodes[link.target]
      if (!s || !t) continue
      const el = edgeMap.get(edgeKey({ source: s.id, target: t.id }))
      if (!el) continue
      el.setAttribute('x1', String(s.x))
      el.setAttribute('y1', String(s.y))
      el.setAttribute('x2', String(t.x))
      el.setAttribute('y2', String(t.y))
    }
  }, [])

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    runningRef.current = false
  }, [])

  const startLoop = useCallback(() => {
    if (runningRef.current) return
    const sim = simRef.current
    if (!sim) return
    runningRef.current = true
    const loop = () => {
      const s = simRef.current
      if (!s) {
        runningRef.current = false
        return
      }
      for (let i = 0; i < TICKS_PER_FRAME; i++) s.tick()
      applyPositions()
      if (s.settled) {
        runningRef.current = false
        rafRef.current = null
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [applyPositions])

  /* ── neighbour-focus highlight (imperative) ─────────────────────── */
  const applyHighlight = useCallback(
    (id: VaultPath | null) => {
      const neighbors = id ? neighborMap.get(id) : null
      const nodeMap = nodeEls.current
      for (const node of view.nodes) {
        const el = nodeMap.get(node.id)
        if (!el) continue
        const dim = id !== null && !(neighbors?.has(node.id) ?? false)
        el.classList.toggle('is-dim', dim)
        el.classList.toggle('is-hover', node.id === id)
      }
      const edgeMap = edgeEls.current
      for (const e of view.edges) {
        const el = edgeMap.get(edgeKey(e))
        if (!el) continue
        const active = id !== null && (e.source === id || e.target === id)
        el.classList.toggle('is-active', active)
        el.classList.toggle('is-dim', id !== null && !active)
      }
    },
    [neighborMap, view],
  )

  /* ── (re)build the simulation when the view or size changes ──────── */
  useEffect(() => {
    stopLoop()
    // Drop any imperative hover state from the previous view: pointerleave may
    // never fire (touch / off-window / in-place rebuild) and React won't
    // rewrite an unchanged className, so clear it ourselves before the build.
    applyHighlight(null)
    hoverRef.current?.hide()
    // Carry over positions for nodes that persist across an in-place rebuild
    // (a vault-content revision or a resize) so the layout morphs instead of
    // jumping. (GraphPage remounts this component via `key` on mode/focus/depth
    // changes, so those start from a fresh layout.)
    const sim = buildSimulation(view, {
      width: size.w,
      height: size.h,
      previous: prevPositionsRef.current,
      params: compact ? COMPACT_FORCE_PARAMS : undefined,
    })
    simRef.current = sim

    if (prefersReducedMotion()) {
      sim.runToSettle()
      applyPositions()
    } else {
      // Paint the seeded positions synchronously so freshly committed elements
      // never flash at the SVG origin before the rAF loop's first frame.
      applyPositions()
      startLoop()
    }

    return () => {
      // Snapshot positions for the next build before tearing down.
      const snap = new Map<
        string,
        { x: number; y: number; fx: number | null; fy: number | null }
      >()
      for (const n of sim.nodes) {
        snap.set(n.id, { x: n.x, y: n.y, fx: n.fx, fy: n.fy })
      }
      prevPositionsRef.current = snap
      stopLoop()
    }
  }, [
    view,
    size.w,
    size.h,
    compact,
    startLoop,
    stopLoop,
    applyPositions,
    applyHighlight,
  ])

  /* ── pan / zoom ─────────────────────────────────────────────────── */
  // React registers `wheel` as a passive listener, so an onWheel prop can't
  // preventDefault (browser warns + the page could scroll). Attach a native
  // non-passive listener instead and zoom toward the cursor.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      // Embedded (compact) panel: a plain wheel must scroll the PAGE, not
      // hijack into zoom — require Ctrl/⌘ to zoom (standard embedded-map UX).
      // The full-window map keeps plain-wheel zoom.
      if (compact && !e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      setTransform((t) => {
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k * factor))
        const ratio = k / t.k
        return {
          k,
          x: cursorX - (cursorX - t.x) * ratio,
          y: cursorY - (cursorY - t.y) * ratio,
        }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('wheel', onWheel)
    }
  }, [compact])

  // Prune the active-pointer map on ANY pointer release, window-wide. Pointer
  // capture usually routes up/cancel back to the svg, but capture can silently
  // fail (older browsers / some stylus stacks); without this, a release off
  // the svg would leave a stale entry and wedge the canvas into pinch mode.
  useEffect(() => {
    const onRelease = (e: PointerEvent): void => {
      pointersRef.current.delete(e.pointerId)
      if (pointersRef.current.size < 2) pinchDistRef.current = null
      // If capture failed, the svg's own pointerup never fires — so end an
      // in-progress NODE drag here too (clear it + release the node's pin),
      // otherwise the node stays frozen (fx/fy persist across sim rebuilds).
      const drag = dragRef.current
      if (drag?.kind === 'node' && drag.pointerId === e.pointerId) {
        dragRef.current = null
        const node = simRef.current?.nodes.find((n) => n.id === drag.id)
        if (node) {
          node.fx = null
          node.fy = null
        }
      }
    }
    window.addEventListener('pointerup', onRelease)
    window.addEventListener('pointercancel', onRelease)
    return () => {
      window.removeEventListener('pointerup', onRelease)
      window.removeEventListener('pointercancel', onRelease)
    }
  }, [])

  const screenPos = useCallback((wx: number, wy: number) => {
    const t = transformRef.current
    return { sx: wx * t.k + t.x, sy: wy * t.k + t.y }
  }, [])

  // Resolve the live sim node by id, not by a captured array index: a mid-drag
  // sim rebuild (resize / vault poll) swaps simRef and invalidates indices.
  const findSimNode = useCallback((id: VaultPath) => {
    return simRef.current?.nodes.find((n) => n.id === id) ?? null
  }, [])

  const handleNodeEnter = useCallback(
    (index: number) => {
      const node = view.nodes[index]
      if (!node) return
      const simNode = findSimNode(node.id)
      if (!simNode) return
      applyHighlight(node.id)
      const { sx, sy } = screenPos(simNode.x, simNode.y)
      hoverRef.current?.show(
        node,
        sx,
        sy - simNode.radius * transformRef.current.k,
      )
    },
    [applyHighlight, findSimNode, screenPos, view],
  )

  const handleNodeLeave = useCallback(() => {
    applyHighlight(null)
    hoverRef.current?.hide()
  }, [applyHighlight])

  // Pointer interaction state: either panning the background or dragging a
  // node. Stored in a ref so the move handler doesn't re-bind each render.
  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; ox: number; oy: number }
    | {
        kind: 'node'
        id: VaultPath
        moved: boolean
        startX: number
        startY: number
        pointerId: number
      }
    | null
  >(null)

  // Active pointers (Feature B Phase B). Keyed by pointerId → last client
  // coords, so a two-finger gesture can be detected and pinch-zoomed. Single
  // pointer keeps the existing pan/drag/click path untouched.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  // Last finger-to-finger distance during an active pinch; null = not pinching.
  const pinchDistRef = useRef<number | null>(null)

  const onSvgPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      // Track every pointer that lands on the svg surface for pinch math.
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      // Background only — node pointerdown is handled on the node and stops
      // propagation.
      if (e.target !== e.currentTarget) return
      capturePointer(e.currentTarget, e.pointerId)
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        ox: transform.x,
        oy: transform.y,
      }
      hoverRef.current?.hide()
    },
    [transform.x, transform.y],
  )

  const worldFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    const t = transformRef.current
    const px = clientX - (rect?.left ?? 0)
    const py = clientY - (rect?.top ?? 0)
    return { wx: (px - t.x) / t.k, wy: (py - t.y) / t.k }
  }, [])

  const onSvgPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      // Keep the tracked coords fresh for any pointer the svg sees (pointer
      // capture routes node-drag pointers here too).
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }

      // Two-finger pinch zoom (Feature B Phase B). Mirrors the wheel-zoom
      // math but drives `k` from the finger-distance delta toward the pinch
      // midpoint. While pinching, single-pointer pan/drag is suppressed.
      if (pointersRef.current.size >= 2) {
        // Entering/continuing a pinch: release any in-progress node-drag pin
        // first, otherwise a drag-then-pinch leaves the node frozen (fx/fy
        // persist across sim rebuilds). Then suppress single-pointer pan/drag.
        if (dragRef.current?.kind === 'node') {
          const dragged = findSimNode(dragRef.current.id)
          if (dragged) {
            dragged.fx = null
            dragged.fy = null
          }
        }
        dragRef.current = null
        const pts = [...pointersRef.current.values()]
        const a = pts[0]
        const b = pts[1]
        if (!a || !b) return
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const prev = pinchDistRef.current
        pinchDistRef.current = dist
        if (prev === null || prev === 0) {
          // First frame of the gesture — establish a baseline, don't jump.
          hoverRef.current?.hide()
          return
        }
        const rect = svgRef.current?.getBoundingClientRect()
        const midX = (a.x + b.x) / 2 - (rect?.left ?? 0)
        const midY = (a.y + b.y) / 2 - (rect?.top ?? 0)
        setTransform((t) => {
          const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k * (dist / prev)))
          const ratio = k / t.k
          return {
            k,
            x: midX - (midX - t.x) * ratio,
            y: midY - (midY - t.y) * ratio,
          }
        })
        return
      }

      const drag = dragRef.current
      if (!drag) return
      if (drag.kind === 'pan') {
        setTransform((t) => ({
          ...t,
          x: drag.ox + (e.clientX - drag.startX),
          y: drag.oy + (e.clientY - drag.startY),
        }))
        return
      }
      // Node drag — pin the node to the cursor and reheat. A sub-threshold
      // wobble is not a drag, so a slightly-shaky click still opens the note.
      if (
        !drag.moved &&
        Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) <
          DRAG_THRESHOLD_PX
      ) {
        return
      }
      const simNode = findSimNode(drag.id)
      if (!simNode) return
      const { wx, wy } = worldFromClient(e.clientX, e.clientY)
      simNode.fx = wx
      simNode.fy = wy
      simNode.x = wx
      simNode.y = wy
      drag.moved = true
      simRef.current?.reheat(0.5)
      startLoop()
    },
    [findSimNode, startLoop, worldFromClient],
  )

  const onSvgPointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      pointersRef.current.delete(e.pointerId)
      // Lifting one finger ends the pinch; the remaining finger should not
      // suddenly pan from a stale baseline, so clear it.
      if (pointersRef.current.size < 2) pinchDistRef.current = null
      const drag = dragRef.current
      dragRef.current = null
      if (drag?.kind === 'node') {
        const simNode = findSimNode(drag.id)
        // Release the pin so the layout re-relaxes around the drop point.
        if (simNode) {
          simNode.fx = null
          simNode.fy = null
        }
        if (!drag.moved) {
          onOpen(drag.id, { newPane: e.metaKey === true || e.ctrlKey === true })
        }
      }
    },
    [findSimNode, onOpen],
  )

  const onSvgPointerCancel = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      pointersRef.current.delete(e.pointerId)
      if (pointersRef.current.size < 2) pinchDistRef.current = null
      // An interrupted gesture (touch/stylus) never fires pointerup. Tear down
      // the drag so a stray later move doesn't resume it, and release any pin.
      const drag = dragRef.current
      dragRef.current = null
      if (drag?.kind === 'node') {
        const simNode = findSimNode(drag.id)
        if (simNode) {
          simNode.fx = null
          simNode.fy = null
        }
      }
    },
    [findSimNode],
  )

  const onNodePointerDown = useCallback(
    (e: ReactPointerEvent<SVGGElement>, id: VaultPath) => {
      e.stopPropagation()
      // Node pointerdown stops propagation, so the svg handler never sees it.
      // Register it here so a finger starting on a node still counts toward a
      // two-finger pinch.
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (svgRef.current) capturePointer(svgRef.current, e.pointerId)
      dragRef.current = {
        kind: 'node',
        id,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
      }
    },
    [],
  )

  // The node pointer-move/up are captured on the svg (pointer capture is set
  // there), so the svg's move/up handlers above drive node dragging too.

  /* ── reset ──────────────────────────────────────────────────────── */
  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, k: 1 })
  }, [])

  const maxDegree = useMemo(
    () => view.nodes.reduce((m, n) => Math.max(m, n.degree), 1),
    [view],
  )

  return (
    <div
      className={
        'swirlread-graphmap__canvas' +
        (compact ? ' swirlread-graphmap__canvas--compact' : '')
      }
      ref={containerRef}
    >
      <svg
        ref={svgRef}
        className="swirlread-graphmap__svg"
        width={size.w}
        height={size.h}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerCancel={onSvgPointerCancel}
        role="application"
        aria-label="Knowledge graph"
      >
        <g
          transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
        >
          <g className="swirlread-graphmap__edges">
            {view.edges.map((edge) => {
              const ek = edgeKey(edge)
              return (
                <line
                  key={ek}
                  ref={(el) => {
                    if (el) edgeEls.current.set(ek, el)
                    else edgeEls.current.delete(ek)
                  }}
                  className="swirlread-graphmap__edge"
                />
              )
            })}
          </g>
          <g className="swirlread-graphmap__nodes">
            {view.nodes.map((node, i) => {
              const isCurrent = node.id === currentPath
              const r = 3 + Math.sqrt(node.degree / maxDegree) * 9
              const showLabel = showAllLabels || hubIds.has(node.id)
              return (
                <g
                  key={node.id}
                  ref={(el) => {
                    if (el) nodeEls.current.set(node.id, el)
                    else nodeEls.current.delete(node.id)
                  }}
                  className={
                    'swirlread-graphmap__node' +
                    (isCurrent ? ' is-current' : '')
                  }
                  data-color={node.colorId}
                  onPointerDown={(e) => onNodePointerDown(e, node.id)}
                  onPointerEnter={() => handleNodeEnter(i)}
                  onPointerLeave={handleNodeLeave}
                >
                  <circle className="swirlread-graphmap__dot" r={r} />
                  {showLabel && (
                    <text
                      className="swirlread-graphmap__label"
                      y={r + 11}
                      textAnchor="middle"
                    >
                      {node.label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      <GraphHoverCard ref={hoverRef} vaultId={vaultId} />

      <div className="swirlread-graphmap__zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          onClick={() =>
            setTransform((t) => ({
              ...t,
              k: Math.min(MAX_ZOOM, t.k * 1.2),
            }))
          }
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() =>
            setTransform((t) => ({
              ...t,
              k: Math.max(MIN_ZOOM, t.k / 1.2),
            }))
          }
          aria-label="Zoom out"
        >
          −
        </button>
        <button type="button" onClick={resetView} aria-label="Reset view">
          ⤾
        </button>
      </div>
    </div>
  )
}

export type { GraphNode }
