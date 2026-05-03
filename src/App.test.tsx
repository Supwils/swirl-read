import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

/**
 * Smoke test for the production assembly.
 *
 * `App` mounts `<RouterProvider>` against the *real* browser router defined
 * in `src/app/router.tsx`. In jsdom the initial location resolves to `/`, so
 * the landing page should render. If this test fails, the production wiring
 * is broken — even if `router.test.tsx` passes (since that uses a memory
 * router and could mask context-shape issues like wrong RouterProvider import).
 */
describe('App (production assembly)', () => {
  it('renders LandingPage at the default jsdom location', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: /swirlread/i }),
    ).toBeInTheDocument()
  })
})
