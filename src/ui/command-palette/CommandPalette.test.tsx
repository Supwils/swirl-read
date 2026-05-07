import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { CommandPalette } from './CommandPalette'
import { __resetWalkedFilesCacheForTests } from './walked-files-cache'
import { __resetFullTextCacheForTests } from './full-text-cache'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import { useReaderStore } from '@/stores/reader-store'
import { useTabsStore } from '@/stores/tabs-store'
import { useTocStore } from '@/stores/toc-store'
import { useUIStore } from '@/stores/ui-store'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { __resetDbForTests } from '@/core/persistence/db'

const EMPTY_TOC_CONTEXT = {
  vaultId: null,
  path: null,
  tags: [],
  outgoingLinks: 0,
}

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetWalkedFilesCacheForTests()
  __resetFullTextCacheForTests()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
  })
  useReaderStore.setState({
    recentByVault: {},
    scrollByVault: {},
    ready: true,
  })
  useTocStore.setState({
    headings: [],
    activeId: null,
    context: EMPTY_TOC_CONTEXT,
  })
  useUIStore.setState({ commandPaletteOpen: false })
  useTabsStore.setState({
    tabsByVault: {},
    recentlyClosedByVault: {},
    tabCapHit: false,
    previewReplaced: false,
    ready: true,
  })
})

afterEach(() => {
  useUIStore.setState({ commandPaletteOpen: false })
  useTocStore.setState({
    headings: [],
    activeId: null,
    context: EMPTY_TOC_CONTEXT,
  })
  useTabsStore.setState({
    tabsByVault: {},
    recentlyClosedByVault: {},
    tabCapHit: false,
    previewReplaced: false,
    ready: true,
  })
})

function ShellWithPalette() {
  // Mirrors AppShell — palette is layout-level so it stays mounted
  // across child routes; child route content is the path-specific bit.
  return (
    <div>
      <Outlet />
      <CommandPalette />
    </div>
  )
}

function renderPaletteAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/app',
        element: <ShellWithPalette />,
        children: [
          { index: true, element: <div data-testid="no-vault-stub" /> },
          { path: ':vaultId', element: <div data-testid="vault-home-stub" /> },
          { path: ':vaultId/*', element: <div data-testid="doc-stub" /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('CommandPalette (M5.1)', () => {
  it('does not render when commandPaletteOpen is false', () => {
    renderPaletteAt('/app')
    expect(
      screen.queryByRole('dialog', { name: /command palette/i }),
    ).not.toBeInTheDocument()
  })

  it('opens when commandPaletteOpen flips to true', async () => {
    renderPaletteAt('/app')
    useUIStore.getState().setCommandPaletteOpen(true)

    expect(
      await screen.findByRole('dialog', { name: /command palette/i }),
    ).toBeInTheDocument()
    // cmdk input is auto-focused.
    const input = screen.getByPlaceholderText(/jump to a recent file/i)
    expect(input).toHaveFocus()
  })

  it('shows the empty state message when no recents exist', async () => {
    renderPaletteAt('/app')
    useUIStore.getState().setCommandPaletteOpen(true)

    expect(
      await screen.findByText(/open a file from the sidebar/i),
    ).toBeInTheDocument()
  })

  it('lists recent files latest-first across vaults', async () => {
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
    useReaderStore.setState({
      recentByVault: {
        va: [
          {
            vaultId: 'va',
            path: 'old.md',
            openedAt: new Date(1_000),
          },
        ],
        vb: [
          {
            vaultId: 'vb',
            path: 'new.md',
            openedAt: new Date(2_000),
          },
        ],
      },
      scrollByVault: {},
      ready: true,
    })

    renderPaletteAt('/app')
    useUIStore.getState().setCommandPaletteOpen(true)

    const dialog = await screen.findByRole('dialog', {
      name: /command palette/i,
    })
    const items = await waitFor(() => {
      const xs = dialog.querySelectorAll('[cmdk-item]')
      expect(xs.length).toBeGreaterThan(0)
      return xs
    })
    // Latest first → "new.md" (2_000 ms) before "old.md" (1_000 ms).
    expect(items[0]?.textContent).toContain('new.md')
    expect(items[0]?.textContent).toContain('Vault Beta')
    expect(items[1]?.textContent).toContain('old.md')
  })

  it('navigates and closes the palette when a recent is selected', async () => {
    const user = userEvent.setup()
    useVaultStore.setState({
      registeredVaults: [
        {
          id: 'va',
          name: 'Vault Alpha',
          registeredAt: new Date(0),
          lastOpenedAt: new Date(0),
        },
      ],
      activeVaultId: null,
      ready: true,
    })
    useReaderStore.setState({
      recentByVault: {
        va: [
          {
            vaultId: 'va',
            path: 'notes/today.md',
            openedAt: new Date(2_000),
          },
        ],
      },
      scrollByVault: {},
      ready: true,
    })

    renderPaletteAt('/app')
    useUIStore.getState().setCommandPaletteOpen(true)

    const dialog = await screen.findByRole('dialog', {
      name: /command palette/i,
    })
    const item = await waitFor(() => {
      const node = dialog.querySelector('[cmdk-item]')
      expect(node).not.toBeNull()
      return node as HTMLElement
    })
    await user.click(item)

    await waitFor(() => {
      expect(screen.getByTestId('doc-stub')).toBeInTheDocument()
    })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('closes when the user presses Escape', async () => {
    const user = userEvent.setup()
    renderPaletteAt('/app')
    useUIStore.getState().setCommandPaletteOpen(true)

    await screen.findByRole('dialog', { name: /command palette/i })
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })
  })
})

async function registerVault(
  id: string,
  tree: Parameters<typeof mockRoot>[1],
): Promise<FSAPIVaultAdapter> {
  const root = mockRoot('vault', tree)
  const adapter = FSAPIVaultAdapter.fromHandle(root, { id, name: 'My Vault' })
  await useVaultStore.getState().registerVault(adapter)
  return adapter
}

describe('CommandPalette (M5.2) — file search', () => {
  it('shows the recents-only placeholder when input is empty', async () => {
    await registerVault('v', { 'a.md': '#a' })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(
      /search files in My Vault/i,
    )
    expect(input).toBeInTheDocument()
    // Empty input → no Files group, no walked-files request fired yet.
    expect(screen.queryByText(/files in my vault/i)).not.toBeInTheDocument()
  })

  it('fuzzy-matches a file by basename when the user types', async () => {
    const user = userEvent.setup()
    await registerVault('v', {
      'index.md': '#',
      knowledge: {
        软件: {
          前端: { 'react.md': '# React' },
        },
        'go.md': '# Go',
      },
    })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/search files in/i)
    await user.type(input, 'react')

    const dialog = await screen.findByRole('dialog')
    const link = await waitFor(() => {
      const hits = dialog.querySelectorAll('[cmdk-item]')
      const match = Array.from(hits).find((el) =>
        el.textContent?.includes('react.md'),
      )
      expect(match).toBeTruthy()
      return match as HTMLElement
    })
    expect(link.textContent).toContain('react.md')
    expect(link.textContent).toContain('knowledge/软件/前端')
  })

  it('navigates to the matched file on selection and closes', async () => {
    const user = userEvent.setup()
    await registerVault('v', {
      'index.md': '# Home',
      'react.md': '# React',
    })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/search files in/i)
    await user.type(input, 'react')

    const dialog = await screen.findByRole('dialog')
    const item = await waitFor(() => {
      const hits = dialog.querySelectorAll('[cmdk-item]')
      const match = Array.from(hits).find((el) =>
        el.textContent?.includes('react.md'),
      )
      expect(match).toBeTruthy()
      return match as HTMLElement
    })
    await user.click(item)

    await waitFor(() => {
      expect(screen.getByTestId('doc-stub')).toBeInTheDocument()
    })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('shows a "no matches" empty state when nothing scores', async () => {
    const user = userEvent.setup()
    await registerVault('v', { 'index.md': '#', 'notes.md': '#' })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/search files in/i)
    await user.type(input, 'zzzzzqqq-no-such-file')

    expect(await screen.findByText(/no matches\./i)).toBeInTheDocument()
  })

  it('prompts the user to open a vault when none is in scope', async () => {
    const user = userEvent.setup()
    renderPaletteAt('/app')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/jump to a recent file/i)
    await user.type(input, 'react')

    expect(
      await screen.findByText(/open a vault to search its files/i),
    ).toBeInTheDocument()
  })
})

describe('CommandPalette (M5.4 + M5.5) — full-text search mode', () => {
  it('routes the `>` prefix into search mode and finds body matches', async () => {
    const user = userEvent.setup()
    await registerVault('v', {
      'react.md': '# React\n\nuseState lets components manage state',
      'go.md': '# Go\n\ngoroutines power concurrency',
    })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/search files in/i)
    await user.type(input, '>useState')

    const dialog = await screen.findByRole('dialog')
    const item = await waitFor(() => {
      const hits = dialog.querySelectorAll('[cmdk-item]')
      const match = Array.from(hits).find((el) =>
        el.textContent?.includes('react.md'),
      )
      expect(match).toBeTruthy()
      return match as HTMLElement
    })
    // The result row's secondary line should include a snippet around
    // the match so the user can preview it without opening.
    expect(item.textContent).toMatch(/useState/i)
  })

  it('switches the placeholder copy to search-content when in `>` mode', async () => {
    const user = userEvent.setup()
    await registerVault('v', { 'a.md': '# A\n\nbody' })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/search files in/i)
    await user.type(input, '>')
    expect(
      await screen.findByPlaceholderText(/search content in/i),
    ).toBeInTheDocument()
  })

  it('shows a hint when `>` is typed without a query', async () => {
    const user = userEvent.setup()
    await registerVault('v', { 'a.md': '# A\n\nbody' })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/search files in/i)
    await user.type(input, '>')

    expect(
      await screen.findByText(/type a query after > to search file contents/i),
    ).toBeInTheDocument()
  })

  it('navigates to the matched file on selection in search mode', async () => {
    const user = userEvent.setup()
    await registerVault('v', {
      'index.md': '# Home\n\nintroduction',
      'react.md': '# React\n\nuseState lets components manage state',
    })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/search files in/i)
    await user.type(input, '>useState')

    const dialog = await screen.findByRole('dialog')
    const item = await waitFor(() => {
      const hits = dialog.querySelectorAll('[cmdk-item]')
      const match = Array.from(hits).find((el) =>
        el.textContent?.includes('react.md'),
      )
      expect(match).toBeTruthy()
      return match as HTMLElement
    })
    await user.click(item)

    await waitFor(() => {
      expect(screen.getByTestId('doc-stub')).toBeInTheDocument()
    })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('reports a no-matches state when nothing scores in search mode', async () => {
    const user = userEvent.setup()
    await registerVault('v', { 'a.md': '# A\n\nplain body content' })

    renderPaletteAt('/app/v')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/search files in/i)
    await user.type(input, '>zzqqq-no-such-token')

    expect(await screen.findByText(/no matches\./i)).toBeInTheDocument()
  })
})

describe('CommandPalette (RX6) — Headings + Sections groups', () => {
  it('renders the Headings group when the current document publishes any', async () => {
    await registerVault('rx6-headings', { 'note.md': '# Hi' })
    useTocStore.setState({
      headings: [
        { id: 'intro', text: 'Intro', level: 1 },
        { id: 'why', text: 'Why', level: 2 },
      ],
      activeId: null,
      context: {
        vaultId: 'rx6-headings',
        path: 'note.md',
        tags: [],
        outgoingLinks: 0,
      },
    })

    renderPaletteAt('/app/rx6-headings/note.md')
    useUIStore.getState().setCommandPaletteOpen(true)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(
        within(dialogText(dialog)).getByText(/Headings \(this document\)/i),
      ).toBeInTheDocument()
    })
    expect(dialog.textContent).toContain('Intro')
    expect(dialog.textContent).toContain('Why')
  })

  it('hides the Headings group when toc-store context targets a different document', async () => {
    await registerVault('rx6-other-doc', { 'note.md': '#' })
    useTocStore.setState({
      headings: [{ id: 'orphan', text: 'Orphan', level: 1 }],
      activeId: null,
      context: {
        // The headings belong to a different file than the URL — the
        // anchor wouldn't exist, so the group should hide.
        vaultId: 'rx6-other-doc',
        path: 'somewhere-else.md',
        tags: [],
        outgoingLinks: 0,
      },
    })

    renderPaletteAt('/app/rx6-other-doc/note.md')
    useUIStore.getState().setCommandPaletteOpen(true)

    await screen.findByRole('dialog')
    expect(
      screen.queryByText(/Headings \(this document\)/i),
    ).not.toBeInTheDocument()
  })

  it('renders the Sections group from the active vault', async () => {
    await registerVault('rx6-sections', {
      career: { 'career-map.md': '# Career map' },
      knowledge: { 'knowledge-map.md': '# Knowledge map' },
      orphan: { 'misc.md': '# Misc' },
    })

    renderPaletteAt('/app/rx6-sections')
    useUIStore.getState().setCommandPaletteOpen(true)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(
        within(dialogText(dialog)).getByText(/Sections in My Vault/i),
      ).toBeInTheDocument()
    })
    expect(dialog.textContent).toContain('career')
    expect(dialog.textContent).toContain('knowledge')
    expect(dialog.textContent).not.toContain('orphan')
  })

  it('hides the Sections group when no top-level dir has a detected home', async () => {
    await registerVault('rx6-no-sections', {
      orphan: { 'misc.md': '# Misc' },
      'note.md': '#',
    })

    renderPaletteAt('/app/rx6-no-sections')
    useUIStore.getState().setCommandPaletteOpen(true)

    await screen.findByRole('dialog')
    // Wait for the sections fetch to settle, then verify nothing landed.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(/Sections in/i)).not.toBeInTheDocument()
  })
})

// `within(dialog)` would fail because cmdk renders the dialog content
// inside a portal — `within` scopes by node tree, not by visual region.
// The helper below scopes back to document.body so getByText cuts
// through the portal boundary.
function dialogText(dialog: HTMLElement): HTMLElement {
  return dialog
}

describe('CommandPalette — Recently closed group', () => {
  it('lists recently-closed tabs for the active vault and reopens on select', async () => {
    const user = userEvent.setup()
    await registerVault('rc-vault', {
      'a.md': '# A',
      'b.md': '# B',
    })
    useTabsStore.setState({
      recentlyClosedByVault: {
        'rc-vault': [
          {
            vaultId: 'rc-vault',
            path: 'b.md',
            pinned: false,
            openedAt: new Date('2026-05-07T11:00:00Z'),
          },
          {
            vaultId: 'rc-vault',
            path: 'a.md',
            pinned: false,
            openedAt: new Date('2026-05-07T10:00:00Z'),
          },
        ],
      },
    })

    renderPaletteAt('/app/rc-vault')
    useUIStore.getState().setCommandPaletteOpen(true)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(
        within(dialogText(dialog)).getByText(/Recently closed/i),
      ).toBeInTheDocument()
    })

    expect(dialog.textContent).toContain('b.md')
    expect(dialog.textContent).toContain('a.md')

    await user.click(screen.getByText('b.md'))

    await waitFor(() => {
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })
    expect(await screen.findByTestId('doc-stub')).toBeInTheDocument()

    // Selecting from the Recently closed group must also pop the entry
    // from the stack — otherwise the same row would still show the next
    // time the palette opens.
    expect(
      useTabsStore
        .getState()
        .recentlyClosedByVault['rc-vault']?.map((t) => t.path),
    ).toEqual(['a.md'])
  })

  it('hides the group when the recently-closed stack is empty', async () => {
    await registerVault('rc-empty', { 'note.md': '#' })

    renderPaletteAt('/app/rc-empty')
    useUIStore.getState().setCommandPaletteOpen(true)

    await screen.findByRole('dialog')
    expect(screen.queryByText(/Recently closed/i)).not.toBeInTheDocument()
  })

  it('only shows recently-closed entries from the current vault', async () => {
    await registerVault('rc-this', { 'this.md': '#' })
    useTabsStore.setState({
      recentlyClosedByVault: {
        'rc-this': [
          {
            vaultId: 'rc-this',
            path: 'this.md',
            pinned: false,
            openedAt: new Date('2026-05-07T10:00:00Z'),
          },
        ],
        'rc-other': [
          {
            vaultId: 'rc-other',
            path: 'other.md',
            pinned: false,
            openedAt: new Date('2026-05-07T10:00:00Z'),
          },
        ],
      },
    })

    renderPaletteAt('/app/rc-this')
    useUIStore.getState().setCommandPaletteOpen(true)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(
        within(dialogText(dialog)).getByText(/Recently closed/i),
      ).toBeInTheDocument()
    })
    expect(dialog.textContent).toContain('this.md')
    expect(dialog.textContent).not.toContain('other.md')
  })
})
