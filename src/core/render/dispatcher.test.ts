import { describe, it, expect } from 'vitest'
import { getRendererKind } from './dispatcher'

describe('getRendererKind (M7.1)', () => {
  it('routes Markdown extensions to the markdown kind', () => {
    expect(getRendererKind('a.md').kind).toBe('markdown')
    expect(getRendererKind('a.mdx').kind).toBe('markdown')
    expect(getRendererKind('A.MD').kind).toBe('markdown')
  })

  it('routes plain-text extensions to the text kind', () => {
    expect(getRendererKind('notes.txt').kind).toBe('text')
    expect(getRendererKind('output.log').kind).toBe('text')
  })

  it('routes HTML files to the html kind (M7.5)', () => {
    expect(getRendererKind('site/index.html')).toEqual({ kind: 'html' })
    expect(getRendererKind('legacy/page.htm')).toEqual({ kind: 'html' })
  })

  it('routes JSON files to the json kind (M7.4)', () => {
    expect(getRendererKind('config/app.json')).toEqual({ kind: 'json' })
    expect(getRendererKind('settings.jsonc')).toEqual({ kind: 'json' })
  })

  it('routes delimited tables to the table kind with the right delimiter (M7.3)', () => {
    expect(getRendererKind('data.csv')).toEqual({
      kind: 'table',
      delimiter: ',',
    })
    expect(getRendererKind('data.tsv')).toEqual({
      kind: 'table',
      delimiter: '\t',
    })
    expect(getRendererKind('legacy.tab')).toEqual({
      kind: 'table',
      delimiter: '\t',
    })
  })

  it('routes source-code extensions to the code kind with a language', () => {
    expect(getRendererKind('app.ts')).toEqual({
      kind: 'code',
      language: 'typescript',
    })
    expect(getRendererKind('App.tsx')).toEqual({
      kind: 'code',
      language: 'tsx',
    })
    expect(getRendererKind('script.py')).toEqual({
      kind: 'code',
      language: 'python',
    })
    expect(getRendererKind('main.go')).toEqual({
      kind: 'code',
      language: 'go',
    })
    expect(getRendererKind('Dockerfile.dockerfile')).toEqual({
      kind: 'code',
      language: 'dockerfile',
    })
    expect(getRendererKind('config.yaml')).toEqual({
      kind: 'code',
      language: 'yaml',
    })
  })

  it('routes media extensions to the media kind with the right subtype (M7.6)', () => {
    expect(getRendererKind('photo.png')).toEqual({
      kind: 'media',
      media: 'image',
    })
    expect(getRendererKind('clip.mp4')).toEqual({
      kind: 'media',
      media: 'video',
    })
    expect(getRendererKind('song.mp3')).toEqual({
      kind: 'media',
      media: 'audio',
    })
    // SVG is text technically but routes to image so opening logo.svg
    // shows the picture, not the markup.
    expect(getRendererKind('logo.svg')).toEqual({
      kind: 'media',
      media: 'image',
    })
  })

  it('routes non-renderable binaries (PDF, archives, fonts) to the binary kind', () => {
    expect(getRendererKind('book.pdf')).toEqual({ kind: 'binary' })
    expect(getRendererKind('archive.zip')).toEqual({ kind: 'binary' })
    expect(getRendererKind('font.woff2')).toEqual({ kind: 'binary' })
  })

  it('treats files without an extension as text (LICENSE, Makefile, …)', () => {
    expect(getRendererKind('LICENSE')).toEqual({ kind: 'text' })
    expect(getRendererKind('Makefile')).toEqual({ kind: 'text' })
    expect(getRendererKind('path/to/README')).toEqual({ kind: 'text' })
  })

  it('treats unknown extensions as binary so readText never gets garbage', () => {
    expect(getRendererKind('mystery.xyz')).toEqual({ kind: 'binary' })
    expect(getRendererKind('data.bin')).toEqual({ kind: 'binary' })
  })

  it('keeps Shiki language ids stable across paths in subfolders', () => {
    const ts = getRendererKind('src/lib/util.ts')
    const py = getRendererKind('a/b/c.py')
    expect(ts.kind === 'code' && ts.language).toBe('typescript')
    expect(py.kind === 'code' && py.language).toBe('python')
  })
})
