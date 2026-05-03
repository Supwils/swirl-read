import type { ReactNode, SVGProps } from 'react'

type LogoProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: number
  title?: string
  decorative?: boolean
}

/**
 * SwilRead brand mark — a folded-corner page with three text lines.
 * Pure currentColor strokes so the mark inherits the active theme's
 * text colour when placed beside the wordmark; the bottom line uses
 * the accent token for a single restrained warm note.
 *
 * Pass `decorative` (or `aria-hidden`) when the surrounding element
 * already labels the mark — keeps assistive tech from announcing the
 * brand twice next to the wordmark.
 */
export function Logo({
  size = 22,
  title = 'SwilRead',
  decorative,
  ...rest
}: LogoProps): ReactNode {
  const ariaHidden = rest['aria-hidden']
  const hidden =
    decorative === true || ariaHidden === true || ariaHidden === 'true'
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(hidden
        ? { 'aria-hidden': true, focusable: false }
        : { role: 'img', 'aria-label': title })}
      {...rest}
    >
      {!hidden && <title>{title}</title>}
      <path d="M7 5 H21 L26 10 V27 H7 Z" />
      <path d="M21 5 V10 H26" />
      <line x1="10.5" y1="15" x2="22.5" y2="15" />
      <line x1="10.5" y1="18.5" x2="22.5" y2="18.5" />
      <line
        x1="10.5"
        y1="22"
        x2="18"
        y2="22"
        style={{ stroke: 'var(--color-accent)' }}
      />
    </svg>
  )
}
