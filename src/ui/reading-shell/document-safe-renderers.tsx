/**
 * Inline error-boundary wrappers for the heavy renderable nodes the
 * markdown pipeline emits.
 *
 * Mermaid throws on invalid diagram syntax; KaTeX rejects malformed
 * latex; both can land in the middle of an otherwise-fine note. Without
 * a per-block boundary a single bad block surfaces the route-level
 * `ErrorFallback` and blanks the whole page. Wrapping each via
 * {@link ChunkBoundary inline} keeps the failure local — the surrounding
 * prose continues rendering, the user sees a small "math couldn't
 * render" chip in place of the broken block.
 *
 * Lives in a `.tsx` separate from the customComponents map so the map
 * file stays a constant export only — keeps `react-refresh/only-export-
 * components` happy without disabling the rule.
 */

import { type ComponentProps, type ReactNode } from 'react'
import { ChunkBoundary } from '@/ui/components/ChunkBoundary'
import { MermaidDiagram } from './MermaidDiagram'
import { MathBlock, MathInline } from './MathBlock'

export function SafeMermaidDiagram(
  props: ComponentProps<typeof MermaidDiagram>,
): ReactNode {
  return (
    <ChunkBoundary label="diagram" inline>
      <MermaidDiagram {...props} />
    </ChunkBoundary>
  )
}

export function SafeMathBlock(
  props: ComponentProps<typeof MathBlock>,
): ReactNode {
  return (
    <ChunkBoundary label="math block" inline>
      <MathBlock {...props} />
    </ChunkBoundary>
  )
}

export function SafeMathInline(
  props: ComponentProps<typeof MathInline>,
): ReactNode {
  return (
    <ChunkBoundary label="math" inline>
      <MathInline {...props} />
    </ChunkBoundary>
  )
}
