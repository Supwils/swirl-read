/**
 * Framework-free force-directed layout.
 *
 * A small velocity-Verlet simulation with four forces — many-body repulsion,
 * link springs, centre gravity, and collision separation — plus alpha cooling
 * so the layout *settles* instead of jittering forever. It's designed to be
 * driven one {@link ForceSimulation.tick} at a time from a `requestAnimation-
 * Frame` loop (live, animated settle) or run to completion synchronously via
 * {@link ForceSimulation.runToSettle} (reduced-motion / tests).
 *
 * Repulsion is O(n²) per tick. Node counts are bounded by the global-view cap
 * (`DEFAULT_MAX_NODES`) and the local view is far smaller, so the quadratic
 * cost stays well within a frame budget during the short cooling window. A
 * Barnes-Hut quadtree is the obvious next step if the cap is ever raised past
 * ~1k — the public API is intentionally agnostic to how repulsion is computed.
 *
 * Determinism: initial placement uses an injectable seeded RNG, so the same
 * graph + seed always lays out identically. Tests rely on this.
 */

import type { GraphView } from './graph-types'

export interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  /** When non-null the node is pinned to (fx, fy) each tick (drag / anchor).
   *  It still exerts forces on others but doesn't integrate its own. */
  fx: number | null
  fy: number | null
  /** Visual radius — drives collision spacing and is read by the renderer. */
  radius: number
  /** in + out degree, carried through for renderer styling. */
  degree: number
}

export interface SimLink {
  /** Index into the simulation's `nodes` array. */
  source: number
  target: number
}

export interface ForceParams {
  /** Many-body repulsion strength (higher = more spread out). */
  repulsion: number
  /** Rest length of link springs. */
  linkDistance: number
  /** Link spring stiffness, 0–1. */
  linkStrength: number
  /** Pull toward the layout centre, 0–1. Keeps detached clusters on screen. */
  centerStrength: number
  /** Velocity retained per tick, 0–1 (cooling friction). */
  damping: number
  /** Fraction of alpha shed per tick. */
  alphaDecay: number
  /** Below this alpha the layout is considered settled. */
  alphaMin: number
}

export const DEFAULT_FORCE_PARAMS: ForceParams = {
  repulsion: 1400,
  linkDistance: 60,
  linkStrength: 0.06,
  centerStrength: 0.02,
  damping: 0.78,
  alphaDecay: 0.022,
  alphaMin: 0.02,
}

const MIN_DISTANCE = 0.5

export class ForceSimulation {
  readonly nodes: SimNode[]
  readonly links: SimLink[]
  private readonly params: ForceParams
  private cx: number
  private cy: number
  alpha = 1

  constructor(
    nodes: SimNode[],
    links: SimLink[],
    center: { x: number; y: number },
    params: ForceParams = DEFAULT_FORCE_PARAMS,
  ) {
    this.nodes = nodes
    this.links = links
    this.cx = center.x
    this.cy = center.y
    this.params = params
  }

  get settled(): boolean {
    return this.alpha <= this.params.alphaMin
  }

  setCenter(x: number, y: number): void {
    this.cx = x
    this.cy = y
  }

  /** Re-energise the layout (e.g. after a drag or a resize). */
  reheat(alpha = 0.6): void {
    this.alpha = Math.max(this.alpha, alpha)
  }

  /** Advance the simulation by one step. No-op once settled. */
  tick(): void {
    if (this.settled) return
    const { nodes, links, params } = this
    const { repulsion, linkDistance, linkStrength, centerStrength, damping } =
      params
    const n = nodes.length

    // Many-body repulsion + collision separation (single O(n²) pass).
    for (let i = 0; i < n; i++) {
      const a = nodes[i]!
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let distSq = dx * dx + dy * dy
        if (distSq < MIN_DISTANCE) {
          // Coincident nodes — nudge deterministically by index so the
          // simulation doesn't depend on Math.random at runtime.
          dx = (((i * 31 + j) % 7) - 3) * 0.1 || 0.1
          dy = (((i * 17 + j) % 5) - 2) * 0.1 || 0.1
          distSq = dx * dx + dy * dy
        }
        const dist = Math.sqrt(distSq)
        const force = repulsion / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy

        // Collision: hard-ish push when circles overlap.
        const minGap = a.radius + b.radius + 2
        if (dist < minGap) {
          const push = (minGap - dist) * 0.5
          const px = (dx / dist) * push
          const py = (dy / dist) * push
          a.vx -= px
          a.vy -= py
          b.vx += px
          b.vy += py
        }
      }
    }

    // Link springs.
    for (const link of links) {
      const s = nodes[link.source]
      const t = nodes[link.target]
      if (!s || !t) continue
      const dx = t.x - s.x
      const dy = t.y - s.y
      const dist = Math.sqrt(dx * dx + dy * dy) || MIN_DISTANCE
      const force = (dist - linkDistance) * linkStrength
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      s.vx += fx
      s.vy += fy
      t.vx -= fx
      t.vy -= fy
    }

    // Centre gravity.
    for (const node of nodes) {
      node.vx += (this.cx - node.x) * centerStrength
      node.vy += (this.cy - node.y) * centerStrength
    }

    // Integrate with cooling; pinned nodes hold position.
    const alpha = this.alpha
    for (const node of nodes) {
      if (node.fx !== null && node.fy !== null) {
        node.x = node.fx
        node.y = node.fy
        node.vx = 0
        node.vy = 0
        continue
      }
      node.vx *= damping
      node.vy *= damping
      node.x += node.vx * alpha
      node.y += node.vy * alpha
    }

    this.alpha *= 1 - params.alphaDecay
  }

  /** Run synchronously until settled (or `maxTicks`). For reduced-motion
   *  rendering and deterministic tests. */
  runToSettle(maxTicks = 600): void {
    let ticks = 0
    while (!this.settled && ticks < maxTicks) {
      this.tick()
      ticks++
    }
  }
}

/** Small, fast, seedable PRNG (mulberry32). Deterministic per seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface BuildSimulationOptions {
  width: number
  height: number
  /** 0..1 random source for initial placement; defaults to a fixed seed. */
  rng?: () => number
  params?: ForceParams
  /** Preserve positions for ids already laid out (mode/depth changes). */
  previous?: Map<
    string,
    { x: number; y: number; fx: number | null; fy: number | null }
  >
}

/**
 * Map a {@link GraphView} to a ready-to-tick {@link ForceSimulation}: degree
 * → radius, seeded radial initial placement, link indices resolved.
 */
export function buildSimulation(
  view: GraphView,
  options: BuildSimulationOptions,
): ForceSimulation {
  const { width, height } = options
  const rng = options.rng ?? mulberry32(0x5eed)
  const cx = width / 2
  const cy = height / 2
  const maxDegree = view.nodes.reduce((m, n) => Math.max(m, n.degree), 1)
  const spread = Math.min(width, height) * 0.42

  const indexById = new Map<string, number>()
  const nodes: SimNode[] = view.nodes.map((node, i) => {
    indexById.set(node.id, i)
    const prev = options.previous?.get(node.id)
    // Golden-angle spiral seeding gives an even initial spread, which the
    // forces resolve faster than uniform random clumps.
    const angle = i * 2.399963229728653
    const r = spread * Math.sqrt((i + 0.5) / view.nodes.length)
    const jitter = (rng() - 0.5) * 8
    return {
      id: node.id,
      x: prev?.x ?? cx + Math.cos(angle) * r + jitter,
      y: prev?.y ?? cy + Math.sin(angle) * r + jitter,
      vx: 0,
      vy: 0,
      fx: prev?.fx ?? null,
      fy: prev?.fy ?? null,
      radius: radiusForDegree(node.degree, maxDegree),
      degree: node.degree,
    }
  })

  const links: SimLink[] = []
  for (const edge of view.edges) {
    const source = indexById.get(edge.source)
    const target = indexById.get(edge.target)
    if (source !== undefined && target !== undefined) {
      links.push({ source, target })
    }
  }

  return new ForceSimulation(
    nodes,
    links,
    { x: cx, y: cy },
    options.params ?? DEFAULT_FORCE_PARAMS,
  )
}

export function radiusForDegree(degree: number, maxDegree: number): number {
  const t = Math.sqrt(degree / Math.max(1, maxDegree))
  return 3 + t * 9
}
