/**
 * ChunkBoundary — combined Suspense + ErrorBoundary for lazy-loaded
 * chunks (and any inline component that may throw at render time).
 *
 * Why this matters: prior to this primitive, a single misbehaving
 * renderer — Mermaid choking on bad syntax, KaTeX rejecting an invalid
 * expression, the markdown pipeline tripping over an unexpected hast
 * node — would propagate up to the route-level `ErrorFallback` and
 * blank the entire page. Wrapping each lazy mount (and a few inline
 * renderers known to throw) keeps failures localised: the rest of the
 * surface keeps working and the user sees a small "this part crashed"
 * card with a Retry button.
 *
 * The error boundary part has to be a class component because React
 * still hasn't shipped a function-component equivalent of
 * `componentDidCatch`. Suspense + lazy chunks are the same primitive
 * we'd reach for anyway, so combining them costs nothing.
 *
 * Two visual modes:
 *
 *   - **default** — a card-shaped fallback with a label and a Retry
 *     button. Good for full-surface failures (a whole renderer chunk
 *     refusing to load).
 *   - **inline** — a one-line muted message. Good for small inline
 *     components like a single Mermaid diagram that would otherwise
 *     leave a blank gap in flowing prose.
 *
 * Retry resets the boundary's error state, which causes React to try
 * rendering the children again — sufficient for transient bugs (e.g.
 * a chunk-load network blip). For deterministic crashes the user gets
 * the same fallback again, but the rest of the page never goes dark.
 */

import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ChunkBoundaryProps {
  children: ReactNode
  /** Short, user-facing description of what crashed. Shown in the
   *  fallback. Keep it lowercase ("review surface" rather than
   *  "Review Surface"). */
  label: string
  /** Compact one-line fallback for inline components. Default false. */
  inline?: boolean
  /** Suspense fallback while a lazy child is loading. */
  loadingFallback?: ReactNode
  /** When this value changes, a latched error is cleared so the boundary
   *  retries rendering. Pass the current document path (or any identity
   *  that should "reset" the crash) — otherwise a single bad document keeps
   *  the crash card up even after navigating to a healthy doc of the same
   *  renderer kind. */
  resetKey?: unknown
}

interface ChunkBoundaryState {
  error: Error | null
}

export class ChunkBoundary extends Component<
  ChunkBoundaryProps,
  ChunkBoundaryState
> {
  // The second argument to `Component`'s constructor is a context arg
  // that's not used in modern React; we just delegate to super.
  override state: ChunkBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ChunkBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in dev so the actual stack lands in the console — production
    // users don't need the noise. Errors caught here don't bubble, but
    // logging keeps the standard React-DevTools workflow intact.
    if (import.meta.env.DEV) {
      console.error(
        `[chunk-boundary] "${this.props.label}" crashed:\n`,
        error,
        '\n',
        info.componentStack,
      )
    }
  }

  override componentDidUpdate(prevProps: ChunkBoundaryProps): void {
    // A new resetKey means we're rendering different content (e.g. the user
    // navigated to another document). Clear a latched error so the healthy
    // content gets a chance to render instead of the stale crash card.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  handleRetry = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const { error } = this.state
    const { children, label, inline, loadingFallback } = this.props

    if (error) {
      if (inline) {
        return (
          <span
            className="swirlread-chunk-fallback swirlread-chunk-fallback--inline"
            role="alert"
            title={error.message}
          >
            <AlertTriangle size={11} aria-hidden="true" />
            {label} couldn&apos;t render
          </span>
        )
      }
      return (
        <div className="swirlread-chunk-fallback" role="alert">
          <p className="swirlread-chunk-fallback__title">
            <AlertTriangle size={14} aria-hidden="true" />
            The {label} crashed.
          </p>
          <p className="swirlread-chunk-fallback__body">
            The rest of the page should still work. If this keeps happening, try
            reloading the tab.
          </p>
          <button
            type="button"
            className="swirlread-chunk-fallback__retry"
            onClick={this.handleRetry}
          >
            <RefreshCw size={12} aria-hidden="true" />
            Retry
          </button>
          {import.meta.env.DEV && (
            <details className="swirlread-chunk-fallback__details">
              <summary>Details (dev)</summary>
              <pre>{error.message}</pre>
            </details>
          )}
        </div>
      )
    }

    return <Suspense fallback={loadingFallback ?? null}>{children}</Suspense>
  }
}
