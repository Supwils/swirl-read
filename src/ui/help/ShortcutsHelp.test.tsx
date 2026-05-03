import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShortcutsHelp } from './ShortcutsHelp'
import { useUIStore } from '@/stores/ui-store'

beforeEach(() => {
  useUIStore.setState({ shortcutsHelpOpen: false })
})

afterEach(() => {
  useUIStore.setState({ shortcutsHelpOpen: false })
})

describe('ShortcutsHelp (M9.4)', () => {
  it('does not render when shortcutsHelpOpen is false', () => {
    render(<ShortcutsHelp />)
    expect(
      screen.queryByRole('dialog', { name: /keyboard shortcuts/i }),
    ).not.toBeInTheDocument()
  })

  it('opens when the store flag flips and lists every shortcut', async () => {
    render(<ShortcutsHelp />)
    useUIStore.getState().setShortcutsHelpOpen(true)

    const dialog = await screen.findByRole('dialog', {
      name: /keyboard shortcuts/i,
    })
    expect(dialog).toBeInTheDocument()
    // Spot-check a binding from each group.
    expect(
      dialog.querySelector('.swirlread-shortcuts__list')?.textContent,
    ).toMatch(/Open command palette/i)
    expect(dialog.textContent).toMatch(/zen mode/i)
    expect(dialog.textContent).toMatch(/this list of shortcuts/i)
  })

  it('closes when the user presses Escape', async () => {
    const user = userEvent.setup()
    render(<ShortcutsHelp />)
    useUIStore.getState().setShortcutsHelpOpen(true)

    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
    })
  })

  it('closes when the user clicks the close button', async () => {
    const user = userEvent.setup()
    render(<ShortcutsHelp />)
    useUIStore.getState().setShortcutsHelpOpen(true)

    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: /close shortcuts/i }))

    await waitFor(() => {
      expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
    })
  })
})
