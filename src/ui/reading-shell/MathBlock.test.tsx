import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  MathBlock,
  MathInline,
  __resetMathRendererCacheForTests,
} from './MathBlock'
import { __setKatexLoaderForTests } from './katex-loader'

beforeEach(() => {
  __resetMathRendererCacheForTests()
  __setKatexLoaderForTests(() =>
    Promise.resolve({
      renderToString: (source: string, opts) =>
        opts.displayMode
          ? `<span data-display="block">RENDERED:${source}</span>`
          : `<span data-display="inline">RENDERED:${source}</span>`,
    }),
  )
})

afterEach(() => {
  __setKatexLoaderForTests(null)
  __resetMathRendererCacheForTests()
})

describe('MathInline', () => {
  it('renders the KaTeX HTML for the source', async () => {
    render(<MathInline data-source="x + y" />)

    const el = await waitFor(() => screen.getByText(/RENDERED:x \+ y/))
    expect(el.parentElement?.className).toContain('swilread-math--inline')
  })

  it('renders nothing when data-source is empty', () => {
    const { container } = render(<MathInline />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('MathBlock', () => {
  it('renders the KaTeX HTML in display mode', async () => {
    // JSX attribute strings are HTML-literal — use a JS expression so
    // `\\` collapses to a single backslash before reaching the prop.
    render(<MathBlock data-source={'\\int_0^1 x^2'} />)

    const el = await waitFor(() => screen.getByText(/RENDERED:\\int_0\^1 x\^2/))
    expect(el.getAttribute('data-display')).toBe('block')
    expect(el.parentElement?.className).toContain('swilread-math--display')
  })

  it('falls back to source-as-code on KaTeX failure', async () => {
    __setKatexLoaderForTests(() =>
      Promise.resolve({
        renderToString: () => {
          throw new Error('katex parse error')
        },
      }),
    )
    render(<MathBlock data-source={'\\bad'} />)

    await waitFor(() => {
      const code = document.querySelector('.swilread-math--error code')
      expect(code).not.toBeNull()
      expect(code?.textContent).toBe('\\bad')
    })
  })

  it('falls back when the loader itself rejects', async () => {
    __setKatexLoaderForTests(() => Promise.reject(new Error('runtime missing')))
    render(<MathBlock data-source={'\\bad'} />)

    await waitFor(() => {
      expect(
        document.querySelector('.swilread-math--error'),
      ).toBeInTheDocument()
    })
  })

  it('shows a loading placeholder before the runtime resolves', () => {
    let resolveLoader: (value: {
      renderToString: (s: string) => string
    }) => void = () => {
      /* assigned synchronously inside the Promise executor below */
    }
    __setKatexLoaderForTests(
      () =>
        new Promise((resolve) => {
          resolveLoader = resolve
        }),
    )
    render(<MathBlock data-source="x" />)
    expect(
      document.querySelector('.swilread-math--loading'),
    ).toBeInTheDocument()
    // Resolve so the test doesn't leak a pending promise into other cases.
    resolveLoader({ renderToString: (s) => s })
  })

  it('mocks suppress the act() warning by completing synchronously after resolve', async () => {
    // sanity: a quick second render reuses the cached lazy loader
    render(<MathInline data-source="alpha" />)
    expect(await screen.findByText(/RENDERED:alpha/)).toBeInTheDocument()
    vi.clearAllMocks()
  })
})
