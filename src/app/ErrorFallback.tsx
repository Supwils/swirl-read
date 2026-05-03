/**
 * ErrorFallback (M9.5) — graceful render-error surface for routes.
 *
 * React Router 7 routes mount this when their element subtree throws or
 * a loader rejects. The component reads the routing error context and
 * presents a theme-aware "something went wrong" page that keeps the
 * shell intact and gives the user a clear path back.
 *
 * Anatomy:
 *   - Big serif title + apologetic body
 *   - Collapsible technical details (the error message + stack) for
 *     anyone who knows what to do with them
 *   - Two affordances: "Back to start" → `/`, "Reload" → `location.reload`
 */

import { type ReactNode } from 'react'
import {
  isRouteErrorResponse,
  Link,
  useLocation,
  useRouteError,
} from 'react-router'
import { AlertCircle } from 'lucide-react'

interface NormalizedError {
  title: string
  message: string
  details?: string
}

function normalizeError(error: unknown): NormalizedError {
  if (isRouteErrorResponse(error)) {
    return {
      title: `${String(error.status)} ${error.statusText}`,
      message:
        typeof error.data === 'string'
          ? error.data
          : 'A route handler returned an error response.',
    }
  }
  if (error instanceof Error) {
    return {
      title: 'Something broke.',
      message: error.message || 'An unexpected error occurred.',
      ...(error.stack && { details: error.stack }),
    }
  }
  return {
    title: 'Something broke.',
    message: typeof error === 'string' ? error : String(error),
  }
}

export function ErrorFallback(): ReactNode {
  const error = useRouteError()
  const location = useLocation()
  const normalized = normalizeError(error)

  return (
    <div className="swirlread-error" role="alert">
      <div className="swirlread-error__card">
        <div className="swirlread-error__badge" aria-hidden="true">
          <AlertCircle size={24} />
        </div>
        <h1 className="swirlread-error__title">{normalized.title}</h1>
        <p className="swirlread-error__message">{normalized.message}</p>
        <p className="swirlread-error__path">
          while loading <code>{location.pathname}</code>
        </p>
        <div className="swirlread-error__actions">
          <Link to="/" className="swirlread-error__action">
            Back to start
          </Link>
          <button
            type="button"
            onClick={() => {
              window.location.reload()
            }}
            className="swirlread-error__action swirlread-error__action--secondary"
          >
            Reload
          </button>
        </div>
        {normalized.details && (
          <details className="swirlread-error__details">
            <summary>Technical details</summary>
            <pre className="swirlread-error__stack">{normalized.details}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
