import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { LandingPage } from './LandingPage'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('LandingPage', () => {
  it('renders the brand wordmark', () => {
    renderWithRouter(<LandingPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: /swilread/i }),
    ).toBeInTheDocument()
  })

  it('renders the primary tagline', () => {
    renderWithRouter(<LandingPage />)
    expect(
      screen.getByText(/read your knowledge\. beautifully\./i),
    ).toBeInTheDocument()
  })

  it('renders the supporting tagline', () => {
    renderWithRouter(<LandingPage />)
    expect(
      screen.getByText(/a reading sanctuary for the ai era\./i),
    ).toBeInTheDocument()
  })

  it('renders an enter-the-app link to /app', () => {
    renderWithRouter(<LandingPage />)
    const link = screen.getByRole('link', { name: /enter the app/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/app')
  })
})
