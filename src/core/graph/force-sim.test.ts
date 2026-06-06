import { describe, it, expect } from 'vitest'
import { buildSimulation, mulberry32, radiusForDegree } from './force-sim'
import type { ForceSimulation } from './force-sim'
import type { GraphView } from './graph-types'

function view(): GraphView {
  return {
    nodes: [mkNode('a', 3), mkNode('b', 1), mkNode('c', 1), mkNode('d', 1)],
    edges: [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'a', target: 'd' },
    ],
    hiddenCount: 0,
    totalNodes: 4,
  }
}

function mkNode(id: string, degree: number) {
  return {
    id,
    label: id.toUpperCase(),
    kind: 'note' as const,
    degree,
    inDegree: degree,
    outDegree: 0,
    section: '',
    colorId: 'knowledge' as const,
  }
}

function dist(sim: ForceSimulation, a: string, b: string): number {
  const na = sim.nodes.find((n) => n.id === a)!
  const nb = sim.nodes.find((n) => n.id === b)!
  return Math.hypot(na.x - nb.x, na.y - nb.y)
}

describe('mulberry32', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('radiusForDegree', () => {
  it('grows with degree and stays bounded', () => {
    expect(radiusForDegree(0, 10)).toBeGreaterThanOrEqual(3)
    expect(radiusForDegree(10, 10)).toBeGreaterThan(radiusForDegree(1, 10))
    expect(radiusForDegree(10, 10)).toBeLessThanOrEqual(12)
  })
})

describe('buildSimulation', () => {
  it('maps nodes with radii and resolves links by index', () => {
    const sim = buildSimulation(view(), { width: 800, height: 600 })
    expect(sim.nodes).toHaveLength(4)
    expect(sim.links).toHaveLength(3)
    for (const node of sim.nodes) expect(node.radius).toBeGreaterThan(0)
    for (const link of sim.links) {
      expect(sim.nodes[link.source]).toBeDefined()
      expect(sim.nodes[link.target]).toBeDefined()
    }
  })

  it('lays out deterministically for a fixed seed', () => {
    const a = buildSimulation(view(), { width: 800, height: 600 })
    const b = buildSimulation(view(), { width: 800, height: 600 })
    a.runToSettle()
    b.runToSettle()
    for (let i = 0; i < a.nodes.length; i++) {
      expect(a.nodes[i]!.x).toBeCloseTo(b.nodes[i]!.x, 5)
      expect(a.nodes[i]!.y).toBeCloseTo(b.nodes[i]!.y, 5)
    }
  })

  it('preserves positions for ids carried over from a previous layout', () => {
    const previous = new Map<
      string,
      { x: number; y: number; fx: number | null; fy: number | null }
    >([['a', { x: 123, y: 456, fx: 123, fy: 456 }]])
    const sim = buildSimulation(view(), { width: 800, height: 600, previous })
    const a = sim.nodes.find((n) => n.id === 'a')!
    expect(a.x).toBe(123)
    expect(a.y).toBe(456)
    expect(a.fx).toBe(123)
  })
})

describe('ForceSimulation', () => {
  it('settles and keeps positions finite', () => {
    const sim = buildSimulation(view(), { width: 800, height: 600 })
    sim.runToSettle()
    expect(sim.settled).toBe(true)
    for (const node of sim.nodes) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
  })

  it('pulls linked nodes nearer than the layout diameter', () => {
    const sim = buildSimulation(view(), { width: 800, height: 600 })
    sim.runToSettle()
    // The hub "a" links to b, c, d. Each spoke should sit within a sane
    // multiple of the rest length, not flung to the canvas edge.
    expect(dist(sim, 'a', 'b')).toBeLessThan(300)
    expect(dist(sim, 'a', 'c')).toBeLessThan(300)
    expect(dist(sim, 'a', 'd')).toBeLessThan(300)
  })

  it('holds a pinned node at its fixed position', () => {
    const sim = buildSimulation(view(), { width: 800, height: 600 })
    const a = sim.nodes.find((n) => n.id === 'a')!
    a.fx = 400
    a.fy = 300
    sim.runToSettle()
    expect(a.x).toBe(400)
    expect(a.y).toBe(300)
  })

  it('reheat raises alpha so a settled layout can move again', () => {
    const sim = buildSimulation(view(), { width: 800, height: 600 })
    sim.runToSettle()
    expect(sim.settled).toBe(true)
    sim.reheat(0.8)
    expect(sim.settled).toBe(false)
    sim.tick()
    expect(sim.alpha).toBeLessThan(0.8)
  })
})
