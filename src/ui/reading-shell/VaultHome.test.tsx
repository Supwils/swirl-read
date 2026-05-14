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

// The historical M4.1 home-detection auto-redirect (index.md / README.md →
// open as the vault landing) is intentionally retired by the new design:
// the vault root now renders Pebble Garden, and the user picks where they
// want to go. `findVaultHome` itself still lives in
// `src/core/navigation/section-detector.ts` for callers that want to
// surface a recommended home file in the future (e.g. a "resume reading"
// chip on Pebble Garden), and its unit tests cover the resolution rules.
// The PebbleGarden component has its own test suite.

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
