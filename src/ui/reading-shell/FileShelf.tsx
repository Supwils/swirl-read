/**
 * FileShelf — design-spec left rail for the reading view.
 *
 * Replaces `FileTree.tsx` for the default branch; the legacy tree stays
 * accessible behind `useUIStore.useLegacyTree` for one release window.
 *
 * Four blocks, top → bottom:
 *   1. Vault summary (name + path).
 *   2. Recently opened (top 4 from reader-store).
 *   3. Folders — one row per top-level folder, only one expanded at a time
 *      (persisted on `ui-store.shelfExpandedFolderId` so reload restores
 *      the user's working pane). When expanded the row reveals the
 *      folder's direct files inside a folder-tinted left rail.
 *   4. Jump strip — six tiny pebble bumps, one per folder, for one-click
 *      switching that echoes the Pebble Garden's organic shapes.
 *
 * The shelf reads listings via the same `file-tree-cache` module as the
 * legacy sidebar, so navigating Pebble Garden → file → Workspace shows the
 * shelf without an extra IDB roundtrip.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from 'react'
import { useNavigate } from 'react-router'
import {
  basename,
  folderColorId,
  type FolderColorId,
  type VaultDirectory,
  type VaultId,
} from '@/core/vault'
import { getAdapter, useVaultStore } from '@/stores/vault-store'
import { useReaderStore } from '@/stores/reader-store'
import { useUIStore } from '@/stores/ui-store'
import { getListing, sortEntries } from '@/ui/file-tree/file-tree-cache'
import { FolderGlyph } from '@/ui/components/FolderGlyph'
import { ContextMenu, type ContextMenuFile } from '@/ui/landing/ContextMenu'
import { FolderRow } from './FolderRow'

interface FileShelfProps {
  vaultId: VaultId
  /** Vault-relative path of the document currently in view. */
  currentPath: string
}

interface ShelfFolder {
  path: string
  name: string
  colorId: FolderColorId
  childCount: number
}

function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function FileShelf({ vaultId, currentPath }: FileShelfProps) {
  const contentRevision = useVaultStore(
    (s) => s.contentRevisionByVault[vaultId] ?? 0,
  )
  const recentByVault = useReaderStore((s) => s.recentByVault)
  const recents = useMemo(
    () => recentByVault[vaultId] ?? [],
    [recentByVault, vaultId],
  )
  const expandedFolderId = useUIStore((s) => s.shelfExpandedFolderId)
  const setExpandedFolderId = useUIStore((s) => s.setShelfExpandedFolderId)
  const navigate = useNavigate()

  const [folders, setFolders] = useState<ShelfFolder[] | null>(null)
  const [vaultName, setVaultName] = useState<string>('')
  const [vaultPath, setVaultPath] = useState<string>('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    file: ContextMenuFile
    folderColor: FolderColorId
  } | null>(null)

  useEffect(() => {
    const vault = getAdapter(vaultId)
    if (!vault) {
      setFolders(null)
      return
    }
    setVaultName(vault.name)
    setVaultPath(`vault://${vault.name}`)
    let cancelled = false
    void (async () => {
      try {
        const root = await getListing(vault, '')
        if (cancelled) return
        const directories = sortEntries(root).filter(
          (e): e is VaultDirectory => e.isDirectory,
        )
        setFolders(
          directories.map((dir) => ({
            path: dir.path,
            name: dir.name,
            colorId: folderColorId(dir.path),
            childCount: 0, // hydrated on expand
          })),
        )
      } catch {
        if (!cancelled) setFolders([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vaultId, contentRevision])

  // Top-level toggle: at most one folder expanded at a time so the shelf
  // stays compact. Deeper expansion is owned by each FolderRow's local
  // state (the chevron-toggle parameter is closure-bound to the folder
  // path, so we don't need it here).
  const handleToggleTopLevelFolder = useCallback(
    (folderPath: string) => {
      void setExpandedFolderId(
        expandedFolderId === folderPath ? null : folderPath,
      )
    },
    [expandedFolderId, setExpandedFolderId],
  )

  const handleFileContextMenu = useCallback(
    (
      event: MouseEvent<HTMLButtonElement>,
      file: ContextMenuFile,
      colorId: FolderColorId,
    ) => {
      event.preventDefault()
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        file,
        folderColor: colorId,
      })
    },
    [],
  )

  const handleJumpClick = useCallback(
    (folderPath: string) => {
      void setExpandedFolderId(folderPath)
    },
    [setExpandedFolderId],
  )

  const jumpStrip = useMemo(() => {
    if (!folders) return []
    return folders.slice(0, 6)
  }, [folders])

  return (
    <aside
      className="swirlread-file-shelf"
      aria-label="Vault file shelf"
      data-testid="file-shelf"
    >
      <div className="swirlread-file-shelf__section">
        <div className="swirlread-file-shelf__label">Vault</div>
        <div className="swirlread-file-shelf__vault-name">
          {vaultName || '…'}
        </div>
        <div className="swirlread-file-shelf__vault-path">{vaultPath}</div>
      </div>

      {recents.length > 0 && (
        <div className="swirlread-file-shelf__section">
          <div className="swirlread-file-shelf__label">Recently opened</div>
          <ul className="swirlread-file-shelf__recents">
            {recents.slice(0, 4).map((entry) => {
              const colorId = folderColorId(entry.path)
              const isCurrent = entry.path === currentPath
              return (
                <li key={entry.path}>
                  <button
                    type="button"
                    className="swirlread-file-shelf__recent"
                    data-current={isCurrent ? 'true' : undefined}
                    onClick={() =>
                      void navigate(
                        `/app/${vaultId}/${encodePathForUrl(entry.path)}`,
                      )
                    }
                  >
                    <FolderGlyph id={colorId} size={10} />
                    <span className="swirlread-file-shelf__recent-name">
                      {basename(entry.path)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <hr className="swirlread-file-shelf__divider" />

      <div className="swirlread-file-shelf__section swirlread-file-shelf__folders">
        <div className="swirlread-file-shelf__label">Folders</div>
        {folders === null && (
          <div className="swirlread-file-shelf__status">Reading vault…</div>
        )}
        {folders?.length === 0 && (
          <div className="swirlread-file-shelf__status">No folders yet.</div>
        )}
        {folders?.map((folder) => (
          <FolderRow
            key={folder.path}
            vaultId={vaultId}
            folder={folder}
            expanded={expandedFolderId === folder.path}
            currentPath={currentPath}
            onToggle={() => handleToggleTopLevelFolder(folder.path)}
            depth={0}
            onFileContextMenu={handleFileContextMenu}
          />
        ))}
      </div>

      {jumpStrip.length > 0 && (
        <div className="swirlread-file-shelf__section">
          <div className="swirlread-file-shelf__label">Jump</div>
          <div
            className="swirlread-file-shelf__jump"
            role="group"
            aria-label="Quick folder jump"
          >
            {jumpStrip.map((folder) => (
              <button
                key={folder.path}
                type="button"
                title={folder.name}
                aria-label={`Jump to ${folder.name}`}
                onClick={() => handleJumpClick(folder.path)}
                data-active={
                  expandedFolderId === folder.path ? 'true' : undefined
                }
                className="swirlread-file-shelf__jump-bump"
                style={{
                  background: `var(--f-${folder.colorId})`,
                  borderColor:
                    expandedFolderId === folder.path
                      ? `var(--f-${folder.colorId}-ink)`
                      : 'transparent',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          vaultId={vaultId}
          file={contextMenu.file}
          folderColor={contextMenu.folderColor}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  )
}
