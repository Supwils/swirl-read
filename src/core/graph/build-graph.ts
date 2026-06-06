/**
 * Build the full {@link VaultGraph} for a vault and derive views from it.
 *
 * Edges come from resolved `[[wikilinks]]` — the same extractor + resolver
 * the backlinks index uses, so the map and the backlinks panel always agree
 * on what links to what. A single `walk()` builds the wikilink index and
 * doubles as the file list; each file is then read once to extract its
 * outgoing links.
 *
 * The full graph is cached per vault (keyed by `VaultId`). Invalidation is
 * wired into the vault-store content-revision fan-out via
 * {@link invalidateVaultGraph}, alongside every other per-vault cache.
 */

import {
  folderColorId,
  isMarkdown,
  splitPath,
  type VaultFileSystem,
  type VaultId,
  type VaultPath,
} from '@/core/vault'
import { extractWikilinkReferences } from '@/core/navigation/backlinks'
import {
  buildWikilinkIndex,
  resolveWikilink,
} from '@/core/navigation/wikilink-resolver'
import { registerVaultDeletionHook } from '@/stores/vault-lifecycle'
import {
  DEFAULT_LOCAL_DEPTH,
  DEFAULT_MAX_NODES,
  type GraphEdge,
  type GraphNode,
  type GraphView,
  type GraphViewOptions,
  type VaultGraph,
} from './graph-types'

const graphCache = new Map<VaultId, Promise<VaultGraph>>()
// Last successfully-built graph per vault, retained across cache invalidation.
// A content re-poll always rebuilds (we can't know if files changed without
// walking), but when the rebuilt graph is structurally identical we hand back
// this SAME object so downstream identity-based memoisation (GraphPage
// `phase`/`view`, GraphCanvas sim) treats the poll as a no-op — no
// re-animation, no pan/zoom reset.
const lastBuilt = new Map<VaultId, VaultGraph>()

/** Full graph for a vault, memoised. Concurrent callers share one walk. */
export function getVaultGraph(vault: VaultFileSystem): Promise<VaultGraph> {
  const cached = graphCache.get(vault.id)
  if (cached) return cached
  const promise = buildVaultGraph(vault)
    .then((fresh) => {
      const prev = lastBuilt.get(vault.id)
      // Structurally unchanged → reuse the prior object (stable identity).
      const result = prev?.signature === fresh.signature ? prev : fresh
      lastBuilt.set(vault.id, result)
      return result
    })
    .catch((err: unknown) => {
      graphCache.delete(vault.id)
      throw err
    })
  graphCache.set(vault.id, promise)
  return promise
}

/** Drop the cached graph for one vault. Wired into the vault-store
 *  content-revision + removal fan-out. `lastBuilt` is deliberately kept here:
 *  it is the baseline used to detect "nothing actually changed" on the next
 *  rebuild, and is replaced whenever a structurally-different graph is built.
 *  The per-vault removal hook below clears it on vault deletion. */
export function invalidateVaultGraph(vaultId: VaultId): void {
  graphCache.delete(vaultId)
}

export function __resetGraphCacheForTests(): void {
  graphCache.clear()
  lastBuilt.clear()
}

// Own the per-vault graph caches: clear BOTH on vault removal so a deleted
// vault leaves no stale baseline behind. (A content refresh uses
// invalidateVaultGraph above, which intentionally preserves lastBuilt.)
registerVaultDeletionHook((vaultId) => {
  graphCache.delete(vaultId)
  lastBuilt.delete(vaultId)
})

async function buildVaultGraph(vault: VaultFileSystem): Promise<VaultGraph> {
  const wikilinkIndex = await buildWikilinkIndex(vault)

  const mdPaths = new Set<VaultPath>()
  for (const paths of wikilinkIndex.values()) {
    for (const path of paths) {
      if (isMarkdown(path)) mdPaths.add(path)
    }
  }

  // Outgoing edges per source note. Read each file once. A small worker pool
  // caps simultaneous reads so a large vault doesn't fan out thousands of
  // FSAPI handles at once (mirrors PebbleGarden's pool). Node order is built
  // later from `mdPaths`, so read-completion order does not affect the result.
  const outgoing = new Map<VaultPath, Set<VaultPath>>()
  const paths = Array.from(mdPaths)
  const READ_POOL = 8
  let cursor = 0
  const readWorker = async (): Promise<void> => {
    while (cursor < paths.length) {
      const path = paths[cursor++]!
      try {
        const raw = await vault.readText(path)
        const targets = new Set<VaultPath>()
        for (const ref of extractWikilinkReferences(raw)) {
          const resolved = resolveWikilink(ref.rawTarget, wikilinkIndex, path)
          if (resolved && resolved !== path && isMarkdown(resolved)) {
            targets.add(resolved)
          }
        }
        if (targets.size > 0) outgoing.set(path, targets)
      } catch {
        // Unreadable file — skip without failing the whole graph.
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(READ_POOL, paths.length) }, readWorker),
  )

  const inDegree = new Map<VaultPath, number>()
  const outDegree = new Map<VaultPath, number>()
  const adjacency = new Map<VaultPath, Set<VaultPath>>()
  const edges: GraphEdge[] = []

  const touch = (id: VaultPath): void => {
    if (!adjacency.has(id)) adjacency.set(id, new Set())
  }

  for (const [source, targets] of outgoing) {
    for (const target of targets) {
      // (source, target) pairs are already unique: each source is iterated
      // once and `targets` is a Set, so no string-keyed dedup is needed.
      edges.push({ source, target })
      outDegree.set(source, (outDegree.get(source) ?? 0) + 1)
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1)
      touch(source)
      touch(target)
      adjacency.get(source)!.add(target)
      adjacency.get(target)!.add(source)
    }
  }

  // Stable node order: walk order (insertion order of `mdPaths`), filtered
  // to nodes that ended up with at least one edge.
  const nodes: GraphNode[] = []
  const byId = new Map<VaultPath, GraphNode>()
  for (const id of mdPaths) {
    if (!adjacency.has(id)) continue
    const node = makeNode(id, inDegree.get(id) ?? 0, outDegree.get(id) ?? 0)
    nodes.push(node)
    byId.set(id, node)
  }
  // Targets that were linked-to but live outside `mdPaths` (e.g. a basename
  // that resolved to a path the walk never surfaced) still need a node so no
  // edge dangles. Rare, but keeps the graph internally consistent.
  for (const id of adjacency.keys()) {
    if (byId.has(id)) continue
    const node = makeNode(id, inDegree.get(id) ?? 0, outDegree.get(id) ?? 0)
    nodes.push(node)
    byId.set(id, node)
  }

  return {
    nodes,
    edges,
    adjacency,
    byId,
    signature: computeSignature(nodes, edges),
  }
}

/**
 * Order-independent structural fingerprint: sorted node ids + sorted edge
 * endpoints. Two builds with the same notes and links produce the same string
 * regardless of walk/read order, so a no-op refresh is detectable without
 * diffing whole arrays. djb2 over the joined keys keeps it O(n+e). The NUL
 * separator (`String.fromCharCode(0)`) can never appear in a vault path, so
 * boundaries are unambiguous.
 */
function computeSignature(nodes: GraphNode[], edges: GraphEdge[]): string {
  const sep = String.fromCharCode(0)
  const nodeKeys = nodes.map((n) => n.id).sort()
  const edgeKeys = edges.map((e) => e.source + sep + e.target).sort()
  let h = 5381
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0
    }
  }
  mix(`N:${String(nodes.length)};E:${String(edges.length)};`)
  for (const k of nodeKeys) mix(k + sep)
  for (const k of edgeKeys) mix(k + sep)
  return (h >>> 0).toString(36)
}

function makeNode(id: VaultPath, inDeg: number, outDeg: number): GraphNode {
  const section = splitPath(id)[0] ?? ''
  return {
    id,
    label: stripExtension(basenameOf(id)),
    kind: 'note',
    degree: inDeg + outDeg,
    inDegree: inDeg,
    outDegree: outDeg,
    section,
    colorId: folderColorId(id),
  }
}

/**
 * Derive a renderable view from a full graph. Pure — no I/O — so the UI can
 * re-derive cheaply whenever the user flips mode / depth / focus.
 */
export function selectGraphView(
  graph: VaultGraph,
  options: GraphViewOptions,
): GraphView {
  const totalNodes = graph.nodes.length
  if (options.mode === 'local') {
    return localView(graph, options.focus, options.depth ?? DEFAULT_LOCAL_DEPTH)
  }
  return globalView(graph, options.maxNodes ?? DEFAULT_MAX_NODES, totalNodes)
}

function globalView(
  graph: VaultGraph,
  maxNodes: number,
  totalNodes: number,
): GraphView {
  if (graph.nodes.length <= maxNodes) {
    return {
      nodes: graph.nodes,
      edges: graph.edges,
      hiddenCount: 0,
      totalNodes,
    }
  }
  // Cull to the most-connected nodes; degree is what makes a hub worth
  // seeing. Ties broken by id for determinism.
  const kept = [...graph.nodes]
    .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
    .slice(0, maxNodes)
  const keptIds = new Set(kept.map((n) => n.id))
  const edges = graph.edges.filter(
    (e) => keptIds.has(e.source) && keptIds.has(e.target),
  )
  return {
    nodes: kept,
    edges,
    hiddenCount: totalNodes - kept.length,
    totalNodes,
  }
}

function localView(
  graph: VaultGraph,
  focus: VaultPath | undefined,
  depth: number,
): GraphView {
  const totalNodes = graph.nodes.length
  const focusNode = focus ? graph.byId.get(focus) : undefined
  if (!focus || !focusNode) {
    // Focus note has no links (orphan) or isn't in the graph: show just it,
    // so the local view never goes blank on a real, open document.
    const soloNode: GraphNode | undefined = focusNode
    return {
      nodes: soloNode ? [soloNode] : [],
      edges: [],
      hiddenCount: 0,
      totalNodes,
    }
  }

  const visited = new Set<VaultPath>([focus])
  let frontier: VaultPath[] = [focus]
  for (let hop = 0; hop < Math.max(0, depth); hop++) {
    const next: VaultPath[] = []
    for (const id of frontier) {
      for (const neighbour of graph.adjacency.get(id) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour)
          next.push(neighbour)
        }
      }
    }
    if (next.length === 0) break
    frontier = next
  }

  const nodes = graph.nodes.filter((n) => visited.has(n.id))
  const edges = graph.edges.filter(
    (e) => visited.has(e.source) && visited.has(e.target),
  )
  return { nodes, edges, hiddenCount: 0, totalNodes }
}

function basenameOf(path: VaultPath): string {
  return path.split('/').at(-1) ?? path
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}
