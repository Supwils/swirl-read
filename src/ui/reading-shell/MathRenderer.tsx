/**
 * MathRenderer (M3.11) — actual KaTeX render once the runtime arrives.
 *
 * Loaded lazily by the thin `MathInline` / `MathBlock` wrappers below
 * so a page without math never pulls KaTeX. On parse errors the source
 * is shown verbatim inside a styled `<code>` — never lose content.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { getKatex } from './katex-loader'

interface MathRendererProps {
  source: string
  display: boolean
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; html: string }
  | { status: 'error'; message: string }

export function MathRenderer({
  source,
  display,
}: MathRendererProps): ReactNode {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getKatex()
      .then((runtime) => {
        if (cancelled) return
        try {
          const html = runtime.renderToString(source, {
            displayMode: display,
            throwOnError: false,
            output: 'htmlAndMathml',
            strict: 'ignore',
          })
          setState({ status: 'ready', html })
        } catch (err) {
          if (cancelled) return
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [source, display])

  if (state.status === 'loading') {
    return display ? (
      <div className="swilread-math swilread-math--loading" aria-busy="true">
        Loading math…
      </div>
    ) : (
      <span className="swilread-math swilread-math--loading" aria-busy="true">
        …
      </span>
    )
  }

  if (state.status === 'error') {
    // Never lose content — fall back to the raw source in a styled
    // <code>. The error message rides along as a title for the curious.
    if (display) {
      return (
        <pre
          className="swilread-math swilread-math--error"
          title={state.message}
        >
          <code>{source}</code>
        </pre>
      )
    }
    return (
      <code
        className="swilread-math swilread-math--error"
        title={state.message}
      >
        {source}
      </code>
    )
  }

  // KaTeX returns sanitized HTML by design (same surface react-markdown's
  // ecosystem assumes). We deliberately bypass our own sanitize pass for
  // this slot — KaTeX's output is HUGE (nested spans for every glyph)
  // and round-tripping it would inflate bundle + runtime.
  return display ? (
    <div
      className="swilread-math swilread-math--display"
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  ) : (
    <span
      className="swilread-math swilread-math--inline"
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  )
}
