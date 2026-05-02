import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { VaultSwitcher } from './VaultSwitcher'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'
import { __resetDbForTests } from '@/core/persistence/db'

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  useVaultStore.setState({
    registeredVaults: [
      {
        id: 'va',
        name: 'Vault Alpha',
        registeredAt: new Date(0),
        lastOpenedAt: new Date(0),
      },
      {
        id: 'vb',
        name: 'Vault Beta',
        registeredAt: new Date(0),
        lastOpenedAt: new Date(0),
      },
    ],
    activeVaultId: null,
    ready: true,
  })
})

afterEach(() => {
  __resetAdaptersForTests()
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/app/:vaultId',
        element: (
          <div>
            <VaultSwitcher />
            <Outlet />
          </div>
        ),
        children: [{ index: true, element: <div data-testid="vault-stub" /> }],
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('VaultSwitcher (M6.1)', () => {
  it('shows the active vault name in the trigger', () => {
    renderAt('/app/va')
    expect(
      screen.getByRole('button', { name: /switch vault/i }),
    ).toHaveTextContent('Vault Alpha')
  })

  it('opens the menu and lists every registered vault', async () => {
    const user = userEvent.setup()
    renderAt('/app/va')

    await user.click(screen.getByRole('button', { name: /switch vault/i }))

    const menu = screen.getByRole('menu', { name: /registered vaults/i })
    const items = menu.querySelectorAll('[role="menuitem"]')
    // 2 vaults + 1 "Open another vault" CTA
    expect(items.length).toBe(3)
    expect(menu.textContent).toContain('Vault Alpha')
    expect(menu.textContent).toContain('Vault Beta')
    expect(menu.textContent).toMatch(/open another vault/i)
  })

  it('marks the current vault with the active class', async () => {
    const user = userEvent.setup()
    renderAt('/app/vb')

    await user.click(screen.getByRole('button', { name: /switch vault/i }))

    const beta = screen.getByRole('menuitem', { name: /vault beta/i })
    expect(beta.className).toContain('is-active')
  })

  it('navigates when a different vault is selected', async () => {
    const user = userEvent.setup()
    renderAt('/app/va')

    await user.click(screen.getByRole('button', { name: /switch vault/i }))
    await user.click(screen.getByRole('menuitem', { name: /vault beta/i }))

    await waitFor(() => {
      // Trigger should now read "Vault Beta" because the route param flipped.
      expect(
        screen.getByRole('button', { name: /switch vault/i }),
      ).toHaveTextContent('Vault Beta')
    })
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderAt('/app/va')

    await user.click(screen.getByRole('button', { name: /switch vault/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })
})
