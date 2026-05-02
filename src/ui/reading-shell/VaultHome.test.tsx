import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/app/router'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { useUIStore } from '@/stores/ui-store'
import { useReaderStore } from '@/stores/reader-store'
import { __resetDbForTests } from '@/core/persistence/db'
import type { MockTreeNode } from '@/core/vault/__test-helpers__/mock-fs'
import { __resetFileTreeCacheForTests } from '@/ui/file-tree/file-tree-cache'

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetFileTreeCacheForTests()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
  })
  // Hide the file-tree sidebar by default so legacy assertions that
  // search for, e.g., a `notes.md` link don't match both the sidebar
  // copy and the directory-listing copy. A dedicated FileTree.test
  // covers the sidebar's own behaviour.
  useUIStore.setState({ fileTreeOpen: false, ready: true })
  useReaderStore.setState({
    recentByVault: {},
    ready: true,
  })
})

async function registerVault(
  id: string,
  tree: MockTreeNode,
): Promise<FSAPIVaultAdapter> {
  const root = mockRoot('vault', tree)
  const adapter = FSAPIVaultAdapter.fromHandle(root, { id, name: 'vault' })
  await useVaultStore.getState().registerVault(adapter)
  return adapter
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

describe('VaultHome — home detection (M4.1)', () => {
  it('auto-redirects to index.md when one exists at the vault root', async () => {
    await registerVault('home-redirect', {
      'index.md': '# Welcome Home\n\nThe entry-point note.',
      knowledge: { 'react.md': '# React' },
    })
    renderAt('/app/home-redirect')

    await waitFor(() => {
      // RX1: page header h1 AND body h1 both carry the title. Either
      // is acceptable — assert at least one shows.
      const headings = screen.getAllByRole('heading', {
        level: 1,
        name: /welcome home/i,
      })
      expect(headings.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('falls back to README.md when there is no index/home', async () => {
    await registerVault('readme-fallback', {
      'README.md': '# Project README\n\nRead this first.',
      'notes.md': 'misc',
    })
    renderAt('/app/readme-fallback')

    await waitFor(() => {
      const headings = screen.getAllByRole('heading', {
        level: 1,
        name: /project readme/i,
      })
      expect(headings.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders a navigable directory listing when no home file exists', async () => {
    await registerVault('listing', {
      'notes.md': '# Notes',
      todo: { 'today.md': '# Today' },
    })
    renderAt('/app/listing')

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /notes\.md/i }),
      ).toBeInTheDocument()
    })
    // Folder is also rendered as a link
    expect(screen.getByRole('link', { name: /todo/i })).toBeInTheDocument()
    // Breadcrumb anchors back to vault root
    expect(
      screen.getByRole('link', { name: /vault root/i }),
    ).toBeInTheDocument()
  })
})

describe('DocumentPage — directory paths (M4.1 / pre-M4.3)', () => {
  it('lists folder contents with clickable links when navigated to a directory', async () => {
    await registerVault('dir-listing', {
      'notes.md': '# Notes',
      career: {
        'me.md': '# Me',
        'roles.md': '# Roles',
        old: {},
      },
    })
    renderAt('/app/dir-listing/career')

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /me\.md/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /roles\.md/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^old$/i })).toBeInTheDocument()
    // Breadcrumb has both root and the current directory crumb
    expect(
      screen.getByRole('link', { name: /vault root/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /career/i }),
    ).toBeInTheDocument()
  })
})
