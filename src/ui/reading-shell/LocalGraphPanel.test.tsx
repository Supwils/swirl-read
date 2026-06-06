import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { LocalGraphPanel } from './LocalGraphPanel'
import { SampleVaultAdapter } from '@/core/vault/sample-adapter'
import { __resetDbForTests } from '@/core/persistence/db'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'
import { useUIStore } from '@/stores/ui-store'
import { __resetGraphCacheForTests } from '@/core/graph'

function makeAdapter(id: string, files: Record<string, string>) {
  return new SampleVaultAdapter({ id, name: id, files })
}

/**
 * Mirrors how DocumentBodyView mounts the panel: a static collapsed header
 * plus the heavy body gated behind the `localGraphOpen` store boolean. This
 * is what we actually want to assert — a collapsed panel renders no canvas.
 */
function Harness({
  vaultId,
  currentPath,
}: {
  vaultId: string
  currentPath: string
}) {
  const open = useUIStore((s) => s.localGraphOpen)
  return (
    <section className="swirlread-localgraph">
      <button type="button" aria-expanded={open}>
        Local graph
      </button>
      {open && <LocalGraphPanel vaultId={vaultId} currentPath={currentPath} />}
    </section>
  )
}

function renderHarness(vaultId: string, currentPath: string): RenderResult {
  return render(
    <MemoryRouter initialEntries={[`/app/${vaultId}/${currentPath}`]}>
      <Routes>
        <Route
          path="/app/:vaultId/__graph__"
          element={<div>full graph page</div>}
        />
        <Route
          path="/app/:vaultId/*"
          element={<Harness vaultId={vaultId} currentPath={currentPath} />}
        />
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
  useUIStore.setState({ localGraphOpen: false })
})

afterEach(() => {
  cleanup()
  __resetAdaptersForTests()
  __resetGraphCacheForTests()
})

describe('LocalGraphPanel', () => {
  it('renders no graph canvas while collapsed (and does not fetch)', async () => {
    const adapter = makeAdapter('lg1', {
      'a.md': 'links to [[b]]',
      'b.md': 'a leaf',
    })
    await useVaultStore.getState().registerVault(adapter)

    const { container } = renderHarness('lg1', 'a.md')

    // Collapsed by default: no canvas, no controls.
    expect(container.querySelector('.swirlread-localgraph__body')).toBeNull()
    expect(container.querySelectorAll('.swirlread-graphmap__dot')).toHaveLength(
      0,
    )
  })

  it('renders nodes for a linked doc once expanded', async () => {
    const adapter = makeAdapter('lg2', {
      'a.md': 'links to [[b]] and [[c]]',
      'b.md': 'a leaf',
      'c.md': 'another leaf',
    })
    await useVaultStore.getState().registerVault(adapter)

    const { container } = renderHarness('lg2', 'a.md')
    act(() => {
      useUIStore.setState({ localGraphOpen: true })
    })

    // depth 1 around a.md → a + b + c = 3 nodes.
    await waitFor(() => {
      expect(
        container.querySelectorAll('.swirlread-graphmap__dot'),
      ).toHaveLength(3)
    })
  })

  it('shows a "not linked yet" message for an orphan doc, not a blank canvas', async () => {
    const adapter = makeAdapter('lg3', {
      'lonely.md': 'no links here at all',
      'a.md': 'links to [[b]]',
      'b.md': 'leaf',
    })
    await useVaultStore.getState().registerVault(adapter)

    const { container } = renderHarness('lg3', 'lonely.md')
    act(() => {
      useUIStore.setState({ localGraphOpen: true })
    })

    expect(await screen.findByText(/isn.t linked yet/i)).toBeInTheDocument()
    expect(container.querySelectorAll('.swirlread-graphmap__dot')).toHaveLength(
      0,
    )
  })

  it('links to the full graph in local mode focused on this note', async () => {
    const adapter = makeAdapter('lg4', {
      'a.md': 'links to [[b]]',
      'b.md': 'leaf',
    })
    await useVaultStore.getState().registerVault(adapter)

    renderHarness('lg4', 'a.md')
    act(() => {
      useUIStore.setState({ localGraphOpen: true })
    })

    const link = await screen.findByRole('link', { name: /open full graph/i })
    expect(link).toHaveAttribute(
      'href',
      '/app/lg4/__graph__?mode=local&focus=a.md&depth=1',
    )
  })
})
