import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the handle-storage functions so tests don't try to round-trip
// the FSAPI mock (which isn't structured-cloneable) through fake-IDB.
const handleStore = new Map<string, FileSystemDirectoryHandle>()
vi.mock('@/core/vault/handle-storage', () => ({
  saveHandle: vi.fn((id: string, handle: FileSystemDirectoryHandle) => {
    handleStore.set(id, handle)
    return Promise.resolve()
  }),
  loadHandle: vi.fn((id: string) =>
    Promise.resolve<FileSystemDirectoryHandle | undefined>(handleStore.get(id)),
  ),
  deleteHandle: vi.fn((id: string) => {
    handleStore.delete(id)
    return Promise.resolve()
  }),
  listHandleIds: vi.fn(() => Promise.resolve(Array.from(handleStore.keys()))),
}))

import {
  __resetPendingAdaptersForTests,
  autoRestoreVaults,
  reauthorizeVault,
} from './auto-restore'
import {
  __resetAdaptersForTests,
  getAdapter,
  useVaultStore,
} from '@/stores/vault-store'
import { __resetDbForTests, db } from '@/core/persistence/db'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetPendingAdaptersForTests()
  handleStore.clear()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: false,
  })
})

afterEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetPendingAdaptersForTests()
  handleStore.clear()
  vi.restoreAllMocks()
})

interface SeedOptions {
  saveHandle?: boolean
  permissionState?: 'granted' | 'prompt' | 'denied'
  requestResult?: 'granted' | 'denied'
}

function seedHandle(
  id: string,
  name: string,
  options: SeedOptions = {},
): FileSystemDirectoryHandle {
  const handle = mockRoot(name, {})
  if (options.permissionState) {
    vi.spyOn(handle, 'queryPermission').mockResolvedValue(
      options.permissionState,
    )
  }
  if (options.requestResult) {
    vi.spyOn(handle, 'requestPermission').mockResolvedValue(
      options.requestResult,
    )
  }
  if (options.saveHandle) {
    handleStore.set(id, handle)
  }
  return handle
}

async function seedMeta(id: string, name: string): Promise<void> {
  await db.vaults.put({
    id,
    name,
    registeredAtMs: 1_000,
    lastOpenedAtMs: 1_000,
  })
}

describe('autoRestoreVaults', () => {
  it('attaches an adapter when the saved handle is still permission-granted', async () => {
    await seedMeta('v1', 'Vault One')
    seedHandle('v1', 'Vault One', {
      saveHandle: true,
      permissionState: 'granted',
    })

    const result = await autoRestoreVaults()

    expect(result.restored).toEqual(['v1'])
    expect(result.pending).toEqual([])
    expect(getAdapter('v1')).not.toBeNull()
  })

  it('marks a vault as pending (not attached) when permission has lapsed', async () => {
    await seedMeta('v1', 'Vault One')
    seedHandle('v1', 'Vault One', {
      saveHandle: true,
      permissionState: 'prompt',
    })

    const result = await autoRestoreVaults()

    expect(result.restored).toEqual([])
    expect(result.pending).toEqual(['v1'])
    expect(getAdapter('v1')).toBeNull()
  })

  it('skips orphan handles whose vault meta has been removed', async () => {
    seedHandle('orphan-id', 'orphan', {
      saveHandle: true,
      permissionState: 'granted',
    })
    // No matching vault meta row.

    const result = await autoRestoreVaults()

    expect(result.restored).toEqual([])
    expect(result.pending).toEqual([])
  })

  it('garbage-collects orphan handles during the boot pass (audit fix)', async () => {
    seedHandle('orphan-id', 'orphan', {
      saveHandle: true,
      permissionState: 'granted',
    })
    expect(handleStore.has('orphan-id')).toBe(true)

    await autoRestoreVaults()

    // Orphan handle should be deleted from idb-keyval, otherwise it
    // would accumulate across remove/re-register cycles.
    expect(handleStore.has('orphan-id')).toBe(false)
  })

  it('hydrates the vault store before processing handles', async () => {
    await seedMeta('v1', 'Vault One')
    seedHandle('v1', 'Vault One', {
      saveHandle: true,
      permissionState: 'granted',
    })
    expect(useVaultStore.getState().ready).toBe(false)

    await autoRestoreVaults()

    expect(useVaultStore.getState().ready).toBe(true)
    expect(useVaultStore.getState().registeredVaults).toHaveLength(1)
  })

  it('returns gracefully when no vaults are registered', async () => {
    const result = await autoRestoreVaults()
    expect(result.restored).toEqual([])
    expect(result.pending).toEqual([])
    expect(result.errors).toEqual([])
  })
})

describe('reauthorizeVault', () => {
  it('attaches the adapter once the user grants permission', async () => {
    await seedMeta('v1', 'Vault One')
    seedHandle('v1', 'Vault One', {
      saveHandle: true,
      permissionState: 'prompt',
      requestResult: 'granted',
    })
    await autoRestoreVaults()
    expect(getAdapter('v1')).toBeNull()

    const ok = await reauthorizeVault('v1')

    expect(ok).toBe(true)
    expect(getAdapter('v1')).not.toBeNull()
  })

  it('returns false when the user denies the permission prompt', async () => {
    await seedMeta('v1', 'Vault One')
    seedHandle('v1', 'Vault One', {
      saveHandle: true,
      permissionState: 'prompt',
      requestResult: 'denied',
    })
    await autoRestoreVaults()

    const ok = await reauthorizeVault('v1')

    expect(ok).toBe(false)
    expect(getAdapter('v1')).toBeNull()
  })

  it('returns false when no saved handle exists for the id', async () => {
    const ok = await reauthorizeVault('never-saved')
    expect(ok).toBe(false)
  })
})
