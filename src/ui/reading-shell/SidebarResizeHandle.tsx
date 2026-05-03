/**
 * Drag-handle for resizing the left sidebar.
 *
 * Lives at the right edge of `.swirlread-vault-layout__sidebar`. During a
 * drag we write the live width directly to the `--file-tree-width` CSS
 * variable on `<html>` for buttery 60 fps motion (no Zustand churn per
 * frame); on pointer-up we persist the final value through the store
 * action, which `useApplyUIPrefs` will reflect back to the same CSS var
 * (idempotent — no flash).
 *
 * Only mounted in working chrome mode + open sidebar. The plan deliberately
 * excludes the handle from the reading-mode hover-summoned sidebar: an
 * 800ms grace timer plus a sustained drag don't compose well, and the
 * floating sidebar's right edge sits over content rather than at a true
 * gutter.
 */

import { useCallback, useRef, type ReactNode } from 'react'
import {
  FILE_TREE_WIDTH_MAX,
  FILE_TREE_WIDTH_MIN,
  useUIStore,
} from '@/stores/ui-store'

const KEY_STEP = 16
const KEY_STEP_LARGE = 64

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function applyLiveWidth(px: number): void {
  document.documentElement.style.setProperty('--file-tree-width', `${px}px`)
}

export function SidebarResizeHandle(): ReactNode {
  const fileTreeWidth = useUIStore((s) => s.fileTreeWidth)
  const setFileTreeWidth = useUIStore((s) => s.setFileTreeWidth)

  // Drag scratchpad — refs so pointer handlers don't trigger renders.
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(fileTreeWidth)
  const liveWidthRef = useRef(fileTreeWidth)

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      // Only respond to primary button.
      if (event.button !== 0) return
      event.preventDefault()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      handle.dataset.dragging = 'true'
      dragStartXRef.current = event.clientX
      dragStartWidthRef.current = useUIStore.getState().fileTreeWidth
      liveWidthRef.current = dragStartWidthRef.current
    },
    [],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.dataset.dragging !== 'true') return
      const dx = event.clientX - dragStartXRef.current
      const next = clamp(
        dragStartWidthRef.current + dx,
        FILE_TREE_WIDTH_MIN,
        FILE_TREE_WIDTH_MAX,
      )
      liveWidthRef.current = next
      applyLiveWidth(next)
      // Live-update aria-valuenow so screen readers track the current value.
      event.currentTarget.setAttribute('aria-valuenow', String(next))
    },
    [],
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const handle = event.currentTarget
      if (handle.dataset.dragging !== 'true') return
      handle.dataset.dragging = 'false'
      try {
        handle.releasePointerCapture(event.pointerId)
      } catch {
        // releasePointerCapture throws if capture was already released.
        // Swallow — state is already correct.
      }
      void setFileTreeWidth(liveWidthRef.current)
    },
    [setFileTreeWidth],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
      let next: number | null = null
      switch (event.key) {
        case 'ArrowLeft':
          next = fileTreeWidth - step
          break
        case 'ArrowRight':
          next = fileTreeWidth + step
          break
        case 'Home':
          next = FILE_TREE_WIDTH_MIN
          break
        case 'End':
          next = FILE_TREE_WIDTH_MAX
          break
        case 'Enter':
        case ' ':
          // Reset to the default — discoverable via Enter on focus.
          next = 280
          break
        default:
          return
      }
      event.preventDefault()
      const clamped = clamp(next, FILE_TREE_WIDTH_MIN, FILE_TREE_WIDTH_MAX)
      void setFileTreeWidth(clamped)
    },
    [fileTreeWidth, setFileTreeWidth],
  )

  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize file tree"
      aria-valuemin={FILE_TREE_WIDTH_MIN}
      aria-valuemax={FILE_TREE_WIDTH_MAX}
      aria-valuenow={fileTreeWidth}
      className="swirlread-vault-layout__sidebar-resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  )
}
