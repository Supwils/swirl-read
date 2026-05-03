import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { List, Network } from 'lucide-react'
import type { VaultEntry, VaultId, VaultPath } from '@/core/vault'
import type { RecentFile, ScrollPosition } from '@/stores/reader-store'
import { useReaderStore } from '@/stores/reader-store'
import { getAdapter } from '@/stores/vault-store'
import { filesForTag } from '@/core/navigation/tag-index'
import type { TagIndex } from '@/core/navigation/tag-index'
import { getTagIndex } from '@/ui/reading-shell/tag-index-cache'
import { getListing, sortEntries } from './file-tree-cache'
import { ContinueAndRecent } from './ContinueAndRecent'
import { SectionsNav } from './SectionsNav'
import { FileTreeNode } from './FileTreeNode'
import { TagFilterBar } from './TagFilterBar'

const GraphView = lazy(() =>
  import('./GraphView').then((m) => ({ default: m.GraphView })),
)

type ViewMode = 'tree' | 'graph'

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
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [activeTag, setActiveTag] = useState<string | null>(null)
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

  const toolbar = (
    <div
      className="swirlread-file-tree__toolbar"
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        className={
          viewMode === 'tree'
            ? 'swirlread-file-tree__view-btn swirlread-file-tree__view-btn--active'
            : 'swirlread-file-tree__view-btn'
        }
        aria-pressed={viewMode === 'tree'}
        title="File tree"
        onClick={() => setViewMode('tree')}
      >
        <List size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={
          viewMode === 'graph'
            ? 'swirlread-file-tree__view-btn swirlread-file-tree__view-btn--active'
            : 'swirlread-file-tree__view-btn'
        }
        aria-pressed={viewMode === 'graph'}
        title="Knowledge graph"
        onClick={() => setViewMode('graph')}
      >
        <Network size={14} aria-hidden="true" />
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

  if (viewMode === 'graph') {
    return (
      <div className="swirlread-file-tree__container swirlread-file-tree__container--graph">
        {toolbar}
        <Suspense
          fallback={
            <p className="swirlread-graph-view__status">Building graph…</p>
          }
        >
          <GraphView vaultId={vaultId} currentPath={currentPath} />
        </Suspense>
      </div>
    )
  }

  if (!rootEntries) {
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
      <TagFilterBar
        vaultId={vaultId}
        activeTag={activeTag}
        onSelect={setActiveTag}
      />
      {activeTag ? (
        <TaggedFilesList
          vaultId={vaultId}
          tag={activeTag}
          currentPath={currentPath}
        />
      ) : (
        <>
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
        </>
      )}
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
    <div className="swirlread-file-tree__files">
      <p className="swirlread-file-tree__section-label">Files</p>
      <ul
        className="swirlread-file-tree"
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

function TaggedFilesList({
  vaultId,
  tag,
  currentPath,
}: {
  vaultId: VaultId
  tag: string
  currentPath: VaultPath
}): ReactNode {
  const [paths, setPaths] = useState<VaultPath[] | null>(null)

  useEffect(() => {
    const vault = getAdapter(vaultId)
    if (!vault) return
    let cancelled = false

    void getTagIndex(vault)
      .then((index: TagIndex) => {
        if (!cancelled) setPaths(filesForTag(index, tag))
      })
      .catch(() => {
        if (!cancelled) setPaths([])
      })

    return () => {
      cancelled = true
    }
  }, [vaultId, tag])

  if (!paths) {
    return (
      <div className="swirlread-tag-results">
        <p className="swirlread-file-tree__status">Loading…</p>
      </div>
    )
  }

  if (paths.length === 0) {
    return (
      <div className="swirlread-tag-results">
        <p className="swirlread-file-tree__status">No files with #{tag}</p>
      </div>
    )
  }

  return (
    <div className="swirlread-tag-results">
      <p className="swirlread-file-tree__section-label">
        #{tag} · {paths.length} file{paths.length !== 1 ? 's' : ''}
      </p>
      <ul className="swirlread-tag-results__list">
        {paths.map((path) => {
          const slash = path.lastIndexOf('/')
          const name = slash === -1 ? path : path.slice(slash + 1)
          const folder = slash === -1 ? '' : path.slice(0, slash)
          const stem = name.includes('.')
            ? name.slice(0, name.lastIndexOf('.'))
            : name
          const isCurrent = path === currentPath
          return (
            <li key={path} className="swirlread-tag-results__item">
              <Link
                to={`/app/${vaultId}/${path}`}
                className={
                  isCurrent
                    ? 'swirlread-tag-results__link swirlread-tag-results__link--current'
                    : 'swirlread-tag-results__link'
                }
              >
                <span className="swirlread-tag-results__name">{stem}</span>
                {folder && (
                  <span className="swirlread-tag-results__folder">
                    {folder}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
