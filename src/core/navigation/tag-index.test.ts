import { describe, it, expect } from 'vitest'
import {
  buildTagIndex,
  filesForTag,
  tagsForFile,
  tagsInMarkdownSource,
} from './tag-index'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'

function adapter(tree: Parameters<typeof mockRoot>[1]): FSAPIVaultAdapter {
  return FSAPIVaultAdapter.fromHandle(mockRoot('vault', tree), {
    id: 'v',
    name: 'vault',
  })
}

describe('tagsInMarkdownSource', () => {
  it('extracts tags from the body', () => {
    expect(tagsInMarkdownSource('# Hi\n\nSome #foo and #bar')).toEqual([
      'foo',
      'bar',
    ])
  })

  it('extracts tags from frontmatter `tags:`', () => {
    expect(
      tagsInMarkdownSource('---\ntags: [reading, ai]\n---\n\n# Body\n'),
    ).toEqual(['reading', 'ai'])
  })

  it('combines body + frontmatter, deduped', () => {
    expect(
      tagsInMarkdownSource(
        '---\ntags: [foo, baz]\n---\n\nBody mentions #foo and #bar.\n',
      ),
    ).toEqual(['foo', 'bar', 'baz'])
  })

  it('ignores tags inside fenced code', () => {
    expect(
      tagsInMarkdownSource(
        '# Real\n\n```ts\nconst t = "#fakeTag"\n```\n\n#real',
      ),
    ).toEqual(['real'])
  })

  it('ignores tags inside inline code', () => {
    expect(
      tagsInMarkdownSource('Use `#tag` to mark items. Try #real.'),
    ).toEqual(['real'])
  })

  it('strips leading hashes from frontmatter tag values', () => {
    expect(
      tagsInMarkdownSource('---\ntags: ["#foo", "#bar/baz"]\n---\n\n'),
    ).toEqual(['foo', 'bar/baz'])
  })

  it('preserves CJK tags from both body and frontmatter', () => {
    expect(
      tagsInMarkdownSource('---\ntags: [前端]\n---\n\n#中文 stuff #前端'),
    ).toEqual(['中文', '前端'])
  })
})

describe('buildTagIndex', () => {
  it('indexes the entire vault and answers files-for-tag queries', async () => {
    const vault = adapter({
      'a.md': '# A\n\n#shared and #onlyA',
      'b.md': '# B\n\n#shared #onlyB',
      'c.md': '---\ntags: [shared]\n---\n\n# C body\n',
      'no-tags.md': '# Just prose',
    })

    const index = await buildTagIndex(vault)

    expect(index.totalTags).toBe(3)
    expect(filesForTag(index, 'shared')).toEqual(['a.md', 'b.md', 'c.md'])
    expect(filesForTag(index, 'onlya')).toEqual(['a.md'])
    expect(filesForTag(index, '#onlyb')).toEqual(['b.md']) // leading # stripped
    expect(filesForTag(index, 'unknown')).toEqual([])
  })

  it('answers tags-for-file queries', async () => {
    const vault = adapter({
      'a.md': '#x #y',
      'b.md': '#z',
    })
    const index = await buildTagIndex(vault)
    expect(tagsForFile(index, 'a.md')).toEqual(['x', 'y'])
    expect(tagsForFile(index, 'b.md')).toEqual(['z'])
    expect(tagsForFile(index, 'never.md')).toEqual([])
  })

  it('walks every directory level', async () => {
    const vault = adapter({
      career: { 'me.md': '#career' },
      knowledge: { 软件: { 前端: { 'react.md': '#react/hooks' } } },
    })
    const index = await buildTagIndex(vault)
    expect(filesForTag(index, 'career')).toEqual(['career/me.md'])
    expect(filesForTag(index, 'react/hooks')).toEqual([
      'knowledge/软件/前端/react.md',
    ])
  })

  it('returns an empty index when no files have tags', async () => {
    const vault = adapter({
      'a.md': 'plain text',
      'b.md': '# Heading\n\nbody',
    })
    const index = await buildTagIndex(vault)
    expect(index.totalTags).toBe(0)
    expect(index.filesByTag.size).toBe(0)
    expect(index.tagsByFile.size).toBe(0)
  })

  it('only walks markdown files (skips images, json, etc.)', async () => {
    const vault = adapter({
      'index.md': '#real',
      'config.json': '{"tags": ["fake"]}',
      'logo.png': new Uint8Array([0]),
    })
    const index = await buildTagIndex(vault)
    expect(filesForTag(index, 'real')).toEqual(['index.md'])
    expect(filesForTag(index, 'fake')).toEqual([])
  })
})
