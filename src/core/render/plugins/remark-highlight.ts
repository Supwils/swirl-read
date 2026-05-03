/**
 * remark-highlight — parse Obsidian-style `==highlighted==` from text nodes.
 *
 * Strategy: visit every `text` node and split occurrences of `==…==` into
 * a `highlight` mdast node + surrounding text. Same shape as the wikilink
 * plugin so failure modes are predictable.
 *
 * Hast hint: emit a real `<mark>` element. `<mark>` is the semantic match
 * for "highlighted text" and is NOT in the default rehype-sanitize allow
 * list, so the pipeline schema explicitly whitelists it. Themed via CSS
 * on `.swirlread-prose mark`.
 *
 * Recognized form:
 *   - `==text==`               at least one non-`=`/non-newline char between
 *
 * Edge cases:
 *   - Setext headings (`Title\n=====`) are already block-parsed before this
 *     plugin runs; the `=====` line is gone by then.
 *   - `text == 5` (whitespace-padded comparison) does NOT match — there's
 *     no closing `==`.
 *   - Lazy match (`.+?`) means `==a== ==b==` produces two separate marks,
 *     not one big one.
 */

import type { Plugin } from 'unified'
import type { Node, Parent } from 'unist'
import type { Root, Text } from 'mdast'
import { visit, SKIP } from 'unist-util-visit'

declare module 'mdast' {
  interface PhrasingContentMap {
    highlight: HighlightNode
  }
  interface RootContentMap {
    highlight: HighlightNode
  }
}

export interface HighlightNode extends Node {
  type: 'highlight'
  value: string
  data?: {
    hName?: string
    hChildren?: { type: 'text'; value: string }[]
  }
}

// Lazy match, single-line, content cannot start or end with whitespace
// (avoids false positives from `== text ==` style comparisons that aren't
// really highlights). Content is at least one non-newline character.
const HIGHLIGHT_RE = /==(\S(?:[^\n]*?\S)?)==/g

function buildHighlightNode(value: string): HighlightNode {
  return {
    type: 'highlight',
    value,
    data: {
      hName: 'mark',
      hChildren: [{ type: 'text', value }],
    },
  }
}

const remarkHighlight: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent: Parent | null) => {
      if (!parent || typeof index !== 'number') return
      const value = node.value
      if (!value.includes('==')) return

      HIGHLIGHT_RE.lastIndex = 0
      const newChildren: (Text | HighlightNode)[] = []
      let last = 0
      let match: RegExpExecArray | null

      while ((match = HIGHLIGHT_RE.exec(value)) !== null) {
        const whole = match[0]
        const inner = match[1]
        if (inner === undefined) continue
        if (match.index > last) {
          newChildren.push({
            type: 'text',
            value: value.slice(last, match.index),
          })
        }
        newChildren.push(buildHighlightNode(inner))
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
  }
}

export default remarkHighlight
