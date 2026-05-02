/**
 * MermaidDiagram — thin lazy wrapper around `MermaidRenderer`.
 *
 * The wrapper lives in the main reader bundle. The actual renderer and the
 * 280 KB Mermaid runtime live in a separate chunk that is only fetched the
 * first time a `<mermaid-diagram>` element appears on the page.
 *
 * Pages with no diagrams therefore pay zero bundle cost beyond this small
 * wrapper. We use a manual dynamic import + state machine rather than
 * React.lazy because the consumer is `hast-util-to-jsx-runtime`'s component
 * map, which is not wrapped in a `<Suspense>` boundary.
 */

import { useEffect, useState, type ComponentType, type ReactNode } from 'react'

type MermaidRendererComponent = ComponentType<{
  'data-source'?: string
  dataSource?: string
  children?: ReactNode
}>

interface MermaidDiagramProps {
  'data-source'?: string
  dataSource?: string
  children?: ReactNode
}

let cachedComponent: Promise<MermaidRendererComponent> | null = null

function loadRenderer(): Promise<MermaidRendererComponent> {
  cachedComponent ??= import('./MermaidRenderer').then((m) => m.MermaidRenderer)
  return cachedComponent
}

export function MermaidDiagram(props: MermaidDiagramProps): ReactNode {
  const [Renderer, setRenderer] = useState<MermaidRendererComponent | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    void loadRenderer().then((component) => {
      if (!cancelled) setRenderer(() => component)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Renderer) {
    return (
      <div className="swilread-mermaid swilread-mermaid--loading" role="status">
        <span className="swilread-mermaid__status">Loading diagram…</span>
      </div>
    )
  }

  return <Renderer {...props} />
}
