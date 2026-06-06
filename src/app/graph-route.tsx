/**
 * Lazy GraphPage wrapper, isolated from `router.tsx` so the router file only
 * exports route data (`react-refresh/only-export-components`). The knowledge
 * map pulls in the force-sim + SVG canvas chunk; it should only load when the
 * user actually opens the graph.
 */

import { lazy, type ReactNode } from 'react'
import { ChunkBoundary } from '@/ui/components/ChunkBoundary'

const GraphPage = lazy(() =>
  import('@/ui/graph/GraphPage').then((m) => ({ default: m.GraphPage })),
)

export function LazyGraphPage(): ReactNode {
  return (
    <ChunkBoundary label="knowledge graph">
      <GraphPage />
    </ChunkBoundary>
  )
}
