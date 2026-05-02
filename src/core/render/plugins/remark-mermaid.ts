/**
 * remark-mermaid — divert `mermaid` fenced code blocks away from Shiki.
 *
 * Strategy: visit every `code` mdast node with `lang === 'mermaid'` and
 * replace it with a custom `mermaid` node whose hast hint emits a
 * `<mermaid-diagram>` element with `data-source` carrying the raw diagram
 * source. The diagram source is preserved verbatim so the lazy-loaded
 * `MermaidDiagram` React component (M3.13) can render it on the client.
 *
 * Why a custom element rather than letting Shiki render a styled `<pre>`?
 *
 *   - Shiki has no `mermaid` grammar; it would fall back to a plain
 *     monochrome block, which is not the intent.
 *   - Mermaid itself is large (~280 KB gzip). We refuse to pay that on
 *     pages that have no diagrams. The renderer (`MermaidDiagram.tsx`)
 *     dynamic-imports it on first mount.
 *   - Keeping the source in `data-source` means a renderer that fails (e.g.
 *     bad syntax) can fall back to displaying the source as a `<pre>`.
 *
 * Sanitize schema is extended in `pipeline.ts` to allow `<mermaid-diagram>`
 * + the `data-source` attribute.
 */

import type { Plugin } from 'unified'
import type { Node, Parent } from 'unist'
import type { Code, Root } from 'mdast'
import { visit } from 'unist-util-visit'

declare module 'mdast' {
  interface BlockContentMap {
    mermaid: MermaidNode
  }
  interface RootContentMap {
    mermaid: MermaidNode
  }
}

export interface MermaidNode extends Node {
  type: 'mermaid'
  source: string
  data?: {
    hName?: string
    hProperties?: Record<string, string>
    hChildren?: { type: 'text'; value: string }[]
  }
}

function buildMermaidNode(source: string): MermaidNode {
  return {
    type: 'mermaid',
    source,
    data: {
      hName: 'mermaid-diagram',
      hProperties: { 'data-source': source },
      // Preserve a textual fallback in case sanitization or a missing
      // renderer drops the custom element. The text content is the raw
      // diagram source.
      hChildren: [{ type: 'text', value: source }],
    },
  }
}

const remarkMermaid: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'code', (node: Code, index, parent: Parent | null) => {
      if (!parent || typeof index !== 'number') return
      if (node.lang !== 'mermaid') return
      const replacement = buildMermaidNode(node.value)
      parent.children.splice(index, 1, replacement as Parent['children'][0])
    })
  }
}

export default remarkMermaid
