/**
 * FolderRow — recursive expandable row inside FileShelf.
 *
 * Each row has two click targets:
 *   - `▸ ▾` chevron — toggles expansion of this row in the sidebar (does
 *     NOT navigate). Lets users browse the tree depth without leaving
 *     the current document.
 *   - The folder name button — navigates the main reading area to that
 *     folder's directory route (`/app/:vaultId/<folder/path>`), where
 *     `use-document-loader` renders the existing `DirectoryListing`.
 *
 * Top-level rows take their `expanded` flag + toggle handler from
 * FileShelf so the persisted `ui-store.shelfExpandedFolderId` keeps one
 * row open at a time. Deeper rows manage their own children locally —
 * once the user has drilled in, freely expanding several siblings
 * inside the same parent is the natural reading affordance.
 */

import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  folderColorId,
  type FolderColorId,
  type VaultEntry,
  type VaultId,
} from '@/core/vault'
import { getAdapter, useVaultStore } from '@/stores/vault-store'
import { getListing, sortEntries } from '@/ui/file-tree/file-tree-cache'
import { FolderGlyph } from '@/ui/components/FolderGlyph'
import type { ContextMenuFile } from '@/ui/landing/ContextMenu'
import { pillFromEntry } from './file-shelf-utils'

interface FolderRowProps {
  vaultId: VaultId
  folder: {
    path: string
    name: string
    colorId: FolderColorId
  }
  currentPath: string
  expanded: boolean
  onToggle: () => void
  /** Nesting level — drives the left padding of each row so the tree
   *  shape is legible without redundant border lines per depth. */
  depth: number
  onFileContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    file: ContextMenuFile,
    colorId: FolderColorId,
  ) => void
}

function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function FolderRow({
  vaultId,
  folder,
  currentPath,
  expanded,
  onToggle,
  depth,
  onFileContextMenu,
}: FolderRowProps) {
  const contentRevision = useVaultStore(
    (s) => s.contentRevisionByVault[vaultId] ?? 0,
  )
  const navigate = useNavigate()
  const [entries, setEntries] = useState<VaultEntry[] | null>(null)
  // Children's expansion is local to each FolderRow — once the user has
  // drilled past the top level, sibling expansion is no longer mutually
  // exclusive, so we don't persist these to ui-store.
  const [childExpanded, setChildExpanded] = useState<Set<string>>(
    () => new Set(),
  )

  useEffect(() => {
    if (!expanded) return
    const adapter = getAdapter(vaultId)
    if (!adapter) return
    let cancelled = false
    void (async () => {
      try {
        const list = await getListing(adapter, folder.path)
        if (cancelled) return
        setEntries(sortEntries(list))
      } catch {
        if (!cancelled) setEntries([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [expanded, vaultId, folder.path, contentRevision])

  const toggleChild = useCallback((childPath: string) => {
    setChildExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(childPath)) next.delete(childPath)
      else next.add(childPath)
      return next
    })
  }, [])

  const handleNavigate = useCallback(() => {
    void navigate(`/app/${vaultId}/${encodePathForUrl(folder.path)}`)
  }, [navigate, vaultId, folder.path])

  const fileCount =
    entries?.filter((entry) => !entry.isDirectory).length ?? null
  const isCurrent = currentPath === folder.path

  return (
    <div
      className="swirlread-file-shelf__folder-row"
      data-expanded={expanded}
      data-depth={depth}
    >
      <div
        className="swirlread-file-shelf__folder-header"
        data-current={isCurrent ? 'true' : undefined}
        style={{
          paddingLeft: depth * 12,
          background: expanded ? `var(--f-${folder.colorId})` : undefined,
          color: expanded ? `var(--f-${folder.colorId}-ink)` : undefined,
        }}
      >
        <button
          type="button"
          className="swirlread-file-shelf__chevron"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={
            expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`
          }
        >
          {expanded ? '▾' : '▸'}
        </button>
        <button
          type="button"
          className="swirlread-file-shelf__folder-name-button"
          onClick={handleNavigate}
          title={`Open folder ${folder.path}`}
        >
          <FolderGlyph id={folder.colorId} size={11} />
          <span className="swirlread-file-shelf__folder-name">
            {folder.name}
          </span>
        </button>
        {fileCount !== null && (
          <span className="swirlread-file-shelf__folder-count">
            {fileCount}
          </span>
        )}
      </div>
      {expanded && entries && (
        <ul
          className="swirlread-file-shelf__folder-files"
          style={{ borderLeftColor: `var(--f-${folder.colorId}-deep)` }}
        >
          {entries.map((entry) => {
            if (entry.isDirectory) {
              const childColor = folderColorId(entry.path)
              return (
                <li key={entry.path}>
                  <FolderRow
                    vaultId={vaultId}
                    folder={{
                      path: entry.path,
                      name: entry.name,
                      colorId: childColor,
                    }}
                    currentPath={currentPath}
                    expanded={childExpanded.has(entry.path)}
                    onToggle={() => toggleChild(entry.path)}
                    depth={depth + 1}
                    onFileContextMenu={onFileContextMenu}
                  />
                </li>
              )
            }
            const pill = pillFromEntry(entry)
            if (!pill) return null
            const isActiveFile = entry.path === currentPath
            return (
              <li key={entry.path}>
                <button
                  type="button"
                  className="swirlread-file-shelf__file"
                  data-active={isActiveFile ? 'true' : undefined}
                  onClick={() =>
                    void navigate(
                      `/app/${vaultId}/${encodePathForUrl(entry.path)}`,
                    )
                  }
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onFileContextMenu(event, pill, folder.colorId)
                  }}
                  style={
                    isActiveFile
                      ? {
                          background: `var(--f-${folder.colorId}-deep)`,
                          color: 'var(--paper)',
                        }
                      : {
                          color: `var(--f-${folder.colorId}-ink)`,
                        }
                  }
                >
                  <span className="swirlread-file-shelf__file-name">
                    {pill.name}
                  </span>
                  {pill.ext && (
                    <span className="swirlread-file-shelf__file-ext">
                      .{pill.ext}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
