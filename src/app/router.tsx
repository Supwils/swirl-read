import { createBrowserRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { AppShell } from '@/app/AppShell'
import { LazyChatPage } from '@/app/chat-route'
import { ErrorFallback } from '@/app/ErrorFallback'
import { LazyReviewPage } from '@/app/review-route'
import { LandingPage } from '@/ui/landing/LandingPage'
import { NoVaultSelected } from '@/ui/reading-shell/NoVaultSelected'
import { VaultLayout } from '@/ui/reading-shell/VaultLayout'
import { VaultHome } from '@/ui/reading-shell/VaultHome'
import { DocumentPage } from '@/ui/reading-shell/DocumentPage'

/**
 * Single source of truth for the route tree.
 *
 * Production exports {@link router} (browser instance);
 * tests use {@link createMemoryRouter} with this same array.
 * Never duplicate this tree in test code.
 *
 * Hierarchy:
 *   /                      → LandingPage
 *   /app                   → AppShell (header + theme switcher + sidebar toggle)
 *     index                → NoVaultSelected
 *     :vaultId             → VaultLayout (file-tree sidebar + outlet)
 *       index              → VaultHome
 *       *                  → DocumentPage
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <LandingPage />,
    errorElement: <ErrorFallback />,
  },
  {
    path: '/app',
    element: <AppShell />,
    // Top-level errorElement catches anything inside the shell. The
    // shell itself stays mounted (so chrome remains) because react-router
    // renders the errorElement INSIDE the route, not in place of it.
    errorElement: <ErrorFallback />,
    children: [
      { index: true, element: <NoVaultSelected /> },
      {
        path: ':vaultId',
        element: <VaultLayout />,
        // Per-vault errorElement so a single broken document doesn't
        // tear down the file-tree sidebar — the layout stays mounted.
        errorElement: <ErrorFallback />,
        children: [
          { index: true, element: <VaultHome /> },
          // Review-page route is more specific than the catch-all
          // below; react-router ranks by specificity, but listing it
          // first also aids readability.
          { path: '__chat__', element: <LazyChatPage /> },
          { path: '__chat__/:sessionId', element: <LazyChatPage /> },
          { path: '__review__/:batchId', element: <LazyReviewPage /> },
          { path: '*', element: <DocumentPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
