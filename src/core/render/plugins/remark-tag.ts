/**
 * remark-tag — parse Obsidian-style `#tag` and `#nested/tag` from text nodes.
 *
 * Recognized forms (Unicode-aware — CJK tags work):
 *
 *   #tag                  → `<tag data-tag="tag">#tag</tag>`
 *   #foo/bar              → nested tag, value `foo/bar`
 *   #中文                 → CJK tag preserved verbatim
 *
 * Deliberately NOT recognized:
 *
 *   xyz#anchor            → preceding letter/digit ⇒ URL fragment, not a tag
 *   /path#frag            → preceding slash ⇒ URL fragment
 *   ##doubled             → preceding `#` ⇒ ATX heading marker leftover
 *   `code with #tag`      → mdast `inlineCode` is not a `text` node
 *
 * Skipped contexts (parent-aware):
 *
 *   - Inside `link`        — `[label #tag](url)` keeps `#tag` as plain text
 *   - Inside `linkReference`
 *   - Inside `image` / `imageReference`
 *
 * Strategy mirrors `remark-wikilink`: a `unist-util-visit` pass over `text`
 * nodes, splitting matched ranges into `<text> | <tag> | <text>` triples.
 */

import type { Plugin } from 'unified'
import type { Node, Parent } from 'unist'
import type { Root, Text } from 'mdast'
import { visit, SKIP } from 'unist-util-visit'

declare module 'mdast' {
  interface PhrasingContentMap {
    tag: TagNode
  }
  interface RootContentMap {
    tag: TagNode
  }
}

export interface TagNode extends Node {
  type: 'tag'
  value: string
  data?: {
    hName?: string
    hProperties?: Record<string, string | undefined>
    hChildren?: { type: 'text'; value: string }[]
  }
}

/**
 * Match `#tag` / `#nested/tag` not preceded by a word char, slash, or `#`.
 *
 * Body chars are Unicode letters/digits/underscores plus `-` and `/`. The
 * leading char must be a letter, digit, or underscore (so a literal `#-`
 * doesn't tag-ify).
 */
const TAG_RE =
  /(?<![\w/#])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*[\p{L}\p{N}_-]|[\p{L}\p{N}_])/gu

/** Pure helper — return every tag value found in `text`, in order, with
 *  duplicates preserved. Exported so the indexer reuses the same regex. */
export function findTagsInText(text: string): string[] {
  if (!text?.includes('#')) return []
  TAG_RE.lastIndex = 0
  const out: string[] = []
  let match: RegExpExecArray | null
  while ((match = TAG_RE.exec(text)) !== null) {
    if (match[1]) out.push(normalizeTag(match[1]))
  }
  return out
}

/**
 * Normalize a tag for storage / equality. Lowercases ASCII letters
 * (Obsidian convention — CJK is case-less so this is a no-op there),
 * trims trailing slashes/dashes that the regex allows mid-tag.
 */
export function normalizeTag(raw: string): string {
  return raw.toLowerCase().replace(/[/_-]+$/u, '')
}

function buildTagNode(value: string): TagNode {
  const normalized = normalizeTag(value)
  return {
    type: 'tag',
    value: normalized,
    data: {
      hName: 'tag',
      hProperties: { 'data-tag': normalized },
      hChildren: [{ type: 'text', value: `#${value}` }],
    },
  }
}

/** Parents whose `text` children should NOT be tag-ified. Keeps tags out
 *  of link labels and image alt text where the `#` carries other meaning. */
const SKIP_PARENT_TYPES: ReadonlySet<string> = new Set([
  'link',
  'linkReference',
  'image',
  'imageReference',
])

const remarkTag: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent: Parent | null) => {
      if (!parent || typeof index !== 'number') return
      if (SKIP_PARENT_TYPES.has(parent.type)) return
      const value = node.value
      if (!value.includes('#')) return

      TAG_RE.lastIndex = 0
      const newChildren: (Text | TagNode)[] = []
      let last = 0
      let match: RegExpExecArray | null

      while ((match = TAG_RE.exec(value)) !== null) {
        const raw = match[1]
        if (raw === undefined) continue
        if (match.index > last) {
          newChildren.push({
            type: 'text',
            value: value.slice(last, match.index),
          })
        }
        newChildren.push(buildTagNode(raw))
        last = match.index + match[0].length
      }

      if (newChildren.length === 0) return
      if (last < value.length) {
        newChildren.push({ type: 'text', value: value.slice(last) })
      }

      parent.children.splice(index, 1, ...(newChildren as Parent['children']))
      const idx = index as number
      return [SKIP, idx + newChildren.length]
    })
  }
}

export default remarkTag
