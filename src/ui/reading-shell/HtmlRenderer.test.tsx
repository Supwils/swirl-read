import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HtmlRenderer } from './HtmlRenderer'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import type { MockTreeNode } from '@/core/vault/__test-helpers__/mock-fs'

function makeVault(id: string, files: MockTreeNode) {
  return FSAPIVaultAdapter.fromHandle(mockRoot('vault', files), {
    id,
    name: id,
  })
}

const SAMPLE = '<!doctype html><html><body><h1>Hi</h1></body></html>'

afterEach(() => {
  cleanup()
})

describe('HtmlRenderer', () => {
  it('renders the source inside a maximally-sandboxed iframe (async build)', async () => {
    const vault = makeVault('h1', { 'page.html': SAMPLE })
    render(<HtmlRenderer source={SAMPLE} vault={vault} path="page.html" />)
    const iframe = await screen.findByTestId('html-renderer-iframe')
    expect(iframe.tagName).toBe('IFRAME')
    expect(iframe.getAttribute('sandbox')).toBe('')
    const srcdoc = iframe.getAttribute('srcdoc') ?? ''
    expect(srcdoc).toContain('<h1>Hi</h1>')
    expect(srcdoc).toContain('data-injected="swirlread-html"')
  })

  it('shows a "Sandboxed" badge so the reader knows scripts are off', async () => {
    const vault = makeVault('h2', { 'page.html': SAMPLE })
    render(<HtmlRenderer source={SAMPLE} vault={vault} path="page.html" />)
    expect(screen.getByText(/sandboxed/i)).toBeInTheDocument()
    // Flush the async build so its state update doesn't fall outside act().
    await screen.findByTestId('html-renderer-iframe')
  })

  it('toggles to a syntax-highlighted source view and back', async () => {
    const vault = makeVault('h3', { 'page.html': SAMPLE })
    render(<HtmlRenderer source={SAMPLE} vault={vault} path="page.html" />)
    await screen.findByTestId('html-renderer-iframe')

    await userEvent.click(screen.getByRole('tab', { name: /source/i }))
    expect(screen.queryByTestId('html-renderer-iframe')).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: /preview/i }))
    expect(
      await screen.findByTestId('html-renderer-iframe'),
    ).toBeInTheDocument()
  })

  it('rewrites a relative image src to a vault blob URL', async () => {
    const html = '<img src="./pic.png">'
    const vault = makeVault('h4', {
      'page.html': html,
      'pic.png': new Uint8Array([1, 2, 3]),
    })
    render(<HtmlRenderer source={html} vault={vault} path="page.html" />)
    const iframe = await screen.findByTestId('html-renderer-iframe')
    await waitFor(() => {
      expect(iframe.getAttribute('srcdoc') ?? '').toContain('blob:')
    })
  })

  it('leaves absolute URLs untouched', async () => {
    const html = '<img src="https://example.com/x.png">'
    const vault = makeVault('h5', { 'page.html': html })
    render(<HtmlRenderer source={html} vault={vault} path="page.html" />)
    const iframe = await screen.findByTestId('html-renderer-iframe')
    const srcdoc = iframe.getAttribute('srcdoc') ?? ''
    expect(srcdoc).toContain('https://example.com/x.png')
    expect(srcdoc).not.toContain('blob:')
  })
})
