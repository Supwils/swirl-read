/**
 * Sync UI preferences from `useUIStore` into the DOM.
 *
 * - Theme class on `<body>` (one of `theme-sepia | theme-light | theme-dark
 *   | theme-oled | theme-auto`)
 * - CSS variables on `:root` for typography settings, consumed by
 *   `.swilread-prose` and other reading-shell rules
 *
 * Mount this hook once at the top of the React tree (App.tsx). It runs on
 * every relevant store change and is idempotent — repeated values produce
 * no DOM mutation churn.
 */

import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'
import { CONTENT_WIDTH_PX } from '@/stores/ui-store'

const THEME_CLASSES = [
  'theme-sepia',
  'theme-light',
  'theme-dark',
  'theme-oled',
  'theme-auto',
] as const

const FONT_FAMILY_CSS_VAR: Record<string, string> = {
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
  system: 'system-ui, sans-serif',
}

export function useApplyUIPrefs(): void {
  const theme = useUIStore((s) => s.theme)
  const fontFamily = useUIStore((s) => s.fontFamily)
  const fontSize = useUIStore((s) => s.fontSize)
  const lineHeight = useUIStore((s) => s.lineHeight)
  const contentWidth = useUIStore((s) => s.contentWidth)
  const zenMode = useUIStore((s) => s.zenMode)

  // Theme class on <body>
  useEffect(() => {
    const body = document.body
    for (const cls of THEME_CLASSES) {
      body.classList.toggle(cls, cls === `theme-${theme}`)
    }
  }, [theme])

  // Typography CSS variables on <html> root
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty(
      '--reader-font-family',
      FONT_FAMILY_CSS_VAR[fontFamily] ?? 'var(--font-serif)',
    )
    root.style.setProperty('--reader-font-size', `${String(fontSize)}px`)
    root.style.setProperty('--reader-line-height', String(lineHeight))
    root.style.setProperty(
      '--reader-content-width',
      `${String(CONTENT_WIDTH_PX[contentWidth])}px`,
    )
  }, [fontFamily, fontSize, lineHeight, contentWidth])

  // Zen mode toggles a body-level class so any rule can react.
  useEffect(() => {
    document.body.classList.toggle('zen-mode', zenMode)
  }, [zenMode])
}
