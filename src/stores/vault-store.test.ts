import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useVaultStore,
  getAdapter,
  getActiveAdapter,
  __resetAdaptersForTests,
} from './vault-store'
import { __resetDbForTests, db } from '@/core/persistence/db'
import type { VaultFileSystem } from '@/core/vault'

function fakeAdapter(id: string, name = id): VaultFileSystem {
  return {
    id,
    name,
    isReadOnly: false,
    list: vi.fn(),
    walk: vi.fn(),
    stat: vi.fn(),
    readText: vi.fn(),
    readBinary: vi.fn(),
    getBlobURL: vi.fn(),
    hasPermission: vi.fn().mockResolvedValue(true),
    requestPermission: vi.fn().mockResolvedValue(true),
    writeText: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  // Reset Zustand state (init() is idempotent but we also clear cached fields)
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: false,
  })
})

describe('vault store — init', () => {
  it('marks ready after first init even with empty db', async () => {
    await useVaultStore.getState().init()
    expect(useVaultStore.getState().ready).toBe(true)
    expect(useVaultStore.getState().registeredVaults).toEqual([])
    expect(useVaultStore.getState().activeVaultId).toBeNull()
  })

  it('init is idempotent', async () => {
    await useVaultStore.getState().init()
    await useVaultStore.getState().init()
    expect(useVaultStore.getState().ready).toBe(true)
  })
})

describe('vault store — registerVault', () => {
  it('persists meta, caches adapter, and marks vault active', async () => {
    const adapter = fakeAdapter('alpha-1234', 'Alpha')
    const meta = await useVaultStore.getState().registerVault(adapter)

    expect(meta.id).toBe('alpha-1234')
    expect(meta.name).toBe('Alpha')
    expect(meta.registeredAt).toBeInstanceOf(Date)

    expect(useVaultStore.getState().registeredVaults).toHaveLength(1)
    expect(useVaultStore.getState().activeVaultId).toBe('alpha-1234')
    expect(getAdapter('alpha-1234')).toBe(adapter)
    expect(getActiveAdapter()).toBe(adapter)
  })

  it('re-registering the same id replaces (not duplicates) the meta', async () => {
    const v1 = fakeAdapter('alpha-1234', 'first')
    const v2 = fakeAdapter('alpha-1234', 'second')
    await useVaultStore.getState().registerVault(v1)
    await useVaultStore.getState().registerVault(v2)
    expect(useVaultStore.getState().registeredVaults).toHaveLength(1)
    expect(useVaultStore.getState().registeredVaults[0]?.name).toBe('second')
    expect(getAdapter('alpha-1234')).toBe(v2)
  })

  it('keeps registeredAt of the original entry on re-register', async () => {
    const adapter = fakeAdapter('alpha-1234')
    const first = await useVaultStore.getState().registerVault(adapter)
    await new Promise((r) => setTimeout(r, 5))
    const second = await useVaultStore.getState().registerVault(adapter)
    expect(second.registeredAt.getTime()).toBe(first.registeredAt.getTime())
    expect(second.lastOpenedAt.getTime()).toBeGreaterThanOrEqual(
      first.lastOpenedAt.getTime(),
    )
  })

  it('survives a fresh init from Dexie', async () => {
    const adapter = fakeAdapter('persist-1', 'Persisted')
    await useVaultStore.getState().registerVault(adapter)

    // Simulate a page reload: clear in-memory adapters and Zustand state,
    // then re-init from Dexie.
    __resetAdaptersForTests()
    useVaultStore.setState({
      registeredVaults: [],
      activeVaultId: null,
      ready: false,
    })

    await useVaultStore.getState().init()
    expect(useVaultStore.getState().registeredVaults).toHaveLength(1)
    expect(useVaultStore.getState().registeredVaults[0]?.name).toBe('Persisted')
    expect(useVaultStore.getState().activeVaultId).toBe('persist-1')
    // Adapter is NOT auto-restored — needs M6.3 permission re-grant
    expect(getAdapter('persist-1')).toBeNull()
  })
})

describe('vault store — switchVault', () => {
  it('changes active id and updates lastOpenedAt', async () => {
    const a = fakeAdapter('a-1111')
    const b = fakeAdapter('b-2222')
    await useVaultStore.getState().registerVault(a)
    await useVaultStore.getState().registerVault(b)
    // b is active after registration
    expect(useVaultStore.getState().activeVaultId).toBe('b-2222')

    await useVaultStore.getState().switchVault('a-1111')
    expect(useVaultStore.getState().activeVaultId).toBe('a-1111')
    expect(useVaultStore.getState().registeredVaults[0]?.id).toBe('a-1111')
  })

  it('is a no-op for unknown ids', async () => {
    await useVaultStore.getState().switchVault('does-not-exist')
    expect(useVaultStore.getState().activeVaultId).toBeNull()
  })
})

describe('vault store — removeVault', () => {
  it('removes from list and clears active if it was active', async () => {
    const adapter = fakeAdapter('to-remove-9999')
    await useVaultStore.getState().registerVault(adapter)
    await useVaultStore.getState().removeVault('to-remove-9999')

    expect(useVaultStore.getState().registeredVaults).toEqual([])
    expect(useVaultStore.getState().activeVaultId).toBeNull()
    expect(getAdapter('to-remove-9999')).toBeNull()
  })

  it('does not touch active when removing a non-active vault', async () => {
    const a = fakeAdapter('keep-1111')
    const b = fakeAdapter('drop-2222')
    await useVaultStore.getState().registerVault(a)
    await useVaultStore.getState().registerVault(b)
    // b is active; remove a
    await useVaultStore.getState().removeVault('keep-1111')
    expect(useVaultStore.getState().activeVaultId).toBe('drop-2222')
    expect(useVaultStore.getState().registeredVaults).toHaveLength(1)
  })

  it('calls adapter.dispose() to revoke blob URLs (audit fix B1)', async () => {
    const dispose = vi.fn()
    const adapter: VaultFileSystem = {
      ...fakeAdapter('blob-vault'),
      dispose,
    }
    await useVaultStore.getState().registerVault(adapter)

    await useVaultStore.getState().removeVault('blob-vault')

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(getAdapter('blob-vault')).toBeNull()
  })

  it('survives an adapter whose dispose() throws', async () => {
    const adapter: VaultFileSystem = {
      ...fakeAdapter('throw-vault'),
      dispose: () => {
        throw new Error('boom')
      },
    }
    await useVaultStore.getState().registerVault(adapter)

    await expect(
      useVaultStore.getState().removeVault('throw-vault'),
    ).resolves.toBeUndefined()
    expect(getAdapter('throw-vault')).toBeNull()
  })

  it('drops in-memory reader-store entries via forgetVault (audit fix)', async () => {
    const adapter = fakeAdapter('mem-target')
    await useVaultStore.getState().registerVault(adapter)
    // Seed in-memory state without going through Dexie (reader-store
    // tests cover the persistent path; here we only verify the
    // forget-on-remove invariant).
    const { useReaderStore } = await import('@/stores/reader-store')
    useReaderStore.setState({
      recentByVault: {
        'mem-target': [
          {
            vaultId: 'mem-target',
            path: 'a.md',
            openedAt: new Date(0),
          },
        ],
      },
      scrollByVault: {
        'mem-target': {
          'a.md': {
            vaultId: 'mem-target',
            path: 'a.md',
            scrollY: 100,
            updatedAt: new Date(0),
          },
        },
      },
      ready: true,
    })

    await useVaultStore.getState().removeVault('mem-target')

    expect(
      useReaderStore.getState().recentByVault['mem-target'],
    ).toBeUndefined()
    expect(
      useReaderStore.getState().scrollByVault['mem-target'],
    ).toBeUndefined()
  })

  it('also wipes per-vault rows from recentFiles, scrollPositions, backlinks (audit fix)', async () => {
    const adapter = fakeAdapter('audit-target')
    await useVaultStore.getState().registerVault(adapter)

    // Seed orphan rows that would have leaked under the old behavior.
    await db.recentFiles.put({
      id: JSON.stringify(['audit-target', 'note.md']),
      vaultId: 'audit-target',
      path: 'note.md',
      openedAtMs: 1_000,
    })
    await db.scrollPositions.put({
      id: JSON.stringify(['audit-target', 'note.md']),
      vaultId: 'audit-target',
      path: 'note.md',
      scrollY: 480,
      updatedAtMs: 1_000,
    })
    await db.backlinks.put({
      id: JSON.stringify(['audit-target', 'src.md', 'dst.md']),
      vaultId: 'audit-target',
      sourcePath: 'src.md',
      targetPath: 'dst.md',
      rawTarget: 'dst',
      context: '…',
      updatedAtMs: 1_000,
    })

    // Sibling vault rows should NOT be touched.
    await db.recentFiles.put({
      id: JSON.stringify(['other', 'a.md']),
      vaultId: 'other',
      path: 'a.md',
      openedAtMs: 1_000,
    })

    await useVaultStore.getState().removeVault('audit-target')

    expect(
      await db.recentFiles.where('vaultId').equals('audit-target').count(),
    ).toBe(0)
    expect(
      await db.scrollPositions.where('vaultId').equals('audit-target').count(),
    ).toBe(0)
    expect(
      await db.backlinks.where('vaultId').equals('audit-target').count(),
    ).toBe(0)
    // Sibling vault row stays intact.
    expect(await db.recentFiles.where('vaultId').equals('other').count()).toBe(
      1,
    )
  })
})

describe('vault store — attachAdapter', () => {
  it('binds a live adapter to an existing meta without persistence side effects', () => {
    const adapter = fakeAdapter('attach-target')
    useVaultStore.getState().attachAdapter(adapter)
    expect(getAdapter('attach-target')).toBe(adapter)
  })
})
