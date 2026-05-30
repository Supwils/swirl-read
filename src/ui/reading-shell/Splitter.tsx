import { useCallback, useEffect, useRef } from 'react'

interface SplitterProps {
  /** Current split ratio (0..1) — width of pane 1 over total. */
  ratio: number
  /** Called continuously as the user drags with the new ratio. */
  onChange: (ratio: number) => void
  /** Called once when the drag releases — useful for persistence writes. */
  onCommit?: (ratio: number) => void
  /** Min/max clamps. Defaults to 0.2 / 0.8 so neither pane vanishes. */
  min?: number
  max?: number
}

const SNAP_RATIOS = [0.4, 0.5, 0.6]
const SNAP_THRESHOLD = 0.02

function snap(ratio: number): number {
  for (const target of SNAP_RATIOS) {
    if (Math.abs(ratio - target) <= SNAP_THRESHOLD) return target
  }
  return ratio
}

/**
 * Splitter — draggable handle between two panes.
 *
 * Drags update the parent's ratio synchronously so the split tracks the
 * cursor exactly. On release we snap to the canonical 40 / 50 / 60 slots
 * if the user is within 2 % of one, so casual users land on clean
 * fractions without having to aim.
 */
export function Splitter({
  ratio,
  onChange,
  onCommit,
  min = 0.2,
  max = 0.8,
}: SplitterProps) {
  const startRef = useRef<{ x: number; width: number } | null>(null)

  const lastRatioRef = useRef(ratio)
  lastRatioRef.current = ratio

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const start = startRef.current
      if (!start) return
      const dx = event.clientX - start.x
      const ratioRaw = (start.width * lastRatioRef.current + dx) / start.width
      const clamped = Math.min(Math.max(ratioRaw, min), max)
      onChange(clamped)
    },
    [onChange, min, max],
  )

  const handlePointerUp = useCallback(() => {
    startRef.current = null
    const finalRatio = snap(lastRatioRef.current)
    if (finalRatio !== lastRatioRef.current) onChange(finalRatio)
    onCommit?.(finalRatio)
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerMove, onCommit, onChange])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const container = event.currentTarget.closest(
        '.swirlread-workspace__panes',
      )
      const width = container?.getBoundingClientRect().width ?? 0
      if (width === 0) return
      startRef.current = { x: event.clientX, width }
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp, { once: true })
    },
    [handlePointerMove, handlePointerUp],
  )

  // Keyboard operation so the split is rebalanceable without a pointer:
  // ←/→ nudge by 2 %, Home/End jump to the min/max clamp, and the digit-ish
  // PageUp/PageDown step by 10 %. Each change commits immediately.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const STEP = 0.02
      const PAGE = 0.1
      let next: number | null = null
      switch (event.key) {
        case 'ArrowLeft':
          next = ratio - STEP
          break
        case 'ArrowRight':
          next = ratio + STEP
          break
        case 'PageUp':
          next = ratio - PAGE
          break
        case 'PageDown':
          next = ratio + PAGE
          break
        case 'Home':
          next = min
          break
        case 'End':
          next = max
          break
        default:
          return
      }
      event.preventDefault()
      const clamped = Math.min(Math.max(next, min), max)
      onChange(clamped)
      onCommit?.(clamped)
    },
    [ratio, min, max, onChange, onCommit],
  )

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [handlePointerMove])

  return (
    <button
      type="button"
      className="swirlread-workspace__splitter"
      aria-label="Resize panes"
      aria-orientation="vertical"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuetext={`Left pane ${String(Math.round(ratio * 100))}% width`}
      role="separator"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </button>
  )
}
