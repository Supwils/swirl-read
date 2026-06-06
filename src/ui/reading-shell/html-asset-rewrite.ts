/**
 * HTML preview asset rewriting + themed head injection.
 *
 * A vault `.html` file is rendered in a `sandbox=""` iframe via `srcDoc`. That
 * iframe has an opaque origin and no base URL, so relative references
 * (`<img src="./pic.png">`, `<link href="style.css">`, CSS `url(...)`) cannot
 * resolve — they point at nothing. This module rewrites those relative URLs to
 * the vault's own `blob:` URLs (via `adapter.getBlobURL`) before the HTML is
 * handed to the iframe, and injects a theme-matched base style so a bare page
 * doesn't flash the wrong background.
 *
 * Security: scripts never run (`sandbox=""` is preserved by the renderer), so
 * `<script src>` and inline scripts are deliberately NOT rewritten — they stay
 * dead. Parsing uses `DOMParser` (`text/html`), which is inert: it never
 * executes scripts or fetches subresources. URLs that escape the vault root
 * (`../../..`) resolve to `null` and are left untouched.
 *
 * The pure functions (`isRewritableUrl`, `resolveAssetPath`,
 * `collectRewritableAssets`, `applyAssetRewrites`, `rewriteCssUrls`,
 * `buildInjectedHead`) are unit-tested; `buildSrcDoc` is the thin async glue
 * that resolves each asset's blob URL and stitches the result together.
 */

import { dirname, normalizePath } from '@/core/vault'
import type { VaultFileSystem, VaultPath } from '@/core/vault'
import type { Theme } from '@/stores/ui-store'

export interface AssetRef {
  /** Resolved vault path (relative to the HTML file's directory). */
  vaultPath: VaultPath
  /** Original raw URL token exactly as it appears in the attribute / CSS. */
  rawUrl: string
}

// Any "scheme:" prefix (http:, https:, data:, blob:, mailto:, tel:, …).
const ABSOLUTE_SCHEME = /^[a-z][a-z0-9+.-]*:/i
// CSS url(...) with optional single/double quotes.
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g

/** True for a relative URL we can resolve to a vault file. */
export function isRewritableUrl(url: string): boolean {
  const u = url.trim()
  if (u === '' || u.startsWith('#')) return false
  if (u.startsWith('//')) return false // protocol-relative
  if (ABSOLUTE_SCHEME.test(u)) return false
  return true
}

/**
 * Resolve a relative URL against the HTML file's directory, collapsing `.`/`..`
 * and rejecting anything that escapes the vault root (returns `null`).
 * `normalizePath` does NOT collapse `..`, so we do it explicitly here.
 */
export function resolveAssetPath(
  url: string,
  dir: VaultPath,
): VaultPath | null {
  if (!isRewritableUrl(url)) return null
  let clean = url.trim()
  const hash = clean.indexOf('#')
  if (hash >= 0) clean = clean.slice(0, hash)
  const query = clean.indexOf('?')
  if (query >= 0) clean = clean.slice(0, query)
  clean = clean.trim()
  if (clean === '') return null

  const fromRoot = clean.startsWith('/')
  const baseParts = fromRoot
    ? []
    : normalizePath(dir).split('/').filter(Boolean)
  const stack = [...baseParts]
  for (const part of normalizePath(clean).split('/').filter(Boolean)) {
    if (part === '.') continue
    if (part === '..') {
      if (stack.length === 0) return null // escaped the vault root
      stack.pop()
    } else {
      stack.push(part)
    }
  }
  const resolved = stack.join('/')
  return resolved === '' ? null : resolved
}

function parseSrcset(srcset: string): { url: string; descriptor: string }[] {
  return srcset
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const [url, ...rest] = part.split(/\s+/)
      return { url: url ?? '', descriptor: rest.join(' ') }
    })
}

function serializeSrcset(items: { url: string; descriptor: string }[]): string {
  return items
    .map((i) => (i.descriptor ? `${i.url} ${i.descriptor}` : i.url))
    .join(', ')
}

function collectFromCss(
  css: string,
  dir: VaultPath,
  out: Map<string, string>,
): void {
  let match: RegExpExecArray | null
  CSS_URL_RE.lastIndex = 0
  while ((match = CSS_URL_RE.exec(css)) !== null) {
    const raw = (match[2] ?? '').trim()
    const resolved = resolveAssetPath(raw, dir)
    if (resolved) out.set(raw, resolved)
  }
}

/**
 * Parse the HTML and collect every rewritable relative URL → resolved vault
 * path. De-duplicated by raw URL (the same raw URL always maps to one path).
 */
export function collectRewritableAssets(
  html: string,
  dir: VaultPath,
): AssetRef[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const byRaw = new Map<string, string>() // rawUrl → vaultPath

  const addAttr = (el: Element, attr: string): void => {
    const raw = el.getAttribute(attr)
    if (raw === null) return
    const resolved = resolveAssetPath(raw, dir)
    if (resolved) byRaw.set(raw.trim(), resolved)
  }

  for (const el of doc.querySelectorAll(
    'img[src], source[src], video[src], audio[src], video[poster]',
  )) {
    addAttr(el, 'src')
    addAttr(el, 'poster')
  }
  for (const el of doc.querySelectorAll('img[srcset], source[srcset]')) {
    for (const item of parseSrcset(el.getAttribute('srcset') ?? '')) {
      const resolved = resolveAssetPath(item.url, dir)
      if (resolved) byRaw.set(item.url.trim(), resolved)
    }
  }
  for (const el of doc.querySelectorAll(
    'link[rel~="stylesheet"][href], link[rel="icon"][href], link[rel="apple-touch-icon"][href]',
  )) {
    addAttr(el, 'href')
  }
  for (const el of doc.querySelectorAll('[style]')) {
    collectFromCss(el.getAttribute('style') ?? '', dir, byRaw)
  }
  for (const el of doc.querySelectorAll('style')) {
    collectFromCss(el.textContent ?? '', dir, byRaw)
  }

  return [...byRaw.entries()].map(([rawUrl, vaultPath]) => ({
    rawUrl,
    vaultPath,
  }))
}

/** Rewrite CSS `url(...)` tokens whose raw URL has a blob mapping. */
export function rewriteCssUrls(
  css: string,
  blobByRawUrl: ReadonlyMap<string, string>,
): string {
  return css.replace(CSS_URL_RE, (full, quote: string, raw: string) => {
    const blob = blobByRawUrl.get(raw.trim())
    return blob ? `url(${quote}${blob}${quote})` : full
  })
}

/** Re-apply a rawUrl→blobUrl map to the HTML; unmatched URLs are left intact. */
export function applyAssetRewrites(
  html: string,
  blobByRawUrl: ReadonlyMap<string, string>,
): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const swapAttr = (el: Element, attr: string): void => {
    const raw = el.getAttribute(attr)
    if (raw === null) return
    const blob = blobByRawUrl.get(raw.trim())
    if (blob) el.setAttribute(attr, blob)
  }

  for (const el of doc.querySelectorAll(
    'img[src], source[src], video[src], audio[src]',
  )) {
    swapAttr(el, 'src')
  }
  for (const el of doc.querySelectorAll('video[poster]')) {
    swapAttr(el, 'poster')
  }
  for (const el of doc.querySelectorAll('img[srcset], source[srcset]')) {
    const next = parseSrcset(el.getAttribute('srcset') ?? '').map((item) => ({
      url: blobByRawUrl.get(item.url.trim()) ?? item.url,
      descriptor: item.descriptor,
    }))
    el.setAttribute('srcset', serializeSrcset(next))
  }
  for (const el of doc.querySelectorAll(
    'link[rel~="stylesheet"][href], link[rel="icon"][href], link[rel="apple-touch-icon"][href]',
  )) {
    swapAttr(el, 'href')
  }
  for (const el of doc.querySelectorAll('[style]')) {
    const css = el.getAttribute('style') ?? ''
    el.setAttribute('style', rewriteCssUrls(css, blobByRawUrl))
  }
  for (const el of doc.querySelectorAll('style')) {
    el.textContent = rewriteCssUrls(el.textContent ?? '', blobByRawUrl)
  }

  return `<!doctype html>${doc.documentElement.outerHTML}`
}

interface ThemeColors {
  bg: string
  text: string
  scheme: 'light' | 'dark' | 'light dark'
}

const THEME_COLORS: Record<Exclude<Theme, 'auto'>, ThemeColors> = {
  sepia: { bg: '#f4ecd8', text: '#3a2f24', scheme: 'light' },
  light: { bg: '#fafaf8', text: '#1a1a1a', scheme: 'light' },
  dark: { bg: '#1e1e1e', text: '#d4d4d4', scheme: 'dark' },
  oled: { bg: '#000000', text: '#cccccc', scheme: 'dark' },
}

/**
 * A `<style>` block injected at the start of the iframe `<head>`: a
 * theme-matched base (background/text + `color-scheme`) so a bare page doesn't
 * flash, theme-aware scrollbars, and an optional reading-width clamp. The
 * page's own rules win — base colors use `:where()` (zero specificity) and the
 * scrollbar styling is cosmetic.
 */
export function buildInjectedHead(
  theme: Theme,
  opts: { readingWidth: boolean },
): string {
  const readingWidthCss = opts.readingWidth
    ? `:where(body){max-width:72ch;margin-inline:auto;padding-inline:1.25rem;}`
    : ''

  if (theme === 'auto') {
    return `<style data-injected="swirlread-html">
:root{color-scheme:light dark;}
:where(html,body){background:#fafaf8;color:#1a1a1a;}
@media (prefers-color-scheme: dark){:where(html,body){background:#1e1e1e;color:#d4d4d4;}}
html{scrollbar-width:thin;scrollbar-color:rgba(58,47,36,.4) transparent;}
@media (prefers-color-scheme: dark){html{scrollbar-color:rgba(228,219,199,.4) transparent;}}
*::-webkit-scrollbar{width:10px;height:10px;background:transparent;}
*::-webkit-scrollbar-thumb{background-color:rgba(128,128,128,.4);border-radius:999px;border:2px solid transparent;background-clip:padding-box;}
${readingWidthCss}
</style>`
  }

  const c = THEME_COLORS[theme]
  return `<style data-injected="swirlread-html">
:root{color-scheme:${c.scheme};}
:where(html,body){background:${c.bg};color:${c.text};}
html{scrollbar-width:thin;scrollbar-color:${c.scheme === 'dark' ? 'rgba(228,219,199,.4)' : 'rgba(58,47,36,.4)'} transparent;}
*::-webkit-scrollbar{width:10px;height:10px;background:transparent;}
*::-webkit-scrollbar-thumb{background-color:${c.scheme === 'dark' ? 'rgba(228,219,199,.3)' : 'rgba(58,47,36,.3)'};border-radius:999px;border:2px solid transparent;background-clip:padding-box;}
${readingWidthCss}
</style>`
}

/** Splice an injected `<head>` block at the start of the document head. */
function injectHead(html: string, headHtml: string): string {
  const headOpen = html.search(/<head\b[^>]*>/i)
  if (headOpen >= 0) {
    const tagEnd = html.indexOf('>', headOpen) + 1
    return html.slice(0, tagEnd) + headHtml + html.slice(tagEnd)
  }
  return headHtml + html
}

export interface BuildSrcDocArgs {
  source: string
  vault: VaultFileSystem
  /** The HTML file's own vault path (used to resolve relative assets). */
  path: VaultPath
  theme: Theme
  readingWidth: boolean
}

/**
 * Build the final iframe `srcDoc`: resolve every relative asset to a vault
 * blob URL, rewrite the HTML, and inject the themed base style. Missing /
 * unreadable assets are skipped (their original URL is left in place — it
 * simply fails to load, exactly like a broken link, never a crash).
 */
export async function buildSrcDoc(args: BuildSrcDocArgs): Promise<string> {
  const { source, vault, path, theme, readingWidth } = args
  const dir = dirname(path)
  const refs = collectRewritableAssets(source, dir)

  const blobByRawUrl = new Map<string, string>()
  await Promise.all(
    refs.map(async (ref) => {
      try {
        const blob = await vault.getBlobURL(ref.vaultPath)
        blobByRawUrl.set(ref.rawUrl, blob)
      } catch {
        // Missing/unreadable asset — leave the original URL untouched.
      }
    }),
  )

  const rewritten = applyAssetRewrites(source, blobByRawUrl)
  return injectHead(rewritten, buildInjectedHead(theme, { readingWidth }))
}
