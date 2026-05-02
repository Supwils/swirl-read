import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HtmlRenderer } from './HtmlRenderer'

const SAMPLE = '<!doctype html><html><body><h1>Hi</h1></body></html>'

describe('HtmlRenderer (M7.5)', () => {
  it('renders the source inside a maximally-sandboxed iframe by default', () => {
    render(<HtmlRenderer source={SAMPLE} />)
    const iframe = screen.getByTestId('html-renderer-iframe')
    expect(iframe.tagName).toBe('IFRAME')
    // Empty sandbox string == every restriction enabled.
    expect(iframe.getAttribute('sandbox')).toBe('')
    expect(iframe.getAttribute('srcdoc')).toBe(SAMPLE)
  })

  it('shows a "Sandboxed" badge so the reader knows scripts are off', () => {
    render(<HtmlRenderer source={SAMPLE} />)
    expect(screen.getByText(/sandboxed/i)).toBeInTheDocument()
  })

  it('toggles to a syntax-highlighted source view on demand', async () => {
    render(<HtmlRenderer source={SAMPLE} />)
    expect(screen.getByTestId('html-renderer-iframe')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /source/i }))
    // Source mode unmounts the iframe and renders the CodeFileRenderer.
    expect(screen.queryByTestId('html-renderer-iframe')).toBeNull()
  })

  it('toggles back to preview from source', async () => {
    render(<HtmlRenderer source={SAMPLE} />)

    await userEvent.click(screen.getByRole('tab', { name: /source/i }))
    expect(screen.queryByTestId('html-renderer-iframe')).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: /preview/i }))
    expect(screen.getByTestId('html-renderer-iframe')).toBeInTheDocument()
  })
})
