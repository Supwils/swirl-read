import { createContext } from 'react'
import type { WikilinkIndex } from '@/core/navigation/wikilink-resolver'
import type { VaultId, VaultPath } from '@/core/vault'

export interface WikilinkContextValue {
  vaultId: VaultId
  /** Path of the document containing the wikilink (used for relative resolution). */
  currentPath: VaultPath
  /** Pre-built basename → paths index for the current vault. */
  index: WikilinkIndex | null
}

export const WikilinkContext = createContext<WikilinkContextValue | null>(null)
