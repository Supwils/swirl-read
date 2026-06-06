/**
 * HighlightsLayer — the orchestration seam that wires the highlights store
 * to the prose DOM, the selection popover, and the document-bottom list.
 *
 * Mounted from DocumentBodyView only in the `rendered` branch, after the
 * prose has been committed to the DOM. It:
 *   - subscribes to the highlights store for this document,
 *   - runs the decoration `useLayoutEffect` (React-safe wrap/unwrap),
 *   - tracks the live text selection (suppressed in edit/zen),
 *   - shows the create/edit popover, and
 *   - renders the bottom HighlightsList (with click-to-scroll).
 *
 * The list lives inline (cheap); the popover is lazy. The decoration and
 * anchor logic stay in the main bundle (small + must run synchronously on
 * every render to avoid a flash of un-highlighted text).
 */

import { lazy, useCallback, useMemo, useState, type ReactNode } from 'react'
import { useHighlightsStore, docKey } from '@/stores/highlights-store'
import { captureAnchor } from '@/core/highlights/anchor'
import type { HighlightColor } from '@/core/highlights/types'
import type { VaultId, VaultPath } from '@/core/vault'
import { ChunkBoundary } from '@/ui/components/ChunkBoundary'
import {
  useHighlightDecoration,
  scrollToHighlight,
} from './use-highlight-decoration'
import { useTextSelection } from './use-text-selection'
import { HighlightsList } from './HighlightsList'
import type { PopoverTarget } from './HighlightPopover'

const HighlightPopover = lazy(() =>
  import('./HighlightPopover').then((m) => ({ default: m.HighlightPopover })),
)

interface HighlightsLayerProps {
  vaultId: VaultId
  filePath: VaultPath
  proseRef: React.RefObject<HTMLDivElement | null>
  /** Doc-identity render key (the LoadState) so a new document re-runs the
   *  decoration pass after React swaps the content. */
  renderKey: unknown
  /** When true (edit mode / zen) the popover is suppressed; decoration is
   *  also disabled in edit mode (CodeMirror owns the surface). */
  suppressPopover: boolean
  /** When true, paint no highlights (edit mode). */
  suppressDecoration: boolean
}

export function HighlightsLayer({
  vaultId,
  filePath,
  proseRef,
  renderKey,
  suppressPopover,
  suppressDecoration,
}: HighlightsLayerProps): ReactNode {
  // Subscribe so store mutations re-render + re-decorate. Selecting only
  // this document's bucket keeps unrelated highlight churn from re-rendering.
  const byDoc = useHighlightsStore((s) => s.byDoc)
  // Use the store's canonical key builder (it normalizes the path) so the
  // read key always matches the write key — a URL splat that isn't already
  // normalized would otherwise miss the bucket the store wrote to.
  const docHighlights = useMemo(
    () => byDoc[docKey(vaultId, filePath)] ?? [],
    [byDoc, vaultId, filePath],
  )

  const [orphanedIds, setOrphanedIds] = useState<Set<string>>(new Set())
  const [popover, setPopover] = useState<PopoverTarget | null>(null)

  // The prose root is always an HTMLDivElement; widen to HTMLElement for the
  // DOM-only hooks below (safe — div is an element). This is a widening cast,
  // not a loosening one: nothing reads back a div-specific member.
  const rootRef = proseRef as React.RefObject<HTMLElement | null>

  const { selection, clear: clearSelection } = useTextSelection({
    rootRef,
    disabled: suppressPopover,
  })

  const handleResolved = useCallback(
    (_anchored: Set<string>, orphaned: Set<string>) => {
      setOrphanedIds((prev) => (setsEqual(prev, orphaned) ? prev : orphaned))
    },
    [],
  )

  const handleHighlightClick = useCallback(
    (id: string, target: HTMLElement) => {
      if (suppressPopover) return
      const hl = docHighlights.find((h) => h.id === id)
      if (!hl) return
      setPopover({
        mode: 'edit',
        rect: target.getBoundingClientRect(),
        id: hl.id,
        color: hl.color,
        note: hl.note,
      })
    },
    [docHighlights, suppressPopover],
  )

  useHighlightDecoration({
    rootRef,
    highlights: docHighlights,
    renderKey,
    disabled: suppressDecoration,
    onHighlightClick: handleHighlightClick,
    onResolved: handleResolved,
  })

  // Open the create popover when a fresh selection settles.
  const showCreate = !suppressPopover && selection !== null && popover === null

  const dismissPopover = useCallback(() => {
    setPopover(null)
    clearSelection()
    const sel = document.getSelection()
    sel?.removeAllRanges()
  }, [clearSelection])

  const handlePickColor = useCallback(
    (color: HighlightColor) => {
      if (popover?.mode === 'edit') {
        void useHighlightsStore.getState().setColor(popover.id, color)
        return
      }
      // Create: capture the anchor from the live selection range.
      const root = proseRef.current
      if (!root || !selection) return
      const anchor = captureAnchor(selection.range, root)
      if (!anchor) {
        dismissPopover()
        return
      }
      void useHighlightsStore.getState().add(vaultId, filePath, anchor, color)
      dismissPopover()
    },
    [popover, proseRef, selection, vaultId, filePath, dismissPopover],
  )

  const handleNoteChange = useCallback(
    (note: string) => {
      if (popover?.mode === 'edit') {
        void useHighlightsStore.getState().setNote(popover.id, note)
      }
      // Notes on a not-yet-created highlight are dropped — the colour pick
      // is the commit point in the create flow (keep the first cut simple).
    },
    [popover],
  )

  const handleRemove = useCallback(() => {
    if (popover?.mode === 'edit') {
      void useHighlightsStore.getState().remove(popover.id)
    }
    dismissPopover()
  }, [popover, dismissPopover])

  const activeTarget: PopoverTarget | null =
    popover ??
    (showCreate && selection ? { mode: 'create', rect: selection.rect } : null)

  return (
    <>
      <HighlightsList
        highlights={docHighlights}
        orphanedIds={orphanedIds}
        onScrollTo={(id) => {
          scrollToHighlight(proseRef.current, id)
        }}
        onRemove={(id) => {
          void useHighlightsStore.getState().remove(id)
        }}
      />
      {activeTarget && (
        <ChunkBoundary label="highlight popover">
          <HighlightPopover
            target={activeTarget}
            onPickColor={handlePickColor}
            onNoteChange={handleNoteChange}
            onRemove={handleRemove}
            onDismiss={dismissPopover}
          />
        </ChunkBoundary>
      )}
    </>
  )
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
