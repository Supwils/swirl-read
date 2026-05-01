import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('renders the brand wordmark', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: /swilread/i }),
    ).toBeInTheDocument()
  })

  it('renders the primary tagline', () => {
    render(<App />)
    expect(
      screen.getByText(/read your knowledge\. beautifully\./i),
    ).toBeInTheDocument()
  })

  it('renders the supporting tagline', () => {
    render(<App />)
    expect(
      screen.getByText(/a reading sanctuary for the ai era\./i),
    ).toBeInTheDocument()
  })
})
