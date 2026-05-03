import { useState, useEffect } from 'react'
import type { VaultEntry, VaultFileSystem } from '@/core/vault'
import { getAdapter, useVaultStore } from '@/stores/vault-store'

export interface AdjacentFiles {
  prev: string | null
  next: string | null
}

const MD_EXTS = new Set(['.md', '.markdown'])

function isMdFile(e: VaultEntry): boolean {
  if (e.isDirectory) return false
  const dot = e.name.lastIndexOf('.')
  return dot !== -1 && MD_EXTS.has(e.name.slice(dot).toLowerCase())
}

function sortByName(entries: VaultEntry[]): VaultEntry[] {
  return [...entries].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}

async function firstMd(
  vault: VaultFileSystem,
  folder: string,
): Promise<string | null> {
  try {
    const entries = await vault.list(folder)
    const files = sortByName(entries.filter(isMdFile))
    const first = files[0]
    if (!first) return null
    return (folder ? folder + '/' : '') + first.name
  } catch {
    return null
  }
}

async function lastMd(
  vault: VaultFileSystem,
  folder: string,
): Promise<string | null> {
  try {
    const entries = await vault.list(folder)
    const files = sortByName(entries.filter(isMdFile))
    const last = files[files.length - 1]
    if (!last) return null
    return (folder ? folder + '/' : '') + last.name
  } catch {
    return null
  }
}

export function useAdjacentFiles(
  vaultId: string | undefined,
  filePath: string,
): AdjacentFiles {
  const [adjacent, setAdjacent] = useState<AdjacentFiles>({
    prev: null,
    next: null,
  })
  const adapterRevision = useVaultStore((s) => s.adapterRevision)

  useEffect(() => {
    if (!vaultId || !filePath) {
      setAdjacent({ prev: null, next: null })
      return
    }
    const vault = getAdapter(vaultId)
    if (!vault) {
      setAdjacent({ prev: null, next: null })
      return
    }
    // Capture as non-null for use inside async closure
    const v: VaultFileSystem = vault

    let cancelled = false

    async function compute(): Promise<void> {
      const parts = filePath.split('/')
      const fileName = parts[parts.length - 1]
      const folderPath = parts.slice(0, -1).join('/')
      const folderPrefix = folderPath ? folderPath + '/' : ''

      let siblings: VaultEntry[]
      try {
        const entries = await v.list(folderPath)
        siblings = sortByName(entries.filter(isMdFile))
      } catch {
        if (!cancelled) setAdjacent({ prev: null, next: null })
        return
      }
      if (cancelled) return

      const idx = siblings.findIndex((e) => e.name === fileName)
      if (idx === -1) {
        if (!cancelled) setAdjacent({ prev: null, next: null })
        return
      }

      const prevSibling = idx > 0 ? siblings[idx - 1] : undefined
      const nextSibling =
        idx < siblings.length - 1 ? siblings[idx + 1] : undefined

      let prevPath: string | null = prevSibling
        ? folderPrefix + prevSibling.name
        : null
      let nextPath: string | null = nextSibling
        ? folderPrefix + nextSibling.name
        : null

      // Cross-folder: only when we have a parent (parts.length >= 2 means
      // the file is inside at least one directory, not at vault root)
      if ((prevPath === null || nextPath === null) && parts.length >= 2) {
        const parentPath = parts.slice(0, -2).join('/')
        const parentPrefix = parentPath ? parentPath + '/' : ''
        const currentFolderName = parts[parts.length - 2]

        let parentEntries: VaultEntry[] = []
        try {
          parentEntries = await v.list(parentPath)
        } catch {
          /* parent not listable — skip cross-folder */
        }
        if (cancelled) return

        const siblingDirs = sortByName(
          parentEntries.filter((e) => e.isDirectory),
        )
        const dirIdx = siblingDirs.findIndex(
          (e) => e.name === currentFolderName,
        )

        if (prevPath === null && idx === 0) {
          const prevDir = dirIdx > 0 ? siblingDirs[dirIdx - 1] : undefined
          if (prevDir) {
            prevPath = await lastMd(v, parentPrefix + prevDir.name)
          }
          // dirIdx === 0: we are the first subdir; parent's own .md files
          // come after all subdirs in DFS order, so nothing precedes us.
        }

        if (cancelled) return

        if (nextPath === null && idx === siblings.length - 1) {
          const nextDir =
            dirIdx >= 0 && dirIdx < siblingDirs.length - 1
              ? siblingDirs[dirIdx + 1]
              : undefined
          if (nextDir) {
            nextPath = await firstMd(v, parentPrefix + nextDir.name)
          } else {
            // No more sibling dirs: fall to parent's own .md files
            const parentMd = sortByName(parentEntries.filter(isMdFile))
            const firstParentMd = parentMd[0]
            if (firstParentMd) {
              nextPath = parentPrefix + firstParentMd.name
            }
          }
        }
      }

      if (!cancelled) setAdjacent({ prev: prevPath, next: nextPath })
    }

    void compute()
    return () => {
      cancelled = true
    }
  }, [vaultId, filePath, adapterRevision])

  return adjacent
}
