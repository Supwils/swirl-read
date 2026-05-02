/**
 * remark-math-shim — convert remark-math nodes into custom HTML hints.
 *
 * `remark-math` parses `$inline$` and `$$block$$` into mdast `inlineMath`
 * and `math` nodes. Without a follow-up rehype plugin those nodes turn
 * into plain `<code class="math">` and `<pre class="math">` blocks at
 * the `remark-rehype` boundary.
 *
 * We don't want to ship `rehype-katex` (it bundles KaTeX eagerly in the
 * main pipeline chunk — ~280 KB minified). Instead, mirror the Mermaid
 * pattern: emit custom `<math-block>` / `<math-inline>` elements with
 * `data-source`. React components lazy-load KaTeX on first mount and
 * render to HTML there.
 *
 * That way pages without math pay nothing; pages with math pay once,
 * lazily, on the first math node that mounts.
 */

import type { Plugin } from 'unified'
import type { Node } from 'unist'
import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'

interface MathNode extends Node {
  type: 'math' | 'inlineMath'
  value: string
  data?: {
    hName?: string
    hProperties?: Record<string, string | undefined>
    hChildren?: { type: 'text'; value: string }[]
  }
}

const remarkMathShim: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(
      tree,
      (node: Node): node is MathNode =>
        node.type === 'math' || node.type === 'inlineMath',
      (node: MathNode) => {
        const isBlock = node.type === 'math'
        node.data = {
          hName: isBlock ? 'math-block' : 'math-inline',
          hProperties: { 'data-source': node.value },
          // hChildren is empty so the placeholder element renders no
          // visible text — the React component owns visual output.
          hChildren: [],
        }
      },
    )
  }
}

export default remarkMathShim
