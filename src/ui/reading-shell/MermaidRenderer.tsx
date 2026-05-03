/**
 * MermaidRenderer — actual Mermaid render component.
 *
 * Loaded only when a `<mermaid-diagram>` element is encountered on a page,
 * via `MermaidDiagram` (the thin lazy wrapper). The renderer plus the
 * Mermaid runtime live in a separate JS chunk so pages without diagrams
 * pay zero bundle cost.
 *
 * Lazy-loading
 * ────────────
 * The Mermaid runtime is ~280 KB gzipped. We refuse to ship it on pages with
 * no diagrams. The first render of any Mermaid diagram triggers a single
 * `import('mermaid')` call which is shared across all subsequent diagrams
 * via a module-level promise. Tests can preload a stub via
 * `__setMermaidLoaderForTests`.
 *
 * Theming
 * ───────
 * Mermaid has a small set of built-in themes ('default', 'dark', 'forest',
 * 'neutral'). We map our reader themes to the closest match and re-render
 * if the active theme changes. Mermaid SVG is otherwise plain markup that
 * inherits ambient colors where it can.
 *
 * Failure
 * ───────
 * Bad diagram syntax, network errors loading the library, or unexpected
 * exceptions all fall through to a styled `<pre>` showing the raw source.
 * That is strictly better than hiding the content the author wrote.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useUIStore, type Theme } from '@/stores/ui-store'
import { getMermaid } from './mermaid-loader'

const THEME_MAP: Record<Theme, string> = {
  sepia: 'neutral',
  light: 'default',
  dark: 'dark',
  oled: 'dark',
  // Mermaid has no `prefers-color-scheme` awareness; pick a sensible default.
  // The reader's `useApplyUIPrefs` hook flips `<body class="theme-…">` if
  // the user is in auto mode, but the active store value stays `auto`.
  auto: 'default',
}

let nextDiagramId = 0

export interface MermaidRendererProps {
  /**
   * The diagram source. The remark plugin emits this via `data-source`,
   * which `hast-util-to-jsx-runtime` passes into props as `dataSource`.
   * Children are kept as a textual fallback in case `data-source` is
   * dropped (e.g. by a future sanitize pass).
   */
  'data-source'?: string
  dataSource?: string
  children?: ReactNode
}

export function MermaidRenderer(props: MermaidRendererProps): ReactNode {
  const source = readSource(props)
  const theme = useUIStore((s) => s.theme)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'rendered'; svg: string }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  useEffect(() => {
    if (!source) {
      setState({ kind: 'error', message: 'Empty diagram' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    void renderDiagram(source, theme)
      .then((svg) => {
        if (!cancelled) setState({ kind: 'rendered', svg })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [source, theme])

  if (state.kind === 'loading') {
    return (
      <div
        className="swirlread-mermaid swirlread-mermaid--loading"
        role="status"
      >
        <span className="swirlread-mermaid__status">Rendering diagram…</span>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <figure className="swirlread-mermaid swirlread-mermaid--error">
        <figcaption className="swirlread-mermaid__caption">
          Couldn&apos;t render this diagram. Showing source:
        </figcaption>
        <pre className="swirlread-mermaid__source">{source}</pre>
      </figure>
    )
  }

  // Mermaid's output is its own SVG produced from author-controlled source.
  // No external HTML reaches here — the source is parsed by mermaid before
  // being stringified. We treat the resulting SVG the same way we treat
  // Shiki's markup elsewhere in the pipeline.
  return (
    <div
      ref={containerRef}
      className="swirlread-mermaid"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  )
}

function readSource(props: MermaidRendererProps): string {
  const direct = props['data-source'] ?? props.dataSource
  if (typeof direct === 'string' && direct.length > 0) return direct
  // Fall back to children text if data attr was stripped.
  const child = props.children
  if (typeof child === 'string') return child
  return ''
}

async function renderDiagram(source: string, theme: Theme): Promise<string> {
  const mermaid = await getMermaid()
  mermaid.initialize({
    startOnLoad: false,
    theme: THEME_MAP[theme],
  })
  // Mermaid requires a unique element id per render call.
  const id = `swirlread-mermaid-${String(++nextDiagramId)}`
  const result = await mermaid.render(id, source)
  return result.svg
}
