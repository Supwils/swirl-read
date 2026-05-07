import { useEffect, useRef } from 'react'
import { getAdapter, useVaultStore } from '@/stores/vault-store'

const FOCUS_REFRESH_COOLDOWN_MS = 2_000

/**
 * P1 vault content sync: when the user returns to SwirlRead after editing the
 * folder elsewhere, invalidate derived vault caches through the same path as
 * the manual file-tree refresh. Browsers do not expose a portable FSAPI watcher,
 * so this is deliberately focus-driven and throttled.
 */
export function useVaultFocusSync(): void {
  const activeVaultId = useVaultStore((s) => s.activeVaultId)
  const refreshVaultContent = useVaultStore((s) => s.refreshVaultContent)
  const lastRefreshAtRef = useRef(0)
  const inFlightRef = useRef(false)

  useEffect(() => {
    function maybeRefresh(): void {
      if (!activeVaultId) return
      if (document.visibilityState === 'hidden') return
      if (!getAdapter(activeVaultId)) return

      const now = Date.now()
      if (inFlightRef.current) return
      if (now - lastRefreshAtRef.current < FOCUS_REFRESH_COOLDOWN_MS) return

      lastRefreshAtRef.current = now
      inFlightRef.current = true
      void refreshVaultContent(activeVaultId).finally(() => {
        inFlightRef.current = false
      })
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible') maybeRefresh()
    }

    window.addEventListener('focus', maybeRefresh)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('focus', maybeRefresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [activeVaultId, refreshVaultContent])
}
