/**
 * SettingsPanel — right-side settings drawer for reader preferences.
 *
 * Uses Radix Dialog for focus management, escape handling, aria wiring, and
 * portal behavior. Controls write directly to `useUIStore`, so changes apply
 * immediately through `useApplyUIPrefs()` and persist through the store's
 * existing Dexie-backed setters.
 */

import * as Dialog from '@radix-ui/react-dialog'
import { Settings, X } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  CONTENT_WIDTH_PX,
  EDITOR_FONT_SIZE_OPTIONS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FRONTMATTER_DISPLAY_OPTIONS,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  THEME_OPTIONS,
  useUIStore,
  type ContentWidth,
  type FontFamily,
  type Theme,
} from '@/stores/ui-store'
import { useHintsStore } from '@/stores/hints-store'
import { AIControl } from './AIControl'

const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'system', label: 'System' },
]

const WIDTH_OPTIONS: { value: ContentWidth; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
]

export function SettingsPanel(): ReactNode {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="swirlread-shell__icon-button"
          aria-label="Open settings"
          title="Settings"
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="swirlread-settings__overlay" />
        <Dialog.Content className="swirlread-settings" aria-label="Settings">
          <header className="swirlread-settings__header">
            <div>
              <Dialog.Title className="swirlread-settings__title">
                Settings
              </Dialog.Title>
              <Dialog.Description className="swirlread-settings__description">
                Reading preferences apply immediately.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="swirlread-settings__close"
                aria-label="Close settings"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="swirlread-settings__body">
            <ThemeControl />
            <FontFamilyControl />
            <FontSizeControl />
            <LineHeightControl />
            <ContentWidthControl />
            <FrontmatterControl />
            <FileTreeControl />
            <TocControl />
            <EditorPreferencesGroup />
            <AIControl />
          </div>

          <footer className="swirlread-settings__footer">
            <ResetHintsButton />
            <ResetButton />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ThemeControl(): ReactNode {
  const theme = useUIStore((state) => state.theme)
  const setTheme = useUIStore((state) => state.setTheme)

  return (
    <label className="swirlread-settings__field">
      <span className="swirlread-settings__label">Theme</span>
      <select
        value={theme}
        onChange={(event) => {
          void setTheme(event.target.value as Theme)
        }}
        className="swirlread-settings__select"
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function FontFamilyControl(): ReactNode {
  const fontFamily = useUIStore((state) => state.fontFamily)
  const setFontFamily = useUIStore((state) => state.setFontFamily)

  return (
    <fieldset className="swirlread-settings__field">
      <legend className="swirlread-settings__label">Font family</legend>
      <div className="swirlread-settings__segmented">
        {FONT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="swirlread-settings__segment"
            aria-pressed={fontFamily === option.value}
            onClick={() => {
              void setFontFamily(option.value)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function FontSizeControl(): ReactNode {
  const fontSize = useUIStore((state) => state.fontSize)
  const setFontSize = useUIStore((state) => state.setFontSize)

  return (
    <label className="swirlread-settings__field">
      <span className="swirlread-settings__label-row">
        <span className="swirlread-settings__label">Font size</span>
        <output className="swirlread-settings__value">{fontSize}px</output>
      </span>
      <input
        type="range"
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        step={1}
        value={fontSize}
        onChange={(event) => {
          void setFontSize(Number(event.target.value))
        }}
        className="swirlread-settings__range"
      />
    </label>
  )
}

function LineHeightControl(): ReactNode {
  const lineHeight = useUIStore((state) => state.lineHeight)
  const setLineHeight = useUIStore((state) => state.setLineHeight)

  return (
    <label className="swirlread-settings__field">
      <span className="swirlread-settings__label-row">
        <span className="swirlread-settings__label">Line height</span>
        <output className="swirlread-settings__value">
          {lineHeight.toFixed(1)}
        </output>
      </span>
      <input
        type="range"
        min={LINE_HEIGHT_MIN}
        max={LINE_HEIGHT_MAX}
        step={0.1}
        value={lineHeight}
        onChange={(event) => {
          void setLineHeight(Number(event.target.value))
        }}
        className="swirlread-settings__range"
      />
    </label>
  )
}

function ContentWidthControl(): ReactNode {
  const contentWidth = useUIStore((state) => state.contentWidth)
  const setContentWidth = useUIStore((state) => state.setContentWidth)

  return (
    <fieldset className="swirlread-settings__field">
      <legend className="swirlread-settings__label-row">
        <span className="swirlread-settings__label">Content width</span>
        <span className="swirlread-settings__value">
          {CONTENT_WIDTH_PX[contentWidth]}px
        </span>
      </legend>
      <div className="swirlread-settings__segmented">
        {WIDTH_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="swirlread-settings__segment"
            aria-pressed={contentWidth === option.value}
            onClick={() => {
              void setContentWidth(option.value)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function FrontmatterControl(): ReactNode {
  const frontmatterDisplay = useUIStore((state) => state.frontmatterDisplay)
  const setFrontmatterDisplay = useUIStore(
    (state) => state.setFrontmatterDisplay,
  )

  return (
    <fieldset className="swirlread-settings__field">
      <legend className="swirlread-settings__label-row">
        <span className="swirlread-settings__label">Frontmatter</span>
        <span className="swirlread-settings__hint">
          How metadata at the top of a note is shown
        </span>
      </legend>
      <div className="swirlread-settings__segmented">
        {FRONTMATTER_DISPLAY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="swirlread-settings__segment"
            aria-pressed={frontmatterDisplay === option.value}
            onClick={() => {
              void setFrontmatterDisplay(option.value)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function FileTreeControl(): ReactNode {
  const fileTreeOpen = useUIStore((state) => state.fileTreeOpen)
  const setFileTreeOpen = useUIStore((state) => state.setFileTreeOpen)

  return (
    <label className="swirlread-settings__toggle-row">
      <span>
        <span className="swirlread-settings__label">File tree</span>
        <span className="swirlread-settings__hint">Show the left sidebar</span>
      </span>
      <input
        type="checkbox"
        checked={fileTreeOpen}
        onChange={(event) => {
          void setFileTreeOpen(event.target.checked)
        }}
        className="swirlread-settings__checkbox"
      />
    </label>
  )
}

function TocControl(): ReactNode {
  const tocOpen = useUIStore((state) => state.tocOpen)
  const setTocOpen = useUIStore((state) => state.setTocOpen)

  return (
    <label className="swirlread-settings__toggle-row">
      <span>
        <span className="swirlread-settings__label">Table of contents</span>
        <span className="swirlread-settings__hint">Show the right sidebar</span>
      </span>
      <input
        type="checkbox"
        checked={tocOpen}
        onChange={(event) => {
          void setTocOpen(event.target.checked)
        }}
        className="swirlread-settings__checkbox"
      />
    </label>
  )
}

function EditorPreferencesGroup(): ReactNode {
  const editorLineNumbers = useUIStore((state) => state.editorLineNumbers)
  const setEditorLineNumbers = useUIStore((state) => state.setEditorLineNumbers)
  const editorLineWrap = useUIStore((state) => state.editorLineWrap)
  const setEditorLineWrap = useUIStore((state) => state.setEditorLineWrap)
  const editorFontSize = useUIStore((state) => state.editorFontSize)
  const setEditorFontSize = useUIStore((state) => state.setEditorFontSize)

  return (
    <fieldset className="swirlread-settings__field">
      <legend className="swirlread-settings__label">Editing</legend>

      <label className="swirlread-settings__field swirlread-settings__field--inline">
        <span>
          <span className="swirlread-settings__label">Line numbers</span>
          <span className="swirlread-settings__hint">
            Show line gutter while editing
          </span>
        </span>
        <input
          type="checkbox"
          checked={editorLineNumbers}
          onChange={(event) => {
            void setEditorLineNumbers(event.target.checked)
          }}
          className="swirlread-settings__checkbox"
        />
      </label>

      <label className="swirlread-settings__field swirlread-settings__field--inline">
        <span>
          <span className="swirlread-settings__label">Wrap long lines</span>
          <span className="swirlread-settings__hint">
            Soft-wrap instead of horizontal scroll
          </span>
        </span>
        <input
          type="checkbox"
          checked={editorLineWrap}
          onChange={(event) => {
            void setEditorLineWrap(event.target.checked)
          }}
          className="swirlread-settings__checkbox"
        />
      </label>

      <fieldset className="swirlread-settings__field">
        <legend className="swirlread-settings__label">Editor font size</legend>
        <div className="swirlread-settings__segmented">
          {EDITOR_FONT_SIZE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="swirlread-settings__segment"
              aria-pressed={editorFontSize === option.value}
              onClick={() => {
                void setEditorFontSize(option.value)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
    </fieldset>
  )
}

function ResetButton(): ReactNode {
  const resetToDefaults = useUIStore((state) => state.resetToDefaults)

  return (
    <button
      type="button"
      className="swirlread-settings__reset"
      onClick={() => {
        void resetToDefaults()
      }}
    >
      Reset to defaults
    </button>
  )
}

function ResetHintsButton(): ReactNode {
  const clearAll = useHintsStore((state) => state.clearAll)
  return (
    <button
      type="button"
      className="swirlread-settings__reset"
      onClick={() => {
        void clearAll()
      }}
    >
      Reset hints
    </button>
  )
}
