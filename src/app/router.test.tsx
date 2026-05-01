import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from './router'

/**
 * Mount the production route tree at a given path.
 *
 * Imports `routes` from `./router` directly — there is NO parallel route tree
 * in tests. If `router.tsx` changes the tree, these tests run against the new
 * tree automatically. The browser-vs-memory difference is only the history
 * adapter; route resolution is identical.
 */
function renderAt(path: string) {
  const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={memoryRouter} />)
}

describe('production route tree', () => {
  it('exposes exactly two top-level routes', () => {
    expect(routes).toHaveLength(2)
    expect(routes.map((r) => r.path)).toEqual(['/', '/app'])
  })

  it('exposes /app with the expected children', () => {
    const app = routes.find((r) => r.path === '/app')
    expect(
      app?.children?.map((c) => ('index' in c ? '<index>' : c.path)),
    ).toEqual(['<index>', ':vaultId', ':vaultId/*'])
  })

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
    expect(screen.getByText(/vault home/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /my-knowledge/i }),
    ).toBeInTheDocument()
    // Unregistered vault shows the missing-state message
    expect(
      screen.getByText(/not registered in the current session/i),
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
