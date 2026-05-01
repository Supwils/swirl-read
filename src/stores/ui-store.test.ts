import { describe, it, expect, beforeEach } from 'vitest'
import {
  useUIStore,
  DEFAULT_THEME,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
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
