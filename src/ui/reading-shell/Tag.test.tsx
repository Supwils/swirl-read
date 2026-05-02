import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tag } from './Tag'
import { useTagStore } from '@/stores/tag-store'

beforeEach(() => {
  useTagStore.setState({ selectedTag: null })
})

afterEach(() => {
  useTagStore.setState({ selectedTag: null })
})

describe('Tag', () => {
  it('renders a button labelled with the tag', () => {
    render(<Tag data-tag="career/me">#career/me</Tag>)
    expect(
      screen.getByRole('button', { name: /show files with tag #career\/me/i }),
    ).toHaveTextContent('#career/me')
  })

  it('flips useTagStore.selectedTag on click', async () => {
    const user = userEvent.setup()
    render(<Tag data-tag="reading">#reading</Tag>)

    expect(useTagStore.getState().selectedTag).toBeNull()
    await user.click(screen.getByRole('button'))
    expect(useTagStore.getState().selectedTag).toBe('reading')
  })

  it('renders children as plain text when data-tag is missing', () => {
    render(<Tag>#orphan</Tag>)
    // No button — defensive fallback path.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('#orphan')).toBeInTheDocument()
  })
})
