import { describe, it, expect } from 'vitest'
import {
  isRewritableUrl,
  resolveAssetPath,
  collectRewritableAssets,
  applyAssetRewrites,
  buildInjectedHead,
  buildSrcDoc,
} from './html-asset-rewrite'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'

describe('isRewritableUrl', () => {
  it('accepts relative urls', () => {
    for (const u of [
      './a.png',
      'a.png',
      '../b/c.css',
      '/root.png',
      'sub/x.png',
    ]) {
      expect(isRewritableUrl(u)).toBe(true)
    }
  })
  it('skips absolute / data / blob / fragment / protocol-relative / empty', () => {
    for (const u of [
      'http://x/a.png',
      'https://x/a.png',
      '//x/a.png',
      'data:image/png;base64,AAAA',
      'blob:abc',
      'mailto:a@b.c',
      '#frag',
      '',
    ]) {
      expect(isRewritableUrl(u)).toBe(false)
    }
  })
})

describe('resolveAssetPath', () => {
  it('resolves relative against the file dir', () => {
    expect(resolveAssetPath('./pic.png', 'a/b')).toBe('a/b/pic.png')
    expect(resolveAssetPath('pic.png', 'a/b')).toBe('a/b/pic.png')
    expect(resolveAssetPath('../x.png', 'a/b')).toBe('a/x.png')
    expect(resolveAssetPath('/root.png', 'a/b')).toBe('root.png')
  })
  it('strips query + fragment', () => {
    expect(resolveAssetPath('pic.png?v=2#x', 'a')).toBe('a/pic.png')
  })
  it('rejects paths that escape the vault root', () => {
    expect(resolveAssetPath('../../etc', 'a')).toBeNull()
    expect(resolveAssetPath('../x', '')).toBeNull()
  })
})

describe('collectRewritableAssets + applyAssetRewrites', () => {
  const html = `<html><head><link rel="stylesheet" href="./s.css"><style>.a{background:url(bg.png)}</style></head><body><img src="img/p.png"><img src="https://x/abs.png"></body></html>`

  it('collects relative img/link/css urls and skips absolutes', () => {
    const paths = collectRewritableAssets(html, 'docs')
      .map((r) => r.vaultPath)
      .sort()
    expect(paths).toContain('docs/s.css')
    expect(paths).toContain('docs/bg.png')
    expect(paths).toContain('docs/img/p.png')
    expect(paths).not.toContain('https://x/abs.png')
  })

  it('rewrites only the mapped urls, leaving absolutes intact', () => {
    const refs = collectRewritableAssets(html, 'docs')
    const map = new Map(refs.map((r) => [r.rawUrl, `blob:${r.vaultPath}`]))
    const out = applyAssetRewrites(html, map)
    expect(out).toContain('blob:docs/img/p.png')
    expect(out).toContain('blob:docs/s.css')
    expect(out).toContain('url(blob:docs/bg.png)')
    expect(out).toContain('https://x/abs.png')
  })
})

describe('buildInjectedHead', () => {
  it('themes color-scheme + base colors per theme', () => {
    const dark = buildInjectedHead('dark', { readingWidth: false })
    expect(dark).toContain('color-scheme:dark')
    expect(dark).toContain('#1e1e1e')
    expect(buildInjectedHead('sepia', { readingWidth: false })).toContain(
      '#f4ecd8',
    )
    expect(buildInjectedHead('auto', { readingWidth: false })).toContain(
      'color-scheme:light dark',
    )
  })
  it('adds the reading-width clamp only when enabled', () => {
    expect(buildInjectedHead('light', { readingWidth: true })).toContain(
      'max-width:72ch',
    )
    expect(buildInjectedHead('light', { readingWidth: false })).not.toContain(
      '72ch',
    )
  })
})

describe('buildSrcDoc', () => {
  it('rewrites relative assets to vault blob urls + injects a themed head', async () => {
    const vault = FSAPIVaultAdapter.fromHandle(
      mockRoot('vault', {
        docs: {
          'page.html': '<img src="pic.png">',
          'pic.png': new Uint8Array([1, 2, 3]),
        },
      }),
      { id: 'bsd1', name: 'bsd1' },
    )
    const srcDoc = await buildSrcDoc({
      source: '<img src="pic.png">',
      vault,
      path: 'docs/page.html',
      theme: 'dark',
      readingWidth: false,
    })
    expect(srcDoc.startsWith('<!doctype html>')).toBe(true)
    expect(srcDoc).toContain('blob:')
    expect(srcDoc).toContain('data-injected="swirlread-html"')
  })

  it('leaves a missing asset untouched without crashing', async () => {
    const vault = FSAPIVaultAdapter.fromHandle(
      mockRoot('vault', { 'page.html': '<img src="missing.png">' }),
      { id: 'bsd2', name: 'bsd2' },
    )
    const srcDoc = await buildSrcDoc({
      source: '<img src="missing.png">',
      vault,
      path: 'page.html',
      theme: 'light',
      readingWidth: false,
    })
    expect(srcDoc).toContain('missing.png')
    expect(srcDoc).not.toContain('blob:')
  })
})
