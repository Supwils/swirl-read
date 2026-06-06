/**
 * use-text-selection — track the current text selection confined to a root
 * element, returning its bounding rect + a cloned Range, or null when the
 * selection is collapsed, empty, or falls outside the root.
 *
 * We listen on `selectionchange` (fires continuously while dragging) but
 * only surface a result on a debounce trailing edge — the popover should
 * appear once the user finishes selecting, not flicker on every mouse move.
 * `mouseup` / `keyup` are also wired so a quick selection still resolves
 * promptly. The Range is cloned so a later DOM mutation (decoration) can't
 * invalidate the captured reference the consumer holds.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SKIP_SELECTOR } from '@/core/highlights/anchor'

/** True when a selection endpoint sits inside a subtree highlights can't
 *  anchor into (code / math / mermaid). */
function isInSkippedSubtree(node: Node): boolean {
  const el =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return el?.closest(SKIP_SELECTOR) != null
}

export interface TextSelectionInfo {
  /** Viewport rect of the selection (for popover placement). */
  rect: DOMRect
  /** A cloned, detached Range describing the selection. */
  range: Range
}

interface UseTextSelectionOptions {
  rootRef: React.RefObject<HTMLElement | null>
  /** When true the hook stays inert and always reports null (edit / zen). */
  disabled?: boolean
  /** Trailing-edge debounce in ms. Default 150. */
  debounceMs?: number
}

export function useTextSelection({
  rootRef,
  disabled = false,
  debounceMs = 150,
}: UseTextSelectionOptions): {
  selection: TextSelectionInfo | null
  clear: () => void
} {
  const [selection, setSelection] = useState<TextSelectionInfo | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    setSelection(null)
  }, [])

  useEffect(() => {
    if (disabled) {
      setSelection(null)
      return
    }
    const root = rootRef.current
    if (!root) return

    function evaluate(): void {
      const node = rootRef.current
      if (!node) return
      const sel = node.ownerDocument.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null)
        return
      }
      const range = sel.getRangeAt(0)
      // Both endpoints must live inside the prose root.
      if (
        !node.contains(range.startContainer) ||
        !node.contains(range.endContainer)
      ) {
        setSelection(null)
        return
      }
      if (range.toString().trim() === '') {
        setSelection(null)
        return
      }
      // If EITHER endpoint sits inside code/math, the anchor capture will fail
      // (those subtrees are excluded from anchoring), so don't pop a popover
      // that would silently no-op on colour-pick.
      if (
        isInSkippedSubtree(range.startContainer) ||
        isInSkippedSubtree(range.endContainer)
      ) {
        setSelection(null)
        return
      }
      const rect = range.getBoundingClientRect()
      setSelection({ rect, range: range.cloneRange() })
    }

    function schedule(): void {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        evaluate()
      }, debounceMs)
    }

    const doc = root.ownerDocument
    doc.addEventListener('selectionchange', schedule)
    root.addEventListener('mouseup', schedule)
    root.addEventListener('keyup', schedule)
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      doc.removeEventListener('selectionchange', schedule)
      root.removeEventListener('mouseup', schedule)
      root.removeEventListener('keyup', schedule)
    }
  }, [rootRef, disabled, debounceMs])

  return { selection, clear }
}
