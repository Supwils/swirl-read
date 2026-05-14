/**
 * UI store — theme, typography, and reading-shell preferences.
 *
 * State:
 *   - `theme`         — `sepia | light | dark | oled | auto`
 *   - `fontFamily`    — body font (serif default; sans / system available)
 *   - `fontSize`      — 14–22 px (clamped)
 *   - `lineHeight`    — 1.4–2.0 (clamped)
 *   - `contentWidth`  — narrow (640) / medium (720) / wide (880)
 *   - `zenMode`             — F-key toggle, hides chrome (M2.6 wires the key)
 *   - `fileTreeOpen`        — left-rail file tree visibility (M4.3)
 *   - `fileTreeWidth`       — left-rail width in px (220–520, drag-to-resize)
 *   - `tocOpen`             — right-rail table of contents visibility (M4.6)
 *   - `commandPaletteOpen`  — ⌘K palette open/closed (M5.1, transient)
 *   - `shortcutsHelpOpen`   — `?` overlay listing all keybindings (M9.4, transient)
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
export type FrontmatterDisplay = 'metadata' | 'raw' | 'hidden'

/**
 * RX2 reading-chrome mode. Two persistent values plus the transient
 * `zenMode` flag give us the three "chrome levels" the craft plan
 * specifies:
 *
 *   - `reading`  — minimal chrome; sidebars hidden by default, hover
 *                  zones (M2.5) summon the file tree / TOC on demand
 *   - `working`  — full chrome; sidebars persistent; matches the
 *                  pre-RX2 default behaviour
 *   - `zen`      — content only; driven by the existing `zenMode`
 *                  transient flag (F key); overrides chrome mode
 */
export type ChromeMode = 'reading' | 'working'

/** Editor font-size keyword (Phase 2D). Maps to actual px in EDITOR_FONT_SIZE_PX. */
export type EditorFontSize = 'sm' | 'md' | 'lg'

/**
 * TOC depth filter. The right-rail "On this page" list shows headings
 * whose level is `<= tocMaxLevel`. Default is 6 (show everything).
 *
 *   - `2` — H1 + H2 only. For long `*-map.md` indexes where the H3
 *           sub-rows turn the rail into a wall.
 *   - `3` — H1–H3. The natural middle ground for most prose docs.
 *   - `6` — show every heading (current behaviour).
 */
export type TocMaxLevel = 2 | 3 | 6

export const FONT_SIZE_MIN = 14
export const FONT_SIZE_MAX = 22
export const LINE_HEIGHT_MIN = 1.4
export const LINE_HEIGHT_MAX = 2.0
export const FILE_TREE_WIDTH_MIN = 220
export const FILE_TREE_WIDTH_MAX = 520

export const DEFAULT_THEME: Theme = 'sepia'
export const DEFAULT_FONT_FAMILY: FontFamily = 'serif'
export const DEFAULT_FONT_SIZE = 18
export const DEFAULT_LINE_HEIGHT = 1.7
export const DEFAULT_CONTENT_WIDTH: ContentWidth = 'medium'
export const DEFAULT_FILE_TREE_OPEN = true
export const DEFAULT_FILE_TREE_WIDTH = 280
export const DEFAULT_TOC_OPEN = true
export const DEFAULT_FRONTMATTER_DISPLAY: FrontmatterDisplay = 'metadata'
export const DEFAULT_CHROME_MODE: ChromeMode = 'reading'
export const DEFAULT_EDITOR_LINE_NUMBERS = false
export const DEFAULT_EDITOR_LINE_WRAP = true
export const DEFAULT_EDITOR_FONT_SIZE: EditorFontSize = 'md'
export const DEFAULT_TOC_MAX_LEVEL: TocMaxLevel = 6
/**
 * RX3 — opt-in fallback to the legacy `FileTree.tsx` sidebar. Defaults to
 * `false` so new vaults render the design-spec `FileShelf` instead. The
 * old tree is kept behind this flag for one release window per the Pebble
 * Garden + Workspace handoff; it will be removed once telemetry shows
 * no-one is using it.
 */
export const DEFAULT_USE_LEGACY_TREE = false
/**
 * Persisted "which folder is currently expanded in the FileShelf". One row
 * at a time so the sidebar never sprawls into a wall. `null` means none.
 */
export const DEFAULT_SHELF_EXPANDED_FOLDER_ID: string | null = null
/** Per-window splitter ratio for the dual-pane Workspace (PR B Step 5). */
export const DEFAULT_PANE_SPLIT_RATIO = 0.5
export const PANE_SPLIT_RATIO_MIN = 0.2
export const PANE_SPLIT_RATIO_MAX = 0.8

const PREF_PREFIX = 'ui:'

interface UIStoreState {
  theme: Theme
  fontFamily: FontFamily
  fontSize: number
  lineHeight: number
  contentWidth: ContentWidth
  zenMode: boolean
  fileTreeOpen: boolean
  fileTreeWidth: number
  tocOpen: boolean
  commandPaletteOpen: boolean
  shortcutsHelpOpen: boolean
  frontmatterDisplay: FrontmatterDisplay
  chromeMode: ChromeMode
  editorLineNumbers: boolean
  editorLineWrap: boolean
  editorFontSize: EditorFontSize
  tocMaxLevel: TocMaxLevel
  useLegacyTree: boolean
  shelfExpandedFolderId: string | null
  paneSplitRatio: number
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
  setFileTreeOpen: (open: boolean) => Promise<void>
  toggleFileTree: () => Promise<void>
  setFileTreeWidth: (width: number) => Promise<void>
  setTocOpen: (open: boolean) => Promise<void>
  toggleToc: () => Promise<void>
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setShortcutsHelpOpen: (open: boolean) => void
  toggleShortcutsHelp: () => void
  setFrontmatterDisplay: (display: FrontmatterDisplay) => Promise<void>
  setChromeMode: (mode: ChromeMode) => Promise<void>
  toggleChromeMode: () => Promise<void>
  setEditorLineNumbers: (on: boolean) => Promise<void>
  setEditorLineWrap: (on: boolean) => Promise<void>
  setEditorFontSize: (size: EditorFontSize) => Promise<void>
  setTocMaxLevel: (level: TocMaxLevel) => Promise<void>
  setUseLegacyTree: (on: boolean) => Promise<void>
  setShelfExpandedFolderId: (id: string | null) => Promise<void>
  setPaneSplitRatio: (ratio: number) => Promise<void>
  resetToDefaults: () => Promise<void>
}

export type UIStore = UIStoreState & UIStoreActions

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const VALID_THEMES = new Set<Theme>(['sepia', 'light', 'dark', 'oled', 'auto'])
const VALID_FONT_FAMILIES = new Set<FontFamily>(['serif', 'sans', 'system'])
const VALID_CONTENT_WIDTHS = new Set<ContentWidth>(['narrow', 'medium', 'wide'])
const VALID_FRONTMATTER_DISPLAYS = new Set<FrontmatterDisplay>([
  'metadata',
  'raw',
  'hidden',
])

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

const isFrontmatterDisplay = (v: unknown): v is FrontmatterDisplay =>
  typeof v === 'string' &&
  VALID_FRONTMATTER_DISPLAYS.has(v as FrontmatterDisplay)

const VALID_CHROME_MODES = new Set<ChromeMode>(['reading', 'working'])
const isChromeMode = (v: unknown): v is ChromeMode =>
  typeof v === 'string' && VALID_CHROME_MODES.has(v as ChromeMode)

const VALID_EDITOR_FONT_SIZES = new Set<EditorFontSize>(['sm', 'md', 'lg'])
const isEditorFontSize = (v: unknown): v is EditorFontSize =>
  typeof v === 'string' && VALID_EDITOR_FONT_SIZES.has(v as EditorFontSize)

const VALID_TOC_MAX_LEVELS = new Set<TocMaxLevel>([2, 3, 6])
const isTocMaxLevel = (v: unknown): v is TocMaxLevel =>
  typeof v === 'number' && VALID_TOC_MAX_LEVELS.has(v as TocMaxLevel)

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

const isNullableString = (v: unknown): v is string | null =>
  v === null || typeof v === 'string'

/* ─── Store ────────────────────────────────────────────────────────── */

export const useUIStore = create<UIStore>((set, get) => ({
  theme: DEFAULT_THEME,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  contentWidth: DEFAULT_CONTENT_WIDTH,
  zenMode: false,
  fileTreeOpen: DEFAULT_FILE_TREE_OPEN,
  fileTreeWidth: DEFAULT_FILE_TREE_WIDTH,
  tocOpen: DEFAULT_TOC_OPEN,
  commandPaletteOpen: false,
  shortcutsHelpOpen: false,
  frontmatterDisplay: DEFAULT_FRONTMATTER_DISPLAY,
  chromeMode: DEFAULT_CHROME_MODE,
  editorLineNumbers: DEFAULT_EDITOR_LINE_NUMBERS,
  editorLineWrap: DEFAULT_EDITOR_LINE_WRAP,
  editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
  tocMaxLevel: DEFAULT_TOC_MAX_LEVEL,
  useLegacyTree: DEFAULT_USE_LEGACY_TREE,
  shelfExpandedFolderId: DEFAULT_SHELF_EXPANDED_FOLDER_ID,
  paneSplitRatio: DEFAULT_PANE_SPLIT_RATIO,
  ready: false,

  async init() {
    if (get().ready) return
    const [
      theme,
      fontFamily,
      fontSize,
      lineHeight,
      contentWidth,
      fileTreeOpen,
      fileTreeWidth,
      tocOpen,
      frontmatterDisplay,
      chromeMode,
      editorLineNumbers,
      editorLineWrap,
      editorFontSize,
      tocMaxLevel,
      useLegacyTree,
      shelfExpandedFolderId,
      paneSplitRatio,
    ] = await Promise.all([
      readPref('theme', isTheme, DEFAULT_THEME),
      readPref('fontFamily', isFontFamily, DEFAULT_FONT_FAMILY),
      readPref('fontSize', isFiniteNumber, DEFAULT_FONT_SIZE),
      readPref('lineHeight', isFiniteNumber, DEFAULT_LINE_HEIGHT),
      readPref('contentWidth', isContentWidth, DEFAULT_CONTENT_WIDTH),
      readPref('fileTreeOpen', isBoolean, DEFAULT_FILE_TREE_OPEN),
      readPref('fileTreeWidth', isFiniteNumber, DEFAULT_FILE_TREE_WIDTH),
      readPref('tocOpen', isBoolean, DEFAULT_TOC_OPEN),
      readPref(
        'frontmatterDisplay',
        isFrontmatterDisplay,
        DEFAULT_FRONTMATTER_DISPLAY,
      ),
      readPref('chromeMode', isChromeMode, DEFAULT_CHROME_MODE),
      readPref('editorLineNumbers', isBoolean, DEFAULT_EDITOR_LINE_NUMBERS),
      readPref('editorLineWrap', isBoolean, DEFAULT_EDITOR_LINE_WRAP),
      readPref('editorFontSize', isEditorFontSize, DEFAULT_EDITOR_FONT_SIZE),
      readPref('tocMaxLevel', isTocMaxLevel, DEFAULT_TOC_MAX_LEVEL),
      readPref('useLegacyTree', isBoolean, DEFAULT_USE_LEGACY_TREE),
      readPref(
        'shelfExpandedFolderId',
        isNullableString,
        DEFAULT_SHELF_EXPANDED_FOLDER_ID,
      ),
      readPref('paneSplitRatio', isFiniteNumber, DEFAULT_PANE_SPLIT_RATIO),
    ])
    set({
      theme,
      fontFamily,
      fontSize: clamp(fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
      lineHeight: clamp(lineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX),
      contentWidth,
      fileTreeOpen,
      fileTreeWidth: clamp(
        fileTreeWidth,
        FILE_TREE_WIDTH_MIN,
        FILE_TREE_WIDTH_MAX,
      ),
      tocOpen,
      frontmatterDisplay,
      chromeMode,
      editorLineNumbers,
      editorLineWrap,
      editorFontSize,
      tocMaxLevel,
      useLegacyTree,
      shelfExpandedFolderId,
      paneSplitRatio: clamp(
        paneSplitRatio,
        PANE_SPLIT_RATIO_MIN,
        PANE_SPLIT_RATIO_MAX,
      ),
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

  async setFileTreeOpen(open) {
    set({ fileTreeOpen: open })
    await writePref('fileTreeOpen', open)
  },

  async toggleFileTree() {
    const next = !get().fileTreeOpen
    set({ fileTreeOpen: next })
    await writePref('fileTreeOpen', next)
  },

  async setFileTreeWidth(width) {
    const clamped = clamp(width, FILE_TREE_WIDTH_MIN, FILE_TREE_WIDTH_MAX)
    set({ fileTreeWidth: clamped })
    await writePref('fileTreeWidth', clamped)
  },

  async setTocOpen(open) {
    set({ tocOpen: open })
    await writePref('tocOpen', open)
  },

  async toggleToc() {
    const next = !get().tocOpen
    set({ tocOpen: next })
    await writePref('tocOpen', next)
  },

  setCommandPaletteOpen(open) {
    set({ commandPaletteOpen: open })
  },

  toggleCommandPalette() {
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen }))
  },

  setShortcutsHelpOpen(open) {
    set({ shortcutsHelpOpen: open })
  },

  toggleShortcutsHelp() {
    set((state) => ({ shortcutsHelpOpen: !state.shortcutsHelpOpen }))
  },

  async setFrontmatterDisplay(display) {
    set({ frontmatterDisplay: display })
    await writePref('frontmatterDisplay', display)
  },

  async setChromeMode(mode) {
    set({ chromeMode: mode })
    await writePref('chromeMode', mode)
  },

  async toggleChromeMode() {
    const next: ChromeMode =
      get().chromeMode === 'reading' ? 'working' : 'reading'
    set({ chromeMode: next })
    await writePref('chromeMode', next)
  },

  async setEditorLineNumbers(on) {
    set({ editorLineNumbers: on })
    await writePref('editorLineNumbers', on)
  },

  async setEditorLineWrap(on) {
    set({ editorLineWrap: on })
    await writePref('editorLineWrap', on)
  },

  async setEditorFontSize(size) {
    set({ editorFontSize: size })
    await writePref('editorFontSize', size)
  },

  async setTocMaxLevel(level) {
    set({ tocMaxLevel: level })
    await writePref('tocMaxLevel', level)
  },

  async setUseLegacyTree(on) {
    set({ useLegacyTree: on })
    await writePref('useLegacyTree', on)
  },

  async setShelfExpandedFolderId(id) {
    set({ shelfExpandedFolderId: id })
    await writePref('shelfExpandedFolderId', id)
  },

  async setPaneSplitRatio(ratio) {
    const clamped = clamp(ratio, PANE_SPLIT_RATIO_MIN, PANE_SPLIT_RATIO_MAX)
    set({ paneSplitRatio: clamped })
    await writePref('paneSplitRatio', clamped)
  },

  async resetToDefaults() {
    set({
      theme: DEFAULT_THEME,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: DEFAULT_FONT_SIZE,
      lineHeight: DEFAULT_LINE_HEIGHT,
      contentWidth: DEFAULT_CONTENT_WIDTH,
      fileTreeOpen: DEFAULT_FILE_TREE_OPEN,
      fileTreeWidth: DEFAULT_FILE_TREE_WIDTH,
      tocOpen: DEFAULT_TOC_OPEN,
      frontmatterDisplay: DEFAULT_FRONTMATTER_DISPLAY,
      chromeMode: DEFAULT_CHROME_MODE,
      editorLineNumbers: DEFAULT_EDITOR_LINE_NUMBERS,
      editorLineWrap: DEFAULT_EDITOR_LINE_WRAP,
      editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
      tocMaxLevel: DEFAULT_TOC_MAX_LEVEL,
      useLegacyTree: DEFAULT_USE_LEGACY_TREE,
      shelfExpandedFolderId: DEFAULT_SHELF_EXPANDED_FOLDER_ID,
      paneSplitRatio: DEFAULT_PANE_SPLIT_RATIO,
    })
    await Promise.all([
      writePref('theme', DEFAULT_THEME),
      writePref('fontFamily', DEFAULT_FONT_FAMILY),
      writePref('fontSize', DEFAULT_FONT_SIZE),
      writePref('lineHeight', DEFAULT_LINE_HEIGHT),
      writePref('contentWidth', DEFAULT_CONTENT_WIDTH),
      writePref('fileTreeOpen', DEFAULT_FILE_TREE_OPEN),
      writePref('fileTreeWidth', DEFAULT_FILE_TREE_WIDTH),
      writePref('tocOpen', DEFAULT_TOC_OPEN),
      writePref('frontmatterDisplay', DEFAULT_FRONTMATTER_DISPLAY),
      writePref('chromeMode', DEFAULT_CHROME_MODE),
      writePref('editorLineNumbers', DEFAULT_EDITOR_LINE_NUMBERS),
      writePref('editorLineWrap', DEFAULT_EDITOR_LINE_WRAP),
      writePref('editorFontSize', DEFAULT_EDITOR_FONT_SIZE),
      writePref('tocMaxLevel', DEFAULT_TOC_MAX_LEVEL),
      writePref('useLegacyTree', DEFAULT_USE_LEGACY_TREE),
      writePref('shelfExpandedFolderId', DEFAULT_SHELF_EXPANDED_FOLDER_ID),
      writePref('paneSplitRatio', DEFAULT_PANE_SPLIT_RATIO),
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

/** Frontmatter display options (label + value), surfaced in the settings panel. */
export const FRONTMATTER_DISPLAY_OPTIONS: {
  value: FrontmatterDisplay
  label: string
}[] = [
  { value: 'metadata', label: 'Metadata' },
  { value: 'raw', label: 'All' },
  { value: 'hidden', label: 'Hidden' },
]

/** Editor font size: keyword → px (Phase 2D). Used in the EditSurface. */
export const EDITOR_FONT_SIZE_PX: Record<EditorFontSize, number> = {
  sm: 13,
  md: 15,
  lg: 17,
}

export const EDITOR_FONT_SIZE_OPTIONS: {
  value: EditorFontSize
  label: string
}[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
]
