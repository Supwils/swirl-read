/**
 * Per-document scroll memory (M2.7).
 *
 * Wires `window.scroll` to the reader store with a small debounce, restores
 * the saved position when a document finishes rendering, and resets to the
 * top when the user navigates between documents so the brief flash of the
 * previous doc's offset never appears.
 *
 * The hook deliberately leaves its dependency on `restoreToken` to the
 * caller — DocumentPage flips the token only when content is in the
 * `rendered` state. That avoids racing the restore against the loading
 * skeleton, which has a different (much shorter) layout height.
 */

import { useEffect, useRef } from 'react'
import { useReaderStore, getScrollPosition } from '@/stores/reader-store'
import type { VaultId, VaultPath } from '@/core/vault'

const SCROLL_SAVE_DEBOUNCE_MS = 250

export interface ScrollMemoryArgs {
  vaultId: VaultId | undefined
  path: VaultPath | undefined
  /** Bumped by the caller once content has rendered and is laid out. */
  restoreToken: unknown
}

export function useScrollMemory({
  vaultId,
  path,
  restoreToken,
}: ScrollMemoryArgs): void {
  // Track the last path we saved for so the debounced timer never writes a
  // position against a stale (vaultId, path) tuple after navigation.
  const currentRef = useRef<{ vaultId: VaultId; path: VaultPath } | null>(null)

  // Reset to top on every navigation. Restoration runs in a separate effect
  // gated by `restoreToken` once the content is on screen. Without this the
  // previous doc's scrollY would remain visible during the loading state.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!vaultId || !path) {
      currentRef.current = null
      return
    }
    currentRef.current = { vaultId, path }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [vaultId, path])

  // Restore the stored position once the document has actually rendered.
  // We use rAF so the layout pass finishes before we set scrollTop —
  // otherwise long Markdown bodies still measure as zero-height when we
  // call scrollTo and the browser clamps the request to the current
  // document height.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!vaultId || !path) return
    const saved = getScrollPosition(vaultId, path)
    if (!saved || saved.scrollY <= 0) return

    let cancelled = false
    const handle = window.requestAnimationFrame(() => {
      if (cancelled) return
      // Second rAF gives the browser one more frame to stabilize layout
      // for embeds / Shiki-rendered code blocks that paint synchronously
      // but cause subsequent reflow as fonts settle.
      window.requestAnimationFrame(() => {
        if (cancelled) return
        window.scrollTo({
          top: saved.scrollY,
          left: 0,
          behavior: 'instant' as ScrollBehavior,
        })
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(handle)
    }
  }, [vaultId, path, restoreToken])

  // Listen to scroll and persist on a short debounce. We deliberately do not
  // save on every event — IndexedDB writes are cheap but not free, and the
  // visible behavior is identical with a 250 ms tail.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!vaultId || !path) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const handleScroll = (): void => {
      const target = currentRef.current
      if (!target) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        const captured = currentRef.current
        if (!captured) return
        if (
          captured.vaultId !== target.vaultId ||
          captured.path !== target.path
        )
          return
        const y = window.scrollY
        void useReaderStore
          .getState()
          .recordScrollPosition(captured.vaultId, captured.path, y)
      }, SCROLL_SAVE_DEBOUNCE_MS)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (timer !== null) clearTimeout(timer)
    }
  }, [vaultId, path])
}
