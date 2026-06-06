import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Eye, RefreshCw } from 'lucide-react'
import type { VaultEntry, VaultId, VaultPath } from '@/core/vault'
import { useSidebarVisibilityStore } from '@/stores/sidebar-visibility-store'
import { getAdapter, useVaultStore } from '@/stores/vault-store'
import { getListing, sortEntries } from './file-tree-cache'
import { SectionsNav } from './SectionsNav'
import { FileTreeNode } from './FileTreeNode'
import { SidebarContextMenu } from './SidebarContextMenu'

interface FileTreeProps {
  vaultId: VaultId
  /** Path of the document/folder currently in view. `""` = vault root. */
  currentPath: VaultPath
}

interface ContextMenuState {
  x: number
  y: number
  entry: VaultEntry
}

export function FileTree({ vaultId, currentPath }: FileTreeProps): ReactNode {
  const [rootEntries, setRootEntries] = useState<VaultEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contentRevision = useVaultStore(
    (state) => state.contentRevisionByVault[vaultId] ?? 0,
  )
  const refreshVaultContent = useVaultStore(
    (state) => state.refreshVaultContent,
  )
  const hideFromSidebar = useSidebarVisibilityStore((s) => s.hide)
  const resetVisibility = useSidebarVisibilityStore((s) => s.reset)
  // Subscribe to the live count so the toolbar button shows/hides
  // reactively as the user toggles entries.
  const hiddenCount = useSidebarVisibilityStore(
    (s) => s.hiddenByVault[vaultId]?.size ?? 0,
  )
  // Wait for the visibility store to hydrate from Dexie before rendering
  // tree entries — otherwise the user sees their hidden folders flash
  // for a frame between mount and the IDB read landing. The store's
  // `init()` is fired once at app startup from `main.tsx`.
  const visibilityReady = useSidebarVisibilityStore((s) => s.ready)

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, entry: VaultEntry) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({ x: event.clientX, y: event.clientY, entry })
    },
    [],
  )

  useEffect(() => {
    const vault = getAdapter(vaultId)
    if (!vault) {
      setError('Vault unavailable')
      return
    }
    let cancelled = false
    setError(null)
    setRootEntries(null)
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
  }, [vaultId, contentRevision])

  async function handleRefresh(): Promise<void> {
    if (refreshing) return
    setRefreshing(true)
    // Hold the spin animation for at least 500 ms so the click is
    // perceptible. `refreshVaultContent` mostly just invalidates caches
    // and returns within a few ms — without this delay the button looks
    // dead even though it worked.
    const minSpin = new Promise<void>((resolve) => setTimeout(resolve, 500))
    try {
      await Promise.all([refreshVaultContent(vaultId), minSpin])
    } finally {
      setRefreshing(false)
    }
  }

  const toolbar = (
    <div
      className="swirlread-file-tree__toolbar"
      role="group"
      aria-label="File tree controls"
    >
      {hiddenCount > 0 && (
        <button
          type="button"
          className="swirlread-file-tree__view-btn swirlread-file-tree__view-btn--reset"
          title={`Show all hidden items (${String(hiddenCount)})`}
          aria-label={`Show all ${String(hiddenCount)} hidden items`}
          onClick={() => void resetVisibility(vaultId)}
        >
          <Eye size={14} aria-hidden="true" />
          <span className="swirlread-file-tree__reset-count">
            {hiddenCount}
          </span>
        </button>
      )}
      <button
        type="button"
        className="swirlread-file-tree__view-btn swirlread-file-tree__refresh-btn"
        aria-label="Refresh file tree now"
        title="Refresh now (auto-syncs every 30 s while visible)"
        disabled={refreshing}
        onClick={() => {
          void handleRefresh()
        }}
      >
        <RefreshCw
          className={refreshing ? 'is-spinning' : undefined}
          size={14}
          aria-hidden="true"
        />
      </button>
    </div>
  )

  if (error) {
    return (
      <div className="swirlread-file-tree__container">
        {toolbar}
        <div
          className="swirlread-file-tree__status"
          role="alert"
          aria-label="File tree error"
        >
          {error}
        </div>
      </div>
    )
  }

  if (!rootEntries || !visibilityReady) {
    return (
      <div className="swirlread-file-tree__container">
        {toolbar}
        <div className="swirlread-file-tree__status">Reading vault…</div>
      </div>
    )
  }

  return (
    <div className="swirlread-file-tree__container">
      {toolbar}
      <SectionsNav
        vaultId={vaultId}
        currentPath={currentPath}
        contentRevision={contentRevision}
        onContextMenu={handleContextMenu}
      />
      <FilesNav
        vaultId={vaultId}
        currentPath={currentPath}
        rootEntries={sortEntries(rootEntries)}
        contentRevision={contentRevision}
        onContextMenu={handleContextMenu}
      />
      {contextMenu && (
        <SidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={contextMenu.entry.path || contextMenu.entry.name}
          onHide={() => {
            void hideFromSidebar(vaultId, contextMenu.entry.path)
          }}
          onClose={() => {
            setContextMenu(null)
          }}
        />
      )}
    </div>
  )
}

function FilesNav({
  vaultId,
  currentPath,
  rootEntries,
  contentRevision,
  onContextMenu,
}: {
  vaultId: VaultId
  currentPath: VaultPath
  rootEntries: VaultEntry[]
  contentRevision: number
  onContextMenu: (
    event: React.MouseEvent<HTMLElement>,
    entry: VaultEntry,
  ) => void
}): ReactNode {
  return (
    <div className="swirlread-file-tree__files">
      <p className="swirlread-file-tree__section-label">Files</p>
      <ul
        className="swirlread-file-tree"
        role="tree"
        aria-label="Vault contents"
      >
        {rootEntries.map((entry) => (
          <FileTreeNode
            key={`${entry.path}:${String(contentRevision)}`}
            vaultId={vaultId}
            entry={entry}
            currentPath={currentPath}
            depth={0}
            contentRevision={contentRevision}
            onContextMenu={onContextMenu}
          />
        ))}
      </ul>
    </div>
  )
}
