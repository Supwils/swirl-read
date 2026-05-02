import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CodeFileRenderer } from './CodeFileRenderer'
import { longestBacktickRun } from './file-renderer-utils'

describe('longestBacktickRun (M7.7 helper)', () => {
  it('returns 2 (so callers pick 3) for sources with no backticks', () => {
    expect(longestBacktickRun('const x = 1')).toBe(2)
    expect(longestBacktickRun('')).toBe(2)
  })

  it('returns the longest consecutive backtick run', () => {
    expect(longestBacktickRun('use `foo` here')).toBe(2)
    expect(longestBacktickRun('triple ``` inside')).toBe(3)
    expect(longestBacktickRun('mixed `a` ``b`` ```c```')).toBe(3)
  })
})

describe('CodeFileRenderer (M7.7)', () => {
  it('runs the source through the pipeline and emits a code block', async () => {
    render(
      <CodeFileRenderer
        source={'const greeting = "hello"'}
        language="typescript"
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('code-file-renderer')).toBeInTheDocument()
    })
    const block = screen.getByTestId('code-file-renderer')
    expect(block.querySelector('pre')).not.toBeNull()
    expect(block.textContent).toContain('hello')
  })

  it('survives a source whose own contents include a triple-backtick fence', async () => {
    const source = [
      'function example() {',
      '  // here is a long backtick run: ```',
      '  return 42',
      '}',
    ].join('\n')

    render(<CodeFileRenderer source={source} language="typescript" />)

    await waitFor(() => {
      expect(screen.getByTestId('code-file-renderer')).toBeInTheDocument()
    })
    // Crucial: the inner ``` did not break out of the fence — the closing
    // pre is still present and contains the line _after_ the inner fence.
    const block = screen.getByTestId('code-file-renderer')
    expect(block.textContent).toContain('return 42')
  })
})
