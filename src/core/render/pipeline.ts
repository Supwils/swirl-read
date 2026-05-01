/**
 * Markdown rendering pipeline.
 *
 * Pipeline steps (async because of Shiki — see note below):
 *
 *   remark-parse
 *     → remark-frontmatter
 *     → remark-gfm
 *     → remark-callout       (custom, M3.5)
 *     → remark-wikilink      (custom, M3.2)
 *     → remark-rehype
 *     → rehype-shiki         (M3.12 — async; promotes pipeline to async)
 *     → rehype-sanitize      (extended schema for our custom tags + Shiki styles)
 *     → hast-util-to-jsx-runtime
 *
 * The `renderMarkdown` function returns `Promise<ReactNode>`. Callers must
 * `await` it (DocumentPage already does, in its useEffect.then handler).
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
import rehypeShiki from '@shikijs/rehype'
import {
  toJsxRuntime,
  type Jsx,
  type Components,
} from 'hast-util-to-jsx-runtime'
import remarkWikilink from './plugins/remark-wikilink'
import remarkCallout from './plugins/remark-callout'

/**
 * Sanitize schema. Built off the rehype-sanitize default and extended to
 * allow:
 *   - `id` on headings (TOC anchoring, M4.6)
 *   - `<wikilink>` tag with our data attrs (M3.3)
 *   - `<callout>` tag with our data attrs (M3.6)
 *   - `style` + `class` on Shiki output (M3.12)
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
    // Shiki emits inline color/background-color via style + token classes.
    // Allow className broadly here — class strings cannot execute and
    // restricting them via regex breaks Shiki's class composition.
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      'style',
      'tabindex',
      'className',
    ],
    code: [...(defaultSchema.attributes?.code ?? []), 'style', 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'style', 'className'],
  },
}

/**
 * Languages we ship out of the box. Anything not in this list still renders
 * (Shiki falls back to plain text); add to this array to enable highlighting.
 *
 * Tuned for Wilson's developer vault — keep in sync with `tech-stack.md`.
 */
const SHIKI_LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'python',
  'rust',
  'go',
  'java',
  'cpp',
  'c',
  'csharp',
  'ruby',
  'swift',
  'kotlin',
  'bash',
  'shell',
  'sh',
  'sql',
  'json',
  'yaml',
  'toml',
  'css',
  'html',
  'markdown',
  'md',
  'diff',
  'dockerfile',
] as const

/** Build the unified processor. Exported for tests / future composition. */
export function createMarkdownProcessor(): Processor {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkGfm)
    .use(remarkCallout)
    .use(remarkWikilink)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeShiki, {
      themes: {
        light: 'github-light',
        dark: 'vitesse-dark',
      },
      langs: [...SHIKI_LANGS],
      defaultColor: false, // emit CSS vars for both themes; we pick via prefers
    })
    .use(rehypeSanitize, schema) as unknown as Processor
}

const defaultProcessor = createMarkdownProcessor()

const jsxRuntimeOptions = {
  Fragment,
  jsx: jsx as Jsx,
  jsxs: jsxs as Jsx,
} satisfies { Fragment: typeof Fragment; jsx: Jsx; jsxs: Jsx }

/**
 * Render a Markdown source string to a React tree.
 *
 * Asynchronous because Shiki's grammar loading is async. Callers must
 * `await` the result (DocumentPage handles this in its `.then` chain).
 */
export async function renderMarkdown(
  source: string,
  components?: Partial<Components>,
): Promise<ReactNode> {
  const mdast = defaultProcessor.parse(source)
  const hast = (await defaultProcessor.run(mdast)) as HastRoot
  // toJsxRuntime returns JSX.Element; React 19's loose JSX typings confuse
  // strict no-unsafe-* rules, so we trust the library's return shape here.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const tree = toJsxRuntime(hast, {
    ...jsxRuntimeOptions,
    ...(components && { components }),
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return tree
}
