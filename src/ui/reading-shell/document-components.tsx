/**
 * Shared hast-to-JSX component map used by the Markdown render pipeline
 * and by EmbedContext so nested embeds inherit the same custom elements.
 *
 * The Safe* wrappers (in `document-safe-renderers.tsx`) carry per-block
 * ChunkBoundary so a single Mermaid syntax error or KaTeX rejection
 * only blanks that one block — the surrounding prose keeps rendering.
 *
 * This file exports a constant only; the wrappers live in their own
 * file so `react-refresh/only-export-components` doesn't trip on a
 * mixed component / non-component module.
 */

import { Wikilink } from './Wikilink'
import { Callout } from './Callout'
import { EmbedNode } from './EmbedNode'
import { Tag } from './Tag'
import {
  SafeMathBlock,
  SafeMathInline,
  SafeMermaidDiagram,
} from './document-safe-renderers'

// hast-util-to-jsx-runtime accepts custom tag names via lowercase keys.
// Our remark plugins emit `<wikilink>`, `<callout>`, `<vault-embed>`,
// `<mermaid-diagram>`, `<tag>`, `<math-inline>`, `<math-block>`.
export const customComponents = {
  wikilink: Wikilink,
  callout: Callout,
  'vault-embed': EmbedNode,
  'mermaid-diagram': SafeMermaidDiagram,
  tag: Tag,
  'math-inline': SafeMathInline,
  'math-block': SafeMathBlock,
}
