/**
 * FileTree — left-rail navigator over the active vault.
 *
 * Fetches root entries on mount (and on vault switch via `key={vaultId}`),
 * then delegates to the three sub-sections:
 *   - ContinueAndRecent  — RX3 continue + recent rail
 *   - SectionsNav        — top-level section quick-jump links
 *   - FilesNav           — full recursive file tree
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { VaultEntry, VaultId, VaultPath } from '@/core/vault'
import type { RecentFile, ScrollPosition } from '@/stores/reader-store'
import { useReaderStore } from '@/stores/reader-store'
import { getAdapter } from '@/stores/vault-store'
import { getListing, sortEntries } from './file-tree-cache'
import { ContinueAndRecent } from './ContinueAndRecent'
import { SectionsNav } from './SectionsNav'
import { FileTreeNode } from './FileTreeNode'

const EMPTY_RECENT_FILES: RecentFile[] = []
const EMPTY_SCROLL_MAP: Record<VaultPath, ScrollPosition> = {}

interface FileTreeProps {
  vaultId: VaultId
  /** Path of the document/folder currently in view. `""` = vault root. */
  currentPath: VaultPath
}

export function FileTree({ vaultId, currentPath }: FileTreeProps): ReactNode {
  const [rootEntries, setRootEntries] = useState<VaultEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recentFiles = useReaderStore(
    (state) => state.recentByVault[vaultId] ?? EMPTY_RECENT_FILES,
  )
  const scrollByPath = useReaderStore(
    (state) => state.scrollByVault[vaultId] ?? EMPTY_SCROLL_MAP,
  )

  useEffect(() => {
    const vault = getAdapter(vaultId)
    if (!vault) {
      setError('Vault unavailable')
      return
    }
    let cancelled = false
    setError(null)
    getListing(vault, '')
      .then((entries) => {
        if (!cancelled) setRootEntries(entries)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [vaultId])

  if (error) {
    return (
      <div
        className="swilread-file-tree__status"
        role="alert"
        aria-label="File tree error"
      >
        {error}
      </div>
    )
  }

  if (!rootEntries) {
    return <div className="swilread-file-tree__status">Reading vault…</div>
  }

  return (
    <div className="swilread-file-tree__container">
      <ContinueAndRecent
        vaultId={vaultId}
        currentPath={currentPath}
        recents={recentFiles}
        scrollByPath={scrollByPath}
      />
      <SectionsNav vaultId={vaultId} currentPath={currentPath} />
      <FilesNav
        vaultId={vaultId}
        currentPath={currentPath}
        rootEntries={sortEntries(rootEntries)}
      />
    </div>
  )
}

function FilesNav({
  vaultId,
  currentPath,
  rootEntries,
}: {
  vaultId: VaultId
  currentPath: VaultPath
  rootEntries: VaultEntry[]
}): ReactNode {
  return (
    <div className="swilread-file-tree__files">
      <p className="swilread-file-tree__section-label">Files</p>
      <ul
        className="swilread-file-tree"
        role="tree"
        aria-label="Vault contents"
      >
        {rootEntries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            vaultId={vaultId}
            entry={entry}
            currentPath={currentPath}
            depth={0}
          />
        ))}
      </ul>
    </div>
  )
}
