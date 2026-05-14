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

import { useEffect, useRef, type RefObject } from 'react'
import { useReaderStore, getScrollPosition } from '@/stores/reader-store'
import type { VaultId, VaultPath } from '@/core/vault'

const SCROLL_SAVE_DEBOUNCE_MS = 250

export interface ScrollMemoryArgs {
  vaultId: VaultId | undefined
  path: VaultPath | undefined
  /** Bumped by the caller once content has rendered and is laid out. */
  restoreToken: unknown
  /**
   * Optional scroll container. When provided the hook attaches to that
   * element's scroll events instead of `window`, and reads / sets its
   * `scrollTop` rather than the page offset. Used by the Workspace
   * surface in dual-pane mode where each pane owns its own scroll.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>
  /**
   * Optional storage scope key. When set, scroll positions persist under
   * `${keyScope}::${path}` rather than `${path}` — keeps per-pane reads
   * from clobbering the global window scroll memory.
   */
  keyScope?: string
}

function scopedKey(keyScope: string | undefined, path: VaultPath): VaultPath {
  return keyScope ? `${keyScope}::${path}` : path
}

export function useScrollMemory({
  vaultId,
  path,
  restoreToken,
  scrollContainerRef,
  keyScope,
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
    const container = scrollContainerRef?.current ?? null
    if (container) {
      container.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant' as ScrollBehavior,
      })
    } else {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant' as ScrollBehavior,
      })
    }
  }, [vaultId, path, scrollContainerRef])

  // Restore the stored position once the document has actually rendered.
  // We use rAF so the layout pass finishes before we set scrollTop —
  // otherwise long Markdown bodies still measure as zero-height when we
  // call scrollTo and the browser clamps the request to the current
  // document height.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!vaultId || !path) return
    const lookupKey = scopedKey(keyScope, path)
    const saved = getScrollPosition(vaultId, lookupKey)
    if (!saved || saved.scrollY <= 0) return

    let cancelled = false
    const handle = window.requestAnimationFrame(() => {
      if (cancelled) return
      // Second rAF gives the browser one more frame to stabilize layout
      // for embeds / Shiki-rendered code blocks that paint synchronously
      // but cause subsequent reflow as fonts settle.
      window.requestAnimationFrame(() => {
        if (cancelled) return
        const container = scrollContainerRef?.current ?? null
        const target: ScrollToOptions = {
          top: saved.scrollY,
          left: 0,
          behavior: 'instant',
        }
        if (container) container.scrollTo(target)
        else window.scrollTo(target)
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(handle)
    }
  }, [vaultId, path, restoreToken, scrollContainerRef, keyScope])

  // Listen to scroll and persist on a short debounce. We deliberately do not
  // save on every event — IndexedDB writes are cheap but not free, and the
  // visible behavior is identical with a 250 ms tail.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!vaultId || !path) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const container = scrollContainerRef?.current ?? null
    const scrollSource: HTMLElement | Window = container ?? window
    const readScrollY = (): number =>
      container ? container.scrollTop : window.scrollY

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
        const y = readScrollY()
        const persistKey = scopedKey(keyScope, captured.path)
        void useReaderStore
          .getState()
          .recordScrollPosition(captured.vaultId, persistKey, y)
      }, SCROLL_SAVE_DEBOUNCE_MS)
    }

    scrollSource.addEventListener('scroll', handleScroll, {
      passive: true,
    })
    return () => {
      scrollSource.removeEventListener('scroll', handleScroll)
      if (timer !== null) clearTimeout(timer)
    }
  }, [vaultId, path, scrollContainerRef, keyScope])
}
