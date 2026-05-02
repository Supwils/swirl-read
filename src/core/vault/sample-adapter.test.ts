import { describe, it, expect } from 'vitest'
import { SampleVaultAdapter } from './sample-adapter'
import { VaultFileNotFoundError, VaultWriteError } from './types'

const SPEC = {
  id: 'sample',
  name: 'Sample Vault',
  files: {
    'index.md': '# Welcome',
    'notes/a.md': '# A',
    'notes/b.md': '# B',
    'images/logo.png': new Uint8Array([1, 2, 3]),
  },
}

describe('SampleVaultAdapter (M8.2)', () => {
  it('lists root entries with directories first', async () => {
    const v = new SampleVaultAdapter(SPEC)
    const entries = await v.list('')
    expect(entries.map((e) => e.name)).toEqual(['images', 'notes', 'index.md'])
  })

  it('lists files inside a subdirectory', async () => {
    const v = new SampleVaultAdapter(SPEC)
    const entries = await v.list('notes')
    expect(entries.map((e) => e.name)).toEqual(['a.md', 'b.md'])
  })

  it('readText returns the source for text files', async () => {
    const v = new SampleVaultAdapter(SPEC)
    expect(await v.readText('index.md')).toBe('# Welcome')
  })

  it('readBinary returns bytes for binary files', async () => {
    const v = new SampleVaultAdapter(SPEC)
    const bytes = await v.readBinary('images/logo.png')
    expect(Array.from(bytes)).toEqual([1, 2, 3])
  })

  it('throws VaultFileNotFoundError for missing paths', async () => {
    const v = new SampleVaultAdapter(SPEC)
    await expect(v.readText('does/not/exist.md')).rejects.toBeInstanceOf(
      VaultFileNotFoundError,
    )
  })

  it('walk yields every file once', async () => {
    const v = new SampleVaultAdapter(SPEC)
    const seen: string[] = []
    for await (const file of v.walk()) seen.push(file.path)
    expect(seen.sort()).toEqual([
      'images/logo.png',
      'index.md',
      'notes/a.md',
      'notes/b.md',
    ])
  })

  it('stat differentiates files and directories', async () => {
    const v = new SampleVaultAdapter(SPEC)
    expect((await v.stat('notes')).isDirectory).toBe(true)
    expect((await v.stat('index.md')).isDirectory).toBe(false)
  })

  it('hasPermission and requestPermission are trivially granted', async () => {
    const v = new SampleVaultAdapter(SPEC)
    expect(await v.hasPermission()).toBe(true)
    expect(await v.requestPermission()).toBe(true)
  })

  it('writeText rejects with VaultWriteError because the sample is read-only (Phase 2A)', async () => {
    const v = new SampleVaultAdapter(SPEC)
    await expect(v.writeText('index.md', 'changed')).rejects.toBeInstanceOf(
      VaultWriteError,
    )
  })

  it('hasWritePermission is always false for the sample adapter', async () => {
    const v = new SampleVaultAdapter(SPEC)
    expect(await v.hasWritePermission()).toBe(false)
    expect(await v.requestWritePermission()).toBe(false)
  })
})
