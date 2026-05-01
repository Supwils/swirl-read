/**
 * remark-wikilink — parse Obsidian-style `[[wikilinks]]` from text nodes.
 *
 * Supported forms:
 *   - `[[page]]`                        target only
 *   - `[[page|alias]]`                  with display alias
 *   - `[[page#heading]]`                with heading anchor
 *   - `[[page#heading|alias]]`          heading + alias
 *   - `[[page^block-id]]`               block reference
 *   - `[[page^block-id|alias]]`         block reference + alias
 *
 * Strategy: a `unist-util-visit` pass over all `text` nodes that splits any
 * occurrence of `[[...]]` into a `wikilink` node + surrounding text.
 *
 * **Known limitation**: this approach doesn't see syntax inside emphasis or
 * other non-text contexts where the parent already holds nested children
 * before our visit. Wikilinks at the top level of paragraphs (the common
 * case) work correctly. A proper micromark extension is the eventual fix
 * (tracked for M3.x polish).
 */

import type { Plugin } from 'unified'
import type { Node, Parent } from 'unist'
import type { Root, Text } from 'mdast'
import { visit, SKIP } from 'unist-util-visit'

export interface WikilinkData {
  target: string
  alias?: string
  heading?: string
  blockId?: string
}

/** mdast extension: register the new node type so types compose cleanly. */
declare module 'mdast' {
  interface PhrasingContentMap {
    wikilink: WikilinkNode
  }
  interface RootContentMap {
    wikilink: WikilinkNode
  }
}

export interface WikilinkNode extends Node {
  type: 'wikilink'
  target: string
  alias?: string
  heading?: string
  blockId?: string
  data?: {
    hName?: string
    hProperties?: Record<string, string | undefined>
    hChildren?: { type: 'text'; value: string }[]
  }
}

const WIKILINK_RE = /\[\[([^\]\n]+)]]/g

/**
 * Parse the body of a `[[...]]` (the part between brackets).
 *
 * Order of token recognition:
 *   1. Pipe `|` first — everything after is the alias (Obsidian rule)
 *   2. Block ref `^` next — separates target from block id
 *   3. Heading `#` — only if no block ref present
 */
export function parseWikilinkBody(body: string): WikilinkData {
  let alias: string | undefined
  let head = body

  const pipeIdx = head.indexOf('|')
  if (pipeIdx >= 0) {
    alias = head.slice(pipeIdx + 1).trim()
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

  const result: WikilinkData = { target: target.trim() }
  if (alias) result.alias = alias
  if (heading) result.heading = heading
  if (blockId) result.blockId = blockId
  return result
}

/** Default visible label when no explicit alias is provided. */
function defaultLabel(parsed: WikilinkData): string {
  if (parsed.alias) return parsed.alias
  let label = parsed.target
  if (parsed.heading) label += ` > ${parsed.heading}`
  return label
}

function buildWikilinkNode(parsed: WikilinkData): WikilinkNode {
  const label = defaultLabel(parsed)
  return {
    type: 'wikilink',
    target: parsed.target,
    ...(parsed.alias !== undefined && { alias: parsed.alias }),
    ...(parsed.heading !== undefined && { heading: parsed.heading }),
    ...(parsed.blockId !== undefined && { blockId: parsed.blockId }),
    data: {
      hName: 'wikilink',
      hProperties: {
        'data-target': parsed.target,
        ...(parsed.alias !== undefined && { 'data-alias': parsed.alias }),
        ...(parsed.heading !== undefined && { 'data-heading': parsed.heading }),
        ...(parsed.blockId !== undefined && {
          'data-block-id': parsed.blockId,
        }),
      },
      hChildren: [{ type: 'text', value: label }],
    },
  }
}

const remarkWikilink: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent: Parent | null) => {
      if (!parent || typeof index !== 'number') return
      const value = node.value
      if (!value.includes('[[')) return

      WIKILINK_RE.lastIndex = 0
      const newChildren: (Text | WikilinkNode)[] = []
      let last = 0
      let match: RegExpExecArray | null

      while ((match = WIKILINK_RE.exec(value)) !== null) {
        const whole = match[0]
        const body = match[1]
        if (body === undefined) continue
        if (match.index > last) {
          newChildren.push({
            type: 'text',
            value: value.slice(last, match.index),
          })
        }
        newChildren.push(buildWikilinkNode(parseWikilinkBody(body)))
        last = match.index + whole.length
      }

      if (newChildren.length === 0) return
      if (last < value.length) {
        newChildren.push({ type: 'text', value: value.slice(last) })
      }

      parent.children.splice(index, 1, ...(newChildren as Parent['children']))
      // unist-util-visit's narrow generics reduce `index` to `never` here
      // even though we've type-guarded above; cast through a local binding.
      const idx = index as number
      return [SKIP, idx + newChildren.length]
    })
  }
}

export default remarkWikilink
