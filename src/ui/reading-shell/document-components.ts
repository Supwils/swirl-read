/**
 * Shared hast-to-JSX component map used by the Markdown render pipeline
 * and by EmbedContext so nested embeds inherit the same custom elements.
 *
 * Lives in a `.ts` file (no JSX needed — just imports and a plain object
 * export) so it can be imported by both use-document-loader and
 * DocumentBodyView without circular dependencies or fast-refresh issues.
 */

import { Wikilink } from './Wikilink'
import { Callout } from './Callout'
import { EmbedNode } from './EmbedNode'
import { MermaidDiagram } from './MermaidDiagram'
import { MathBlock, MathInline } from './MathBlock'
import { Tag } from './Tag'

// hast-util-to-jsx-runtime accepts custom tag names via lowercase keys.
// Our remark plugins emit `<wikilink>`, `<callout>`, `<vault-embed>`,
// `<mermaid-diagram>`, `<tag>`, `<math-inline>`, `<math-block>`.
export const customComponents = {
  wikilink: Wikilink,
  callout: Callout,
  'vault-embed': EmbedNode,
  'mermaid-diagram': MermaidDiagram,
  tag: Tag,
  'math-inline': MathInline,
  'math-block': MathBlock,
}
