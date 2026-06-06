/**
 * Knowledge-graph data model.
 *
 * A {@link VaultGraph} is the *full* relationship graph of a vault: every
 * Markdown note that participates in at least one resolved `[[wikilink]]`,
 * plus the directed edges between them. It is built once per vault and
 * cached (see `build-graph.ts`); the UI never mutates it.
 *
 * Views are *derived* from the full graph via {@link GraphViewOptions}:
 *   - `global` — the whole graph, culled to the most-connected N nodes when
 *      it is larger than the cap.
 *   - `local`  — a breadth-first neighbourhood around one focus note, out to
 *      a given depth. This is the reading-centric mode: "what connects to
 *      the thing I'm reading right now."
 *
 * First cut scope (locked 2026-06-05): notes only. Tag nodes, unresolved
 * link placeholders, and attachment nodes are intentionally out of scope so
 * the map stays in service of reading rather than becoming a vanity starfield
 * (see docs/design/vision.md on Obsidian's graph view).
 */

import type { FolderColorId, VaultPath } from '@/core/vault'

/** The only node kind in the first cut. Reserved as a union so adding
 *  `'tag' | 'unresolved' | 'attachment'` later is a non-breaking widening. */
export type GraphNodeKind = 'note'

export interface GraphNode {
  /** Resolved vault path — unique within the graph; also the React key. */
  id: VaultPath
  /** Basename without extension, for labels. */
  label: string
  kind: GraphNodeKind
  /** in + out — drives node radius and degree-based culling. */
  degree: number
  inDegree: number
  outDegree: number
  /** Top-level folder segment (`""` for a root-level note). */
  section: string
  /** Stable palette id derived from {@link section} — drives node colour. */
  colorId: FolderColorId
}

export interface GraphEdge {
  source: VaultPath
  target: VaultPath
}

export interface VaultGraph {
  /** Every connected note, uncapped. Insertion order = walk order. */
  nodes: GraphNode[]
  /** Directed, de-duplicated. `source` links to `target`. */
  edges: GraphEdge[]
  /** Undirected adjacency for local-graph BFS. Keyed by node id. */
  adjacency: Map<VaultPath, Set<VaultPath>>
  /** O(1) node lookup by id. */
  byId: Map<VaultPath, GraphNode>
  /** Order-independent structural fingerprint (sorted node ids + edge
   *  endpoints). Equal across rebuilds when nothing actually changed; lets
   *  `getVaultGraph` hand back a reference-stable object on a no-op refresh. */
  signature: string
}

export type GraphViewMode = 'global' | 'local'

export interface GraphViewOptions {
  mode: GraphViewMode
  /** Required for `local` mode — the note the neighbourhood is centred on. */
  focus?: VaultPath
  /** Local-mode BFS radius (hops). Ignored in global mode. */
  depth?: number
  /** Hard cap on rendered nodes (global mode culls by degree to this). */
  maxNodes?: number
}

export interface GraphView {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Nodes present in the full graph but omitted from this view (degree
   *  culling in global mode). 0 when nothing was dropped. */
  hiddenCount: number
  /** Total connected notes in the full graph, for "showing N of M" copy. */
  totalNodes: number
}

/** Default local-graph radius. One hop on each side of the focus note. */
export const DEFAULT_LOCAL_DEPTH = 1

/** Default global-view node cap. Above this, the SVG renderer and the
 *  O(n²) settle phase both start to feel heavy; degree culling keeps the
 *  most-connected hubs, which is what users actually came to see. */
export const DEFAULT_MAX_NODES = 600
