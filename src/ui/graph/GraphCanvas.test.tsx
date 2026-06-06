import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { GraphCanvas } from './GraphCanvas'
import type { GraphNode, GraphView } from '@/core/graph'

function node(id: string, label: string, degree: number): GraphNode {
  return {
    id,
    label,
    kind: 'note',
    degree,
    inDegree: degree,
    outDegree: 0,
    section: '',
    colorId: 'knowledge',
  }
}

function makeView(): GraphView {
  return {
    nodes: [node('a.md', 'A', 2), node('b.md', 'B', 1), node('c.md', 'C', 1)],
    edges: [
      { source: 'a.md', target: 'b.md' },
      { source: 'a.md', target: 'c.md' },
    ],
    hiddenCount: 0,
    totalNodes: 3,
  }
}

afterEach(() => {
  cleanup()
})

describe('GraphCanvas', () => {
  it('renders one circle per node and one line per edge', () => {
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('.swirlread-graphmap__dot')).toHaveLength(
      3,
    )
    expect(
      container.querySelectorAll('.swirlread-graphmap__edge'),
    ).toHaveLength(2)
  })

  it('marks the current-path node', () => {
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    const current = container.querySelectorAll(
      '.swirlread-graphmap__node.is-current',
    )
    expect(current).toHaveLength(1)
  })

  it('opens a node on click (pointer down then up without a drag)', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={onOpen}
      />,
    )
    const svg = container.querySelector('.swirlread-graphmap__svg')!
    const nodes = container.querySelectorAll('.swirlread-graphmap__node')
    fireEvent.pointerDown(nodes[1]!) // B
    fireEvent.pointerUp(svg)
    expect(onOpen).toHaveBeenCalledWith('b.md', { newPane: false })
  })

  it('flags newPane on a ⌘/Ctrl-click', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={onOpen}
      />,
    )
    const svg = container.querySelector('.swirlread-graphmap__svg')!
    const nodes = container.querySelectorAll('.swirlread-graphmap__node')
    fireEvent.pointerDown(nodes[2]!) // C
    // jsdom's PointerEvent doesn't carry modifier keys through fireEvent's
    // pointer helpers, so dispatch a native event that does.
    fireEvent(
      svg,
      new MouseEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      }),
    )
    expect(onOpen).toHaveBeenCalledWith('c.md', { newPane: true })
  })

  it('exposes zoom controls', () => {
    const { getByLabelText } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    expect(getByLabelText('Zoom in')).toBeInTheDocument()
    expect(getByLabelText('Zoom out')).toBeInTheDocument()
    expect(getByLabelText('Reset view')).toBeInTheDocument()
  })

  // Regression for bug #2: id-keyed refs must never desync when the node set
  // changes (a file added/removed while the map is open). With the old
  // index-keyed ref arrays a surviving node could end up stuck at the origin.
  it('keeps every surviving node positioned after a middle node is removed', () => {
    // Reduced-motion → the sim settles synchronously, so positions are final.
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const full: GraphView = {
      nodes: [node('a.md', 'A', 2), node('b.md', 'B', 2), node('c.md', 'C', 2)],
      edges: [
        { source: 'a.md', target: 'b.md' },
        { source: 'b.md', target: 'c.md' },
        { source: 'a.md', target: 'c.md' },
      ],
      hiddenCount: 0,
      totalNodes: 3,
    }
    const { container, rerender } = render(
      <GraphCanvas
        view={full}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    // Remove the MIDDLE node so survivors shift index.
    const trimmed: GraphView = {
      nodes: [node('a.md', 'A', 1), node('c.md', 'C', 1)],
      edges: [{ source: 'a.md', target: 'c.md' }],
      hiddenCount: 0,
      totalNodes: 2,
    }
    rerender(
      <GraphCanvas
        view={trimmed}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    const gs = container.querySelectorAll('.swirlread-graphmap__node')
    expect(gs).toHaveLength(2)
    for (const g of gs) {
      const t = g.getAttribute('transform') ?? ''
      expect(t).toMatch(/^translate\(/)
      expect(t).not.toBe('translate(0,0)') // not stuck at the origin
    }
    vi.unstubAllGlobals()
  })

  // Compact mode (the document-foot LocalGraphPanel) renders the same node/edge
  // structure and still opens nodes on click — it only tunes layout + chrome.
  it('renders identical structure in compact mode and still opens nodes', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={onOpen}
        compact
      />,
    )
    expect(container.querySelectorAll('.swirlread-graphmap__dot')).toHaveLength(
      3,
    )
    expect(
      container.querySelectorAll('.swirlread-graphmap__edge'),
    ).toHaveLength(2)
    // The compact modifier is applied so CSS can shrink the zoom cluster.
    expect(
      container.querySelector('.swirlread-graphmap__canvas--compact'),
    ).not.toBeNull()

    const svg = container.querySelector('.swirlread-graphmap__svg')!
    const nodes = container.querySelectorAll('.swirlread-graphmap__node')
    fireEvent.pointerDown(nodes[1]!) // B
    fireEvent.pointerUp(svg)
    expect(onOpen).toHaveBeenCalledWith('b.md', { newPane: false })
  })

  // Feature B Phase B: two-finger pinch zooms toward the midpoint. The first
  // gesture frame establishes a baseline (no jump); the second, with the
  // fingers further apart, zooms in.
  //
  // jsdom's fireEvent pointer helpers drop clientX/clientY (same limitation
  // the ⌘-click test above works around), so we dispatch native PointerEvent
  // objects that carry the coordinates.
  it('pinch-zooms the world transform on a two-finger spread', () => {
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    const svg = container.querySelector('.swirlread-graphmap__svg')!
    const world = container.querySelector('.swirlread-graphmap__svg > g')!
    expect(world.getAttribute('transform')).toContain('scale(1)')

    // jsdom has no PointerEvent constructor, so build a MouseEvent (which
    // carries clientX/clientY) and attach a pointerId — React reads both off
    // the native event.
    const pointer = (type: string, pointerId: number, x: number, y: number) => {
      const ev = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      })
      Object.defineProperty(ev, 'pointerId', { value: pointerId })
      fireEvent(svg, ev)
    }

    // Two fingers down (distance 100).
    pointer('pointerdown', 1, 100, 100)
    pointer('pointerdown', 2, 200, 100)
    // First move establishes the pinch baseline — no zoom yet.
    pointer('pointermove', 2, 200, 100)
    // Spread the fingers apart (distance 200) → zoom in toward the midpoint.
    pointer('pointermove', 2, 300, 100)

    const t = world.getAttribute('transform') ?? ''
    const scale = Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? '1')
    expect(scale).toBeGreaterThan(1)

    pointer('pointerup', 1, 100, 100)
    pointer('pointerup', 2, 300, 100)
  })

  // Regression for bug #1: an in-place view change (a background content poll)
  // must NOT reset the user's pan/zoom.
  it('preserves pan/zoom across an in-place view change', () => {
    const { container, getByLabelText, rerender } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    fireEvent.click(getByLabelText('Zoom in'))
    const world = container.querySelector('.swirlread-graphmap__svg > g')
    const before = world?.getAttribute('transform')
    expect(before).toContain('scale(1.2)')
    // A new but structurally-equivalent view object (what a poll would pass).
    rerender(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    expect(world?.getAttribute('transform')).toBe(before)
  })

  // Regression for the embedded-panel scroll-hijack fix: full-window zooms on
  // plain wheel; compact only zooms with Ctrl/⌘ (plain wheel scrolls the page).
  it('zooms on a plain wheel in full-window mode', () => {
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
      />,
    )
    const svg = container.querySelector('.swirlread-graphmap__svg')!
    const world = container.querySelector('.swirlread-graphmap__svg > g')!
    fireEvent(
      svg,
      new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(world.getAttribute('transform')).toContain('scale(1.1')
  })

  it('does NOT zoom on a plain wheel in compact mode', () => {
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
        compact
      />,
    )
    const svg = container.querySelector('.swirlread-graphmap__svg')!
    const world = container.querySelector('.swirlread-graphmap__svg > g')!
    fireEvent(
      svg,
      new WheelEvent('wheel', {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(world.getAttribute('transform')).toContain('scale(1)')
  })

  it('zooms on Ctrl+wheel in compact mode', () => {
    const { container } = render(
      <GraphCanvas
        view={makeView()}
        vaultId="v"
        currentPath="a.md"
        onOpen={vi.fn()}
        compact
      />,
    )
    const svg = container.querySelector('.swirlread-graphmap__svg')!
    const world = container.querySelector('.swirlread-graphmap__svg > g')!
    fireEvent(
      svg,
      new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(world.getAttribute('transform')).toContain('scale(1.1')
  })
})
