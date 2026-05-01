import { describe, it, expect } from 'vitest'
import {
  normalizePath,
  joinPath,
  dirname,
  basename,
  extname,
  splitPath,
  isMarkdown,
  isImage,
  isWithin,
} from './path'

describe('normalizePath', () => {
  it('strips leading and trailing slashes', () => {
    expect(normalizePath('/foo/bar/')).toBe('foo/bar')
  })

  it('collapses repeated slashes', () => {
    expect(normalizePath('foo//bar///baz')).toBe('foo/bar/baz')
  })

  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('foo\\bar\\baz')).toBe('foo/bar/baz')
  })

  it('returns empty string for slash-only paths', () => {
    expect(normalizePath('/')).toBe('')
    expect(normalizePath('//')).toBe('')
  })

  it('preserves already-normalized paths', () => {
    expect(normalizePath('foo/bar')).toBe('foo/bar')
  })

  it('handles empty input', () => {
    expect(normalizePath('')).toBe('')
  })
})

describe('joinPath', () => {
  it('joins segments with forward slashes', () => {
    expect(joinPath('career', 'me', 'me.md')).toBe('career/me/me.md')
  })

  it('filters empty segments', () => {
    expect(joinPath('', 'foo', '', 'bar')).toBe('foo/bar')
  })

  it('normalizes embedded slashes', () => {
    expect(joinPath('/foo/', '/bar/')).toBe('foo/bar')
  })

  it('returns empty string for no segments', () => {
    expect(joinPath()).toBe('')
  })
})

describe('dirname', () => {
  it('returns parent directory', () => {
    expect(dirname('career/me/me.md')).toBe('career/me')
  })

  it('returns empty string for root-level files', () => {
    expect(dirname('readme.md')).toBe('')
  })

  it('returns empty string for empty path', () => {
    expect(dirname('')).toBe('')
  })
})

describe('basename', () => {
  it('returns final segment', () => {
    expect(basename('career/me/me.md')).toBe('me.md')
  })

  it('returns the path itself when no separator', () => {
    expect(basename('readme.md')).toBe('readme.md')
  })

  it('returns empty string for empty path', () => {
    expect(basename('')).toBe('')
  })
})

describe('extname', () => {
  it('returns lowercased extension with dot', () => {
    expect(extname('me.md')).toBe('.md')
    expect(extname('Image.PNG')).toBe('.png')
  })

  it('handles paths with directories', () => {
    expect(extname('career/me/me.md')).toBe('.md')
  })

  it('returns empty for files without extension', () => {
    expect(extname('Makefile')).toBe('')
    expect(extname('career/Makefile')).toBe('')
  })

  it('returns empty for dotfiles (leading-dot only)', () => {
    expect(extname('.gitignore')).toBe('')
    expect(extname('.env.local')).toBe('.local')
  })

  it('returns empty for empty path', () => {
    expect(extname('')).toBe('')
  })
})

describe('splitPath', () => {
  it('splits into segments', () => {
    expect(splitPath('career/me/me.md')).toEqual(['career', 'me', 'me.md'])
  })

  it('returns empty array for empty path', () => {
    expect(splitPath('')).toEqual([])
  })

  it('normalizes before splitting', () => {
    expect(splitPath('/foo//bar/')).toEqual(['foo', 'bar'])
  })
})

describe('isMarkdown', () => {
  it('returns true for .md and .mdx', () => {
    expect(isMarkdown('readme.md')).toBe(true)
    expect(isMarkdown('article.mdx')).toBe(true)
    expect(isMarkdown('career/me/me.md')).toBe(true)
  })

  it('returns false for other extensions', () => {
    expect(isMarkdown('image.png')).toBe(false)
    expect(isMarkdown('script.js')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isMarkdown('README.MD')).toBe(true)
  })
})

describe('isImage', () => {
  it('returns true for common image formats', () => {
    expect(isImage('photo.png')).toBe(true)
    expect(isImage('photo.jpg')).toBe(true)
    expect(isImage('photo.jpeg')).toBe(true)
    expect(isImage('animated.gif')).toBe(true)
    expect(isImage('modern.webp')).toBe(true)
    expect(isImage('next-gen.avif')).toBe(true)
    expect(isImage('vector.svg')).toBe(true)
  })

  it('returns false for non-images', () => {
    expect(isImage('readme.md')).toBe(false)
    expect(isImage('doc.pdf')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isImage('Photo.PNG')).toBe(true)
  })
})

describe('isWithin', () => {
  it('returns true when child is inside parent', () => {
    expect(isWithin('career/me/me.md', 'career')).toBe(true)
    expect(isWithin('career/me/me.md', 'career/me')).toBe(true)
  })

  it('returns true when child equals parent', () => {
    expect(isWithin('career', 'career')).toBe(true)
  })

  it('returns false for unrelated paths', () => {
    expect(isWithin('knowledge', 'career')).toBe(false)
    expect(isWithin('careers/me', 'career')).toBe(false) // prefix-but-not-segment
  })

  it('treats empty parent as containing everything', () => {
    expect(isWithin('career/me/me.md', '')).toBe(true)
    expect(isWithin('', '')).toBe(true)
  })
})
