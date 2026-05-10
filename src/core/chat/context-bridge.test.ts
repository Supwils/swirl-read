import { describe, expect, it } from 'vitest'
import { FSAPIVaultAdapter } from '@/core/vault'
import {
  type MockTreeNode,
  mockRoot,
} from '@/core/vault/__test-helpers__/mock-fs'
import {
  buildReadingContextRefs,
  loadContextChunksForRefs,
} from './context-bridge'
import type { ChatContextRef } from './types'

function makeVault(tree: MockTreeNode) {
  const root = mockRoot('vault', tree)
  return FSAPIVaultAdapter.fromHandle(root, {
    id: 'vault-a',
    name: 'vault',
  })
}

function hydrateDrafts(
  drafts: Awaited<ReturnType<typeof buildReadingContextRefs>>,
): ChatContextRef[] {
  return drafts.map((draft, index) => ({
    ...draft,
    id: `ctx-${String(index)}`,
    sessionId: 'chat-1',
    createdAt: new Date('2099-01-01T00:00:00Z'),
  }))
}

describe('reading chat context bridge', () => {
  it('builds explicit refs for the current document and linked notes', async () => {
    const vault = makeVault({
      'index.md': '# Home\n\nSee [[React]] and [[image.png]].',
      notes: {
        'React.md': '# React',
      },
      'image.png': new Uint8Array([1, 2, 3]),
    })

    const refs = await buildReadingContextRefs({
      vaultId: 'vault-a',
      adapter: vault,
      currentPath: 'index.md',
      includeLinkedDocuments: true,
    })

    expect(refs.map((ref) => [ref.sourceType, ref.path])).toEqual([
      ['current-document', 'index.md'],
      ['linked-document', 'notes/React.md'],
    ])
    expect(refs.every((ref) => ref.contentSnapshot === null)).toBe(true)
  })

  it('stores selected text as an explicit snapshot ref', async () => {
    const vault = makeVault({ 'index.md': '# Home' })

    const refs = await buildReadingContextRefs({
      vaultId: 'vault-a',
      adapter: vault,
      currentPath: 'index.md',
      selectionText: '  important quote  ',
      includeLinkedDocuments: false,
    })

    expect(refs.map((ref) => ref.sourceType)).toEqual([
      'current-document',
      'selection',
    ])
    expect(refs[1]?.contentSnapshot).toBe('important quote')
    expect(refs[1]?.label).toBe('Selection from index.md')
  })

  it('loads chunks from live vault content and snapshot refs', async () => {
    const tree: MockTreeNode = { 'index.md': 'first version' }
    const vault = makeVault(tree)
    const refs = hydrateDrafts(
      await buildReadingContextRefs({
        vaultId: 'vault-a',
        adapter: vault,
        currentPath: 'index.md',
        selectionText: 'stable selection',
      }),
    )
    tree['index.md'] = 'updated version'

    const chunks = await loadContextChunksForRefs(refs, {
      resolveVault: () => vault,
    })

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      'updated version',
      'stable selection',
    ])
  })

  it('applies linked-note count and total-character caps', async () => {
    const vault = makeVault({
      'index.md': '[[a]] [[b]] [[c]]',
      'a.md': 'aaaa',
      'b.md': 'bbbb',
      'c.md': 'cccc',
    })

    const refs = await buildReadingContextRefs({
      vaultId: 'vault-a',
      adapter: vault,
      currentPath: 'index.md',
      includeLinkedDocuments: true,
      linkedLimit: 3,
      maxLinkedFileChars: 4,
      maxLinkedTotalChars: 8,
    })

    expect(refs.map((ref) => ref.path)).toEqual(['index.md', 'a.md', 'b.md'])
  })

  it('skips unreadable or missing file refs when loading chunks', async () => {
    const vault = makeVault({ 'index.md': '# Home' })
    const chunks = await loadContextChunksForRefs(
      [
        {
          id: 'ctx-1',
          sessionId: 'chat-1',
          vaultId: 'vault-a',
          sourceType: 'manual-file',
          label: 'missing.md',
          path: 'missing.md',
          pinned: false,
          createdAt: new Date('2099-01-01T00:00:00Z'),
          contentSnapshot: null,
        },
      ],
      { resolveVault: () => vault },
    )

    expect(chunks).toEqual([])
  })
})
