import { useMemo } from 'react'
import type { VaultId, VaultPath } from '@/core/vault'
import { useReaderStore } from '@/stores/reader-store'
import { useVaultStore } from '@/stores/vault-store'

export interface RecentItem {
  vaultId: VaultId
  vaultName: string
  path: VaultPath
  openedAt: Date
  href: string
}

/**
 * Flatten the per-vault recent map into a single recency-ordered list,
 * decorated with vault names so the secondary line is meaningful when
 * multiple vaults are registered.
 */
export function useFlatRecents(): RecentItem[] {
  const recentByVault = useReaderStore((state) => state.recentByVault)
  const registeredVaults = useVaultStore((state) => state.registeredVaults)

  return useMemo(() => {
    const nameById = new Map<VaultId, string>(
      registeredVaults.map((v) => [v.id, v.name]),
    )
    const flat: RecentItem[] = []
    for (const [vaultId, files] of Object.entries(recentByVault)) {
      for (const file of files) {
        flat.push({
          vaultId,
          vaultName: nameById.get(vaultId) ?? vaultId,
          path: file.path,
          openedAt: file.openedAt,
          href: `/app/${vaultId}/${file.path}`,
        })
      }
    }
    flat.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
    // Cap at 30 — `recentByVault` is already capped per-vault but we
    // bound the cross-vault list too.
    return flat.slice(0, 30)
  }, [recentByVault, registeredVaults])
}
