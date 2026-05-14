import { describe, expect, it } from 'vitest'
import { FOLDER_COLORS, folderColorId } from './folder-color'

describe('folderColorId', () => {
  it('returns the canonical id verbatim for all six known folders', () => {
    for (const id of FOLDER_COLORS) {
      expect(folderColorId(id)).toBe(id)
    }
  })

  it('matches the canonical id case-insensitively', () => {
    expect(folderColorId('Knowledge')).toBe('knowledge')
    expect(folderColorId('JOURNAL')).toBe('journal')
  })

  it('inherits the top-level folder color for nested paths', () => {
    expect(folderColorId('knowledge/frontend/react.md')).toBe('knowledge')
    expect(folderColorId('career/me/me.md')).toBe('career')
  })

  it('is stable for unknown folder names across calls', () => {
    const names = ['frontend', '中文笔记', 'z-misc', 'projects-2026']
    for (const name of names) {
      const first = folderColorId(name)
      const second = folderColorId(name)
      const third = folderColorId(`${name}/sub`)
      expect(first).toBe(second)
      expect(first).toBe(third)
      expect(FOLDER_COLORS).toContain(first)
    }
  })

  it('handles empty / root paths without throwing', () => {
    expect(FOLDER_COLORS).toContain(folderColorId(''))
    expect(FOLDER_COLORS).toContain(folderColorId('/'))
  })

  it('distributes unknown names across the palette (not all bucketed into one)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 64; i++) {
      seen.add(folderColorId(`bucket-${i}`))
    }
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })
})
