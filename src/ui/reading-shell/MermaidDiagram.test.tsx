import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MermaidDiagram } from './MermaidDiagram'
import { __setMermaidLoaderForTests } from './mermaid-loader'
import { useUIStore, DEFAULT_THEME } from '@/stores/ui-store'
import { __resetDbForTests } from '@/core/persistence/db'

// The wrapper dynamic-imports `MermaidRenderer`. Tests can't intercept the
// dynamic import itself (Vitest cannot mock module identifiers retroactively
// in jsdom mode without `vi.mock` at module scope, which would affect every
// test), but we can stub the underlying mermaid runtime so the renderer
// resolves into a real SVG once it loads.

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
  __setMermaidLoaderForTests(async () =>
    Promise.resolve({
      initialize: () => {
        // noop in tests
      },
      render: (id: string, source: string) =>
        Promise.resolve({
          svg: `<svg data-id="${id}"><text>${source}</text></svg>`,
        }),
    }),
  )
})

describe('MermaidDiagram lazy wrapper (M3.13)', () => {
  it('shows a loading placeholder before the renderer chunk arrives', () => {
    render(<MermaidDiagram data-source="graph TD" />)
    expect(screen.getByText(/loading diagram/i)).toBeInTheDocument()
  })

  it('eventually renders the diagram once the renderer chunk loads', async () => {
    const { container } = render(<MermaidDiagram data-source="graph TD" />)
    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
    })
  })
})
