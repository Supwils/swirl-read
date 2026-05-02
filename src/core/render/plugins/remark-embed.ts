/**
 * remark-embed — parse Obsidian-style embeds `![[file]]` from text nodes.
 *
 * Supported forms:
 *   - `![[image.png]]`                  inline embed (image/video/audio/md)
 *   - `![[image.png|400]]`              with display arg (image: width)
 *   - `![[image.png|400x300]]`          with width × height
 *   - `![[image.png|alt text]]`         non-numeric arg → alt text
 *   - `![[note]]`                        no extension → markdown by default
 *   - `![[note.md#heading]]`             section embed (renderer scope)
 *   - `![[note.md^block-id]]`            block reference (renderer scope)
 *
 * Two passes:
 *   1. Visit `text` nodes; replace any `![[...]]` occurrence with an
 *      `embed` mdast node + surrounding text.
 *   2. Lift any paragraph whose ONLY child is an embed up to a top-level
 *      block. Avoids invalid `<aside><p><img></p></aside>` HTML for the
 *      common case where an embed sits alone on its own line.
 *
 * Inline embeds (e.g. `text ![[icon.png]] more text`) stay nested inside
 * their paragraph — fine for inline-renderable kinds (image / span).
 *
 * **Run BEFORE remark-wikilink in the pipeline.** Otherwise wikilink would
 * match the inner `[[file]]` of `![[file]]` and consume it, leaving a stray
 * `!` behind.
 *
 * Known limitation (shared with remark-wikilink): the visit pass only
 * touches text nodes whose siblings have already been parsed. Embeds inside
 * emphasis or other phrasing wrappers are not currently split.
 */

import type { Plugin } from 'unified'
import type { Node, Parent } from 'unist'
import type { Paragraph, Root, Text } from 'mdast'
import { visit, SKIP } from 'unist-util-visit'

export type EmbedKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'markdown'
  | 'pdf'
  | 'other'

export interface EmbedData {
  target: string
  display?: string
  heading?: string
  blockId?: string
  kind: EmbedKind
}

declare module 'mdast' {
  interface PhrasingContentMap {
    embed: EmbedNode
  }
  interface RootContentMap {
    embed: EmbedNode
  }
}

export interface EmbedNode extends Node {
  type: 'embed'
  target: string
  display?: string
  heading?: string
  blockId?: string
  kind: EmbedKind
  data?: {
    hName?: string
    hProperties?: Record<string, string | undefined>
  }
}

const EMBED_RE = /!\[\[([^\]\n]+)]]/g

const IMAGE_EXTS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.bmp',
  '.ico',
]
const VIDEO_EXTS = ['.mp4', '.webm', '.ogv', '.mov', '.m4v']
const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus']
const MARKDOWN_EXTS = ['.md', '.mdx']

function lowerExt(target: string): string {
  const slashIdx = target.lastIndexOf('/')
  const base = slashIdx >= 0 ? target.slice(slashIdx + 1) : target
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot).toLowerCase()
}

/** Pick a renderer kind from the file extension. No extension → markdown. */
export function detectKind(target: string): EmbedKind {
  const ext = lowerExt(target)
  if (!ext) return 'markdown'
  if (MARKDOWN_EXTS.includes(ext)) return 'markdown'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (AUDIO_EXTS.includes(ext)) return 'audio'
  if (ext === '.pdf') return 'pdf'
  return 'other'
}

/**
 * Parse the body of `![[...]]` (the content between brackets).
 *
 * Order of token recognition mirrors remark-wikilink:
 *   1. Pipe `|`     → everything after is the display argument
 *   2. Block ref `^` → separates target from block id
 *   3. Heading `#`   → only if no block ref
 */
export function parseEmbedBody(body: string): EmbedData {
  let display: string | undefined
  let head = body

  const pipeIdx = head.indexOf('|')
  if (pipeIdx >= 0) {
    display = head.slice(pipeIdx + 1).trim()
    head = head.slice(0, pipeIdx)
  }

  let target = head
  let heading: string | undefined
  let blockId: string | undefined

  const blockIdIdx = head.indexOf('^')
  if (blockIdIdx >= 0) {
    blockId = head.slice(blockIdIdx + 1).trim()
    target = head.slice(0, blockIdIdx)
  } else {
    const headingIdx = head.indexOf('#')
    if (headingIdx >= 0) {
      heading = head.slice(headingIdx + 1).trim()
      target = head.slice(0, headingIdx)
    }
  }

  const cleanTarget = target.trim()
  const result: EmbedData = {
    target: cleanTarget,
    kind: detectKind(cleanTarget),
  }
  if (display) result.display = display
  if (heading) result.heading = heading
  if (blockId) result.blockId = blockId
  return result
}

function buildEmbedNode(parsed: EmbedData): EmbedNode {
  return {
    type: 'embed',
    target: parsed.target,
    kind: parsed.kind,
    ...(parsed.display !== undefined && { display: parsed.display }),
    ...(parsed.heading !== undefined && { heading: parsed.heading }),
    ...(parsed.blockId !== undefined && { blockId: parsed.blockId }),
    data: {
      hName: 'vault-embed',
      hProperties: {
        'data-target': parsed.target,
        'data-kind': parsed.kind,
        ...(parsed.display !== undefined && { 'data-display': parsed.display }),
        ...(parsed.heading !== undefined && { 'data-heading': parsed.heading }),
        ...(parsed.blockId !== undefined && {
          'data-block-id': parsed.blockId,
        }),
      },
    },
  }
}

const remarkEmbed: Plugin<[], Root> = () => {
  return (tree: Root) => {
    // Pass 1: split text nodes containing `![[...]]`.
    visit(tree, 'text', (node: Text, index, parent: Parent | null) => {
      if (!parent || typeof index !== 'number') return
      const value = node.value
      if (!value.includes('![[')) return

      EMBED_RE.lastIndex = 0
      const newChildren: (Text | EmbedNode)[] = []
      let last = 0
      let match: RegExpExecArray | null

      while ((match = EMBED_RE.exec(value)) !== null) {
        const whole = match[0]
        const body = match[1]
        if (body === undefined) continue
        if (match.index > last) {
          newChildren.push({
            type: 'text',
            value: value.slice(last, match.index),
          })
        }
        newChildren.push(buildEmbedNode(parseEmbedBody(body)))
        last = match.index + whole.length
      }

      if (newChildren.length === 0) return
      if (last < value.length) {
        newChildren.push({ type: 'text', value: value.slice(last) })
      }

      parent.children.splice(index, 1, ...(newChildren as Parent['children']))
      const idx = index as number
      return [SKIP, idx + newChildren.length]
    })

    // Pass 2: lift solitary embeds out of their wrapping paragraph so the
    // hast tree can render them as block-level without nesting an <aside>
    // (or future block-level embed) inside a <p>.
    visit(
      tree,
      'paragraph',
      (node: Paragraph, index, parent: Parent | null) => {
        if (!parent || typeof index !== 'number') return
        if (node.children.length !== 1) return
        const only = node.children[0]
        if (!only || (only as Node).type !== 'embed') return
        parent.children.splice(
          index,
          1,
          only as unknown as Parent['children'][number],
        )
        // unist-util-visit narrows `index` to `never` after we've returned
        // from the type guards above; rebind through a local for the SKIP.
        const idx = index as number
        return [SKIP, idx + 1]
      },
    )
  }
}

export default remarkEmbed
