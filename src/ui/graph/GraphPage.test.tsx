import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { GraphPage } from './GraphPage'
import { SampleVaultAdapter } from '@/core/vault/sample-adapter'
import { __resetDbForTests } from '@/core/persistence/db'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'
import { __resetGraphCacheForTests } from '@/core/graph'

function makeAdapter(id: string, files: Record<string, string>) {
  return new SampleVaultAdapter({ id, name: id, files })
}

function renderGraph(vaultId: string, search = '') {
  return render(
    <MemoryRouter initialEntries={[`/app/${vaultId}/__graph__${search}`]}>
      <Routes>
        <Route path="/app/:vaultId" element={<div>vault home</div>} />
        <Route path="/app/:vaultId/__graph__" element={<GraphPage />} />
        <Route path="/app/:vaultId/*" element={<div>doc page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetGraphCacheForTests()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
    adapterRevision: 0,
    contentRevisionByVault: {},
  })
})

afterEach(() => {
  __resetAdaptersForTests()
  __resetGraphCacheForTests()
})

describe('GraphPage', () => {
  it('builds the map and counts the connected notes', async () => {
    const adapter = makeAdapter('g1', {
      'a.md': 'links to [[b]] and [[c]]',
      'b.md': 'a leaf',
      'c.md': 'another leaf',
    })
    await useVaultStore.getState().registerVault(adapter)
    const { container } = renderGraph('g1')

    expect(await screen.findByText('3 notes')).toBeInTheDocument()
    await waitFor(() => {
      expect(
        container.querySelectorAll('.swirlread-graphmap__dot').length,
      ).toBe(3)
    })
  })

  it('shows an empty state when nothing is linked', async () => {
    const adapter = makeAdapter('g2', {
      'lonely.md': 'no links here at all',
    })
    await useVaultStore.getState().registerVault(adapter)
    renderGraph('g2')
    expect(
      await screen.findByText(/no connections to map yet/i),
    ).toBeInTheDocument()
  })

  it('renders the error state when the vault adapter is gone', async () => {
    renderGraph('ghost')
    expect(await screen.findByText(/vault unavailable/i)).toBeInTheDocument()
  })

  it('navigates to a note when its node is clicked', async () => {
    const adapter = makeAdapter('g3', {
      'a.md': 'links to [[b]]',
      'b.md': 'a leaf',
    })
    await useVaultStore.getState().registerVault(adapter)
    const { container } = renderGraph('g3')

    await screen.findByText('2 notes')
    const svg = container.querySelector('.swirlread-graphmap__svg')!
    const nodes = container.querySelectorAll('.swirlread-graphmap__node')
    fireEvent.pointerDown(nodes[0]!)
    fireEvent.pointerUp(svg)

    expect(await screen.findByText('doc page')).toBeInTheDocument()
  })

  it('enters local mode from a focus search param', async () => {
    const adapter = makeAdapter('g4', {
      'a.md': 'links to [[b]] and [[c]]',
      'b.md': 'see [[c]]',
      'c.md': 'leaf',
    })
    await useVaultStore.getState().registerVault(adapter)
    renderGraph('g4', '?mode=local&focus=b.md')

    // b links a, c (depth 1) → b + a + c = 3 nodes; the Local button is active.
    const local = await screen.findByRole('button', { name: 'Local' })
    await waitFor(() => {
      expect(local).toHaveAttribute('data-active', 'true')
    })
  })

  // Regression for bug #1: a no-op content poll must not flash the loading
  // screen or drop the rendered graph.
  it('keeps the graph on screen across a no-op content refresh', async () => {
    const adapter = makeAdapter('poll', {
      'a.md': 'links to [[b]]',
      'b.md': 'leaf',
    })
    await useVaultStore.getState().registerVault(adapter)
    const { container } = renderGraph('poll')
    await screen.findByText('2 notes')
    const before = container.querySelectorAll('.swirlread-graphmap__dot').length
    expect(before).toBe(2)

    await act(async () => {
      await useVaultStore.getState().refreshVaultContent('poll')
    })

    expect(screen.queryByText(/building knowledge map/i)).toBeNull()
    await waitFor(() => {
      expect(
        container.querySelectorAll('.swirlread-graphmap__dot').length,
      ).toBe(before)
    })
  })

  // Regression for bug #9: in global mode the source note (?from=) is marked
  // current so the reader sees where they came from.
  it('highlights the source note from ?from= in global mode', async () => {
    const adapter = makeAdapter('fromv', {
      'a.md': 'links to [[b]]',
      'b.md': 'leaf',
    })
    await useVaultStore.getState().registerVault(adapter)
    const { container } = renderGraph('fromv', '?from=a.md')
    await screen.findByText('2 notes')
    await waitFor(() => {
      expect(
        container.querySelector('.swirlread-graphmap__node.is-current'),
      ).not.toBeNull()
    })
  })
})
