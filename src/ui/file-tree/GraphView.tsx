import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import type { VaultId, VaultPath } from '@/core/vault'
import { getAdapter } from '@/stores/vault-store'
import { getVaultGraph } from './vault-graph'

interface SimNode {
  id: VaultPath
  label: string
  degree: number
  x: number
  y: number
  vx: number
  vy: number
}

interface LayoutEdge {
  source: SimNode
  target: SimNode
}

function runLayout(
  nodes: SimNode[],
  edges: LayoutEdge[],
  w: number,
  h: number,
): void {
  const cx = w / 2
  const cy = h / 2
  const REPULSION = 900
  const SPRING_LEN = 70
  const SPRING_K = 0.04
  const CENTER_K = 0.006
  const DAMPING = 0.82
  const ITERS = 160

  for (const n of nodes) {
    n.x = cx + (Math.random() - 0.5) * w * 0.5
    n.y = cy + (Math.random() - 0.5) * h * 0.5
    n.vx = 0
    n.vy = 0
  }

  for (let iter = 0; iter < ITERS; iter++) {
    const alpha = Math.max(0.01, 1 - iter / ITERS)

    // Repulsion between every pair.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (!a) continue
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        if (!b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        const force = REPULSION / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    // Spring attraction along edges.
    for (const e of edges) {
      const dx = e.target.x - e.source.x
      const dy = e.target.y - e.source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const force = (dist - SPRING_LEN) * SPRING_K
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      e.source.vx += fx
      e.source.vy += fy
      e.target.vx -= fx
      e.target.vy -= fy
    }

    // Gentle pull toward center so isolated nodes don't drift away.
    for (const n of nodes) {
      n.vx += (cx - n.x) * CENTER_K
      n.vy += (cy - n.y) * CENTER_K
    }

    // Integrate with cooling.
    for (const n of nodes) {
      n.vx *= DAMPING
      n.vy *= DAMPING
      n.x = Math.max(12, Math.min(w - 12, n.x + n.vx * alpha))
      n.y = Math.max(12, Math.min(h - 12, n.y + n.vy * alpha))
    }
  }
}

interface Transform {
  x: number
  y: number
  scale: number
}

interface GraphViewProps {
  vaultId: VaultId
  currentPath: VaultPath
}

export function GraphView({ vaultId, currentPath }: GraphViewProps): ReactNode {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [simNodes, setSimNodes] = useState<SimNode[] | null>(null)
  const [layoutEdges, setLayoutEdges] = useState<LayoutEdge[]>([])
  const [layoutSize, setLayoutSize] = useState<{ w: number; h: number } | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState<Transform>({
    x: 0,
    y: 0,
    scale: 1,
  })
  const panRef = useRef<{
    sx: number
    sy: number
    ox: number
    oy: number
  } | null>(null)
  const movedRef = useRef(false)

  useEffect(() => {
    const vault = getAdapter(vaultId)
    if (!vault) {
      setError('Vault unavailable')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    void getVaultGraph(vault)
      .then((graph) => {
        if (cancelled) return
        const el = containerRef.current
        const rect = el?.getBoundingClientRect()
        const w = Math.max(200, rect?.width ?? 260)
        const h = Math.max(350, rect?.height ?? 0, window.innerHeight * 0.55)

        const sNodes: SimNode[] = graph.nodes.map((n) => ({
          ...n,
          x: w / 2,
          y: h / 2,
          vx: 0,
          vy: 0,
        }))

        const byId = new Map<VaultPath, SimNode>(sNodes.map((n) => [n.id, n]))
        const lEdges: LayoutEdge[] = []
        for (const e of graph.edges) {
          const src = byId.get(e.source)
          const tgt = byId.get(e.target)
          if (src && tgt) lEdges.push({ source: src, target: tgt })
        }

        runLayout(sNodes, lEdges, w, h)

        if (!cancelled) {
          setSimNodes(sNodes)
          setLayoutEdges(lEdges)
          setLayoutSize({ w, h })
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to build graph')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [vaultId])

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.88 : 1.14
    setTransform((t) => ({
      ...t,
      scale: Math.max(0.15, Math.min(5, t.scale * factor)),
    }))
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return
    e.currentTarget.setPointerCapture(e.pointerId)
    movedRef.current = false
    panRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: transform.x,
      oy: transform.y,
    }
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!panRef.current) return
    const dx = e.clientX - panRef.current.sx
    const dy = e.clientY - panRef.current.sy
    if (Math.abs(dx) + Math.abs(dy) > 2) movedRef.current = true
    setTransform((t) => ({
      ...t,
      x: panRef.current!.ox + dx,
      y: panRef.current!.oy + dy,
    }))
  }

  const onPointerUp = () => {
    panRef.current = null
  }

  if (loading) {
    return (
      <div ref={containerRef} className="swirlread-graph-view">
        <p className="swirlread-graph-view__status">Building graph…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div ref={containerRef} className="swirlread-graph-view">
        <p className="swirlread-graph-view__status swirlread-graph-view__status--error">
          {error}
        </p>
      </div>
    )
  }

  if (!simNodes || simNodes.length === 0) {
    return (
      <div ref={containerRef} className="swirlread-graph-view">
        <p className="swirlread-graph-view__status">
          No links found. Add [[wikilinks]] between your notes to see
          connections here.
        </p>
      </div>
    )
  }

  const svgW = layoutSize?.w ?? 260
  const svgH = layoutSize?.h ?? 420
  const maxDeg = simNodes.reduce((m, n) => Math.max(m, n.degree), 1)
  const radius = (n: SimNode) =>
    Math.max(3, Math.min(10, 2.5 + (n.degree / maxDeg) * 8))

  const hoveredNode = simNodes.find((n) => n.id === hoveredId)

  return (
    <div ref={containerRef} className="swirlread-graph-view">
      <svg
        className="swirlread-graph-view__svg"
        width={svgW}
        height={svgH}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g
          transform={`translate(${String(transform.x)},${String(transform.y)}) scale(${String(transform.scale)})`}
        >
          {/* Edges */}
          {layoutEdges.map((e, i) => (
            <line
              key={i}
              x1={e.source.x}
              y1={e.source.y}
              x2={e.target.x}
              y2={e.target.y}
              className="swirlread-graph-view__edge"
            />
          ))}
          {/* Nodes */}
          {simNodes.map((n) => {
            const isCurrent = n.id === currentPath
            const r = radius(n)
            return (
              <circle
                key={n.id}
                cx={n.x}
                cy={n.y}
                r={r}
                className={
                  isCurrent
                    ? 'swirlread-graph-view__node swirlread-graph-view__node--current'
                    : n.id === hoveredId
                      ? 'swirlread-graph-view__node swirlread-graph-view__node--hovered'
                      : 'swirlread-graph-view__node'
                }
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => {
                  if (!movedRef.current) {
                    void navigate(`/app/${vaultId}/${n.id}`)
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
            )
          })}
        </g>
      </svg>
      {/* Floating label for hovered node */}
      {hoveredNode && (
        <div
          className="swirlread-graph-view__tooltip"
          style={{
            left: hoveredNode.x * transform.scale + transform.x,
            top:
              hoveredNode.y * transform.scale +
              transform.y -
              radius(hoveredNode) * transform.scale -
              8,
          }}
        >
          {hoveredNode.label}
        </div>
      )}
    </div>
  )
}
