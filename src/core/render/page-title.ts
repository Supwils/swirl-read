/**
 * Page-title derivation for the document page (RX1).
 *
 * Picks the most article-like display title for a file from three
 * sources, in priority order:
 *
 *   1. Frontmatter `title` (via the existing `selectMetadata` extractor)
 *   2. The first ATX `# Heading` in the markdown body
 *   3. A cleaned version of the filename (extension stripped, dashes
 *      and underscores replaced with spaces, ASCII words title-cased)
 *
 * Why a regex for the body H1 instead of reusing `extractHeadings`:
 * `extractHeadings` walks the rendered DOM. Page-title selection has
 * to run BEFORE render so the header shows the right title during the
 * loading skeleton — there is no DOM to walk yet. The regex covers
 * the only form that matters in practice (ATX `# Heading`).
 */

import type { Frontmatter } from './frontmatter'
import { selectMetadata } from './frontmatter'

export interface PageTitleSources {
  /** Parsed frontmatter (or `present: false` for non-markdown / no fm). */
  frontmatter: Frontmatter
  /**
   * Original markdown source. Frontmatter does NOT need to be stripped
   * — the H1 regex is multiline and the YAML/TOML delimiter lines
   * never look like ATX headings.
   */
  raw: string
  /** Vault-relative path (e.g. `knowledge/软件/前端/react.md`). */
  filePath: string
}

/** Derived title + a marker showing where it came from (for tests / UI). */
export interface DerivedPageTitle {
  title: string
  source: 'frontmatter' | 'body-h1' | 'filename'
}

export function derivePageTitle(sources: PageTitleSources): DerivedPageTitle {
  const fmTitle = sources.frontmatter.present
    ? selectMetadata(sources.frontmatter.data).title?.trim()
    : undefined
  if (fmTitle) {
    return { title: fmTitle, source: 'frontmatter' }
  }

  const bodyH1 = firstAtxH1(sources.raw)
  if (bodyH1) {
    return { title: bodyH1, source: 'body-h1' }
  }

  return { title: cleanFilename(sources.filePath), source: 'filename' }
}

/**
 * Pull the first top-level ATX heading from raw markdown. Strips a
 * trailing closing run of `#` characters (the GFM `# Title #` form).
 * Skips fenced code blocks defensively so a `# comment` inside ```bash
 * doesn't get promoted to the page title.
 */
export function firstAtxH1(raw: string): string | null {
  if (!raw) return null
  const stripped = stripFencedCode(raw)
  const match = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(stripped)
  if (!match?.[1]) return null
  return match[1].trim()
}

/**
 * Replace fenced-code spans with newlines of equivalent length so the
 * H1 regex's line offsets remain valid but no in-fence text matches.
 */
function stripFencedCode(source: string): string {
  return source.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/[^\n]/g, ' '),
  )
}

/**
 * Turn a vault-relative path into a human-readable title:
 * strip the directory + extension, replace separators with spaces,
 * title-case ASCII words. Non-ASCII characters (CJK) are preserved
 * verbatim so we don't mangle Chinese filenames.
 */
export function cleanFilename(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  const noExt = base.replace(/\.[^.]+$/, '')
  if (!noExt) return base
  const normalized = noExt.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return base
  return normalized.split(' ').map(titleCaseWord).join(' ')
}

function titleCaseWord(word: string): string {
  if (word.length === 0) return word
  // Only title-case words starting with a lowercase ASCII letter.
  // Already-cased ASCII (e.g. acronyms `API`) and non-Latin words
  // (e.g. `中文`) pass through unchanged.
  if (!/^[a-z]/.test(word)) return word
  return word[0]!.toUpperCase() + word.slice(1)
}
