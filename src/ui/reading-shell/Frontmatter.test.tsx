import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FrontmatterPanel } from './Frontmatter'
import type { Frontmatter } from '@/core/render/frontmatter'

function fm(
  overrides: Partial<Frontmatter> & { data?: Frontmatter['data'] } = {},
): Frontmatter {
  return {
    present: true,
    format: 'yaml',
    raw: '',
    body: '',
    data: {},
    ...overrides,
  }
}

describe('FrontmatterPanel', () => {
  it('renders nothing when frontmatter is absent', () => {
    const { container } = render(
      <FrontmatterPanel
        frontmatter={fm({ present: false, format: null })}
        display="metadata"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when display is hidden', () => {
    const { container } = render(
      <FrontmatterPanel
        frontmatter={fm({ data: { title: 'Hi' } })}
        display="hidden"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders description, date, author and tags in metadata mode (title goes to the doc header per RX1)', () => {
    render(
      <FrontmatterPanel
        frontmatter={fm({
          data: {
            title: 'A Note',
            description: 'A summary',
            date: '2026-05-01',
            author: 'Wilson',
            tags: ['react', 'ui'],
          },
        })}
        display="metadata"
      />,
    )
    // Title is intentionally NOT rendered here — DocumentPage owns it
    // as the page header now.
    expect(
      screen.queryByRole('heading', { level: 1, name: 'A Note' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('A summary')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(screen.getByText('Wilson')).toBeInTheDocument()
    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('ui')).toBeInTheDocument()
  })

  it('renders nothing when metadata mode has only the title (now owned by the doc header)', () => {
    const { container } = render(
      <FrontmatterPanel
        frontmatter={fm({ data: { title: 'Solo Title' } })}
        display="metadata"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when metadata mode has no recognised fields', () => {
    const { container } = render(
      <FrontmatterPanel
        frontmatter={fm({ data: { custom: 'x' } })}
        display="metadata"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders all fields as a definition list in raw mode', () => {
    render(
      <FrontmatterPanel
        frontmatter={fm({
          data: {
            title: 'A',
            tags: ['x', 'y'],
            draft: true,
            custom: 'value',
          },
        })}
        display="raw"
      />,
    )
    // Section labelled "Frontmatter"
    expect(screen.getByText('Frontmatter')).toBeInTheDocument()
    // Each key is rendered as a <dt>
    const keys = ['title', 'tags', 'draft', 'custom']
    for (const key of keys) {
      expect(screen.getByText(key)).toBeInTheDocument()
    }
    // Tags array becomes "x, y"
    expect(screen.getByText('x, y')).toBeInTheDocument()
    // Boolean prints as 'true'
    expect(screen.getByText('true')).toBeInTheDocument()
  })
})
