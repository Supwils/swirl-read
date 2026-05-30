import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { LandingPage } from './LandingPage'
import { useDialogStore } from '@/stores/dialog-store'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'
import { __resetDbForTests } from '@/core/persistence/db'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('LandingPage', () => {
  beforeEach(async () => {
    await __resetDbForTests()
    __resetAdaptersForTests()
    useVaultStore.setState({
      registeredVaults: [],
      activeVaultId: null,
      ready: true,
    })
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    __resetAdaptersForTests()
  })

  it('renders the brand wordmark', () => {
    renderWithRouter(<LandingPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: /swirlread/i }),
    ).toBeInTheDocument()
  })

  it('renders the primary tagline', () => {
    renderWithRouter(<LandingPage />)
    expect(
      screen.getByText(/read your knowledge\. beautifully\./i),
    ).toBeInTheDocument()
  })

  it('renders the supporting tagline', () => {
    renderWithRouter(<LandingPage />)
    expect(
      screen.getByText(/a reading sanctuary for the ai era\./i),
    ).toBeInTheDocument()
  })

  it('renders both CTAs (M8.3: sample vault now enabled)', () => {
    renderWithRouter(<LandingPage />)
    const sampleBtn = screen.getByRole('button', {
      name: /try with sample vault/i,
    })
    const openBtn = screen.getByRole('button', { name: /open my vault/i })
    expect(sampleBtn).not.toBeDisabled()
    expect(openBtn).not.toBeDisabled()
  })

  it('does not show the FolderPicker by default', () => {
    renderWithRouter(<LandingPage />)
    expect(
      screen.queryByRole('heading', { name: /open your vault/i }),
    ).not.toBeInTheDocument()
  })

  it('opens the FolderPicker when "Open my vault" is clicked', async () => {
    renderWithRouter(<LandingPage />)
    await userEvent.click(
      screen.getByRole('button', { name: /open my vault/i }),
    )
    expect(
      await screen.findByRole('heading', { name: /open your vault/i }),
    ).toBeInTheDocument()
  })

  it('registers the sample vault when "Try with sample vault" is clicked (M8.3)', async () => {
    renderWithRouter(<LandingPage />)
    await userEvent.click(
      screen.getByRole('button', { name: /try with sample vault/i }),
    )
    // The store's registerVault is async; flush by waiting for state update.
    await new Promise((resolve) => setTimeout(resolve, 10))
    const ids = useVaultStore.getState().registeredVaults.map((v) => v.id)
    expect(ids).toContain('sample-reading-in-the-age-of-ai')
  })

  describe('returning user state (M6.4)', () => {
    it('shows the recents list when vaults are registered', () => {
      useVaultStore.setState({
        registeredVaults: [
          {
            id: 'va',
            name: 'Vault Alpha',
            registeredAt: new Date(0),
            lastOpenedAt: new Date(),
          },
          {
            id: 'vb',
            name: 'Vault Beta',
            registeredAt: new Date(0),
            lastOpenedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
          },
        ],
        activeVaultId: null,
        ready: true,
      })

      renderWithRouter(<LandingPage />)

      expect(screen.getByText('Your vaults')).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /vault alpha/i }),
      ).toHaveAttribute('href', '/app/va')
      expect(screen.getByRole('link', { name: /vault beta/i })).toHaveAttribute(
        'href',
        '/app/vb',
      )
    })

    it('hides the fresh-user CTAs when vaults exist', () => {
      useVaultStore.setState({
        registeredVaults: [
          {
            id: 'va',
            name: 'Vault Alpha',
            registeredAt: new Date(0),
            lastOpenedAt: new Date(),
          },
        ],
        activeVaultId: null,
        ready: true,
      })

      renderWithRouter(<LandingPage />)

      expect(
        screen.queryByRole('button', { name: /try with sample vault/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /open my vault/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /open another vault/i }),
      ).toBeInTheDocument()
    })

    it('exposes a remove button for each recent vault that removes it after confirmation', async () => {
      useVaultStore.setState({
        registeredVaults: [
          {
            id: 'va',
            name: 'Vault Alpha',
            registeredAt: new Date(0),
            lastOpenedAt: new Date(),
          },
          {
            id: 'vb',
            name: 'Vault Beta',
            registeredAt: new Date(0),
            lastOpenedAt: new Date(),
          },
        ],
        activeVaultId: null,
        ready: true,
      })

      renderWithRouter(<LandingPage />)

      const removeBtn = screen.getByRole('button', {
        name: /remove vault alpha from your vaults/i,
      })
      await userEvent.click(removeBtn)

      expect(useDialogStore.getState().confirmPayload?.title).toMatch(
        /remove vault/i,
      )

      useDialogStore.getState().answerConfirmation(true)

      await vi.waitFor(() => {
        expect(
          useVaultStore.getState().registeredVaults.map((v) => v.id),
        ).toEqual(['vb'])
      })
    })

    it('keeps the vault when the user cancels the confirmation', async () => {
      useVaultStore.setState({
        registeredVaults: [
          {
            id: 'va',
            name: 'Vault Alpha',
            registeredAt: new Date(0),
            lastOpenedAt: new Date(),
          },
        ],
        activeVaultId: null,
        ready: true,
      })

      renderWithRouter(<LandingPage />)

      await userEvent.click(
        screen.getByRole('button', {
          name: /remove vault alpha from your vaults/i,
        }),
      )
      useDialogStore.getState().answerConfirmation(false)

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(
        useVaultStore.getState().registeredVaults.map((v) => v.id),
      ).toEqual(['va'])
    })

    it('caps the recents list at 5 entries', () => {
      useVaultStore.setState({
        registeredVaults: Array.from({ length: 8 }, (_, i) => ({
          id: `v${String(i)}`,
          name: `Vault ${String(i)}`,
          registeredAt: new Date(0),
          lastOpenedAt: new Date(0),
        })),
        activeVaultId: null,
        ready: true,
      })

      renderWithRouter(<LandingPage />)

      const list = screen
        .getByText('Your vaults')
        .parentElement?.querySelectorAll('a')
      expect(list?.length).toBe(5)
    })

    it('shows an overflow hint when more vaults are hidden', () => {
      useVaultStore.setState({
        registeredVaults: Array.from({ length: 8 }, (_, i) => ({
          id: `v${String(i)}`,
          name: `Vault ${String(i)}`,
          registeredAt: new Date(0),
          lastOpenedAt: new Date(0),
        })),
        activeVaultId: null,
        ready: true,
      })

      renderWithRouter(<LandingPage />)

      expect(
        screen.getByText(/\+ 3 more vaults not shown/i),
      ).toBeInTheDocument()
    })

    it('omits the overflow hint when the list is not truncated', () => {
      useVaultStore.setState({
        registeredVaults: Array.from({ length: 3 }, (_, i) => ({
          id: `v${String(i)}`,
          name: `Vault ${String(i)}`,
          registeredAt: new Date(0),
          lastOpenedAt: new Date(0),
        })),
        activeVaultId: null,
        ready: true,
      })

      renderWithRouter(<LandingPage />)

      expect(
        screen.queryByText(/more vaults? not shown/i),
      ).not.toBeInTheDocument()
    })
  })
})
