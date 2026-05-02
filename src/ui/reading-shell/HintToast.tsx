/**
 * HintToast (M9.4).
 *
 * One-shot bottom-of-screen toast pointing first-time users at the
 * keyboard surfaces they wouldn't discover by reading. Dismisses on a
 * 12 s timer or via the close button; either path marks the hint as
 * seen so it never reappears for the current browser profile.
 *
 * Hint identity is the `id` prop, persisted in the Dexie `hintsSeen`
 * table via `useHintsStore`. A separate hint id covers each
 * onboarding moment we want to surface.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useHintsStore } from '@/stores/hints-store'

const AUTO_DISMISS_MS = 12_000

interface HintToastProps {
  id: string
  title: string
  children: ReactNode
}

export function HintToast({ id, title, children }: HintToastProps): ReactNode {
  const ready = useHintsStore((s) => s.ready)
  const seen = useHintsStore((s) => s.seen.has(id))
  const markSeen = useHintsStore((s) => s.markSeen)

  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Wait for the hydration pass — otherwise we'd flash the toast for
    // a returning user during the brief window before init() resolves.
    if (!ready) return
    if (seen) return
    setVisible(true)
    const timer = window.setTimeout(() => {
      setVisible(false)
      void markSeen(id)
    }, AUTO_DISMISS_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [ready, seen, id, markSeen])

  if (!visible || seen || !ready) return null

  return (
    <div
      className="swilread-hint"
      role="status"
      aria-live="polite"
      data-testid="hint-toast"
    >
      <div className="swilread-hint__body">
        <p className="swilread-hint__title">{title}</p>
        <div className="swilread-hint__detail">{children}</div>
      </div>
      <button
        type="button"
        className="swilread-hint__close"
        aria-label="Dismiss hint"
        onClick={() => {
          setVisible(false)
          void markSeen(id)
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
