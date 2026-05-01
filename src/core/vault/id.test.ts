import { describe, it, expect } from 'vitest'
import { slugify, generateVaultId } from './id'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('My Knowledge')).toBe('my-knowledge')
  })

  it('collapses runs of punctuation into a single hyphen', () => {
    expect(slugify('Reading & Writing!!')).toBe('reading-writing')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello')
    expect(slugify('---foo---')).toBe('foo')
  })

  it('preserves Unicode letters and numbers', () => {
    expect(slugify('思源宋体')).toBe('思源宋体')
    expect(slugify('日本語 ノート')).toBe('日本語-ノート')
    expect(slugify('vault-2024')).toBe('vault-2024')
  })

  it('caps length at 32 characters', () => {
    const long = 'a-very-long-folder-name-that-exceeds-thirty-two-chars'
    expect(slugify(long).length).toBeLessThanOrEqual(32)
  })

  it('falls back to "vault" for empty or punctuation-only input', () => {
    expect(slugify('')).toBe('vault')
    expect(slugify('   ')).toBe('vault')
    expect(slugify('!!!')).toBe('vault')
  })

  it('is deterministic', () => {
    expect(slugify('Foo Bar')).toBe(slugify('Foo Bar'))
  })
})

describe('generateVaultId', () => {
  it('combines slug and a 4-char suffix joined by a hyphen', () => {
    const id = generateVaultId('supwil')
    expect(id).toMatch(/^supwil-[a-z0-9]{4}$/)
  })

  it('produces different IDs across calls (suffix randomized)', () => {
    const a = generateVaultId('supwil')
    const b = generateVaultId('supwil')
    // Probability of collision in 4-char base36 ≈ 1/1.68M; safe in tests
    expect(a).not.toBe(b)
  })

  it('handles unicode folder names', () => {
    const id = generateVaultId('知识库')
    expect(id).toMatch(/^知识库-[a-z0-9]{4}$/)
  })

  it('handles empty input via fallback', () => {
    const id = generateVaultId('')
    expect(id).toMatch(/^vault-[a-z0-9]{4}$/)
  })
})
