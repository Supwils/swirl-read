import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { LandingPage } from './LandingPage'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('LandingPage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
  })

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

  it('renders both CTAs (sample vault disabled, open vault enabled)', () => {
    renderWithRouter(<LandingPage />)
    const sampleBtn = screen.getByRole('button', {
      name: /try with sample vault/i,
    })
    const openBtn = screen.getByRole('button', { name: /open my vault/i })
    expect(sampleBtn).toBeDisabled()
    expect(openBtn).not.toBeDisabled()
  })

  it('does not show the FolderPicker by default', () => {
    renderWithRouter(<LandingPage />)
    expect(
      screen.queryByRole('heading', { name: /open your vault/i }),
    ).not.toBeInTheDocument()
  })

  it('opens the FolderPicker when "Open my vault" is clicked', async () => {
    renderWithRouter(<LandingPage />)
    await userEvent.click(
      screen.getByRole('button', { name: /open my vault/i }),
    )
    expect(
      await screen.findByRole('heading', { name: /open your vault/i }),
    ).toBeInTheDocument()
  })
})
