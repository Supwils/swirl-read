/**
 * Toggle — design-spec segmented control used in the chrome bar.
 *
 * Two-option pill that maps to the `seg` artboard primitive. Renders as
 * a single button per option with `data-on` for the active state so the
 * styling can paint the active background without a wrapping `<input>`
 * tree. Keyboard interaction is implicit — each option is a button.
 */

import type { ReactNode } from 'react'

export interface ToggleOption<T extends string> {
  value: T
  label: string
  ariaLabel?: string
}

interface ToggleProps<T extends string> {
  value: T
  options: ToggleOption<T>[]
  onChange: (value: T) => void
  ariaLabel?: string
}

export function Toggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: ToggleProps<T>): ReactNode {
  return (
    <div
      className="swirlread-chrome-toggle"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="swirlread-chrome-toggle__option"
          data-on={opt.value === value ? 'true' : undefined}
          aria-label={opt.ariaLabel ?? opt.label}
          aria-pressed={opt.value === value}
          onClick={() => {
            if (opt.value !== value) onChange(opt.value)
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
