/**
 * Legacy sidebar-graph adapter.
 *
 * The authoritative graph builder now lives in `@/core/graph`. This module
 * stays as a thin, backward-compatible shim for the in-sidebar mini-graph
 * (`GraphView.tsx`): it returns a degree-culled global view in the small
 * `{ nodes, edges }` shape that component already consumes, and re-exports
 * the shared cache invalidator so the vault-store fan-out keeps one entry.
 *
 * New surfaces should import from `@/core/graph` directly.
 */

import type { VaultFileSystem, VaultPath } from '@/core/vault'
import {
  getVaultGraph as getFullVaultGraph,
  invalidateVaultGraph,
  selectGraphView,
} from '@/core/graph'

export { invalidateVaultGraph }

export interface GraphNode {
  id: VaultPath
  label: string
  degree: number
}

export interface GraphEdge {
  source: VaultPath
  target: VaultPath
}

export interface VaultGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Sidebar mini-graph cap — small enough that the synchronous layout in
 *  the legacy `GraphView` stays snappy. */
const SIDEBAR_MAX_NODES = 250

export async function getVaultGraph(
  vault: VaultFileSystem,
): Promise<VaultGraph> {
  const full = await getFullVaultGraph(vault)
  const view = selectGraphView(full, {
    mode: 'global',
    maxNodes: SIDEBAR_MAX_NODES,
  })
  return {
    nodes: view.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      degree: n.degree,
    })),
    edges: view.edges.map((e) => ({ source: e.source, target: e.target })),
  }
}
