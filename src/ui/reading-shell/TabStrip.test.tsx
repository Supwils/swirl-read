import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { __resetDbForTests } from '@/core/persistence/db'
import { useTabsStore } from '@/stores/tabs-store'
import { TabStrip } from './TabStrip'

/**
 * Test harness — renders the TabStrip with a known vault path inside a
 * memory router. `LocationProbe` mirrors the current URL into a DOM
 * node so assertions can read it without poking router internals.
 */
function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{`${loc.pathname}${loc.search}`}</span>
}

function renderTabStrip(initialPath: string, currentPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <TabStrip vaultId="v" currentPath={currentPath} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await __resetDbForTests()
  useTabsStore.setState({
    tabsByVault: {},
    recentlyClosedByVault: {},
    ready: true,
  })
})

afterEach(async () => {
  await __resetDbForTests()
  useTabsStore.setState({
    tabsByVault: {},
    recentlyClosedByVault: {},
    ready: false,
  })
})

describe('TabStrip — close button (A.H1 regression)', () => {
  it('closing the last tab navigates to /app/:vaultId?empty=1', async () => {
    const user = userEvent.setup()
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })

    renderTabStrip('/app/v/a.md', 'a.md')

    const closeBtn = await waitFor(() =>
      screen.getByRole('button', { name: /close a\.md/i }),
    )
    await user.click(closeBtn)

    // Tabs are gone from the store and the URL carries the empty=1
    // opt-out so VaultHome won't auto-redirect into index.md and
    // silently re-create a tab.
    await waitFor(() => {
      expect(useTabsStore.getState().tabsByVault.v ?? []).toEqual([])
    })
    expect(screen.getByTestId('loc').textContent).toBe('/app/v?empty=1')
  })

  it('closing a non-last tab navigates to a neighbour', async () => {
    const user = userEvent.setup()
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    await useTabsStore.getState().openOrFocus('v', 'b.md', { pin: true })

    renderTabStrip('/app/v/a.md', 'a.md')

    const closeBtn = await waitFor(() =>
      screen.getByRole('button', { name: /close a\.md/i }),
    )
    await user.click(closeBtn)

    await waitFor(() => {
      const paths = (useTabsStore.getState().tabsByVault.v ?? []).map(
        (t) => t.path,
      )
      expect(paths).toEqual(['b.md'])
    })
    expect(screen.getByTestId('loc').textContent).toBe('/app/v/b.md')
  })

  it('closing an inactive tab does not change the URL', async () => {
    const user = userEvent.setup()
    await useTabsStore.getState().openOrFocus('v', 'a.md', { pin: true })
    await useTabsStore.getState().openOrFocus('v', 'b.md', { pin: true })

    renderTabStrip('/app/v/a.md', 'a.md')

    const closeBtn = await waitFor(() =>
      screen.getByRole('button', { name: /close b\.md/i }),
    )
    await user.click(closeBtn)

    await waitFor(() => {
      const paths = (useTabsStore.getState().tabsByVault.v ?? []).map(
        (t) => t.path,
      )
      expect(paths).toEqual(['a.md'])
    })
    expect(screen.getByTestId('loc').textContent).toBe('/app/v/a.md')
  })
})
