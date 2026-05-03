/**
 * Math wrappers (M3.11) — thin lazy shells around `MathRenderer`.
 *
 * These two components are the surface that the markdown pipeline binds
 * to (`<math-inline>` / `<math-block>` custom elements). They dynamic-
 * import the actual renderer so KaTeX's CSS+JS bundle (~280 KB minified)
 * never enters the main reader chunk. Pages without math pay nothing.
 *
 * Following the `MermaidDiagram` pattern: `useState`+`useEffect` for the
 * dynamic import (NOT `React.lazy`) because the consumer is the
 * `hast-util-to-jsx-runtime` components map, which is not wrapped in
 * `<Suspense>` and we don't want to introduce a Suspense boundary for
 * a single feature.
 */

import { useEffect, useState, type ComponentType, type ReactNode } from 'react'

interface RendererProps {
  source: string
  display: boolean
}

type RendererComponent = ComponentType<RendererProps>

let cachedRenderer: Promise<RendererComponent> | null = null

function loadRenderer(): Promise<RendererComponent> {
  if (cachedRenderer) return cachedRenderer
  cachedRenderer = import('./MathRenderer').then((mod) => mod.MathRenderer)
  return cachedRenderer
}

interface CommonProps {
  'data-source'?: string
}

export function MathInline(props: CommonProps): ReactNode {
  return <Mount source={props['data-source'] ?? ''} display={false} />
}

export function MathBlock(props: CommonProps): ReactNode {
  return <Mount source={props['data-source'] ?? ''} display={true} />
}

function Mount({
  source,
  display,
}: {
  source: string
  display: boolean
}): ReactNode {
  const [Renderer, setRenderer] = useState<RendererComponent | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadRenderer().then((R) => {
      if (!cancelled) setRenderer(() => R)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!source) return null

  if (!Renderer) {
    return display ? (
      <div className="swirlread-math swirlread-math--loading" aria-busy="true">
        Loading math…
      </div>
    ) : (
      <span className="swirlread-math swirlread-math--loading" aria-busy="true">
        …
      </span>
    )
  }

  return <Renderer source={source} display={display} />
}

/** Test-only — reset the cached renderer between cases. */
// eslint-disable-next-line react-refresh/only-export-components
export function __resetMathRendererCacheForTests(): void {
  cachedRenderer = null
}
