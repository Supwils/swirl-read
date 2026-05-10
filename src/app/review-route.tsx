/**
 * Lazy ReviewPage wrapper, isolated from `router.tsx` so the router
 * file only exports route data — `react-refresh/only-export-components`
 * fails when a single file mixes component and non-component exports.
 */

import { lazy, type ReactNode } from 'react'
import { ChunkBoundary } from '@/ui/components/ChunkBoundary'

const ReviewPage = lazy(() =>
  import('@/ui/review/ReviewPage').then((m) => ({ default: m.ReviewPage })),
)

export function LazyReviewPage(): ReactNode {
  return (
    <ChunkBoundary label="review surface">
      <ReviewPage />
    </ChunkBoundary>
  )
}
