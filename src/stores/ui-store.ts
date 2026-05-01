/**
 * UI store — theme, typography, and reading-shell preferences.
 *
 * State:
 *   - `theme`         — `sepia | light | dark | oled | auto`
 *   - `fontFamily`    — body font (serif default; sans / system available)
 *   - `fontSize`      — 14–22 px (clamped)
 *   - `lineHeight`    — 1.4–2.0 (clamped)
 *   - `contentWidth`  — narrow (640) / medium (720) / wide (880)
 *   - `zenMode`       — F-key toggle, hides chrome (M2.6 wires the key)
 *
 * Persistence: all fields except `zenMode` are written to the Dexie
 * `preferences` table. `zenMode` is intentionally session-scoped so a
 * stuck zen state never survives a reload.
 *
 * UI sync: the {@link useApplyUIPrefs} hook (in `app/use-apply-ui-prefs.ts`)
 * subscribes to this store and reflects values into DOM (body class,
 * CSS vars on root).
 */

import { create } from 'zustand'
import { db } from '@/core/persistence/db'

export type Theme = 'sepia' | 'light' | 'dark' | 'oled' | 'auto'
export type FontFamily = 'serif' | 'sans' | 'system'
export type ContentWidth = 'narrow' | 'medium' | 'wide'

export const FONT_SIZE_MIN = 14
export const FONT_SIZE_MAX = 22
export const LINE_HEIGHT_MIN = 1.4
export const LINE_HEIGHT_MAX = 2.0

export const DEFAULT_THEME: Theme = 'sepia'
export const DEFAULT_FONT_FAMILY: FontFamily = 'serif'
export const DEFAULT_FONT_SIZE = 18
export const DEFAULT_LINE_HEIGHT = 1.7
export const DEFAULT_CONTENT_WIDTH: ContentWidth = 'medium'

const PREF_PREFIX = 'ui:'

interface UIStoreState {
  theme: Theme
  fontFamily: FontFamily
  fontSize: number
  lineHeight: number
  contentWidth: ContentWidth
  zenMode: boolean
  /** True after `init()` has finished loading from Dexie. */
  ready: boolean
}

interface UIStoreActions {
  init: () => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  setFontFamily: (family: FontFamily) => Promise<void>
  setFontSize: (size: number) => Promise<void>
  setLineHeight: (height: number) => Promise<void>
  setContentWidth: (width: ContentWidth) => Promise<void>
  setZenMode: (on: boolean) => void
  toggleZenMode: () => void
  resetToDefaults: () => Promise<void>
}

export type UIStore = UIStoreState & UIStoreActions

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const VALID_THEMES = new Set<Theme>(['sepia', 'light', 'dark', 'oled', 'auto'])
const VALID_FONT_FAMILIES = new Set<FontFamily>(['serif', 'sans', 'system'])
const VALID_CONTENT_WIDTHS = new Set<ContentWidth>(['narrow', 'medium', 'wide'])

/* ─── Pref read helpers (defensive about untrusted IDB values) ─────── */

async function readPref<T>(
  key: string,
  isValid: (v: unknown) => v is T,
  fallback: T,
): Promise<T> {
  const row = await db.preferences.get(`${PREF_PREFIX}${key}`)
  if (!row) return fallback
  return isValid(row.value) ? row.value : fallback
}

async function writePref(key: string, value: unknown): Promise<void> {
  await db.preferences.put({ key: `${PREF_PREFIX}${key}`, value })
}

const isTheme = (v: unknown): v is Theme =>
  typeof v === 'string' && VALID_THEMES.has(v as Theme)

const isFontFamily = (v: unknown): v is FontFamily =>
  typeof v === 'string' && VALID_FONT_FAMILIES.has(v as FontFamily)

const isContentWidth = (v: unknown): v is ContentWidth =>
  typeof v === 'string' && VALID_CONTENT_WIDTHS.has(v as ContentWidth)

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/* ─── Store ────────────────────────────────────────────────────────── */

export const useUIStore = create<UIStore>((set, get) => ({
  theme: DEFAULT_THEME,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  contentWidth: DEFAULT_CONTENT_WIDTH,
  zenMode: false,
  ready: false,

  async init() {
    if (get().ready) return
    const [theme, fontFamily, fontSize, lineHeight, contentWidth] =
      await Promise.all([
        readPref('theme', isTheme, DEFAULT_THEME),
        readPref('fontFamily', isFontFamily, DEFAULT_FONT_FAMILY),
        readPref('fontSize', isFiniteNumber, DEFAULT_FONT_SIZE),
        readPref('lineHeight', isFiniteNumber, DEFAULT_LINE_HEIGHT),
        readPref('contentWidth', isContentWidth, DEFAULT_CONTENT_WIDTH),
      ])
    set({
      theme,
      fontFamily,
      fontSize: clamp(fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
      lineHeight: clamp(lineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX),
      contentWidth,
      ready: true,
    })
  },

  async setTheme(theme) {
    set({ theme })
    await writePref('theme', theme)
  },

  async setFontFamily(family) {
    set({ fontFamily: family })
    await writePref('fontFamily', family)
  },

  async setFontSize(size) {
    const clamped = clamp(size, FONT_SIZE_MIN, FONT_SIZE_MAX)
    set({ fontSize: clamped })
    await writePref('fontSize', clamped)
  },

  async setLineHeight(height) {
    const clamped = clamp(height, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX)
    set({ lineHeight: clamped })
    await writePref('lineHeight', clamped)
  },

  async setContentWidth(width) {
    set({ contentWidth: width })
    await writePref('contentWidth', width)
  },

  setZenMode(on) {
    set({ zenMode: on })
  },

  toggleZenMode() {
    set((state) => ({ zenMode: !state.zenMode }))
  },

  async resetToDefaults() {
    set({
      theme: DEFAULT_THEME,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: DEFAULT_FONT_SIZE,
      lineHeight: DEFAULT_LINE_HEIGHT,
      contentWidth: DEFAULT_CONTENT_WIDTH,
    })
    await Promise.all([
      writePref('theme', DEFAULT_THEME),
      writePref('fontFamily', DEFAULT_FONT_FAMILY),
      writePref('fontSize', DEFAULT_FONT_SIZE),
      writePref('lineHeight', DEFAULT_LINE_HEIGHT),
      writePref('contentWidth', DEFAULT_CONTENT_WIDTH),
    ])
  },
}))

/** Theme list for display (label + value). */
export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'sepia', label: 'Sepia' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'oled', label: 'OLED' },
  { value: 'auto', label: 'Auto' },
]

/** Map content width keyword to actual pixel value. */
export const CONTENT_WIDTH_PX: Record<ContentWidth, number> = {
  narrow: 640,
  medium: 720,
  wide: 880,
}
