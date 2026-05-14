import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { FileShelf } from './FileShelf'
import { SampleVaultAdapter } from '@/core/vault/sample-adapter'
import { __resetDbForTests } from '@/core/persistence/db'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'
import { useUIStore } from '@/stores/ui-store'
import { useReaderStore } from '@/stores/reader-store'
import { __resetFileTreeCacheForTests } from '@/ui/file-tree/file-tree-cache'

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetFileTreeCacheForTests()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
    adapterRevision: 0,
    contentRevisionByVault: {},
  })
  useUIStore.setState({
    shelfExpandedFolderId: null,
    useLegacyTree: false,
    ready: true,
  })
  useReaderStore.setState({
    recentByVault: {},
    scrollByVault: {},
    ready: true,
  })
})

afterEach(() => {
  __resetAdaptersForTests()
})

function renderShelf(vaultId: string, currentPath = '') {
  return render(
    <MemoryRouter initialEntries={[`/app/${vaultId}/${currentPath}`]}>
      <Routes>
        <Route
          path="/app/:vaultId/*"
          element={<FileShelf vaultId={vaultId} currentPath={currentPath} />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

async function registerAdapter(files: Record<string, string>) {
  const adapter = new SampleVaultAdapter({
    id: 'shelf-vault',
    name: 'Shelf Vault',
    files,
  })
  await useVaultStore.getState().registerVault(adapter)
  return adapter
}

describe('FileShelf', () => {
  it('renders vault name + folder list once the adapter resolves', async () => {
    const adapter = await registerAdapter({
      'knowledge/react.md': '#',
      'career/cv.md': '#',
      'reading/why.md': '#',
    })
    const { container } = renderShelf(adapter.id)
    expect(await screen.findByText('Shelf Vault')).toBeInTheDocument()
    await waitFor(() => {
      const rows = container.querySelectorAll<HTMLDivElement>(
        '.swirlread-file-shelf__folder-row[data-depth="0"]',
      )
      expect(rows.length).toBe(3)
      const names = Array.from(rows).map(
        (r) =>
          r.querySelector('.swirlread-file-shelf__folder-name')?.textContent,
      )
      expect(names).toEqual(['career', 'knowledge', 'reading'])
    })
  })

  it('chevron expands the row + persists the choice to ui-store', async () => {
    const adapter = await registerAdapter({
      'knowledge/react.md': '#',
      'knowledge/css.md': '#',
      'career/cv.md': '#',
    })
    renderShelf(adapter.id)
    const chevron = await screen.findByRole('button', {
      name: /expand knowledge/i,
    })
    await userEvent.click(chevron)
    await waitFor(() => {
      expect(useUIStore.getState().shelfExpandedFolderId).toBe('knowledge')
    })
    // Files inside the folder are now visible (react.md → 'react' name).
    expect(await screen.findByText('react')).toBeInTheDocument()
  })

  it('clicking the folder name navigates to the folder directory route', async () => {
    const adapter = await registerAdapter({
      'knowledge/react.md': '#',
      'career/cv.md': '#',
    })
    render(
      <MemoryRouter initialEntries={[`/app/${adapter.id}`]}>
        <Routes>
          <Route
            path="/app/:vaultId"
            element={<FileShelf vaultId={adapter.id} currentPath="" />}
          />
          <Route
            path="/app/:vaultId/*"
            element={<div data-testid="folder-page">directory route</div>}
          />
        </Routes>
      </MemoryRouter>,
    )
    // Folder name button has its title for tooltip but the accessible
    // name is just the visible folder name. Use it directly.
    const nameButton = await screen.findByRole('button', {
      name: 'knowledge',
    })
    await userEvent.click(nameButton)
    await waitFor(() => {
      expect(screen.getByTestId('folder-page')).toBeInTheDocument()
    })
  })

  it('renders Recently opened entries when reader-store has them', async () => {
    const adapter = await registerAdapter({
      'reading/why.md': '#',
    })
    useReaderStore.setState({
      recentByVault: {
        [adapter.id]: [
          {
            vaultId: adapter.id,
            path: 'reading/why.md',
            openedAt: new Date(),
          },
        ],
      },
      scrollByVault: {},
      ready: true,
    })
    renderShelf(adapter.id)
    expect(await screen.findByText(/recently opened/i)).toBeInTheDocument()
    expect(await screen.findByText('why.md')).toBeInTheDocument()
  })

  it('jump strip selects a folder when clicked', async () => {
    const adapter = await registerAdapter({
      'ai/prompt.md': '#',
      'tasks/todo.md': '#',
    })
    renderShelf(adapter.id)
    await screen.findByRole('button', { name: /jump to ai/i })
    await userEvent.click(screen.getByRole('button', { name: /jump to ai/i }))
    expect(useUIStore.getState().shelfExpandedFolderId).toBe('ai')
  })
})
