import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  type RouteObject,
} from 'react-router'
import { ErrorFallback } from './ErrorFallback'

// React Router prints to console.error when a route throws — silence it
// for these tests so noise doesn't drown the actual assertions.
const consoleSpy = { error: vi.fn(), warn: vi.fn() }
let originalError: typeof console.error
let originalWarn: typeof console.warn

beforeEach(() => {
  originalError = console.error
  originalWarn = console.warn
  console.error = consoleSpy.error
  console.warn = consoleSpy.warn
})

afterEach(() => {
  console.error = originalError
  console.warn = originalWarn
  consoleSpy.error.mockReset()
  consoleSpy.warn.mockReset()
})

function ThrowingChild(): never {
  throw new Error('Boom — deliberate render error')
}

function makeRouter(routes: RouteObject[], at: string) {
  return createMemoryRouter(routes, { initialEntries: [at] })
}

describe('ErrorFallback (M9.5)', () => {
  it('renders when a route element throws', () => {
    const routes: RouteObject[] = [
      {
        path: '/',
        element: <ThrowingChild />,
        errorElement: <ErrorFallback />,
      },
    ]
    render(<RouterProvider router={makeRouter(routes, '/')} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    // Message appears in the message paragraph; the stack also contains
    // it, so we filter to the dedicated message element only.
    expect(
      screen.getByText(/boom — deliberate render error/i, {
        selector: '.swirlread-error__message',
      }),
    ).toBeInTheDocument()
  })

  it('shows the failing path in the body', () => {
    const routes: RouteObject[] = [
      {
        path: '/app/:vaultId/*',
        element: <ThrowingChild />,
        errorElement: <ErrorFallback />,
      },
    ]
    render(<RouterProvider router={makeRouter(routes, '/app/v/note.md')} />)

    expect(screen.getByText(/while loading/i)).toBeInTheDocument()
    expect(screen.getByText('/app/v/note.md')).toBeInTheDocument()
  })

  it('exposes a "Back to start" link to root', () => {
    const routes: RouteObject[] = [
      {
        path: '/x',
        element: <ThrowingChild />,
        errorElement: <ErrorFallback />,
      },
    ]
    render(<RouterProvider router={makeRouter(routes, '/x')} />)

    const link = screen.getByRole('link', { name: /back to start/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders technical details for native Error instances', () => {
    const routes: RouteObject[] = [
      {
        path: '/x',
        element: <ThrowingChild />,
        errorElement: <ErrorFallback />,
      },
    ]
    render(<RouterProvider router={makeRouter(routes, '/x')} />)

    // Stack is collapsed inside <details>; the summary is always rendered.
    expect(screen.getByText(/technical details/i)).toBeInTheDocument()
  })

  it('preserves parent layout content when a child route throws', () => {
    const routes: RouteObject[] = [
      {
        path: '/app',
        element: (
          <div>
            <div data-testid="shell-chrome">shell</div>
            <Outlet />
          </div>
        ),
        children: [
          {
            path: 'vault',
            element: <ThrowingChild />,
            errorElement: <ErrorFallback />,
          },
        ],
      },
    ]
    render(<RouterProvider router={makeRouter(routes, '/app/vault')} />)

    // Chrome from the parent layout stays mounted; only the child slot
    // is replaced by the fallback. This is the core M9.5 guarantee.
    expect(screen.getByTestId('shell-chrome')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
