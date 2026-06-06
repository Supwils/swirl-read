/**
 * HighlightPopover — the floating control for creating or editing a
 * highlight. Lazy-loaded (it's only needed once a reader actually selects
 * text or clicks an existing highlight), so it stays out of the main bundle.
 *
 * Two modes:
 *   - `create` — a fresh selection. Pick a colour (+ optional note) → adds.
 *   - `edit`   — an existing highlight was clicked. Change colour, edit the
 *                note, or remove it.
 *
 * Positioned with `position: fixed` from a viewport rect supplied by the
 * caller (the selection rect for create, the clicked span's rect for edit),
 * so we avoid pulling Floating UI into this chunk. Clicking the colour
 * swatches is the primary action; the note field is opt-in.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { HIGHLIGHT_COLORS, type HighlightColor } from '@/core/highlights/types'

export type PopoverTarget =
  | { mode: 'create'; rect: DOMRect }
  | {
      mode: 'edit'
      rect: DOMRect
      id: string
      color: HighlightColor
      note: string
    }

interface HighlightPopoverProps {
  target: PopoverTarget
  onPickColor: (color: HighlightColor) => void
  onNoteChange: (note: string) => void
  onRemove: () => void
  onDismiss: () => void
}

const COLOR_LABELS: Record<HighlightColor, string> = {
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  pink: 'Pink',
  purple: 'Purple',
}

export function HighlightPopover({
  target,
  onPickColor,
  onNoteChange,
  onRemove,
  onDismiss,
}: HighlightPopoverProps): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null)
  const initialNote = target.mode === 'edit' ? target.note : ''
  const [note, setNote] = useState(initialNote)
  const activeColor = target.mode === 'edit' ? target.color : null

  // Move focus into the popover only in EDIT mode (opened by an explicit click
  // on a highlight). The CREATE popover auto-appears on every text selection,
  // so stealing focus there would (a) intrude on select-to-copy and (b) make a
  // subsequent Space/Enter activate a colour swatch instead of scrolling. The
  // create popover is still reachable by Tab (it's in DOM right after the
  // prose).
  useEffect(() => {
    if (target.mode !== 'edit') return
    ref.current?.querySelector<HTMLElement>('button')?.focus({
      preventScroll: true,
    })
  }, [target.mode])

  // Dismiss on outside press / Escape. `pointerdown` (not `mousedown`) so a
  // tap outside on touch devices dismisses too. The delegated prose-click
  // listener lives elsewhere; here we just close.
  useEffect(() => {
    function onDocPointer(event: Event): void {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onDismiss()
      }
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onDismiss()
    }
    // Scrolling the page away from the anchored selection dismisses (the
    // popover is position:fixed and would otherwise hang detached). Capture
    // phase so it catches scrolling in any container, not just the window —
    // but ignore scrolling INSIDE the popover (e.g. a multi-line note
    // textarea) so editing a note doesn't dismiss it.
    function onScroll(event: Event): void {
      if (ref.current?.contains(event.target as Node)) return
      onDismiss()
    }
    // Defer the outside-press binding a tick so the very press that opened
    // the popover doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDocPointer)
      window.addEventListener('scroll', onScroll, true)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onDocPointer)
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onDismiss])

  // Keep the local note in sync if the target switches to a different
  // highlight while the popover is mounted.
  useEffect(() => {
    setNote(initialNote)
  }, [initialNote])

  const style = positionStyle(target.rect, target.mode === 'edit')

  return (
    <div
      ref={ref}
      className="swirlread-hl-popover"
      style={style}
      role="dialog"
      aria-label={target.mode === 'create' ? 'Add highlight' : 'Edit highlight'}
    >
      <div className="swirlread-hl-popover__swatches">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={
              'swirlread-hl-popover__swatch' +
              (activeColor === color
                ? ' swirlread-hl-popover__swatch--active'
                : '')
            }
            data-hl-color={color}
            aria-label={COLOR_LABELS[color]}
            aria-pressed={activeColor === color}
            onClick={() => {
              onPickColor(color)
            }}
          />
        ))}
        {target.mode === 'edit' && (
          <button
            type="button"
            className="swirlread-hl-popover__remove"
            aria-label="Remove highlight"
            onClick={onRemove}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {/* Notes are an edit-mode affordance: the create flow commits on the
          colour pick, so a note typed before the highlight exists would be
          dropped. Show the field only once the highlight is real. */}
      {target.mode === 'edit' && (
        <textarea
          className="swirlread-hl-popover__note"
          placeholder="Add a note…"
          rows={2}
          value={note}
          onChange={(event) => {
            setNote(event.target.value)
          }}
          onBlur={() => {
            if (note !== initialNote) onNoteChange(note)
          }}
        />
      )}
    </div>
  )
}

/**
 * Place the popover just below the anchor rect, clamped to the viewport so
 * it never hangs off-screen. `position: fixed`, so the rect's viewport
 * coordinates are used directly.
 */
function positionStyle(rect: DOMRect, isEdit: boolean): React.CSSProperties {
  const POPOVER_WIDTH = 232
  const GAP = 8
  // Rough heights so we can flip above when there's no room below. Edit mode
  // adds the note textarea, so it's taller.
  const estHeight = isEdit ? 150 : 56
  const viewportWidth =
    typeof window !== 'undefined' ? window.innerWidth : POPOVER_WIDTH + 32
  const viewportHeight =
    typeof window !== 'undefined' ? window.innerHeight : estHeight + 32
  let left = rect.left
  if (left + POPOVER_WIDTH > viewportWidth - 8) {
    left = Math.max(8, viewportWidth - POPOVER_WIDTH - 8)
  }
  // Below the anchor by default; flip above when it would overflow the bottom.
  let top = rect.bottom + GAP
  if (top + estHeight > viewportHeight - 8) {
    top = Math.max(8, rect.top - GAP - estHeight)
  }
  return {
    position: 'fixed',
    top,
    left,
    width: POPOVER_WIDTH,
  }
}
