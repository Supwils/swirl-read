import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useApplyUIPrefs } from '@/app/use-apply-ui-prefs'
import { db, __resetDbForTests } from '@/core/persistence/db'
import {
  DEFAULT_CONTENT_WIDTH,
  DEFAULT_FILE_TREE_OPEN,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_FRONTMATTER_DISPLAY,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_THEME,
  DEFAULT_TOC_OPEN,
  useUIStore,
} from '@/stores/ui-store'
import { SettingsPanel } from './SettingsPanel'

beforeEach(async () => {
  await __resetDbForTests()
  document.body.className = ''
  document.documentElement.removeAttribute('style')
  useUIStore.setState({
    theme: DEFAULT_THEME,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: DEFAULT_LINE_HEIGHT,
    contentWidth: DEFAULT_CONTENT_WIDTH,
    zenMode: false,
    fileTreeOpen: DEFAULT_FILE_TREE_OPEN,
    tocOpen: DEFAULT_TOC_OPEN,
    commandPaletteOpen: false,
    shortcutsHelpOpen: false,
    frontmatterDisplay: DEFAULT_FRONTMATTER_DISPLAY,
    ready: true,
  })
})

function Harness() {
  useApplyUIPrefs()
  return <SettingsPanel />
}

async function openSettings() {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: /open settings/i }))
  expect(
    await screen.findByRole('dialog', { name: /settings/i }),
  ).toBeInTheDocument()
  return user
}

describe('SettingsPanel (M2.4)', () => {
  it('opens and closes as a dialog', async () => {
    const user = await openSettings()

    await user.click(screen.getByRole('button', { name: /close settings/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('changes theme immediately and persists it', async () => {
    const user = await openSettings()

    await user.selectOptions(screen.getByLabelText(/theme/i), 'dark')

    expect(useUIStore.getState().theme).toBe('dark')
    await waitFor(() => {
      expect(document.body).toHaveClass('theme-dark')
    })
    expect((await db.preferences.get('ui:theme'))?.value).toBe('dark')
  })

  it('updates typography controls and reflects CSS variables', async () => {
    const user = await openSettings()
    const sliders = screen.getAllByRole('slider')
    const fontSizeSlider = sliders[0]
    const lineHeightSlider = sliders[1]
    if (!fontSizeSlider || !lineHeightSlider) {
      throw new Error('Expected font size and line height sliders')
    }

    await user.click(screen.getByRole('button', { name: 'Sans' }))
    fireEvent.change(fontSizeSlider, {
      target: { value: '20' },
    })
    fireEvent.change(lineHeightSlider, {
      target: { value: '1.9' },
    })

    await waitFor(() => {
      expect(useUIStore.getState().fontFamily).toBe('sans')
      expect(useUIStore.getState().fontSize).toBe(20)
      expect(useUIStore.getState().lineHeight).toBe(1.9)
    })
    expect(
      document.documentElement.style.getPropertyValue('--reader-font-size'),
    ).toBe('20px')
    expect(
      document.documentElement.style.getPropertyValue('--reader-line-height'),
    ).toBe('1.9')
    expect((await db.preferences.get('ui:fontFamily'))?.value).toBe('sans')
  })

  it('updates content width and file-tree preference', async () => {
    const user = await openSettings()

    await user.click(screen.getByRole('button', { name: 'Wide' }))
    await user.click(screen.getByLabelText(/show the left sidebar/i))

    expect(useUIStore.getState().contentWidth).toBe('wide')
    expect(useUIStore.getState().fileTreeOpen).toBe(false)
    expect(
      document.documentElement.style.getPropertyValue('--reader-content-width'),
    ).toBe('880px')
    expect((await db.preferences.get('ui:fileTreeOpen'))?.value).toBe(false)
  })

  it('toggles the table-of-contents preference (M4.6)', async () => {
    const user = await openSettings()

    await user.click(screen.getByLabelText(/show the right sidebar/i))

    expect(useUIStore.getState().tocOpen).toBe(!DEFAULT_TOC_OPEN)
    expect((await db.preferences.get('ui:tocOpen'))?.value).toBe(
      !DEFAULT_TOC_OPEN,
    )
  })

  it('updates frontmatter display preference (M3.10)', async () => {
    const user = await openSettings()

    // Default is "metadata" — switch to "All" (raw)
    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(useUIStore.getState().frontmatterDisplay).toBe('raw')
    expect((await db.preferences.get('ui:frontmatterDisplay'))?.value).toBe(
      'raw',
    )

    // Switch to "Hidden"
    await user.click(screen.getByRole('button', { name: 'Hidden' }))
    expect(useUIStore.getState().frontmatterDisplay).toBe('hidden')
  })

  it('resets preferences to defaults', async () => {
    const user = await openSettings()

    await user.selectOptions(screen.getByLabelText(/theme/i), 'oled')
    await user.click(screen.getByRole('button', { name: 'Wide' }))
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.click(screen.getByRole('button', { name: /reset to defaults/i }))

    const state = useUIStore.getState()
    expect(state.theme).toBe(DEFAULT_THEME)
    expect(state.contentWidth).toBe(DEFAULT_CONTENT_WIDTH)
    expect(state.fontSize).toBe(DEFAULT_FONT_SIZE)
    expect(state.lineHeight).toBe(DEFAULT_LINE_HEIGHT)
    expect(state.frontmatterDisplay).toBe(DEFAULT_FRONTMATTER_DISPLAY)
    expect((await db.preferences.get('ui:theme'))?.value).toBe(DEFAULT_THEME)
  })
})
