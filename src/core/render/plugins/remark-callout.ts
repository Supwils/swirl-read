/**
 * remark-callout — parse Obsidian-style callouts inside blockquotes.
 *
 * Recognized syntax:
 *   > [!type]
 *   > body line
 *
 *   > [!type] Optional title
 *   > body line one
 *   > body line two
 *
 *   > [!type]+   ← foldable, default-open (M3.x polish)
 *   > [!type]-   ← foldable, default-collapsed (M3.x polish)
 *
 * Strategy: walk every `blockquote` node; if its first paragraph's first
 * text starts with `[!type]`, transform the blockquote into a `callout`
 * node. The header line is stripped; remaining body becomes children.
 *
 * Foldable markers (`+`/`-`) are recognized but currently ignored — the
 * callout always renders expanded. Adding state is a polish task.
 */

import type { Plugin } from 'unified'
import type { BlockContent, Blockquote, DefinitionContent, Root } from 'mdast'
import { visit, SKIP } from 'unist-util-visit'

/**
 * Match `[!type]` or `[!type]+`/`[!type]-`, optional title text after a space.
 *
 * IMPORTANT: the gap between `]` and the title uses `[ \t]*` (NOT `\s*`)
 * so the regex stops at a newline. `\s` would consume the line break and
 * pull the body's first line into the title.
 */
const CALLOUT_HEADER_RE = /^\[!([a-zA-Z][a-zA-Z0-9-]*)\][+-]?[ \t]*([^\n]*)/

declare module 'mdast' {
  interface RootContentMap {
    callout: CalloutNode
  }
  interface BlockContentMap {
    callout: CalloutNode
  }
}

type CalloutChild = BlockContent | DefinitionContent

export interface CalloutNode {
  type: 'callout'
  calloutType: string
  title?: string
  children: CalloutChild[]
  data?: {
    hName?: string
    hProperties?: Record<string, string | undefined>
  }
}

/** Build a callout node from the parsed blockquote content. */
function makeCalloutNode(
  calloutType: string,
  title: string | undefined,
  children: CalloutChild[],
): CalloutNode {
  return {
    type: 'callout',
    calloutType: calloutType.toLowerCase(),
    ...(title && { title }),
    children,
    data: {
      hName: 'callout',
      hProperties: {
        'data-callout-type': calloutType.toLowerCase(),
        ...(title && { 'data-callout-title': title }),
      },
    },
  }
}

const remarkCallout: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
      if (!parent || typeof index !== 'number') return

      const firstPara = node.children[0]
      if (firstPara?.type !== 'paragraph') return

      const firstChild = firstPara.children[0]
      if (firstChild?.type !== 'text') return

      const match = CALLOUT_HEADER_RE.exec(firstChild.value)
      if (!match) return

      const calloutType = match[1]
      if (!calloutType) return

      const titleRaw = match[2]?.trim() ?? ''
      const title = titleRaw.length > 0 ? titleRaw : undefined
      const headerLength = match[0].length
      const remaining = firstChild.value.slice(headerLength)

      // Drop a leading newline so body-on-the-same-line works the same as
      // body-on-the-next-line: e.g. `> [!note]\n> body` and
      // `> [!note]\nbody` both produce a body of just "body".
      const bodyText = remaining.startsWith('\n')
        ? remaining.slice(1)
        : remaining

      // Mutate the first paragraph: replace the first text node's value or
      // remove it if it's now empty.
      if (bodyText.length > 0) {
        firstChild.value = bodyText
      } else {
        firstPara.children.shift()
      }

      // If the first paragraph is now empty, drop it from the body.
      const calloutChildren =
        firstPara.children.length === 0 ? node.children.slice(1) : node.children

      parent.children.splice(
        index,
        1,
        makeCalloutNode(
          calloutType,
          title,
          calloutChildren,
        ) as unknown as BlockContent,
      )

      return [SKIP, index + 1]
    })
  }
}

export default remarkCallout
