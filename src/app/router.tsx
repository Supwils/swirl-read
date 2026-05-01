import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/app/AppShell'
import { LandingPage } from '@/ui/landing/LandingPage'
import { NoVaultSelected } from '@/ui/reading-shell/NoVaultSelected'
import { VaultHome } from '@/ui/reading-shell/VaultHome'
import { DocumentPage } from '@/ui/reading-shell/DocumentPage'

export const router = createBrowserRouter([
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
])
