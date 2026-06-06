/**
 * Knowledge-graph core — vault-relationship model, builder, and layout engine.
 *
 * Pure data + math; no React, no DOM. The UI layer (`@/ui/graph`) consumes
 * this to render the full-window knowledge map and the sidebar mini-graph.
 */

export type {
  GraphNode,
  GraphNodeKind,
  GraphEdge,
  VaultGraph,
  GraphView,
  GraphViewMode,
  GraphViewOptions,
} from './graph-types'
export { DEFAULT_LOCAL_DEPTH, DEFAULT_MAX_NODES } from './graph-types'

export {
  getVaultGraph,
  invalidateVaultGraph,
  selectGraphView,
  __resetGraphCacheForTests,
} from './build-graph'

export type {
  SimNode,
  SimLink,
  ForceParams,
  BuildSimulationOptions,
} from './force-sim'
export {
  ForceSimulation,
  DEFAULT_FORCE_PARAMS,
  buildSimulation,
  radiusForDegree,
  mulberry32,
} from './force-sim'
