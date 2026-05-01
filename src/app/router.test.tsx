import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AppShell } from '@/app/AppShell'
import { LandingPage } from '@/ui/landing/LandingPage'
import { NoVaultSelected } from '@/ui/reading-shell/NoVaultSelected'
import { VaultHome } from '@/ui/reading-shell/VaultHome'
import { DocumentPage } from '@/ui/reading-shell/DocumentPage'

const routes = [
  { path: '/', element: <LandingPage /> },
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

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

describe('router', () => {
  it('renders LandingPage at /', () => {
    renderAt('/')
    expect(
      screen.getByRole('heading', { level: 1, name: /swilread/i }),
    ).toBeInTheDocument()
  })

  it('renders AppShell with no-vault placeholder at /app', () => {
    renderAt('/app')
    expect(screen.getByText(/no vault selected/i)).toBeInTheDocument()
    expect(screen.getByText(/app shell · placeholder/i)).toBeInTheDocument()
  })

  it('renders VaultHome with vaultId at /app/:vaultId', () => {
    renderAt('/app/my-knowledge')
    expect(screen.getByText(/vault home · placeholder/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /my-knowledge/i }),
    ).toBeInTheDocument()
  })

  it('renders DocumentPage with file path at /app/:vaultId/*', () => {
    renderAt('/app/my-knowledge/career/me/me.md')
    expect(screen.getByText(/document page · placeholder/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /my-knowledge/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('career/me/me.md')).toBeInTheDocument()
  })
})
