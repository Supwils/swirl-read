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
    ).toEqual(['<index>', ':vaultId'])
    // The vaultId route now wraps a layout (VaultLayout) with its own
    // index (VaultHome) and splat child (DocumentPage).
    const vaultRoute = app?.children?.find(
      (c) => !('index' in c) && c.path === ':vaultId',
    )
    expect(
      (vaultRoute && 'children' in vaultRoute ? vaultRoute.children : [])?.map(
        (c) => ('index' in c ? '<index>' : c.path),
      ),
    ).toEqual(['<index>', '*'])
  })

  it('renders LandingPage at /', () => {
    renderAt('/')
    expect(
      screen.getByRole('heading', { level: 1, name: /swirlread/i }),
    ).toBeInTheDocument()
  })

  it('renders AppShell with no-vault placeholder at /app', () => {
    renderAt('/app')
    expect(screen.getByText(/no vault selected/i)).toBeInTheDocument()
    // AppShell header contains the SwirlRead wordmark + settings trigger
    expect(screen.getByRole('link', { name: /swirlread/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /open settings/i }),
    ).toBeInTheDocument()
  })

  it('renders VaultHome with vaultId at /app/:vaultId', async () => {
    renderAt('/app/my-knowledge')
    // Unregistered vault shows the M6.3 reauthorize prompt with the
    // vault id as the heading. The 'no-handle' branch resolves
    // asynchronously after listHandleIds().
    expect(
      await screen.findByRole('heading', { level: 2, name: /my-knowledge/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/no saved handle for this vault/i),
    ).toBeInTheDocument()
  })

  it('renders DocumentPage with file path at /app/:vaultId/*', async () => {
    renderAt('/app/my-knowledge/career/me/me.md')
    // Vault not registered → DocumentPage shows the M6.3 reauthorize prompt
    // (the heading repeats the vault id alongside the page header).
    expect(
      await screen.findByRole('heading', { level: 2, name: /my-knowledge/i }),
    ).toBeInTheDocument()
    // The file path appears in the document page header.
    expect(screen.getByText('career/me/me.md')).toBeInTheDocument()
  })
})
