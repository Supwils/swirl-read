import { describe, it, expect, beforeEach } from 'vitest'
import {
  useUIStore,
  DEFAULT_THEME,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_FILE_TREE_OPEN,
  DEFAULT_FILE_TREE_WIDTH,
  DEFAULT_TOC_OPEN,
  DEFAULT_FRONTMATTER_DISPLAY,
  FILE_TREE_WIDTH_MAX,
  FILE_TREE_WIDTH_MIN,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
} from './ui-store'
import { __resetDbForTests, db } from '@/core/persistence/db'

beforeEach(async () => {
  await __resetDbForTests()
  useUIStore.setState({
    theme: DEFAULT_THEME,
    fontFamily: 'serif',
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: DEFAULT_LINE_HEIGHT,
    contentWidth: 'medium',
    zenMode: false,
    fileTreeOpen: DEFAULT_FILE_TREE_OPEN,
    fileTreeWidth: DEFAULT_FILE_TREE_WIDTH,
    tocOpen: DEFAULT_TOC_OPEN,
    commandPaletteOpen: false,
    shortcutsHelpOpen: false,
    frontmatterDisplay: DEFAULT_FRONTMATTER_DISPLAY,
    ready: false,
  })
})

describe('ui store — init', () => {
  it('marks ready with defaults when db is empty', async () => {
    await useUIStore.getState().init()
    const state = useUIStore.getState()
    expect(state.ready).toBe(true)
    expect(state.theme).toBe(DEFAULT_THEME)
    expect(state.fontSize).toBe(DEFAULT_FONT_SIZE)
  })

  it('init is idempotent', async () => {
    await useUIStore.getState().init()
    await useUIStore.getState().init()
    expect(useUIStore.getState().ready).toBe(true)
  })

  it('restores persisted values', async () => {
    await db.preferences.put({ key: 'ui:theme', value: 'dark' })
    await db.preferences.put({ key: 'ui:fontSize', value: 20 })
    await useUIStore.getState().init()
    expect(useUIStore.getState().theme).toBe('dark')
    expect(useUIStore.getState().fontSize).toBe(20)
  })

  it('falls back to defaults for invalid stored values', async () => {
    await db.preferences.put({ key: 'ui:theme', value: 'INVALID' })
    await db.preferences.put({ key: 'ui:fontSize', value: 'not-a-number' })
    await useUIStore.getState().init()
    expect(useUIStore.getState().theme).toBe(DEFAULT_THEME)
    expect(useUIStore.getState().fontSize).toBe(DEFAULT_FONT_SIZE)
  })

  it('clamps out-of-range numeric prefs on load', async () => {
    await db.preferences.put({ key: 'ui:fontSize', value: 9999 })
    await db.preferences.put({ key: 'ui:lineHeight', value: 0.1 })
    await useUIStore.getState().init()
    expect(useUIStore.getState().fontSize).toBe(FONT_SIZE_MAX)
    expect(useUIStore.getState().lineHeight).toBe(LINE_HEIGHT_MIN)
  })
})

describe('ui store — setters persist + clamp', () => {
  it('setTheme updates state and writes to db', async () => {
    await useUIStore.getState().setTheme('oled')
    expect(useUIStore.getState().theme).toBe('oled')
    const row = await db.preferences.get('ui:theme')
    expect(row?.value).toBe('oled')
  })

  it('setFontSize clamps and persists', async () => {
    await useUIStore.getState().setFontSize(99)
    expect(useUIStore.getState().fontSize).toBe(FONT_SIZE_MAX)
    await useUIStore.getState().setFontSize(0)
    expect(useUIStore.getState().fontSize).toBe(FONT_SIZE_MIN)
  })

  it('setLineHeight clamps and persists', async () => {
    await useUIStore.getState().setLineHeight(99)
    expect(useUIStore.getState().lineHeight).toBe(LINE_HEIGHT_MAX)
  })

  it('setContentWidth persists', async () => {
    await useUIStore.getState().setContentWidth('wide')
    expect(useUIStore.getState().contentWidth).toBe('wide')
    const row = await db.preferences.get('ui:contentWidth')
    expect(row?.value).toBe('wide')
  })

  it('setFontFamily persists', async () => {
    await useUIStore.getState().setFontFamily('sans')
    expect(useUIStore.getState().fontFamily).toBe('sans')
  })
})

describe('ui store — zenMode', () => {
  it('zenMode is session-scoped (not persisted)', () => {
    useUIStore.getState().setZenMode(true)
    expect(useUIStore.getState().zenMode).toBe(true)
    // No expectation on db — zenMode is intentionally not written
  })

  it('toggleZenMode flips the flag', () => {
    expect(useUIStore.getState().zenMode).toBe(false)
    useUIStore.getState().toggleZenMode()
    expect(useUIStore.getState().zenMode).toBe(true)
    useUIStore.getState().toggleZenMode()
    expect(useUIStore.getState().zenMode).toBe(false)
  })
})

describe('ui store — fileTreeOpen (M4.3)', () => {
  it('defaults to open', () => {
    expect(useUIStore.getState().fileTreeOpen).toBe(DEFAULT_FILE_TREE_OPEN)
  })

  it('setFileTreeOpen writes to db', async () => {
    await useUIStore.getState().setFileTreeOpen(false)
    expect(useUIStore.getState().fileTreeOpen).toBe(false)
    const row = await db.preferences.get('ui:fileTreeOpen')
    expect(row?.value).toBe(false)
  })

  it('toggleFileTree flips and persists', async () => {
    await useUIStore.getState().toggleFileTree()
    expect(useUIStore.getState().fileTreeOpen).toBe(!DEFAULT_FILE_TREE_OPEN)
    const row = await db.preferences.get('ui:fileTreeOpen')
    expect(row?.value).toBe(!DEFAULT_FILE_TREE_OPEN)
  })

  it('init restores fileTreeOpen from db', async () => {
    await db.preferences.put({ key: 'ui:fileTreeOpen', value: false })
    useUIStore.setState({ ready: false })
    await useUIStore.getState().init()
    expect(useUIStore.getState().fileTreeOpen).toBe(false)
  })
})

describe('ui store — fileTreeWidth (resizable sidebar)', () => {
  it('defaults to 280', () => {
    expect(useUIStore.getState().fileTreeWidth).toBe(DEFAULT_FILE_TREE_WIDTH)
  })

  it('setFileTreeWidth clamps below the minimum', async () => {
    await useUIStore.getState().setFileTreeWidth(50)
    expect(useUIStore.getState().fileTreeWidth).toBe(FILE_TREE_WIDTH_MIN)
    const row = await db.preferences.get('ui:fileTreeWidth')
    expect(row?.value).toBe(FILE_TREE_WIDTH_MIN)
  })

  it('setFileTreeWidth clamps above the maximum', async () => {
    await useUIStore.getState().setFileTreeWidth(2000)
    expect(useUIStore.getState().fileTreeWidth).toBe(FILE_TREE_WIDTH_MAX)
  })

  it('setFileTreeWidth persists in-range values verbatim', async () => {
    await useUIStore.getState().setFileTreeWidth(360)
    expect(useUIStore.getState().fileTreeWidth).toBe(360)
    const row = await db.preferences.get('ui:fileTreeWidth')
    expect(row?.value).toBe(360)
  })

  it('init clamps a corrupt persisted width', async () => {
    await db.preferences.put({ key: 'ui:fileTreeWidth', value: 9999 })
    useUIStore.setState({ ready: false })
    await useUIStore.getState().init()
    expect(useUIStore.getState().fileTreeWidth).toBe(FILE_TREE_WIDTH_MAX)
  })

  it('init falls back to default for invalid stored values', async () => {
    await db.preferences.put({ key: 'ui:fileTreeOpen', value: 'yes' })
    useUIStore.setState({ ready: false })
    await useUIStore.getState().init()
    expect(useUIStore.getState().fileTreeOpen).toBe(DEFAULT_FILE_TREE_OPEN)
  })
})

describe('ui store — tocOpen (M4.6)', () => {
  it('defaults to open', () => {
    expect(useUIStore.getState().tocOpen).toBe(DEFAULT_TOC_OPEN)
  })

  it('setTocOpen writes to db', async () => {
    await useUIStore.getState().setTocOpen(false)
    expect(useUIStore.getState().tocOpen).toBe(false)
    const row = await db.preferences.get('ui:tocOpen')
    expect(row?.value).toBe(false)
  })

  it('toggleToc flips and persists', async () => {
    await useUIStore.getState().toggleToc()
    expect(useUIStore.getState().tocOpen).toBe(!DEFAULT_TOC_OPEN)
    const row = await db.preferences.get('ui:tocOpen')
    expect(row?.value).toBe(!DEFAULT_TOC_OPEN)
  })

  it('init restores tocOpen from db', async () => {
    await db.preferences.put({ key: 'ui:tocOpen', value: false })
    useUIStore.setState({ ready: false })
    await useUIStore.getState().init()
    expect(useUIStore.getState().tocOpen).toBe(false)
  })

  it('init falls back to default for invalid stored values', async () => {
    await db.preferences.put({ key: 'ui:tocOpen', value: 'maybe' })
    useUIStore.setState({ ready: false })
    await useUIStore.getState().init()
    expect(useUIStore.getState().tocOpen).toBe(DEFAULT_TOC_OPEN)
  })
})

describe('ui store — commandPaletteOpen (M5.1)', () => {
  it('defaults to closed', () => {
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('setCommandPaletteOpen flips the flag without persisting', async () => {
    useUIStore.getState().setCommandPaletteOpen(true)
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    // Transient — never written to Dexie.
    const row = await db.preferences.get('ui:commandPaletteOpen')
    expect(row).toBeUndefined()
  })

  it('toggleCommandPalette flips the flag', () => {
    useUIStore.getState().toggleCommandPalette()
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    useUIStore.getState().toggleCommandPalette()
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })
})

describe('ui store — shortcutsHelpOpen (M9.4)', () => {
  it('defaults to closed', () => {
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
  })

  it('setShortcutsHelpOpen flips the flag without persisting', async () => {
    useUIStore.getState().setShortcutsHelpOpen(true)
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(true)
    const row = await db.preferences.get('ui:shortcutsHelpOpen')
    expect(row).toBeUndefined()
  })

  it('toggleShortcutsHelp flips the flag', () => {
    useUIStore.getState().toggleShortcutsHelp()
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(true)
    useUIStore.getState().toggleShortcutsHelp()
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
  })
})

describe('ui store — frontmatterDisplay (M3.10)', () => {
  it('defaults to metadata mode', () => {
    expect(useUIStore.getState().frontmatterDisplay).toBe(
      DEFAULT_FRONTMATTER_DISPLAY,
    )
  })

  it('setFrontmatterDisplay persists', async () => {
    await useUIStore.getState().setFrontmatterDisplay('raw')
    expect(useUIStore.getState().frontmatterDisplay).toBe('raw')
    const row = await db.preferences.get('ui:frontmatterDisplay')
    expect(row?.value).toBe('raw')
  })

  it('init restores frontmatterDisplay from db', async () => {
    await db.preferences.put({
      key: 'ui:frontmatterDisplay',
      value: 'hidden',
    })
    useUIStore.setState({ ready: false })
    await useUIStore.getState().init()
    expect(useUIStore.getState().frontmatterDisplay).toBe('hidden')
  })

  it('init falls back to default for invalid stored values', async () => {
    await db.preferences.put({
      key: 'ui:frontmatterDisplay',
      value: 'not-a-mode',
    })
    useUIStore.setState({ ready: false })
    await useUIStore.getState().init()
    expect(useUIStore.getState().frontmatterDisplay).toBe(
      DEFAULT_FRONTMATTER_DISPLAY,
    )
  })
})

describe('ui store — resetToDefaults', () => {
  it('restores every field to its default', async () => {
    await useUIStore.getState().setTheme('dark')
    await useUIStore.getState().setFontSize(22)
    await useUIStore.getState().setContentWidth('wide')

    await useUIStore.getState().resetToDefaults()

    const state = useUIStore.getState()
    expect(state.theme).toBe(DEFAULT_THEME)
    expect(state.fontSize).toBe(DEFAULT_FONT_SIZE)
    expect(state.contentWidth).toBe('medium')

    const themeRow = await db.preferences.get('ui:theme')
    expect(themeRow?.value).toBe(DEFAULT_THEME)
  })
})
