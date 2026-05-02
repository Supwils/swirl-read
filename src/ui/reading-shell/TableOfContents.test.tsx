import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useTocStore } from '@/stores/toc-store'
import { TableOfContents } from './TableOfContents'

class MockIntersectionObserver {
  callback: IntersectionObserverCallback
  root: Element | Document | null = null
  rootMargin = ''
  thresholds: readonly number[] = []
  observed: Element[] = []

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element): void {
    this.observed.push(target)
  }
  unobserve(target: Element): void {
    this.observed = this.observed.filter((el) => el !== target)
  }
  disconnect(): void {
    this.observed = []
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

const EMPTY_CONTEXT = {
  vaultId: null,
  path: null,
  tags: [],
  outgoingLinks: 0,
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  useTocStore.setState({
    headings: [],
    activeId: null,
    context: EMPTY_CONTEXT,
  })
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  useTocStore.setState({
    headings: [],
    activeId: null,
    context: EMPTY_CONTEXT,
  })
})

describe('TableOfContents', () => {
  it('renders nothing when there are no headings AND no context (RX4)', () => {
    const { container } = render(<TableOfContents />)
    // RX4: rail collapses entirely instead of showing a noisy empty
    // state. Caller layout (VaultLayout) takes care of the column.
    expect(container).toBeEmptyDOMElement()
  })

  it('renders heading links in document order', () => {
    useTocStore.setState({
      headings: [
        { id: 'intro', text: 'Intro', level: 1 },
        { id: 'why', text: 'Why', level: 2 },
        { id: 'how', text: 'How', level: 2 },
      ],
      activeId: null,
    })

    render(<TableOfContents />)

    const items = screen.getAllByRole('link')
    expect(items.map((el) => el.textContent)).toEqual(['Intro', 'Why', 'How'])
  })

  it('marks the active heading with aria-current and the active class', () => {
    useTocStore.setState({
      headings: [
        { id: 'a', text: 'Alpha', level: 2 },
        { id: 'b', text: 'Bravo', level: 2 },
      ],
      activeId: 'b',
    })

    render(<TableOfContents />)

    const active = screen.getByRole('link', { name: 'Bravo' })
    expect(active).toHaveAttribute('aria-current', 'location')
    expect(active.className).toContain('is-active')
  })

  it('scrolls to the heading element on click and updates the URL hash', async () => {
    const user = userEvent.setup()
    const heading = document.createElement('h2')
    heading.id = 'why'
    heading.textContent = 'Why'
    document.body.appendChild(heading)

    const scrollSpy = vi.fn()
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollSpy,
    })

    useTocStore.setState({
      headings: [{ id: 'why', text: 'Why', level: 2 }],
      activeId: null,
    })

    render(<TableOfContents />)

    await user.click(screen.getByRole('link', { name: 'Why' }))

    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#why')
  })

  it('indents nested headings relative to the shallowest level present', () => {
    useTocStore.setState({
      headings: [
        { id: 'a', text: 'Section', level: 2 },
        { id: 'b', text: 'Sub', level: 3 },
      ],
      activeId: null,
    })

    render(<TableOfContents />)

    const [first, second] = screen
      .getAllByRole('listitem')
      .map((el) => el.style.paddingLeft)
    expect(first).toBe('0px')
    expect(second).toBe('12px')
  })
})

describe('TableOfContents — context rail (RX4)', () => {
  it('renders the rail with context modules even when there are no headings', () => {
    useTocStore.setState({
      headings: [],
      activeId: null,
      context: {
        vaultId: 'v',
        path: 'note.md',
        tags: ['reading', 'ai'],
        outgoingLinks: 3,
      },
    })

    render(<TableOfContents />)

    // The TOC list is hidden (no headings) but the context section is up.
    expect(screen.queryByText('On this page')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/page context/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /show files tagged #reading/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/3 links out/i)).toBeInTheDocument()
  })

  it('hides the tags chip when no tags but keeps the link counts', () => {
    useTocStore.setState({
      headings: [],
      activeId: null,
      context: {
        vaultId: 'v',
        path: 'note.md',
        tags: [],
        outgoingLinks: 1,
      },
    })

    render(<TableOfContents />)

    expect(
      screen.queryByLabelText(/tags on this page/i),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/1 link out/i)).toBeInTheDocument()
    // Singular form, not "1 links out".
    expect(screen.queryByText(/1 links out/)).not.toBeInTheDocument()
  })

  it('caps tag pills at 6 with a "+N" overflow indicator', () => {
    useTocStore.setState({
      headings: [],
      activeId: null,
      context: {
        vaultId: 'v',
        path: 'note.md',
        tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        outgoingLinks: 0,
      },
    })

    render(<TableOfContents />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(6)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('clicking a tag chip selects the tag in useTagStore', async () => {
    const user = userEvent.setup()
    useTocStore.setState({
      headings: [],
      activeId: null,
      context: {
        vaultId: 'v',
        path: 'note.md',
        tags: ['reading'],
        outgoingLinks: 0,
      },
    })
    const { useTagStore } = await import('@/stores/tag-store')
    useTagStore.setState({ selectedTag: null })

    render(<TableOfContents />)

    await user.click(screen.getByRole('button', { name: /tagged #reading/i }))

    expect(useTagStore.getState().selectedTag).toBe('reading')
    useTagStore.setState({ selectedTag: null })
  })

  it('renders both the context rail and the TOC when both exist', () => {
    useTocStore.setState({
      headings: [
        { id: 'a', text: 'Alpha', level: 2 },
        { id: 'b', text: 'Bravo', level: 2 },
      ],
      activeId: null,
      context: {
        vaultId: 'v',
        path: 'note.md',
        tags: ['t1'],
        outgoingLinks: 2,
      },
    })

    render(<TableOfContents />)

    expect(screen.getByLabelText(/page context/i)).toBeInTheDocument()
    expect(screen.getByText('On this page')).toBeInTheDocument()
    // Both heading links rendered.
    expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bravo' })).toBeInTheDocument()
  })
})
