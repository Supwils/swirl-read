import { describe, it, expect, beforeEach } from 'vitest'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import {
  getVaultGraph,
  invalidateVaultGraph,
  selectGraphView,
  __resetGraphCacheForTests,
} from './build-graph'
import type { VaultGraph } from './graph-types'

function makeVault(id: string) {
  const root = mockRoot('vault', {
    'A.md': 'links to [[B]] and [[C]]',
    'B.md': 'see [[C]]',
    'C.md': 'a leaf note, no links',
    'D.md': 'back to [[A]]',
    'orphan.md': 'nobody links here and it links nowhere',
    notes: {
      'E.md': 'mentions [[A]] in a deep folder',
    },
  })
  return FSAPIVaultAdapter.fromHandle(root, { id, name: id })
}

let graph: VaultGraph

beforeEach(async () => {
  __resetGraphCacheForTests()
  graph = await getVaultGraph(makeVault('graph-vault'))
})

describe('buildVaultGraph', () => {
  it('includes only connected notes (orphans excluded)', () => {
    const ids = graph.nodes.map((n) => n.id).sort()
    expect(ids).toEqual(['A.md', 'B.md', 'C.md', 'D.md', 'notes/E.md'])
  })

  it('builds directed, de-duplicated edges from resolved wikilinks', () => {
    const keys = graph.edges.map((e) => `${e.source}->${e.target}`).sort()
    expect(keys).toEqual([
      'A.md->B.md',
      'A.md->C.md',
      'B.md->C.md',
      'D.md->A.md',
      'notes/E.md->A.md',
    ])
  })

  it('computes in/out/total degree per node', () => {
    const a = graph.byId.get('A.md')!
    expect(a.outDegree).toBe(2) // → B, C
    expect(a.inDegree).toBe(2) // ← D, E
    expect(a.degree).toBe(4)
    const c = graph.byId.get('C.md')!
    expect(c.inDegree).toBe(2)
    expect(c.outDegree).toBe(0)
  })

  it('builds an undirected adjacency map', () => {
    expect([...graph.adjacency.get('A.md')!].sort()).toEqual([
      'B.md',
      'C.md',
      'D.md',
      'notes/E.md',
    ])
    expect([...graph.adjacency.get('D.md')!]).toEqual(['A.md'])
  })

  it('derives label + section + colorId', () => {
    const e = graph.byId.get('notes/E.md')!
    expect(e.label).toBe('E')
    expect(e.section).toBe('notes')
    expect(e.colorId).toBeTypeOf('string')
  })

  it('memoises per vault and invalidates', async () => {
    const vault = makeVault('memo-vault')
    const first = getVaultGraph(vault)
    const second = getVaultGraph(vault)
    expect(first).toBe(second) // same in-flight/cached promise
    invalidateVaultGraph('memo-vault')
    const third = getVaultGraph(vault)
    expect(third).not.toBe(first)
    await Promise.all([first, third])
  })
})

describe('selectGraphView — global', () => {
  it('returns the whole graph when under the cap', () => {
    const view = selectGraphView(graph, { mode: 'global', maxNodes: 100 })
    expect(view.nodes.length).toBe(5)
    expect(view.hiddenCount).toBe(0)
    expect(view.totalNodes).toBe(5)
  })

  it('culls to the most-connected nodes when over the cap', () => {
    const view = selectGraphView(graph, { mode: 'global', maxNodes: 3 })
    const kept = view.nodes.map((n) => n.id).sort()
    // A(4) is the top hub; B(2) and C(2) tie and break by id.
    expect(kept).toEqual(['A.md', 'B.md', 'C.md'])
    expect(view.hiddenCount).toBe(2)
    // Edges with a culled endpoint are dropped.
    for (const edge of view.edges) {
      expect(kept).toContain(edge.source)
      expect(kept).toContain(edge.target)
    }
  })
})

describe('selectGraphView — local', () => {
  it('returns the focus note and its depth-1 neighbours', () => {
    const view = selectGraphView(graph, {
      mode: 'local',
      focus: 'D.md',
      depth: 1,
    })
    expect(view.nodes.map((n) => n.id).sort()).toEqual(['A.md', 'D.md'])
    expect(view.edges).toEqual([{ source: 'D.md', target: 'A.md' }])
  })

  it('expands the neighbourhood with depth', () => {
    const view = selectGraphView(graph, {
      mode: 'local',
      focus: 'D.md',
      depth: 2,
    })
    expect(view.nodes.length).toBe(5) // D → A → {B,C,E}
  })

  it('returns an empty view for a focus note absent from the graph', () => {
    const view = selectGraphView(graph, {
      mode: 'local',
      focus: 'orphan.md',
      depth: 2,
    })
    expect(view.nodes).toEqual([])
    expect(view.edges).toEqual([])
  })
})

function vaultWith(id: string, files: Record<string, string>) {
  return FSAPIVaultAdapter.fromHandle(mockRoot('vault', files), {
    id,
    name: id,
  })
}

describe('getVaultGraph — structural identity reuse (bug #1)', () => {
  it('returns the SAME object across a rebuild when content is unchanged', async () => {
    __resetGraphCacheForTests()
    const vault = vaultWith('reuse-vault', {
      'a.md': 'links to [[b]]',
      'b.md': 'leaf',
    })
    const first = await getVaultGraph(vault)
    // A content poll invalidates the cache then rebuilds.
    invalidateVaultGraph('reuse-vault')
    const second = await getVaultGraph(vault)
    expect(second).toBe(first) // reference-stable → no downstream churn
    expect(second.signature).toBe(first.signature)
  })

  it('returns a NEW object when a link actually changes', async () => {
    __resetGraphCacheForTests()
    const before = await getVaultGraph(
      vaultWith('chg-vault', { 'a.md': 'links to [[b]]', 'b.md': 'leaf' }),
    )
    invalidateVaultGraph('chg-vault')
    // Same vault id, new content (an extra link a → c).
    const after = await getVaultGraph(
      vaultWith('chg-vault', {
        'a.md': 'links to [[b]] and [[c]]',
        'b.md': 'leaf',
        'c.md': 'leaf',
      }),
    )
    expect(after).not.toBe(before)
    expect(after.signature).not.toBe(before.signature)
    expect(after.edges.length).toBe(2)
  })
})

describe('buildVaultGraph — paths with spaces (bug #3)', () => {
  it('keeps every distinct edge when file paths contain spaces', async () => {
    __resetGraphCacheForTests()
    const g = await getVaultGraph(
      vaultWith('space-vault', {
        'a b.md': 'links to [[c]]',
        'a.md': 'links to [[b c]]',
        'c.md': 'leaf',
        'b c.md': 'leaf',
      }),
    )
    const keys = g.edges.map((e) => `${e.source}->${e.target}`).sort()
    expect(keys).toEqual(['a b.md->c.md', 'a.md->b c.md'])
    expect(g.byId.get('a b.md')!.outDegree).toBe(1)
    expect(g.byId.get('a.md')!.outDegree).toBe(1)
  })
})
