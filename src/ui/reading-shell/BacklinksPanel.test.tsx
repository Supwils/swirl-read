import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import {
  __resetBacklinksForTests,
  indexBacklinksForFile,
} from '@/core/navigation/backlinks'
import { buildWikilinkIndex } from '@/core/navigation/wikilink-resolver'
import { __resetDbForTests } from '@/core/persistence/db'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import { useReaderStore } from '@/stores/reader-store'
import { BacklinksPanel } from './BacklinksPanel'

beforeEach(async () => {
  await __resetDbForTests()
  __resetBacklinksForTests()
  useReaderStore.setState({
    recentByVault: {},
    scrollByVault: {},
    ready: true,
  })
})

describe('BacklinksPanel (M4.5 + RX5)', () => {
  it('renders nothing when no backlinks are known (RX5: hide on empty)', async () => {
    render(
      <MemoryRouter>
        <BacklinksPanel vaultId="vault-a" currentPath="target.md" />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useReaderStore.getState().ready).toBe(true)
    })
    // Nothing rendered — not even the heading. The reader sees an undisturbed
    // end-of-document, no "No backlinks yet." status row.
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /backlinks/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('lists source files and emphasizes the wikilink in the snippet (RX5)', async () => {
    const root = mockRoot('vault', {
      'source.md': '# Source\n\nThis mentions [[target]] in passing.',
      'target.md': '# Target',
    })
    const vault = FSAPIVaultAdapter.fromHandle(root, {
      id: 'vault-a',
      name: 'vault',
    })
    const index = await buildWikilinkIndex(vault)
    await indexBacklinksForFile(
      'vault-a',
      'source.md',
      '# Source\n\nThis mentions [[target]] in passing.',
      index,
    )

    render(
      <MemoryRouter>
        <BacklinksPanel vaultId="vault-a" currentPath="target.md" />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'source.md' })).toHaveAttribute(
        'href',
        '/app/vault-a/source.md',
      )
    })

    // Surrounding context is preserved across mark boundaries.
    const snippet = screen
      .getAllByText((_, element) =>
        Boolean(
          element?.textContent
            ?.toLowerCase()
            .includes('mentions [[target]] in passing'),
        ),
      )
      .find((node) => node.classList.contains('swilread-backlinks__context'))
    expect(snippet).toBeDefined()

    // RX5: the [[target]] reference itself is wrapped in <mark> so the eye
    // lands on the connection.
    const mark = snippet?.querySelector('mark')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('[[target]]')
  })

  it('ranks recently-opened sources above other backlinks (RX5)', async () => {
    const root = mockRoot('vault', {
      'alpha.md': 'See [[target]].',
      'omega.md': 'Also [[target]].',
      'target.md': '# Target',
    })
    const vault = FSAPIVaultAdapter.fromHandle(root, {
      id: 'vault-rank',
      name: 'vault',
    })
    const index = await buildWikilinkIndex(vault)
    await indexBacklinksForFile(
      'vault-rank',
      'alpha.md',
      'See [[target]].',
      index,
    )
    await indexBacklinksForFile(
      'vault-rank',
      'omega.md',
      'Also [[target]].',
      index,
    )

    // Reader recently opened omega.md → it should bubble above alpha.md
    // even though alphabetical order would put alpha first.
    await useReaderStore.getState().markRecentFile('vault-rank', 'omega.md')

    render(
      <MemoryRouter>
        <BacklinksPanel vaultId="vault-rank" currentPath="target.md" />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(2)
    })
    const links = screen.getAllByRole('link').map((link) => link.textContent)
    expect(links).toEqual(['omega.md', 'alpha.md'])
  })
})
