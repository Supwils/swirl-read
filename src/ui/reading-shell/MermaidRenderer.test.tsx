import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MermaidRenderer } from './MermaidRenderer'
import { __setMermaidLoaderForTests } from './mermaid-loader'
import { useUIStore, DEFAULT_THEME } from '@/stores/ui-store'
import { __resetDbForTests } from '@/core/persistence/db'

beforeEach(async () => {
  await __resetDbForTests()
  useUIStore.setState({
    theme: DEFAULT_THEME,
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.7,
    contentWidth: 'medium',
    zenMode: false,
    fileTreeOpen: true,
    frontmatterDisplay: 'metadata',
    ready: true,
  })
})

afterEach(() => {
  __setMermaidLoaderForTests(null)
})

describe('MermaidRenderer (M3.13)', () => {
  it('renders the SVG returned by the lazy-loaded mermaid runtime', async () => {
    const initialize = vi.fn<(config: unknown) => void>()
    const renderFn = vi.fn(async (id: string, source: string) =>
      Promise.resolve({
        svg: `<svg data-id="${id}"><text>${source}</text></svg>`,
      }),
    )
    __setMermaidLoaderForTests(async () =>
      Promise.resolve({ initialize, render: renderFn }),
    )

    const source = 'graph TD\nA-->B'
    const { container } = render(<MermaidRenderer data-source={source} />)

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
    })
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false }) as { startOnLoad: false },
    )
    expect(renderFn).toHaveBeenCalledWith(
      expect.stringMatching(/swilread-mermaid-/) as string,
      source,
    )
  })

  it('shows a loading indicator before the runtime resolves', () => {
    let release: () => void = () => {
      // replaced inside the Promise executor below
    }
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    __setMermaidLoaderForTests(async () => {
      await wait
      return Promise.resolve({
        initialize: vi.fn(),
        render: vi.fn(async () => Promise.resolve({ svg: '<svg/>' })),
      })
    })

    render(<MermaidRenderer data-source="flowchart" />)

    expect(screen.getByText(/rendering diagram/i)).toBeInTheDocument()
    release()
  })

  it('falls back to source on render failure', async () => {
    __setMermaidLoaderForTests(async () =>
      Promise.resolve({
        initialize: vi.fn(),
        render: vi.fn(() => Promise.reject(new Error('parse error'))),
      }),
    )

    render(<MermaidRenderer data-source="not a valid diagram" />)

    await waitFor(() => {
      expect(
        screen.getByText(/couldn't render this diagram/i),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('not a valid diagram')).toBeInTheDocument()
  })

  it('uses the active theme from useUIStore (mapping to a mermaid theme)', async () => {
    const initialize = vi.fn<(config: { theme: string }) => void>()
    __setMermaidLoaderForTests(async () =>
      Promise.resolve({
        initialize,
        render: vi.fn(async () => Promise.resolve({ svg: '<svg/>' })),
      }),
    )

    useUIStore.setState({ theme: 'dark' })
    const { container } = render(<MermaidRenderer data-source="graph TD" />)

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
    })
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }) as { theme: 'dark' },
    )
  })

  it('shows an error state for empty diagram source', async () => {
    __setMermaidLoaderForTests(async () =>
      Promise.resolve({
        initialize: vi.fn(),
        render: vi.fn(async () => Promise.resolve({ svg: '<svg/>' })),
      }),
    )

    render(<MermaidRenderer data-source="" />)

    await waitFor(() => {
      expect(
        screen.getByText(/couldn't render this diagram/i),
      ).toBeInTheDocument()
    })
  })
})
