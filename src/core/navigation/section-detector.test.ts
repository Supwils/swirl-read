import { describe, it, expect } from 'vitest'
import {
  detectSections,
  findSectionHome,
  findVaultHome,
  pickHomeFromEntries,
  pickSectionHomeFromEntries,
} from './section-detector'
import type { VaultEntry } from '@/core/vault'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'

function file(name: string, path = name): VaultEntry {
  return {
    isDirectory: false,
    name,
    path,
    extension: name.includes('.') ? name.slice(name.lastIndexOf('.')) : '',
    size: 0,
    modifiedAt: new Date(0),
  }
}

function dir(name: string, path = name): VaultEntry {
  return { isDirectory: true, name, path }
}

describe('pickHomeFromEntries', () => {
  it('picks index.md when present', () => {
    expect(
      pickHomeFromEntries([file('readme.md'), file('index.md'), dir('career')]),
    ).toBe('index.md')
  })

  it('falls back to home.md when no index', () => {
    expect(pickHomeFromEntries([file('home.md'), file('readme.md')])).toBe(
      'home.md',
    )
  })

  it('falls back to README.md (case-insensitive) when no index/home', () => {
    expect(pickHomeFromEntries([file('README.md'), file('notes.md')])).toBe(
      'README.md',
    )
  })

  it('matches case-insensitively', () => {
    expect(pickHomeFromEntries([file('Index.MD')])).toBe('Index.MD')
  })

  it('accepts .mdx variants', () => {
    expect(pickHomeFromEntries([file('index.mdx')])).toBe('index.mdx')
  })

  it('returns null when no home candidate exists', () => {
    expect(
      pickHomeFromEntries([file('notes.md'), file('todo.md'), dir('career')]),
    ).toBeNull()
  })

  it('ignores directories with home-like names', () => {
    expect(pickHomeFromEntries([dir('index.md'), file('notes.md')])).toBeNull()
  })

  it('returns null on an empty vault', () => {
    expect(pickHomeFromEntries([])).toBeNull()
  })
})

describe('pickSectionHomeFromEntries (M4.2)', () => {
  it("prefers `<dirname>-map.md` (Wilson's vault convention)", () => {
    const entries = [
      file('career-map.md', 'career/career-map.md'),
      file('me.md', 'career/me.md'),
      file('index.md', 'career/index.md'),
    ]
    expect(pickSectionHomeFromEntries(entries, 'career')).toBe(
      'career/career-map.md',
    )
  })

  it('falls back to `<dirname>.md` when no map file exists', () => {
    const entries = [
      file('career.md', 'career/career.md'),
      file('me.md', 'career/me.md'),
    ]
    expect(pickSectionHomeFromEntries(entries, 'career')).toBe(
      'career/career.md',
    )
  })

  it('falls back to index.md, then home.md, then README.md', () => {
    expect(
      pickSectionHomeFromEntries(
        [file('index.md', 'k/index.md'), file('home.md', 'k/home.md')],
        'k',
      ),
    ).toBe('k/index.md')
    expect(
      pickSectionHomeFromEntries(
        [file('home.md', 'k/home.md'), file('README.md', 'k/README.md')],
        'k',
      ),
    ).toBe('k/home.md')
    expect(
      pickSectionHomeFromEntries(
        [file('README.md', 'k/README.md'), file('notes.md', 'k/notes.md')],
        'k',
      ),
    ).toBe('k/README.md')
  })

  it('matches case-insensitively against the directory name', () => {
    const entries = [file('Career-Map.MD', 'career/Career-Map.MD')]
    expect(pickSectionHomeFromEntries(entries, 'CAREER')).toBe(
      'career/Career-Map.MD',
    )
  })

  it('accepts .mdx variants for both the map and home slots', () => {
    expect(
      pickSectionHomeFromEntries(
        [file('career-map.mdx', 'career/career-map.mdx')],
        'career',
      ),
    ).toBe('career/career-map.mdx')
    expect(
      pickSectionHomeFromEntries([file('index.mdx', 'k/index.mdx')], 'k'),
    ).toBe('k/index.mdx')
  })

  it('returns null when no candidate matches', () => {
    const entries = [
      file('notes.md', 'career/notes.md'),
      file('todo.md', 'career/todo.md'),
    ]
    expect(pickSectionHomeFromEntries(entries, 'career')).toBeNull()
  })

  it('ignores directories with home-shaped names', () => {
    const entries = [
      dir('career-map.md', 'career/career-map.md'),
      file('notes.md', 'career/notes.md'),
    ]
    expect(pickSectionHomeFromEntries(entries, 'career')).toBeNull()
  })

  it('returns null for an empty directory name (defensive)', () => {
    expect(pickSectionHomeFromEntries([file('index.md')], '')).toBeNull()
  })

  it('returns null for an empty entries list', () => {
    expect(pickSectionHomeFromEntries([], 'career')).toBeNull()
  })
})

describe('findSectionHome (M4.2)', () => {
  it('reads a directory and returns its section home', async () => {
    const root = mockRoot('vault', {
      career: {
        'career-map.md': '# Career map',
        'me.md': '# Me',
      },
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'vault',
    })
    expect(await findSectionHome(adapter, 'career')).toBe(
      'career/career-map.md',
    )
  })

  it('returns null when the directory has no home candidate', async () => {
    const root = mockRoot('vault', {
      career: {
        'me.md': '# Me',
        'todo.md': '# Todo',
      },
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'vault',
    })
    expect(await findSectionHome(adapter, 'career')).toBeNull()
  })
})

describe('detectSections (M4.2)', () => {
  it("returns every top-level directory in Wilson's vault layout, with homes resolved", async () => {
    const root = mockRoot('supwil', {
      'index.md': '# Vault home',
      career: {
        'career-map.md': '# Career map',
        'me.md': '# Me',
      },
      knowledge: {
        'knowledge-map.md': '# Knowledge map',
      },
      tasks: {
        'tasks-map.md': '# Tasks map',
      },
      ai: {
        'index.md': '# AI section home',
      },
      orphan: {
        'misc.md': '# Misc',
      },
      'top-level.md': '# Loose note',
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'supwil',
    })

    const sections = await detectSections(adapter)
    const byName: Record<string, string | null> = Object.fromEntries(
      sections.map((s) => [s.directory.name, s.home]),
    )
    expect(byName).toEqual({
      career: 'career/career-map.md',
      knowledge: 'knowledge/knowledge-map.md',
      tasks: 'tasks/tasks-map.md',
      ai: 'ai/index.md',
      orphan: null,
    })
    // Loose top-level files are NOT promoted to sections.
    expect(sections.find((s) => s.directory.name === 'top-level.md')).toBe(
      undefined,
    )
  })

  it('returns an empty list when the vault has no top-level directories', async () => {
    const root = mockRoot('flat', {
      'a.md': 'one',
      'b.md': 'two',
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'flat',
    })
    expect(await detectSections(adapter)).toEqual([])
  })
})

describe('findVaultHome', () => {
  it('reads root entries through the adapter and returns the home path', async () => {
    const root = mockRoot('vault', {
      'index.md': '# Home',
      'README.md': '# Read me',
      knowledge: { 'react.md': '# React' },
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'vault',
    })
    expect(await findVaultHome(adapter)).toBe('index.md')
  })

  it('returns null when the vault has no home candidate', async () => {
    const root = mockRoot('vault', {
      'notes.md': '# Notes',
      knowledge: {},
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'v',
      name: 'vault',
    })
    expect(await findVaultHome(adapter)).toBeNull()
  })
})
