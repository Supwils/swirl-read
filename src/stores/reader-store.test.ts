import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, __resetDbForTests } from '@/core/persistence/db'
import {
  MAX_RECENT_FILES_PER_VAULT,
  MAX_SCROLL_POSITIONS_PER_VAULT,
  getRecentFilesForVault,
  getScrollPosition,
  useReaderStore,
} from './reader-store'

beforeEach(async () => {
  vi.restoreAllMocks()
  await __resetDbForTests()
  useReaderStore.setState({
    recentByVault: {},
    scrollByVault: {},
    ready: false,
  })
})

function mockNowSequence(start = 1_000): void {
  let current = start
  vi.spyOn(Date, 'now').mockImplementation(() => {
    current += 1_000
    return current
  })
}

describe('reader store — init', () => {
  it('marks ready with an empty recent map when db is empty', async () => {
    await useReaderStore.getState().init()
    expect(useReaderStore.getState().ready).toBe(true)
    expect(useReaderStore.getState().recentByVault).toEqual({})
  })

  it('restores persisted recent files latest-first', async () => {
    await db.recentFiles.bulkPut([
      {
        id: JSON.stringify(['vault-a', 'old.md']),
        vaultId: 'vault-a',
        path: 'old.md',
        openedAtMs: 1_000,
      },
      {
        id: JSON.stringify(['vault-a', 'new.md']),
        vaultId: 'vault-a',
        path: 'new.md',
        openedAtMs: 2_000,
      },
    ])

    await useReaderStore.getState().init()

    expect(getRecentFilesForVault('vault-a').map((item) => item.path)).toEqual([
      'new.md',
      'old.md',
    ])
  })
})

describe('reader store — recent files', () => {
  it('records opened files latest-first', async () => {
    mockNowSequence()

    await useReaderStore.getState().markRecentFile('vault-a', 'a.md')
    await useReaderStore.getState().markRecentFile('vault-a', 'b.md')

    expect(getRecentFilesForVault('vault-a').map((item) => item.path)).toEqual([
      'b.md',
      'a.md',
    ])
  })

  it('dedupes a file and moves it to the top', async () => {
    mockNowSequence()

    await useReaderStore.getState().markRecentFile('vault-a', 'a.md')
    await useReaderStore.getState().markRecentFile('vault-a', 'b.md')
    await useReaderStore.getState().markRecentFile('vault-a', 'a.md')

    expect(getRecentFilesForVault('vault-a').map((item) => item.path)).toEqual([
      'a.md',
      'b.md',
    ])
    expect(
      await db.recentFiles.where('vaultId').equals('vault-a').count(),
    ).toBe(2)
  })

  it('keeps only the last 20 files per vault and prunes IndexedDB', async () => {
    mockNowSequence()

    for (let i = 0; i < MAX_RECENT_FILES_PER_VAULT + 5; i += 1) {
      await useReaderStore.getState().markRecentFile('vault-a', `note-${i}.md`)
    }

    const recent = getRecentFilesForVault('vault-a')
    expect(recent).toHaveLength(MAX_RECENT_FILES_PER_VAULT)
    expect(recent[0]?.path).toBe('note-24.md')
    expect(recent.at(-1)?.path).toBe('note-5.md')
    expect(
      await db.recentFiles.where('vaultId').equals('vault-a').count(),
    ).toBe(MAX_RECENT_FILES_PER_VAULT)
  })

  it('keeps vaults isolated', async () => {
    mockNowSequence()

    await useReaderStore.getState().markRecentFile('vault-a', 'a.md')
    await useReaderStore.getState().markRecentFile('vault-b', 'b.md')

    expect(getRecentFilesForVault('vault-a').map((item) => item.path)).toEqual([
      'a.md',
    ])
    expect(getRecentFilesForVault('vault-b').map((item) => item.path)).toEqual([
      'b.md',
    ])
  })

  it('normalizes paths before storing', async () => {
    mockNowSequence()

    await useReaderStore.getState().markRecentFile('vault-a', '/dir//note.md/')

    expect(getRecentFilesForVault('vault-a')[0]?.path).toBe('dir/note.md')
  })

  it('clears one vault without touching another vault', async () => {
    mockNowSequence()
    await useReaderStore.getState().markRecentFile('vault-a', 'a.md')
    await useReaderStore.getState().markRecentFile('vault-b', 'b.md')

    await useReaderStore.getState().clearRecentFiles('vault-a')

    expect(getRecentFilesForVault('vault-a')).toEqual([])
    expect(getRecentFilesForVault('vault-b').map((item) => item.path)).toEqual([
      'b.md',
    ])
  })
})

describe('reader store — scroll positions (M2.7)', () => {
  it('init restores persisted scroll positions', async () => {
    await db.scrollPositions.bulkPut([
      {
        id: JSON.stringify(['vault-a', 'note.md']),
        vaultId: 'vault-a',
        path: 'note.md',
        scrollY: 480,
        updatedAtMs: 1_000,
      },
    ])

    await useReaderStore.getState().init()

    expect(getScrollPosition('vault-a', 'note.md')?.scrollY).toBe(480)
  })

  it('records and reads back a scroll position', async () => {
    await useReaderStore.getState().recordScrollPosition('vault-a', 'a.md', 320)

    expect(getScrollPosition('vault-a', 'a.md')?.scrollY).toBe(320)
    const row = await db.scrollPositions.get(
      JSON.stringify(['vault-a', 'a.md']),
    )
    expect(row?.scrollY).toBe(320)
  })

  it('normalizes paths before storing', async () => {
    await useReaderStore
      .getState()
      .recordScrollPosition('vault-a', '/dir//file.md/', 120)

    expect(getScrollPosition('vault-a', 'dir/file.md')?.scrollY).toBe(120)
  })

  it('clamps negative scrollY to 0 and treats it as no memory', async () => {
    await useReaderStore.getState().recordScrollPosition('vault-a', 'a.md', 100)
    await useReaderStore.getState().recordScrollPosition('vault-a', 'a.md', -50)

    expect(getScrollPosition('vault-a', 'a.md')).toBeUndefined()
    expect(
      await db.scrollPositions.get(JSON.stringify(['vault-a', 'a.md'])),
    ).toBeUndefined()
  })

  it('drops the row when a scroll position returns to 0', async () => {
    await useReaderStore.getState().recordScrollPosition('vault-a', 'a.md', 240)
    expect(getScrollPosition('vault-a', 'a.md')?.scrollY).toBe(240)

    await useReaderStore.getState().recordScrollPosition('vault-a', 'a.md', 0)
    expect(getScrollPosition('vault-a', 'a.md')).toBeUndefined()
    expect(
      await db.scrollPositions.where('vaultId').equals('vault-a').count(),
    ).toBe(0)
  })

  it('keeps vaults isolated', async () => {
    await useReaderStore.getState().recordScrollPosition('vault-a', 'a.md', 100)
    await useReaderStore.getState().recordScrollPosition('vault-b', 'a.md', 200)

    expect(getScrollPosition('vault-a', 'a.md')?.scrollY).toBe(100)
    expect(getScrollPosition('vault-b', 'a.md')?.scrollY).toBe(200)
  })

  it('prunes oldest rows when a vault exceeds the cap', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 1_000
      return now
    })

    for (let i = 0; i < MAX_SCROLL_POSITIONS_PER_VAULT + 5; i += 1) {
      await useReaderStore
        .getState()
        .recordScrollPosition('vault-a', `note-${i}.md`, 100 + i)
    }

    expect(
      await db.scrollPositions.where('vaultId').equals('vault-a').count(),
    ).toBe(MAX_SCROLL_POSITIONS_PER_VAULT)
    // Oldest entries (note-0..note-4) are gone; latest entries remain.
    expect(getScrollPosition('vault-a', 'note-0.md')).toBeUndefined()
    expect(
      getScrollPosition(
        'vault-a',
        `note-${MAX_SCROLL_POSITIONS_PER_VAULT + 4}.md`,
      )?.scrollY,
    ).toBe(100 + MAX_SCROLL_POSITIONS_PER_VAULT + 4)
  })

  it('clears scroll positions for one vault only', async () => {
    await useReaderStore.getState().recordScrollPosition('vault-a', 'a.md', 100)
    await useReaderStore.getState().recordScrollPosition('vault-b', 'b.md', 200)

    await useReaderStore.getState().clearScrollPositions('vault-a')

    expect(getScrollPosition('vault-a', 'a.md')).toBeUndefined()
    expect(getScrollPosition('vault-b', 'b.md')?.scrollY).toBe(200)
  })

  it('ignores empty paths', async () => {
    await useReaderStore.getState().recordScrollPosition('vault-a', '', 100)
    expect(
      await db.scrollPositions.where('vaultId').equals('vault-a').count(),
    ).toBe(0)
  })
})
