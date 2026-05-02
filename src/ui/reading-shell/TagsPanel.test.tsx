import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { TagsPanel } from './TagsPanel'
import { __resetTagIndexCacheForTests } from './tag-index-cache'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import { useTagStore } from '@/stores/tag-store'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { __resetDbForTests } from '@/core/persistence/db'

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetTagIndexCacheForTests()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
  })
  useTagStore.setState({ selectedTag: null })
})

afterEach(() => {
  useTagStore.setState({ selectedTag: null })
})

async function registerVault(
  id: string,
  tree: Parameters<typeof mockRoot>[1],
): Promise<FSAPIVaultAdapter> {
  const root = mockRoot('vault', tree)
  const adapter = FSAPIVaultAdapter.fromHandle(root, { id, name: 'vault' })
  await useVaultStore.getState().registerVault(adapter)
  return adapter
}

function PanelHarness({ vaultId }: { vaultId: string }) {
  return (
    <div>
      <Outlet />
      <TagsPanel vaultId={vaultId} />
    </div>
  )
}

function renderPanel(vaultId: string, atPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/app/:vaultId',
        element: <PanelHarness vaultId={vaultId} />,
        children: [
          { index: true, element: <div data-testid="vault-home-stub" /> },
          { path: '*', element: <div data-testid="doc-stub" /> },
        ],
      },
    ],
    { initialEntries: [atPath] },
  )
  return render(<RouterProvider router={router} />)
}

describe('TagsPanel (M3.14)', () => {
  it('does not render anything when no tag is selected', async () => {
    await registerVault('v', { 'a.md': '# A\n\n#shared' })
    renderPanel('v', '/app/v')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens with the selected tag and lists matching files', async () => {
    await registerVault('v', {
      'a.md': '# A\n\n#shared and #onlyA',
      'b.md': '# B\n\n#shared',
      'c.md': '#unrelated',
    })

    renderPanel('v', '/app/v')
    useTagStore.getState().selectTag('shared')

    // Radix sets aria-labelledby from <Dialog.Title> (the tag value),
    // so the dialog's accessible name is the tag itself.
    const dialog = await screen.findByRole('dialog', { name: 'shared' })
    expect(
      dialog.querySelector('.swilread-tags-panel__title'),
    ).toHaveTextContent('shared')
    // Both `a.md` and `b.md` are listed; `c.md` is not.
    const links = await waitFor(() => {
      const ls = dialog.querySelectorAll('a.swilread-tags-panel__link')
      expect(ls.length).toBe(2)
      return ls
    })
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'))
    expect(hrefs.sort()).toEqual(['/app/v/a.md', '/app/v/b.md'].sort())
  })

  it('navigates to the file and clears selectedTag on selection', async () => {
    const user = userEvent.setup()
    await registerVault('v', { 'a.md': '#shared', 'b.md': '#shared' })

    renderPanel('v', '/app/v')
    useTagStore.getState().selectTag('shared')

    const dialog = await screen.findByRole('dialog')
    const link = await waitFor(() => {
      const ls = dialog.querySelectorAll('a.swilread-tags-panel__link')
      expect(ls.length).toBeGreaterThan(0)
      return ls[0] as HTMLElement
    })
    await user.click(link)

    await waitFor(() => {
      expect(screen.getByTestId('doc-stub')).toBeInTheDocument()
    })
    expect(useTagStore.getState().selectedTag).toBeNull()
  })

  it('shows an empty-state when no files match', async () => {
    await registerVault('v', { 'a.md': '#other' })
    renderPanel('v', '/app/v')
    useTagStore.getState().selectTag('nonexistent')

    expect(
      await screen.findByText(/no files in this vault use #nonexistent/i),
    ).toBeInTheDocument()
  })

  it('closes on Escape and clears selectedTag', async () => {
    const user = userEvent.setup()
    await registerVault('v', { 'a.md': '#shared' })

    renderPanel('v', '/app/v')
    useTagStore.getState().selectTag('shared')

    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(useTagStore.getState().selectedTag).toBeNull()
    })
  })
})
