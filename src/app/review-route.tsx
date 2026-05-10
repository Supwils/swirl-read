/**
 * Lazy ReviewPage wrapper, isolated from `router.tsx` so the router
 * file only exports route data — `react-refresh/only-export-components`
 * fails when a single file mixes component and non-component exports.
 */

import { lazy, Suspense, type ReactNode } from 'react'

const ReviewPage = lazy(() =>
  import('@/ui/review/ReviewPage').then((m) => ({ default: m.ReviewPage })),
)

export function LazyReviewPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <ReviewPage />
    </Suspense>
  )
}
