import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetDbForTests, db } from '@/core/persistence/db'
import { useVaultStore } from './vault-store'
import { usePanesStore, PANE_1, PANE_2 } from './panes-store'
import { runVaultDeletionHooks } from './vault-lifecycle'

/** Seed a vault into the registry so persisting pane mutators (which bail
 *  for an unregistered vault) run normally. Mirrors the real flow where a
 *  vault is always registered before its Workspace mounts. */
function registerTestVault(id: string): void {
  const now = new Date()
  useVaultStore.setState((s) => ({
    registeredVaults: [
      ...s.registeredVaults.filter((v) => v.id !== id),
      { id, name: id, registeredAt: now, lastOpenedAt: now },
    ],
  }))
}

beforeEach(async () => {
  await __resetDbForTests()
  usePanesStore.setState({ panesByVault: {}, ready: true })
  useVaultStore.setState({ registeredVaults: [] })
  registerTestVault('v')
})

afterEach(async () => {
  await __resetDbForTests()
})

describe('panes-store', () => {
  it('getOrInit returns a single-pane default without persisting', async () => {
    const state = usePanesStore.getState().getOrInit('v')
    expect(state.viewMode).toBe('single')
    expect(state.panes).toHaveLength(1)
    expect(state.panes[0]?.id).toBe(PANE_1)
    expect(state.activePaneId).toBe(PANE_1)
    // Pure read — no Dexie row exists until a real mutation occurs.
    expect(await db.panes.get('v')).toBeUndefined()
  })

  it('persisting mutators no-op for an unregistered (removed) vault', async () => {
    // Simulate the removal race: the vault is gone from the registry but a
    // late async action still reaches a pane mutator.
    useVaultStore.setState({ registeredVaults: [] })
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'late.md')
    expect(usePanesStore.getState().panesByVault.v).toBeUndefined()
    expect(await db.panes.get('v')).toBeUndefined()
  })

  it('setCurrentPath writes through to Dexie', async () => {
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'reading/why.md')
    const row = await db.panes.get('v')
    expect(row?.panes[0]?.currentPath).toBe('reading/why.md')
  })

  it('splitPane single → dual, pane 2 inherits pane 1 by default', async () => {
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'a.md')
    await usePanesStore.getState().splitPane('v')
    const next = usePanesStore.getState().panesByVault.v
    expect(next?.viewMode).toBe('dual')
    expect(next?.panes).toHaveLength(2)
    expect(next?.panes[1]?.currentPath).toBe('a.md')
    expect(next?.activePaneId).toBe(PANE_2)
  })

  it('splitPane with explicit path opens that doc in pane 2', async () => {
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'a.md')
    await usePanesStore.getState().splitPane('v', 'b.md')
    expect(usePanesStore.getState().panesByVault.v?.panes[1]?.currentPath).toBe(
      'b.md',
    )
  })

  it('closePane returns to single mode with the survivor renamed to pane-1', async () => {
    usePanesStore.setState({
      panesByVault: {
        v: {
          panes: [
            { id: PANE_1, currentPath: 'a.md' },
            { id: PANE_2, currentPath: 'b.md' },
          ],
          activePaneId: PANE_2,
          viewMode: 'dual',
        },
      },
      ready: true,
    })
    await usePanesStore.getState().closePane('v', PANE_1)
    const next = usePanesStore.getState().panesByVault.v
    expect(next?.viewMode).toBe('single')
    expect(next?.panes).toHaveLength(1)
    expect(next?.panes[0]?.id).toBe(PANE_1)
    expect(next?.panes[0]?.currentPath).toBe('b.md')
    expect(next?.activePaneId).toBe(PANE_1)
  })

  it('openInOtherPane splits when single and lands in pane 2', async () => {
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'a.md')
    await usePanesStore.getState().openInOtherPane('v', 'b.md')
    const state = usePanesStore.getState().panesByVault.v
    expect(state?.viewMode).toBe('dual')
    expect(state?.panes[1]?.currentPath).toBe('b.md')
    expect(state?.activePaneId).toBe(PANE_2)
  })

  it('openInOtherPane swaps targets in dual mode', async () => {
    usePanesStore.setState({
      panesByVault: {
        v: {
          panes: [
            { id: PANE_1, currentPath: 'a.md' },
            { id: PANE_2, currentPath: 'b.md' },
          ],
          activePaneId: PANE_1,
          viewMode: 'dual',
        },
      },
      ready: true,
    })
    await usePanesStore.getState().openInOtherPane('v', 'c.md')
    const state = usePanesStore.getState().panesByVault.v
    expect(state?.panes[1]?.currentPath).toBe('c.md')
    expect(state?.activePaneId).toBe(PANE_2)
  })

  it('openInPane(PANE_2) splits from single, lands pane2, focuses pane2', async () => {
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'a.md')
    await usePanesStore.getState().openInPane('v', PANE_2, 'b.md')
    const state = usePanesStore.getState().panesByVault.v
    expect(state?.viewMode).toBe('dual')
    expect(state?.panes[0]?.currentPath).toBe('a.md')
    expect(state?.panes[1]?.currentPath).toBe('b.md')
    expect(state?.activePaneId).toBe(PANE_2)
  })

  it('openInPane(PANE_1) sets pane 1 and focuses it in single mode', async () => {
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'a.md')
    await usePanesStore.getState().openInPane('v', PANE_1, 'b.md')
    const state = usePanesStore.getState().panesByVault.v
    expect(state?.viewMode).toBe('single')
    expect(state?.panes).toHaveLength(1)
    expect(state?.panes[0]?.currentPath).toBe('b.md')
    expect(state?.activePaneId).toBe(PANE_1)
  })

  it('openInPane(PANE_2) swaps pane 2 + focuses it when already dual', async () => {
    usePanesStore.setState({
      panesByVault: {
        v: {
          panes: [
            { id: PANE_1, currentPath: 'a.md' },
            { id: PANE_2, currentPath: 'b.md' },
          ],
          activePaneId: PANE_1,
          viewMode: 'dual',
        },
      },
      ready: true,
    })
    await usePanesStore.getState().openInPane('v', PANE_2, 'c.md')
    const state = usePanesStore.getState().panesByVault.v
    expect(state?.viewMode).toBe('dual')
    expect(state?.panes[0]?.currentPath).toBe('a.md')
    expect(state?.panes[1]?.currentPath).toBe('c.md')
    expect(state?.activePaneId).toBe(PANE_2)
  })

  it('openInPane(PANE_1) swaps pane 1 + focuses it when already dual', async () => {
    usePanesStore.setState({
      panesByVault: {
        v: {
          panes: [
            { id: PANE_1, currentPath: 'a.md' },
            { id: PANE_2, currentPath: 'b.md' },
          ],
          activePaneId: PANE_2,
          viewMode: 'dual',
        },
      },
      ready: true,
    })
    await usePanesStore.getState().openInPane('v', PANE_1, 'c.md')
    const state = usePanesStore.getState().panesByVault.v
    expect(state?.viewMode).toBe('dual')
    expect(state?.panes[0]?.currentPath).toBe('c.md')
    expect(state?.panes[1]?.currentPath).toBe('b.md')
    expect(state?.activePaneId).toBe(PANE_1)
  })

  it('focusPane(PANE_2) is a no-op in single mode', async () => {
    usePanesStore.getState().getOrInit('v')
    await usePanesStore.getState().focusPane('v', PANE_2)
    expect(usePanesStore.getState().panesByVault.v?.activePaneId).toBe(PANE_1)
  })

  it('forgetVault deletes both in-memory state and the persisted row', async () => {
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'a.md')
    expect(await db.panes.get('v')).toBeTruthy()
    usePanesStore.getState().forgetVault('v')
    expect(usePanesStore.getState().panesByVault.v).toBeUndefined()
    // The delete is fire-and-forget; await a microtask cycle.
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(await db.panes.get('v')).toBeUndefined()
  })

  it('vault-lifecycle deletion hook cleans up panes', async () => {
    await usePanesStore.getState().setCurrentPath('v', PANE_1, 'a.md')
    await runVaultDeletionHooks('v')
    expect(usePanesStore.getState().panesByVault.v).toBeUndefined()
  })

  it('init() rehydrates from Dexie', async () => {
    await db.panes.put({
      vaultId: 'v',
      panes: [
        { id: PANE_1, currentPath: 'a.md' },
        { id: PANE_2, currentPath: 'b.md' },
      ],
      activePaneId: PANE_2,
      viewMode: 'dual',
    })
    usePanesStore.setState({ panesByVault: {}, ready: false })
    await usePanesStore.getState().init()
    const state = usePanesStore.getState().panesByVault.v
    expect(state?.viewMode).toBe('dual')
    expect(state?.panes[1]?.currentPath).toBe('b.md')
    expect(state?.activePaneId).toBe(PANE_2)
  })
})
