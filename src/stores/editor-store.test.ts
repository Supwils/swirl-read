import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  VaultFileNotFoundError,
  VaultPermissionDeniedError,
  VaultWriteError,
  type VaultEntry,
  type VaultFile,
  type VaultFileSystem,
  type VaultId,
  type VaultPath,
} from '@/core/vault'
import { useEditorStore, isDirty, isEditing } from './editor-store'

interface MockAdapter extends VaultFileSystem {
  readonly _writes: { path: VaultPath; content: string }[]
  setDiskContents: (path: VaultPath, content: string) => void
  setReadError: (err: Error | null) => void
  setWriteError: (err: Error | null) => void
  setHasWrite: (granted: boolean) => void
  setRequestResult: (granted: boolean) => void
}

function makeMockAdapter(
  vaultId: VaultId,
  initial: Record<VaultPath, string> = {},
): MockAdapter {
  const disk = new Map<VaultPath, string>(Object.entries(initial))
  const writes: { path: VaultPath; content: string }[] = []
  let readError: Error | null = null
  let writeError: Error | null = null
  let hasWriteState = true
  let requestResult = true

  const adapter: MockAdapter = {
    id: vaultId,
    name: vaultId,
    isReadOnly: false,
    _writes: writes,
    setDiskContents(path, content) {
      disk.set(path, content)
    },
    setReadError(err) {
      readError = err
    },
    setWriteError(err) {
      writeError = err
    },
    setHasWrite(granted) {
      hasWriteState = granted
    },
    setRequestResult(granted) {
      requestResult = granted
    },
    list(): Promise<VaultEntry[]> {
      return Promise.resolve([])
    },
    walk(): AsyncIterable<VaultFile> {
      const empty: AsyncIterable<VaultFile> = {
        [Symbol.asyncIterator](): AsyncIterator<VaultFile> {
          return {
            next(): Promise<IteratorResult<VaultFile>> {
              return Promise.resolve({ value: undefined, done: true })
            },
          }
        },
      }
      return empty
    },
    stat(path): Promise<VaultEntry> {
      return Promise.reject(new VaultFileNotFoundError(path))
    },
    readText(path): Promise<string> {
      if (readError) return Promise.reject(readError)
      const value = disk.get(path)
      if (value === undefined) {
        return Promise.reject(new VaultFileNotFoundError(path))
      }
      return Promise.resolve(value)
    },
    readBinary(): Promise<Uint8Array> {
      return Promise.resolve(new Uint8Array())
    },
    writeText(path, content): Promise<void> {
      if (writeError) return Promise.reject(writeError)
      disk.set(path, content)
      writes.push({ path, content })
      return Promise.resolve()
    },
    hasWritePermission(): Promise<boolean> {
      return Promise.resolve(hasWriteState)
    },
    requestWritePermission(): Promise<boolean> {
      hasWriteState = requestResult
      return Promise.resolve(requestResult)
    },
    getBlobURL(): Promise<string> {
      return Promise.resolve('')
    },
    hasPermission(): Promise<boolean> {
      return Promise.resolve(true)
    },
    requestPermission(): Promise<boolean> {
      return Promise.resolve(true)
    },
  }

  return adapter
}

beforeEach(() => {
  useEditorStore.setState({ active: null })
})

describe('editor-store — enter / updateDraft / cancel', () => {
  it('enter() seeds a clean session with original==draft', () => {
    useEditorStore
      .getState()
      .enter('vault-a', 'notes/hello.md', '# Hello\n\nworld')
    const session = useEditorStore.getState().active
    expect(session).not.toBeNull()
    expect(session?.original).toBe('# Hello\n\nworld')
    expect(session?.draft).toBe('# Hello\n\nworld')
    expect(session?.dirty).toBe(false)
    expect(session?.conflict).toBe('clean')
    expect(session?.error).toBeNull()
    expect(isEditing()).toBe(true)
    expect(isDirty()).toBe(false)
  })

  it('updateDraft() flips dirty when draft diverges from original', () => {
    const { enter, updateDraft } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    expect(useEditorStore.getState().active?.dirty).toBe(true)
    expect(isDirty()).toBe(true)
  })

  it('updateDraft() back to original clears dirty', () => {
    const { enter, updateDraft } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    updateDraft('one')
    expect(useEditorStore.getState().active?.dirty).toBe(false)
  })

  it('cancel() drops the session', () => {
    const { enter, updateDraft, cancel } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    cancel()
    expect(useEditorStore.getState().active).toBeNull()
    expect(isEditing()).toBe(false)
  })

  it('forgetVault() drops the session only if vault matches', () => {
    const { enter, forgetVault } = useEditorStore.getState()
    enter('vault-a', 'a.md', 'one')
    forgetVault('vault-b')
    expect(useEditorStore.getState().active).not.toBeNull()
    forgetVault('vault-a')
    expect(useEditorStore.getState().active).toBeNull()
  })
})

describe('editor-store — save happy path', () => {
  it('writes the draft and resets dirty', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    const result = await save(() => adapter)
    expect(result).toBe('clean')
    expect(adapter._writes).toEqual([{ path: 'a.md', content: 'two' }])
    const session = useEditorStore.getState().active
    expect(session?.draft).toBe('two')
    expect(session?.original).toBe('two')
    expect(session?.dirty).toBe(false)
    expect(session?.saving).toBe(false)
    expect(session?.error).toBeNull()
  })

  it('a no-change save still writes and stays clean', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    const { enter, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    const result = await save(() => adapter)
    expect(result).toBe('clean')
    expect(adapter._writes).toHaveLength(1)
  })

  it('returns "clean" no-op when no session is active', async () => {
    const result = await useEditorStore.getState().save(() => null)
    expect(result).toBe('clean')
  })
})

describe('editor-store — save permission flow', () => {
  it('requests write permission lazily and proceeds when granted', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    adapter.setHasWrite(false)
    adapter.setRequestResult(true)
    const requestSpy = vi.spyOn(adapter, 'requestWritePermission')

    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    await save(() => adapter)

    expect(requestSpy).toHaveBeenCalledOnce()
    expect(adapter._writes).toHaveLength(1)
    expect(useEditorStore.getState().active?.dirty).toBe(false)
  })

  it('surfaces permission-denied error and preserves the draft', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    adapter.setHasWrite(false)
    adapter.setRequestResult(false)

    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('draft-text')
    await save(() => adapter)

    const session = useEditorStore.getState().active
    expect(session?.error?.kind).toBe('permission-denied')
    expect(session?.draft).toBe('draft-text')
    expect(session?.dirty).toBe(true)
    expect(adapter._writes).toHaveLength(0)
  })
})

describe('editor-store — save error mapping', () => {
  it('maps VaultPermissionDeniedError thrown from writeText', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    adapter.setWriteError(new VaultPermissionDeniedError())
    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    await save(() => adapter)
    expect(useEditorStore.getState().active?.error?.kind).toBe(
      'permission-denied',
    )
  })

  it('maps VaultWriteError without "read-only" → write-failed', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    adapter.setWriteError(new VaultWriteError('a.md', { reason: 'disk full' }))
    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    await save(() => adapter)
    expect(useEditorStore.getState().active?.error?.kind).toBe('write-failed')
  })

  it('maps VaultWriteError mentioning "read-only" → read-only-vault', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    adapter.setWriteError(
      new VaultWriteError('a.md', {
        reason: 'Sample vault is read-only — open your own vault to edit',
      }),
    )
    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    await save(() => adapter)
    expect(useEditorStore.getState().active?.error?.kind).toBe(
      'read-only-vault',
    )
  })

  it('falls back to "unknown" for non-vault errors', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    adapter.setWriteError(new Error('boom'))
    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    await save(() => adapter)
    const err = useEditorStore.getState().active?.error
    expect(err?.kind).toBe('unknown')
    expect(err?.message).toBe('boom')
  })

  it('flags unknown error from a failed pre-read', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    adapter.setReadError(new Error('disk offline'))
    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    await save(() => adapter)
    expect(useEditorStore.getState().active?.error?.kind).toBe('unknown')
    expect(adapter._writes).toHaveLength(0)
  })
})

describe('editor-store — conflict detection', () => {
  it('blocks save when disk diverged from original', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('user-edit')
    adapter.setDiskContents('a.md', 'changed-by-other-app')
    const result = await save(() => adapter)
    expect(result).toBe('stale-on-disk')
    expect(adapter._writes).toHaveLength(0)
    const session = useEditorStore.getState().active
    expect(session?.conflict).toBe('stale-on-disk')
    expect(session?.draft).toBe('user-edit')
    expect(session?.saving).toBe(false)
  })

  it('overwrite() bypasses the conflict and writes the draft', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    const { enter, updateDraft, save, overwrite } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('user-edit')
    adapter.setDiskContents('a.md', 'changed-by-other-app')
    await save(() => adapter)
    expect(useEditorStore.getState().active?.conflict).toBe('stale-on-disk')

    await overwrite(() => adapter)
    expect(adapter._writes).toEqual([{ path: 'a.md', content: 'user-edit' }])
    const session = useEditorStore.getState().active
    expect(session?.conflict).toBe('clean')
    expect(session?.dirty).toBe(false)
  })

  it('reloadFromDisk() clears the conflict and draft', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    const { enter, updateDraft, save, reloadFromDisk } =
      useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('user-edit')
    adapter.setDiskContents('a.md', 'changed-by-other-app')
    await save(() => adapter)

    await reloadFromDisk(() => adapter)
    const session = useEditorStore.getState().active
    expect(session?.conflict).toBe('clean')
    expect(session?.draft).toBe('changed-by-other-app')
    expect(session?.original).toBe('changed-by-other-app')
    expect(session?.dirty).toBe(false)
  })
})

describe('editor-store — adapter unavailable', () => {
  it('save() with no adapter records an unknown error', async () => {
    const { enter, updateDraft, save } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    await save(() => null)
    expect(useEditorStore.getState().active?.error?.kind).toBe('unknown')
  })
})

describe('editor-store — clearError', () => {
  it('clears error but leaves draft and conflict intact', async () => {
    const adapter = makeMockAdapter('v', { 'a.md': 'one' })
    adapter.setWriteError(new Error('boom'))
    const { enter, updateDraft, save, clearError } = useEditorStore.getState()
    enter('v', 'a.md', 'one')
    updateDraft('two')
    await save(() => adapter)
    expect(useEditorStore.getState().active?.error?.kind).toBe('unknown')
    clearError()
    const session = useEditorStore.getState().active
    expect(session?.error).toBeNull()
    expect(session?.draft).toBe('two')
    expect(session?.dirty).toBe(true)
  })
})
