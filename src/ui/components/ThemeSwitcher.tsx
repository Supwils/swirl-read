import { useUIStore, THEME_OPTIONS, type Theme } from '@/stores/ui-store'

/**
 * Minimal theme switcher — a `<select>` that persists the chosen theme.
 *
 * A richer Radix dropdown lands in M2.4 (settings panel). For M2.3 the
 * point is to make the four themes + Auto actually reachable.
 */
export function ThemeSwitcher() {
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  return (
    <label className="flex items-center gap-2 font-serif text-sm">
      <span style={{ color: 'var(--color-text-muted)' }}>Theme</span>
      <select
        value={theme}
        onChange={(e) => {
          void setTheme(e.target.value as Theme)
        }}
        className="rounded-md px-2 py-1 font-serif text-sm"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text)',
          borderColor: 'var(--color-border)',
          borderWidth: '1px',
          borderStyle: 'solid',
        }}
      >
        {THEME_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
