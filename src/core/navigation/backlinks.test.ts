import { describe, it, expect, beforeEach } from 'vitest'
import { db, __resetDbForTests } from '@/core/persistence/db'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import {
  buildBacklinksIndex,
  extractWikilinkReferences,
  getBacklinksForFile,
  indexBacklinksForFile,
  rankBacklinks,
  __resetBacklinksForTests,
  type Backlink,
} from './backlinks'
import { buildWikilinkIndex } from './wikilink-resolver'

beforeEach(async () => {
  await __resetDbForTests()
  __resetBacklinksForTests()
})

describe('extractWikilinkReferences', () => {
  it('extracts plain, alias, heading, and block wikilinks', () => {
    const refs = extractWikilinkReferences(
      'See [[react]], [[career/me|me]], [[react#hooks]], [[quote^abc|Quote]].',
    )

    expect(refs.map((ref) => ref.target)).toEqual([
      'react',
      'career/me',
      'react',
      'quote',
    ])
    expect(refs[1]?.alias).toBe('me')
    expect(refs[2]?.heading).toBe('hooks')
    expect(refs[3]?.blockId).toBe('abc')
  })

  it('ignores embeds, code, and comments', () => {
    const refs = extractWikilinkReferences(`
![[image.png]]
\`[[inline-code]]\`
\`\`\`
[[fenced-code]]
\`\`\`
<!-- [[commented]] -->
Real [[target]].
`)

    expect(refs.map((ref) => ref.target)).toEqual(['target'])
  })

  it('includes compact context around each reference', () => {
    const refs = extractWikilinkReferences(
      'Before words [[target]] after words',
    )

    expect(refs[0]?.context).toContain('Before words [[target]] after words')
  })
})

describe('backlinks index', () => {
  async function makeVault() {
    const root = mockRoot('vault', {
      'index.md': '# Home\n\nSee [[react]] and [[career/me|Me]].',
      career: {
        'me.md': '# Me\n\nReturn to [[index]].',
      },
      knowledge: {
        'react.md': '# React',
      },
      'notes.txt': '[[react]] in a non-markdown file',
    })
    const vault = FSAPIVaultAdapter.fromHandle(root, {
      id: 'backlinks-vault',
      name: 'vault',
    })
    const wikilinkIndex = await buildWikilinkIndex(vault)
    return { vault, wikilinkIndex }
  }

  it('indexes one source file and returns files linking to a target', async () => {
    const { wikilinkIndex } = await makeVault()

    await indexBacklinksForFile(
      'backlinks-vault',
      'index.md',
      'See [[react]] and [[career/me|Me]].',
      wikilinkIndex,
    )

    expect(
      (await getBacklinksForFile('backlinks-vault', 'knowledge/react.md')).map(
        (item) => item.sourcePath,
      ),
    ).toEqual(['index.md'])
    expect(
      (await getBacklinksForFile('backlinks-vault', 'career/me.md'))[0]
        ?.rawTarget,
    ).toBe('career/me|Me')
  })

  it('dedupes repeated links from one source to the same target', async () => {
    const { wikilinkIndex } = await makeVault()

    await indexBacklinksForFile(
      'backlinks-vault',
      'index.md',
      '[[react]] then again [[knowledge/react.md]]',
      wikilinkIndex,
    )

    expect(
      await getBacklinksForFile('backlinks-vault', 'knowledge/react.md'),
    ).toHaveLength(1)
    expect(await db.backlinks.count()).toBe(1)
  })

  it('re-indexing a source removes stale backlinks', async () => {
    const { wikilinkIndex } = await makeVault()

    await indexBacklinksForFile(
      'backlinks-vault',
      'index.md',
      'See [[react]]',
      wikilinkIndex,
    )
    await indexBacklinksForFile(
      'backlinks-vault',
      'index.md',
      'See [[career/me]]',
      wikilinkIndex,
    )

    expect(
      await getBacklinksForFile('backlinks-vault', 'knowledge/react.md'),
    ).toEqual([])
    expect(
      (await getBacklinksForFile('backlinks-vault', 'career/me.md')).map(
        (item) => item.sourcePath,
      ),
    ).toEqual(['index.md'])
  })

  it('hydrates backlinks from IndexedDB after memory reset', async () => {
    const { wikilinkIndex } = await makeVault()
    await indexBacklinksForFile(
      'backlinks-vault',
      'index.md',
      'See [[react]]',
      wikilinkIndex,
    )
    __resetBacklinksForTests()

    expect(
      (await getBacklinksForFile('backlinks-vault', 'knowledge/react.md')).map(
        (item) => item.sourcePath,
      ),
    ).toEqual(['index.md'])
  })

  it('builds a full-vault backlinks index for markdown files', async () => {
    const { vault } = await makeVault()

    await buildBacklinksIndex(vault)

    expect(
      (await getBacklinksForFile('backlinks-vault', 'knowledge/react.md')).map(
        (item) => item.sourcePath,
      ),
    ).toEqual(['index.md'])
    expect(
      (await getBacklinksForFile('backlinks-vault', 'index.md')).map(
        (item) => item.sourcePath,
      ),
    ).toEqual(['career/me.md'])
    expect(
      await db.backlinks.where('sourcePath').equals('notes.txt').count(),
    ).toBe(0)
  })
})

describe('rankBacklinks (RX5)', () => {
  function backlink(sourcePath: string, targetPath = 'target.md'): Backlink {
    return {
      vaultId: 'v',
      sourcePath,
      targetPath,
      rawTarget: 'target',
      context: '',
      updatedAt: new Date(0),
    }
  }

  it('falls back to alphabetical when no signals are provided', () => {
    const ranked = rankBacklinks([
      backlink('zeta.md'),
      backlink('alpha.md'),
      backlink('beta.md'),
    ])
    expect(ranked.map((item) => item.sourcePath)).toEqual([
      'alpha.md',
      'beta.md',
      'zeta.md',
    ])
  })

  it('promotes recently-opened sources to the top, in recency order', () => {
    const ranked = rankBacklinks(
      [backlink('alpha.md'), backlink('beta.md'), backlink('zeta.md')],
      { recentSourcePaths: ['zeta.md', 'beta.md'] },
    )
    expect(ranked.map((item) => item.sourcePath)).toEqual([
      'zeta.md',
      'beta.md',
      'alpha.md',
    ])
  })

  it('prefers same-section sources at the same recency tier', () => {
    const ranked = rankBacklinks(
      [
        backlink('career/me.md', 'knowledge/react.md'),
        backlink('knowledge/hooks.md', 'knowledge/react.md'),
        backlink('tasks/today.md', 'knowledge/react.md'),
      ],
      { currentPath: 'knowledge/react.md' },
    )
    expect(ranked[0]?.sourcePath).toBe('knowledge/hooks.md')
  })

  it('lets recency override section affinity', () => {
    const ranked = rankBacklinks(
      [
        backlink('knowledge/hooks.md', 'knowledge/react.md'),
        backlink('career/me.md', 'knowledge/react.md'),
      ],
      {
        currentPath: 'knowledge/react.md',
        recentSourcePaths: ['career/me.md'],
      },
    )
    expect(ranked.map((item) => item.sourcePath)).toEqual([
      'career/me.md',
      'knowledge/hooks.md',
    ])
  })

  it('does not mutate the input list', () => {
    const input = [backlink('zeta.md'), backlink('alpha.md')]
    const before = input.map((item) => item.sourcePath)
    rankBacklinks(input)
    expect(input.map((item) => item.sourcePath)).toEqual(before)
  })
})
