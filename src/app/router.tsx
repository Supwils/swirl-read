import { createBrowserRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { AppShell } from '@/app/AppShell'
import { LandingPage } from '@/ui/landing/LandingPage'
import { NoVaultSelected } from '@/ui/reading-shell/NoVaultSelected'
import { VaultHome } from '@/ui/reading-shell/VaultHome'
import { DocumentPage } from '@/ui/reading-shell/DocumentPage'

/**
 * Single source of truth for the route tree.
 *
 * Production exports {@link router} (browser instance);
 * tests use {@link createMemoryRouter} with this same array.
 * Never duplicate this tree in test code.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <NoVaultSelected /> },
      { path: ':vaultId', element: <VaultHome /> },
      { path: ':vaultId/*', element: <DocumentPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
