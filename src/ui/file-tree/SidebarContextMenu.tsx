/**
 * SidebarContextMenu — minimal right-click menu for sidebar entries.
 *
 * Lives in a Portal so it can paint outside the sidebar's clip region.
 * Closes on Escape, on outside click, and after any item is selected.
 *
 * Positioning: anchored at the cursor coordinates the parent passes in,
 * then nudged up / left if the menu would overflow the viewport. Phase A
 * keeps the math simple — measure once after mount, adjust style.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EyeOff } from 'lucide-react'

export interface SidebarContextMenuProps {
  x: number
  y: number
  /** Display label for the entry the menu was opened over — shown as a
   *  small header so the user can confirm they right-clicked the right
   *  thing before picking a destructive action. */
  label: string
  onHide: () => void
  onClose: () => void
}

export function SidebarContextMenu({
  x,
  y,
  label,
  onHide,
  onClose,
}: SidebarContextMenuProps): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null)
  const firstItemRef = useRef<HTMLButtonElement | null>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  // Adjust if the menu would overflow the viewport, then move keyboard
  // focus to the first menu item so a right-click + Enter keyboard
  // flow works without a tab. We measure once after first paint; the
  // menu's contents are static, so a single pass is enough.
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    let nextLeft = x
    let nextTop = y
    if (x + rect.width + 8 > window.innerWidth) {
      nextLeft = Math.max(8, window.innerWidth - rect.width - 8)
    }
    if (y + rect.height + 8 > window.innerHeight) {
      nextTop = Math.max(8, window.innerHeight - rect.height - 8)
    }
    if (nextLeft !== x || nextTop !== y) {
      setPosition({ left: nextLeft, top: nextTop })
    }
    firstItemRef.current?.focus()
  }, [x, y])

  // Outside-click + Escape close. Pointerdown (not click) so the close
  // happens before the underlying element receives a click — otherwise
  // selecting another tree row would briefly show the menu jumping.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      const node = ref.current
      if (!node) return
      if (event.target instanceof Node && node.contains(event.target)) return
      onClose()
    }
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="swirlread-context-menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => {
        // Prevent the browser native menu when the user right-clicks
        // inside our menu — they're already in a menu.
        event.preventDefault()
      }}
    >
      <p className="swirlread-context-menu__header" title={label}>
        {label}
      </p>
      <button
        ref={firstItemRef}
        type="button"
        role="menuitem"
        className="swirlread-context-menu__item"
        onClick={() => {
          onHide()
          onClose()
        }}
      >
        <EyeOff size={13} aria-hidden="true" />
        <span>Hide from sidebar</span>
      </button>
    </div>,
    document.body,
  )
}
