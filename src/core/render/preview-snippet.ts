/**
 * preview-snippet — turn a Markdown source into a short plain-text preview
 * suitable for a hover popover.
 *
 * What gets stripped:
 *   - YAML / TOML frontmatter blocks at the start
 *   - The first H1 line (it usually duplicates the filename)
 *   - Heavy block-level markup that adds noise without context
 *     (code fences, HTML comments)
 *   - Inline `[[wikilinks]]` and `![[embeds]]` collapsed to their target/alias
 *
 * What's preserved:
 *   - Inline emphasis text (we keep the words, drop the `**`/`*`/`==`)
 *   - The first ~`maxChars` characters of the cleaned body, with a trailing
 *     ellipsis when truncated.
 *
 * Pure utility — no DOM, no markdown parser. The render path is hot
 * (called on first hover, which is meant to be ~instant), so the
 * implementation is deliberately regex-based and bounded.
 */

const FRONTMATTER_YAML_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
const FRONTMATTER_TOML_RE = /^\+\+\+\r?\n[\s\S]*?\r?\n\+\+\+\r?\n?/
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const FENCED_CODE_RE = /```[\s\S]*?```/g
const FIRST_H1_RE = /^#\s+[^\n]*\n+/
const WIKILINK_OR_EMBED_RE = /!?\[\[([^\]\n]+)]]/g
const HEADING_HASH_RE = /^#{1,6}\s+/gm
const EMPHASIS_RE = /(\*\*|__|\*|_|==|~~)/g
const BLOCKQUOTE_PREFIX_RE = /^>\s*/gm
const LINK_RE = /\[([^\]\n]+)]\([^)\n]*\)/g
const INLINE_CODE_RE = /`([^`\n]+)`/g

export function previewSnippet(source: string, maxChars = 200): string {
  let body = source

  // Strip frontmatter (YAML or TOML) at the very top.
  body = body.replace(FRONTMATTER_YAML_RE, '')
  body = body.replace(FRONTMATTER_TOML_RE, '')

  // Drop fenced code blocks and HTML comments — they add noise to a tiny
  // preview and rarely contain the lead the reader expects.
  body = body.replace(FENCED_CODE_RE, '')
  body = body.replace(HTML_COMMENT_RE, '')

  // Strip the leading H1, which is usually the file's title.
  body = body.replace(/^\s+/, '').replace(FIRST_H1_RE, '')

  // Collapse `[[target|alias]]` → `alias`, `[[target]]` → `target`.
  body = body.replace(WIKILINK_OR_EMBED_RE, (_full, inner: string) => {
    const pipeIdx = inner.indexOf('|')
    if (pipeIdx >= 0) return inner.slice(pipeIdx + 1).trim()
    return inner.trim()
  })

  // `[text](url)` → `text`
  body = body.replace(LINK_RE, '$1')

  // Inline-code wraps: keep the text, drop the backticks.
  body = body.replace(INLINE_CODE_RE, '$1')

  // Strip heading hashes, blockquote prefixes, common emphasis wrappers.
  body = body.replace(HEADING_HASH_RE, '')
  body = body.replace(BLOCKQUOTE_PREFIX_RE, '')
  body = body.replace(EMPHASIS_RE, '')

  // Collapse whitespace runs (including newlines) into single spaces.
  body = body.replace(/\s+/g, ' ').trim()

  if (body.length <= maxChars) return body
  // Don't break inside a word: back up to the last space within maxChars.
  const cut = body.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = lastSpace > maxChars * 0.7 ? cut.slice(0, lastSpace) : cut
  return trimmed.replace(/[\s.,;:]+$/, '') + '…'
}
