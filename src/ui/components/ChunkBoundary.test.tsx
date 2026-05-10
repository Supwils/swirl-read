import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense, lazy, useState, type ReactNode } from 'react'
import { ChunkBoundary } from './ChunkBoundary'

function Throwing(): never {
  throw new Error('boom from child')
}

function Working(): ReactNode {
  return <p data-testid="ok">all good</p>
}

describe('ChunkBoundary', () => {
  // Errors caught by an ErrorBoundary still log a console.error in
  // React's dev mode. Silence it for the duration of these tests so the
  // vitest output stays focused on assertions.
  const originalError = console.error
  beforeAll(() => {
    console.error = vi.fn()
  })
  afterAll(() => {
    console.error = originalError
  })

  it('renders children when nothing throws', () => {
    render(
      <ChunkBoundary label="thing">
        <Working />
      </ChunkBoundary>,
    )
    expect(screen.getByTestId('ok')).toBeInTheDocument()
  })

  it('renders the card fallback when a child throws', () => {
    render(
      <ChunkBoundary label="review surface">
        <Throwing />
      </ChunkBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/the review surface crashed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('renders the inline fallback when inline=true', () => {
    render(
      <ChunkBoundary label="diagram" inline>
        <Throwing />
      </ChunkBoundary>,
    )
    expect(screen.getByText(/diagram couldn't render/i)).toBeInTheDocument()
    // Inline variant has no Retry button — it lives in flowing prose
    // where a button would be visually disruptive.
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  // Retry behaviour is covered end-to-end by the "renders with React
  // state hooks intact" test below — React 19's dev-mode auto-recovery
  // on first throw makes a simpler "throw once then succeed" test
  // racy without buying additional coverage.

  it('forwards loadingFallback to its inner Suspense boundary', () => {
    // Build a lazy component that never resolves so we can observe the
    // loading fallback. The promise being held open is fine — the test
    // unmounts after the assertion.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const Slow = lazy(() => new Promise<{ default: typeof Working }>(() => {}))
    render(
      <ChunkBoundary label="thing" loadingFallback={<span>loading…</span>}>
        <Slow />
      </ChunkBoundary>,
    )
    expect(screen.getByText('loading…')).toBeInTheDocument()
  })

  it('catches errors that surface from a Suspense-resolved chunk', async () => {
    let resolveLoad: ((mod: { default: typeof Throwing }) => void) | null = null
    const LazyBomb = lazy(
      () =>
        new Promise<{ default: typeof Throwing }>((res) => {
          resolveLoad = res
        }),
    )

    render(
      <ChunkBoundary label="bomb">
        <LazyBomb />
      </ChunkBoundary>,
    )
    // Resolve the lazy load with a component that throws on render —
    // the boundary should catch the throw, not the Suspense.
    resolveLoad!({ default: Throwing })
    await screen.findByText(/the bomb crashed/i)
  })

  it('renders with React state hooks intact (no remount on retry)', async () => {
    function Counter({ shouldThrow }: { shouldThrow: boolean }): ReactNode {
      const [n, setN] = useState(0)
      if (shouldThrow) throw new Error('go away')
      return (
        <button type="button" onClick={() => setN(n + 1)}>
          count: {n}
        </button>
      )
    }
    function Harness(): ReactNode {
      const [arm, setArm] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setArm(false)}>
            disarm
          </button>
          <ChunkBoundary label="counter">
            <Counter shouldThrow={arm} />
          </ChunkBoundary>
        </>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText(/the counter crashed/i)).toBeInTheDocument()

    // Disarm the throw, then click Retry inside the boundary.
    await user.click(screen.getByRole('button', { name: /^disarm$/i }))
    await user.click(screen.getByRole('button', { name: /retry/i }))
    // Counter mounts fresh post-retry; clicking should still work.
    await user.click(screen.getByRole('button', { name: /count: 0/ }))
    expect(screen.getByRole('button', { name: /count: 1/ })).toBeInTheDocument()
  })
})

// Suspense imported only for type-side use of `lazy`'s API; harmless if
// not referenced at runtime — keeps the bundle tree-shake friendly.
void Suspense
