import { useEffect } from 'react'
import { getAdapter, useVaultStore } from '@/stores/vault-store'

const POLL_INTERVAL_MS = 30_000

/**
 * P3 vault content sync: while the tab is visible, poll the active vault
 * on a slow cadence so files added or removed from disk surface in the
 * file tree (and other revision-keyed surfaces) without requiring the
 * user to alt-tab. The timer is paused while the document is hidden so a
 * background tab is not constantly invalidating caches. Only expanded
 * surfaces actually re-read — the poll just bumps the per-vault content
 * revision through the same path as P0 / P1.
 */
export function useVaultPollSync(): void {
  const activeVaultId = useVaultStore((s) => s.activeVaultId)
  const refreshVaultContent = useVaultStore((s) => s.refreshVaultContent)

  useEffect(() => {
    if (!activeVaultId) return
    let timer: ReturnType<typeof setInterval> | null = null

    function tick(): void {
      if (document.visibilityState !== 'visible') return
      if (!activeVaultId) return
      if (!getAdapter(activeVaultId)) return
      void refreshVaultContent(activeVaultId)
    }

    function start(): void {
      if (timer !== null) return
      timer = setInterval(tick, POLL_INTERVAL_MS)
    }

    function stop(): void {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [activeVaultId, refreshVaultContent])
}
