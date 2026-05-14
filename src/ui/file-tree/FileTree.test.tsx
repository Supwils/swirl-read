import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/app/router'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import type { MockTreeNode } from '@/core/vault/__test-helpers__/mock-fs'
import { useReaderStore } from '@/stores/reader-store'
import { useSidebarVisibilityStore } from '@/stores/sidebar-visibility-store'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { useUIStore, DEFAULT_FILE_TREE_OPEN } from '@/stores/ui-store'
import { __resetDbForTests } from '@/core/persistence/db'
import { __resetFileTreeCacheForTests } from './file-tree-cache'

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
  // RX2: pin to working chrome so fileTreeOpen actually drives sidebar
  // visibility — reading chrome would hide it behind a hover gesture.
  // RX3: FileShelf is the default sidebar in production; these legacy
  // FileTree tests opt back into the tree explicitly so they can
  // continue to assert the tree-specific behavior.
  useUIStore.setState({
    fileTreeOpen: true,
    ready: true,
    chromeMode: 'working',
    useLegacyTree: true,
  })
  useReaderStore.setState({
    recentByVault: {},
    ready: true,
  })
  // FileTree gates rendering on this store being ready; init pulls
  // from the (now-empty) Dexie preferences row so we start from a
  // clean slate for every test.
  useSidebarVisibilityStore.setState({ hiddenByVault: {}, ready: false })
  await useSidebarVisibilityStore.getState().init()
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

function getSidebar(): HTMLElement {
  return screen.getByRole('complementary', { name: /file tree/i })
}

describe('FileTree (M4.3) — mount + lazy expand', () => {
  it('renders root entries (directories first, then files)', async () => {
    await registerVault('tree-root', {
      'notes.md': '# notes',
      career: { 'me.md': '# me' },
      ai: { 'agents.md': '# agents' },
    })
    renderAt('/app/tree-root')

    const sidebar = await waitFor(() => getSidebar())
    await waitFor(() => {
      expect(within(sidebar).getByText('career')).toBeInTheDocument()
    })
    expect(within(sidebar).getByText('ai')).toBeInTheDocument()
    expect(within(sidebar).getByText('notes.md')).toBeInTheDocument()
  })

  it('does not load children of unexpanded directories', async () => {
    await registerVault('lazy', {
      career: { 'me.md': '# me', 'roles.md': '# roles' },
    })
    renderAt('/app/lazy')

    const sidebar = await waitFor(() => getSidebar())
    await waitFor(() => {
      expect(within(sidebar).getByText('career')).toBeInTheDocument()
    })
    // `me.md` lives inside the unexpanded `career` folder — should not
    // be in the DOM until the user expands.
    expect(within(sidebar).queryByText('me.md')).not.toBeInTheDocument()
  })

  it('expands a directory on click and reveals children', async () => {
    const user = userEvent.setup()
    await registerVault('expand', {
      career: { 'me.md': '# me' },
    })
    renderAt('/app/expand')

    const sidebar = await waitFor(() => getSidebar())
    const careerBtn = await waitFor(() =>
      within(sidebar).getByRole('button', { name: /expand career/i }),
    )
    await user.click(careerBtn)

    await waitFor(() => {
      expect(within(sidebar).getByText('me.md')).toBeInTheDocument()
    })
    // After expanding, the same row's aria-label flips.
    expect(
      within(sidebar).getByRole('button', { name: /collapse career/i }),
    ).toBeInTheDocument()
  })

  it('refreshes cached root listings after external file creation', async () => {
    const user = userEvent.setup()
    const tree: MockTreeNode = {
      'notes.md': '# notes',
    }
    await registerVault('refresh-root', tree)
    renderAt('/app/refresh-root')

    const sidebar = await waitFor(() => getSidebar())
    await waitFor(() => {
      expect(within(sidebar).getByText('notes.md')).toBeInTheDocument()
    })

    tree['new.md'] = '# new'
    expect(within(sidebar).queryByText('new.md')).not.toBeInTheDocument()

    await user.click(
      within(sidebar).getByRole('button', { name: /refresh file tree/i }),
    )

    await waitFor(() => {
      expect(within(sidebar).getByText('new.md')).toBeInTheDocument()
    })
  })
})

describe('FileTree (M4.3) — active file + ancestor auto-expansion', () => {
  it('marks the active file with aria-current and a "is-active" link', async () => {
    await registerVault('active', {
      'index.md': '# Home',
      'notes.md': '# Notes',
    })
    renderAt('/app/active/notes.md')

    const sidebar = await waitFor(() => getSidebar())
    const activeLink = await waitFor(() =>
      within(sidebar).getByRole('link', { name: 'notes.md' }),
    )
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    expect(activeLink.className).toContain('is-active')
  })

  it('auto-expands ancestors of the active document', async () => {
    await registerVault('ancestor', {
      career: {
        me: { 'me.md': '# Me' },
      },
    })
    renderAt('/app/ancestor/career/me/me.md')

    const sidebar = await waitFor(() => getSidebar())
    // The deeply-nested file should be visible without any user click —
    // ancestors auto-expanded because they're on the active path.
    await waitFor(() => {
      expect(
        within(sidebar).getByRole('link', { name: 'me.md' }),
      ).toBeInTheDocument()
    })
  })

  // Regression: previously the auto-expand effect had `expanded` in its
  // deps and fired on every render where `isAncestor && !expanded`. That
  // overwrote the user's manual collapse on the next tick. The fix keys
  // auto-expansion to currentPath changes via a ref, so a manual collapse
  // sticks until the user navigates somewhere new.
  it('keeps a folder collapsed after the user clicks to close it, even when it contains the open file', async () => {
    const user = userEvent.setup()
    await registerVault('sticky-collapse', {
      career: {
        me: { 'me.md': '# Me' },
      },
    })
    renderAt('/app/sticky-collapse/career/me/me.md')

    const sidebar = await waitFor(() => getSidebar())
    // Auto-expansion makes the leaf visible.
    await waitFor(() => {
      expect(
        within(sidebar).getByRole('link', { name: 'me.md' }),
      ).toBeInTheDocument()
    })

    // User clicks the chevron on `career` to collapse it.
    const careerToggle = within(sidebar).getByRole('button', {
      name: /collapse career/i,
    })
    await user.click(careerToggle)

    // The leaf disappears and stays gone — the auto-expand effect must not
    // re-run for the same currentPath.
    await waitFor(() => {
      expect(
        within(sidebar).queryByRole('link', { name: 'me.md' }),
      ).not.toBeInTheDocument()
    })
    // Hold for a couple of frames so any latent re-render had a chance.
    await new Promise((r) => setTimeout(r, 50))
    expect(
      within(sidebar).queryByRole('link', { name: 'me.md' }),
    ).not.toBeInTheDocument()
  })
})

describe('FileTree (M4.3) — visibility toggle', () => {
  it('hides the sidebar when fileTreeOpen is false', async () => {
    useUIStore.setState({ fileTreeOpen: false, ready: true })
    await registerVault('toggle', { 'notes.md': '# notes' })
    renderAt('/app/toggle')

    // Wait for the auto-redirect to settle (no index.md, so we land
    // on the directory listing).
    await waitFor(() => {
      // Main view shows the listing; sidebar is absent.
      expect(
        screen.queryByRole('complementary', { name: /file tree/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('toggle button in AppShell flips the store flag', async () => {
    const user = userEvent.setup()
    await registerVault('shell-toggle', { 'notes.md': '# notes' })
    renderAt('/app/shell-toggle')

    expect(useUIStore.getState().fileTreeOpen).toBe(true)
    const button = screen.getByRole('button', { name: /hide file shelf/i })
    await user.click(button)
    await waitFor(() => {
      expect(useUIStore.getState().fileTreeOpen).toBe(false)
    })
  })
})

describe('FileTree (M4.3) — defaults', () => {
  it('matches DEFAULT_FILE_TREE_OPEN', () => {
    expect(DEFAULT_FILE_TREE_OPEN).toBe(true)
  })
})

describe('FileTree (RX3) — Sections layout', () => {
  it('lists detected sections in the Sections block above the file tree', async () => {
    await registerVault('rx3-sections', {
      career: { 'career-map.md': '# Career map' },
      knowledge: { 'knowledge-map.md': '# Knowledge map' },
      orphan: { 'misc.md': '# Misc' },
    })

    renderAt('/app/rx3-sections')

    const sidebar = await waitFor(() => getSidebar())
    const sectionsNav = await waitFor(() =>
      within(sidebar).getByRole('navigation', { name: /^sections$/i }),
    )
    // Sections with a detected home appear; orphan does not.
    const careerLink = within(sectionsNav).getByRole('link', {
      name: /open career section/i,
    })
    expect(careerLink).toHaveAttribute(
      'href',
      '/app/rx3-sections/career/career-map.md',
    )
    const knowledgeLink = within(sectionsNav).getByRole('link', {
      name: /open knowledge section/i,
    })
    expect(knowledgeLink).toHaveAttribute(
      'href',
      '/app/rx3-sections/knowledge/knowledge-map.md',
    )
    expect(
      within(sectionsNav).queryByRole('link', { name: /open orphan section/i }),
    ).not.toBeInTheDocument()
  })

  it('hides the Sections block when no top-level dir has a detected home', async () => {
    await registerVault('rx3-no-sections', {
      orphan: { 'misc.md': '# Misc' },
      'note.md': '# Note',
    })

    renderAt('/app/rx3-no-sections')

    const sidebar = await waitFor(() => getSidebar())
    // Wait for the file tree to render so we know the sections fetch has resolved.
    await waitFor(() => {
      expect(within(sidebar).getByText('orphan')).toBeInTheDocument()
    })
    expect(
      within(sidebar).queryByRole('navigation', { name: /^sections$/i }),
    ).not.toBeInTheDocument()
  })
})

describe('FileTree (M4.2) — section homes', () => {
  it('renders top-level dirs with `<dirname>-map.md` as a section link to the map', async () => {
    await registerVault('sectioned', {
      'index.md': '# Vault home',
      career: {
        'career-map.md': '# Career map',
        'me.md': '# Me',
      },
      knowledge: {
        'knowledge-map.md': '# Knowledge map',
      },
    })

    renderAt('/app/sectioned')

    const sidebar = await waitFor(() => getSidebar())
    // RX3: section links now appear BOTH in the dedicated "Sections"
    // block (top-level promotion) AND on the file-tree row itself.
    // Both should point at the section home; assert at least one of
    // each and verify all hrefs are correct.
    const careerLinks = await waitFor(() => {
      const links = within(sidebar).getAllByRole('link', {
        name: /open career section/i,
      })
      expect(links.length).toBeGreaterThanOrEqual(1)
      return links
    })
    careerLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        'href',
        '/app/sectioned/career/career-map.md',
      )
    })

    const knowledgeLinks = within(sidebar).getAllByRole('link', {
      name: /open knowledge section/i,
    })
    expect(knowledgeLinks.length).toBeGreaterThanOrEqual(1)
    knowledgeLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        'href',
        '/app/sectioned/knowledge/knowledge-map.md',
      )
    })

    // Chevron expand button still exists for each section.
    expect(
      within(sidebar).getByRole('button', { name: /expand career/i }),
    ).toBeInTheDocument()
  })

  it('renders top-level dirs without a section home as plain folders', async () => {
    await registerVault('no-sections', {
      orphan: { 'note.md': '# Note' },
    })

    renderAt('/app/no-sections')

    const sidebar = await waitFor(() => getSidebar())
    // No `Open … section` link — falls through to the regular dir button.
    await waitFor(() => {
      expect(
        within(sidebar).getByRole('button', { name: /expand orphan/i }),
      ).toBeInTheDocument()
    })
    expect(
      within(sidebar).queryByRole('link', { name: /open orphan section/i }),
    ).not.toBeInTheDocument()
  })

  it('marks the section row active when viewing the section home', async () => {
    await registerVault('section-active', {
      career: {
        'career-map.md': '# Career map',
      },
    })

    renderAt('/app/section-active/career/career-map.md')

    const sidebar = await waitFor(() => getSidebar())
    // RX3: both the new Sections block link and the existing file-tree
    // section row link should mark `aria-current="page"` when active.
    const links = await waitFor(() => {
      const found = within(sidebar).getAllByRole('link', {
        name: /open career section/i,
      })
      expect(found.length).toBeGreaterThanOrEqual(1)
      return found
    })
    links.forEach((link) => {
      expect(link).toHaveAttribute('aria-current', 'page')
    })
  })
})

describe('FileTree — sidebar right-click hide', () => {
  it('hides a folder when "Hide from sidebar" is selected, then reset brings it back', async () => {
    const user = userEvent.setup()
    await registerVault('hide-flow', {
      career: { 'me.md': '# me' },
      'index.md': '# Home',
    })

    renderAt('/app/hide-flow')

    const sidebar = await waitFor(() => getSidebar())
    // Both sidebar entries should land before we right-click.
    await waitFor(() => {
      expect(within(sidebar).getByText('career')).toBeInTheDocument()
    })
    expect(within(sidebar).getByText('index.md')).toBeInTheDocument()

    // Right-click the career folder row. The expand button is the
    // closest stable handle (the row itself is a <button> rendered
    // through that). React Testing Library doesn't expose a direct
    // contextMenu helper, so we dispatch the synthetic event on the
    // row's button.
    const careerRow = within(sidebar).getByRole('button', {
      name: /expand career/i,
    })
    await user.pointer({ keys: '[MouseRight]', target: careerRow })

    // Context menu portals into document.body (outside the sidebar
    // tree), so we query at the screen level.
    const hideItem = await screen.findByRole('menuitem', {
      name: /hide from sidebar/i,
    })
    await user.click(hideItem)

    // Folder disappears immediately.
    await waitFor(() => {
      expect(within(sidebar).queryByText('career')).not.toBeInTheDocument()
    })
    // Sibling stays visible.
    expect(within(sidebar).getByText('index.md')).toBeInTheDocument()

    // Reset button now appears in the toolbar — count is 1.
    const resetBtn = await within(sidebar).findByLabelText(
      /show all 1 hidden items/i,
    )
    await user.click(resetBtn)

    await waitFor(() => {
      expect(within(sidebar).getByText('career')).toBeInTheDocument()
    })
    // After reset, the button itself is gone.
    expect(
      within(sidebar).queryByLabelText(/show all .* hidden items/i),
    ).not.toBeInTheDocument()
  })
})
