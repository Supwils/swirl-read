import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlainTextRenderer } from './PlainTextRenderer'

describe('PlainTextRenderer (M7.2)', () => {
  it('renders the source string verbatim, preserving newlines', () => {
    render(<PlainTextRenderer source={'line one\nline two\n'} />)
    const pre = screen.getByTestId('plain-text-renderer')
    expect(pre.tagName).toBe('PRE')
    expect(pre.textContent).toBe('line one\nline two\n')
  })

  it('does not interpret HTML inside the source', () => {
    render(<PlainTextRenderer source={'<script>alert(1)</script>'} />)
    const pre = screen.getByTestId('plain-text-renderer')
    expect(pre.querySelector('script')).toBeNull()
    expect(pre.textContent).toBe('<script>alert(1)</script>')
  })
})
