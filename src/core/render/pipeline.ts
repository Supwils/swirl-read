/**
 * Markdown rendering pipeline (basic).
 *
 * Handles CommonMark + GFM + frontmatter detection. Returns a React node
 * tree, not an HTML string, so the host can compose it directly.
 *
 * Custom plugins (wikilinks, callouts, embeds, highlights) and rich
 * features (math, syntax highlighting, mermaid) land in M3.x. This file
 * is intentionally narrow — it's the pipeline's foundation, designed to
 * accept additional plugins without restructuring.
 */

import { Fragment, type ReactNode } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { Root as HastRoot } from 'hast'
import { unified, type Processor } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import {
  toJsxRuntime,
  type Jsx,
  type Components,
} from 'hast-util-to-jsx-runtime'
import remarkWikilink from './plugins/remark-wikilink'
import remarkCallout from './plugins/remark-callout'

/**
 * Sanitize schema. Built off the rehype-sanitize default (a GitHub-style
 * allowlist) and extended where SwilRead's renderer needs it.
 *
 * For now we only widen by adding `id` to headings (so the table-of-
 * contents M4.6 can deep-link to sections). Wikilink/callout/embed
 * extensions update this schema in M3.x.
 */
const schema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'wikilink', 'callout'],
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 ?? []), 'id'],
    h2: [...(defaultSchema.attributes?.h2 ?? []), 'id'],
    h3: [...(defaultSchema.attributes?.h3 ?? []), 'id'],
    h4: [...(defaultSchema.attributes?.h4 ?? []), 'id'],
    h5: [...(defaultSchema.attributes?.h5 ?? []), 'id'],
    h6: [...(defaultSchema.attributes?.h6 ?? []), 'id'],
    wikilink: ['data-target', 'data-alias', 'data-heading', 'data-block-id'],
    callout: ['data-callout-type', 'data-callout-title'],
  },
}

/** Build the unified processor. Exported for tests / future composition. */
export function createMarkdownProcessor(): Processor {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkGfm)
    .use(remarkCallout)
    .use(remarkWikilink)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, schema) as unknown as Processor
}

const defaultProcessor = createMarkdownProcessor()

/**
 * Render a Markdown source string to a React tree.
 *
 * Synchronous: every plugin in the current pipeline supports `runSync`.
 * If we add an async plugin later (e.g. Shiki dual-theme), this returns a
 * Promise instead — callers should be prepared (use Suspense or refactor
 * the call site).
 */
const jsxRuntimeOptions = {
  Fragment,
  jsx: jsx as Jsx,
  jsxs: jsxs as Jsx,
} satisfies { Fragment: typeof Fragment; jsx: Jsx; jsxs: Jsx }

export function renderMarkdown(
  source: string,
  components?: Partial<Components>,
): ReactNode {
  const mdast = defaultProcessor.parse(source)
  const hast = defaultProcessor.runSync(mdast) as HastRoot
  // toJsxRuntime returns JSX.Element. React 19's JSX namespace surface
  // confuses no-unsafe-* rules; we trust the library's return type here.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const tree = toJsxRuntime(hast, {
    ...jsxRuntimeOptions,
    ...(components && { components }),
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return tree
}
