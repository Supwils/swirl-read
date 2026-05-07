import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetWikilinkPreviewCacheForTests,
  getCachedPreview,
  invalidateWikilinkPreviewCache,
  setCachedPreview,
} from './wikilink-preview-cache'

beforeEach(() => {
  __resetWikilinkPreviewCacheForTests()
})

afterEach(() => {
  __resetWikilinkPreviewCacheForTests()
})

describe('wikilink-preview-cache', () => {
  it('returns null on miss', () => {
    expect(getCachedPreview('v', 'a.md')).toBeNull()
  })

  it('returns the snippet after set', () => {
    setCachedPreview('v', 'a.md', 'hello')
    expect(getCachedPreview('v', 'a.md')).toBe('hello')
  })

  it('updates the snippet when set is called again for the same key', () => {
    setCachedPreview('v', 'a.md', 'first')
    setCachedPreview('v', 'a.md', 'second')
    expect(getCachedPreview('v', 'a.md')).toBe('second')
  })

  it('keys by both vaultId and path', () => {
    setCachedPreview('v1', 'a.md', 'one')
    setCachedPreview('v2', 'a.md', 'two')
    expect(getCachedPreview('v1', 'a.md')).toBe('one')
    expect(getCachedPreview('v2', 'a.md')).toBe('two')
  })

  it('caps the cache at 10 entries, evicting the least-recently-used', () => {
    for (let i = 0; i < 11; i++) {
      setCachedPreview('v', `f${String(i)}.md`, `body-${String(i)}`)
    }
    // The first inserted entry should have been evicted.
    expect(getCachedPreview('v', 'f0.md')).toBeNull()
    // Everything else still present.
    expect(getCachedPreview('v', 'f10.md')).toBe('body-10')
    expect(getCachedPreview('v', 'f1.md')).toBe('body-1')
  })

  it('promotes hits so a recently-read entry survives the next eviction', () => {
    for (let i = 0; i < 10; i++) {
      setCachedPreview('v', `f${String(i)}.md`, `body-${String(i)}`)
    }
    // Promote f0 to most-recent via a get.
    expect(getCachedPreview('v', 'f0.md')).toBe('body-0')
    // Insert one more to force eviction.
    setCachedPreview('v', 'f10.md', 'body-10')
    // f1 (now the oldest) should be gone, f0 should still be here.
    expect(getCachedPreview('v', 'f1.md')).toBeNull()
    expect(getCachedPreview('v', 'f0.md')).toBe('body-0')
  })

  it('invalidate drops only the named vault', () => {
    setCachedPreview('v1', 'a.md', 'one')
    setCachedPreview('v1', 'b.md', 'two')
    setCachedPreview('v2', 'a.md', 'three')

    invalidateWikilinkPreviewCache('v1')

    expect(getCachedPreview('v1', 'a.md')).toBeNull()
    expect(getCachedPreview('v1', 'b.md')).toBeNull()
    expect(getCachedPreview('v2', 'a.md')).toBe('three')
  })
})
