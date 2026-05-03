import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JsonRenderer } from './JsonRenderer'
import { formatJsonPath, stripJsonComments } from './json-utils'

describe('formatJsonPath (M7 polish helper)', () => {
  it('returns "$" for the root path', () => {
    expect(formatJsonPath([])).toBe('$')
  })

  it('uses dot notation for simple keys', () => {
    expect(formatJsonPath(['a', 'b', 'c'])).toBe('a.b.c')
  })

  it('uses bracket notation for numeric indices', () => {
    expect(formatJsonPath(['users', 0, 'name'])).toBe('users[0].name')
  })

  it('quotes keys with non-identifier characters', () => {
    expect(formatJsonPath(['weird-key'])).toBe('["weird-key"]')
    expect(formatJsonPath(['a', '中文'])).toBe('a["中文"]')
  })
})

describe('stripJsonComments (M7.4 helper)', () => {
  it('removes // line comments', () => {
    expect(stripJsonComments('// hi\n{"a":1}')).toBe('\n{"a":1}')
  })

  it('removes /* block */ comments', () => {
    expect(stripJsonComments('/* hi */{"a":1}')).toBe('{"a":1}')
  })

  it('does not strip // inside string values', () => {
    expect(stripJsonComments('{"url":"http://example.com"}')).toBe(
      '{"url":"http://example.com"}',
    )
  })

  it('handles escaped quotes inside strings', () => {
    expect(stripJsonComments('{"q":"say \\"hi\\""}')).toBe(
      '{"q":"say \\"hi\\""}',
    )
  })
})

describe('JsonRenderer (M7.4)', () => {
  it('renders an object as a tree by default', () => {
    render(<JsonRenderer source='{"name":"Alice","age":30}' />)
    expect(screen.getByTestId('json-renderer-tree')).toBeInTheDocument()
    expect(screen.getByText('"name"')).toBeInTheDocument()
    expect(screen.getByText('"Alice"')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renders different primitive types with type-specific styling hooks', () => {
    const { container } = render(
      <JsonRenderer source='{"s":"x","n":42,"b":true,"z":null}' />,
    )
    expect(container.querySelector('.swirlread-json__string')).not.toBeNull()
    expect(container.querySelector('.swirlread-json__number')).not.toBeNull()
    expect(container.querySelector('.swirlread-json__boolean')).not.toBeNull()
    expect(container.querySelector('.swirlread-json__null')).not.toBeNull()
  })

  it('collapses deeper levels by default and expands on click', async () => {
    render(<JsonRenderer source='{"outer":{"inner":{"hidden":1}}}' />)
    // depth 0 (root) and depth 1 (outer) auto-open. Depth 2 ("inner") is
    // collapsed, so "hidden" should NOT be in the document yet.
    expect(screen.queryByText('"hidden"')).toBeNull()

    // Find the inner toggle and click it open.
    const innerToggle = screen
      .getAllByRole('button', { expanded: false })
      .find((btn) => btn.textContent?.includes('"inner"'))
    expect(innerToggle).toBeDefined()
    await userEvent.click(innerToggle!)
    expect(screen.getByText('"hidden"')).toBeInTheDocument()
  })

  it('renders arrays with their item count when collapsed', async () => {
    render(<JsonRenderer source='{"tags":["a","b","c"]}' />)
    // tags is at depth 1 (auto-open), so its items are visible.
    expect(screen.getByText('"a"')).toBeInTheDocument()
    // Collapse it.
    const tagsToggle = screen
      .getAllByRole('button', { expanded: true })
      .find((btn) => btn.textContent?.includes('"tags"'))
    expect(tagsToggle).toBeDefined()
    await userEvent.click(tagsToggle!)
    expect(screen.queryByText('"a"')).toBeNull()
    expect(screen.getByText('3 items')).toBeInTheDocument()
  })

  it('falls back to source view with an error message when JSON is invalid', () => {
    render(<JsonRenderer source="{ not valid json" />)
    expect(screen.queryByTestId('json-renderer-tree')).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(
      /couldn'?t parse json/i,
    )
  })

  it('toggles between tree and source views', async () => {
    render(<JsonRenderer source='{"a":1}' />)
    expect(screen.getByTestId('json-renderer-tree')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /source/i }))
    expect(screen.queryByTestId('json-renderer-tree')).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: /tree/i }))
    expect(screen.getByTestId('json-renderer-tree')).toBeInTheDocument()
  })

  it('parses .jsonc-style files with comments', () => {
    render(
      <JsonRenderer source={'// header comment\n{"value": 7 /* inline */}'} />,
    )
    expect(screen.getByTestId('json-renderer-tree')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('filters and force-expands matching ancestors via the search input (M7 polish)', async () => {
    render(
      <JsonRenderer source='{"alpha":{"deep":{"target":"hidden value"}}}' />,
    )
    // depth 2 ("deep") collapses by default → "target" is not visible.
    expect(screen.queryByText('"target"')).toBeNull()

    const search = screen.getByTestId('json-renderer-search')
    await userEvent.type(search, 'target')

    // Forced-expand bubble: "target" now visible inside the deep tree.
    expect(
      screen.getByText((_, el) => el?.textContent === '"target"'),
    ).toBeInTheDocument()
    // The matched key is wrapped in <mark>.
    const mark = document.querySelector('.swirlread-json__match')
    expect(mark?.textContent).toBe('target')
  })

  it('matches case-insensitively against values too', async () => {
    render(<JsonRenderer source='{"k":"Hello World"}' />)
    const search = screen.getByTestId('json-renderer-search')
    await userEvent.type(search, 'WORLD')
    const mark = document.querySelector('.swirlread-json__match')
    expect(mark?.textContent).toBe('World')
  })

  it('renders a hover-only copy-path button on every node (M7 polish)', () => {
    render(<JsonRenderer source='{"name":"Alice"}' />)
    const buttons = screen.getAllByTestId('json-copy-path')
    // Two: one for the root collection, one for the leaf "name".
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    const leafBtn = buttons.find((b) =>
      b.getAttribute('aria-label')?.includes('name'),
    )
    expect(leafBtn).toBeDefined()
    expect(leafBtn?.getAttribute('aria-label')).toContain('Copy path name')
  })
})
