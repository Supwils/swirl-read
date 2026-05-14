import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from 'react'
import { useParams } from 'react-router'
import {
  basename,
  extname,
  folderColorId,
  type FolderColorId,
  type VaultDirectory,
  type VaultEntry,
  type VaultFileSystem,
} from '@/core/vault'
import { useVaultStore, getAdapter } from '@/stores/vault-store'
import { ReauthorizeVault } from '@/ui/reading-shell/ReauthorizeVault'
import { Pebble, type PebbleFolder, type PebbleSize } from './Pebble'
import { FilePill, type FilePillFile } from './FilePill'
import { ContextMenu } from './ContextMenu'

/** Pebbles per page before pagination + "more folders →" handoff. */
const PEBBLES_PER_PAGE = 6

interface FolderProbe extends PebbleFolder {
  /** Direct sub-folder entries from the listing — used so the drilled
   *  view can render each one as its own Pebble without an extra fetch. */
  subFolderEntries: VaultDirectory[]
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ready'
      vaultName: string
      currentPath: string
      folders: FolderProbe[]
      /** Files that live directly under `currentPath`. Surfaced in the
       *  drilled view as a flat pill row below the sub-folder grid. */
      looseFiles: FilePillFile[]
    }
  | { kind: 'empty'; vaultName: string }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

function fileEntryToPill(entry: VaultEntry): FilePillFile | null {
  if (entry.isDirectory) return null
  const ext = extname(entry.path).replace(/^\./, '')
  const name = ext
    ? entry.name.slice(0, entry.name.length - (ext.length + 1))
    : entry.name
  return { path: entry.path, name, ext }
}

function sizeForChildCount(count: number): PebbleSize {
  if (count >= 10) return 'lg'
  if (count >= 4) return 'md'
  return 'sm'
}

/**
 * Probe a folder: list its direct entries, classify into files +
 * sub-folders, and pack into a `FolderProbe` ready for the Pebble grid.
 * The probe is shallow — we don't recurse into sub-folders here; the
 * user drills in one level at a time, fetching the next layer lazily.
 */
async function probeFolder(
  vault: VaultFileSystem,
  directoryPath: string,
  displayName: string,
): Promise<FolderProbe> {
  const entries = await vault.list(directoryPath)
  const subFolders = entries.filter((e): e is VaultDirectory => e.isDirectory)
  const pills: FilePillFile[] = []
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const pill = fileEntryToPill(entry)
    if (pill) pills.push(pill)
  }
  return {
    path: directoryPath,
    name: displayName,
    colorId: folderColorId(directoryPath),
    // Total children = files + sub-folders; lets the size heuristic
    // reflect the folder's true breadth, not just its file count.
    childCount: entries.length,
    childFolders: subFolders.length,
    files: pills,
    subFolderEntries: subFolders,
  }
}

export function PebbleGarden() {
  const { vaultId } = useParams<{ vaultId: string }>()
  const contentRevision = useVaultStore((s) =>
    vaultId ? (s.contentRevisionByVault[vaultId] ?? 0) : 0,
  )
  const adapterRevision = useVaultStore((s) => s.adapterRevision)
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  // Vault-root for the empty path, or a sub-folder path for drilled
  // navigation. Updated on title-click; reset by the breadcrumb.
  const [currentPath, setCurrentPath] = useState<string>('')
  // Trail of drilled folders. The first crumb is always "all folders"
  // (the vault root); subsequent crumbs are each level the user
  // clicked through, in order.
  const [crumbs, setCrumbs] = useState<{ path: string; name: string }[]>([])
  const [page, setPage] = useState(0)
  /** Set of folder paths whose `+N more` is expanded. Local to this
   *  surface only — not persisted, because the expanded state is a
   *  per-visit reading affordance, not a per-vault preference. */
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  )
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    file: FilePillFile
    folderColor: FolderColorId
  } | null>(null)

  useEffect(() => {
    if (!vaultId) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setState({ kind: 'missing' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    setPage(0)
    // Reset inline expansion every time the user navigates so the next
    // pebble grid starts uncluttered.
    setExpandedFolders(new Set())

    void (async () => {
      try {
        const entries = await vault.list(currentPath)
        if (cancelled) return
        const directories = entries.filter(
          (entry): entry is VaultDirectory => entry.isDirectory,
        )
        const looseFiles: FilePillFile[] = []
        for (const entry of entries) {
          if (entry.isDirectory) continue
          const pill = fileEntryToPill(entry)
          if (pill) looseFiles.push(pill)
        }
        if (directories.length === 0 && looseFiles.length === 0) {
          setState({ kind: 'empty', vaultName: vault.name })
          return
        }
        const probed = await Promise.all(
          directories.map((dir) => probeFolder(vault, dir.path, dir.name)),
        )
        if (cancelled) return
        setState({
          kind: 'ready',
          vaultName: vault.name,
          currentPath,
          folders: probed,
          looseFiles,
        })
      } catch (err: unknown) {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [vaultId, contentRevision, adapterRevision, currentPath])

  const drillInto = useCallback((folder: PebbleFolder) => {
    setCrumbs((trail) => [...trail, { path: folder.path, name: folder.name }])
    setCurrentPath(folder.path)
  }, [])

  const goToCrumb = useCallback(
    (index: number) => {
      if (index < 0) {
        // -1 means "all folders" / vault root.
        setCrumbs([])
        setCurrentPath('')
        return
      }
      const target = crumbs[index]
      if (!target) return
      setCrumbs(crumbs.slice(0, index + 1))
      setCurrentPath(target.path)
    },
    [crumbs],
  )

  const toggleExpanded = useCallback((folder: PebbleFolder) => {
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (next.has(folder.path)) next.delete(folder.path)
      else next.add(folder.path)
      return next
    })
  }, [])

  const handleFileContextMenu = useCallback(
    (
      event: MouseEvent<HTMLButtonElement>,
      file: FilePillFile,
      folder: PebbleFolder,
    ) => {
      event.preventDefault()
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        file,
        folderColor: folder.colorId,
      })
    },
    [],
  )

  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <section className="swirlread-pebble-garden">
        <div className="swirlread-pebble-garden__masthead">
          <div>
            <div className="swirlread-pebble-garden__kicker">Vault</div>
            <h1 className="swirlread-pebble-garden__title">Reading vault…</h1>
          </div>
        </div>
      </section>
    )
  }

  if (state.kind === 'missing' && vaultId) {
    return (
      <section className="swirlread-pebble-garden">
        <div className="swirlread-pebble-garden__masthead">
          <div>
            <div className="swirlread-pebble-garden__kicker">Vault</div>
            <h1 className="swirlread-pebble-garden__title">
              Vault unavailable
            </h1>
          </div>
        </div>
        <div style={{ padding: '0 48px 32px' }}>
          <ReauthorizeVault vaultId={vaultId} />
        </div>
      </section>
    )
  }

  if (state.kind === 'error') {
    return (
      <section className="swirlread-pebble-garden">
        <div className="swirlread-pebble-garden__masthead">
          <div>
            <div className="swirlread-pebble-garden__kicker">Vault</div>
            <h1 className="swirlread-pebble-garden__title">
              Couldn&rsquo;t read this vault
            </h1>
          </div>
        </div>
        <p className="swirlread-pebble-garden__error" role="alert">
          {state.message}
        </p>
      </section>
    )
  }

  if (state.kind === 'empty') {
    return (
      <section className="swirlread-pebble-garden">
        <div className="swirlread-pebble-garden__masthead">
          <div>
            <div className="swirlread-pebble-garden__kicker">Vault</div>
            <h1 className="swirlread-pebble-garden__title">
              {state.vaultName}
            </h1>
          </div>
        </div>
        <p className="swirlread-pebble-garden__status">
          {currentPath
            ? `Folder “${basename(currentPath)}” is empty.`
            : 'This vault is empty. Drop some Markdown into the folder and refresh.'}
        </p>
        {crumbs.length > 0 && (
          <p
            className="swirlread-pebble-garden__breadcrumb"
            style={{ padding: '0 48px 24px' }}
          >
            <button type="button" onClick={() => goToCrumb(-1)}>
              ← all folders
            </button>
          </p>
        )}
      </section>
    )
  }

  if (!vaultId || state.kind !== 'ready') return null

  const ready = state
  const totalPages = Math.ceil(ready.folders.length / PEBBLES_PER_PAGE)
  const pageIndex = Math.min(Math.max(page, 0), Math.max(0, totalPages - 1))
  const pageSlice = ready.folders.slice(
    pageIndex * PEBBLES_PER_PAGE,
    (pageIndex + 1) * PEBBLES_PER_PAGE,
  )
  const hasMorePages = totalPages > 1

  return (
    <>
      <PebbleGardenView
        vaultId={vaultId}
        vaultName={ready.vaultName}
        crumbs={crumbs}
        folders={pageSlice}
        looseFiles={ready.looseFiles}
        hasMorePages={hasMorePages}
        pageIndex={pageIndex}
        totalPages={totalPages}
        expandedFolders={expandedFolders}
        onDrillIn={drillInto}
        onMoreToggle={toggleExpanded}
        onFileContextMenu={handleFileContextMenu}
        onPageChange={setPage}
        onCrumbClick={goToCrumb}
        totalFolderCount={ready.folders.length}
      />
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
    </>
  )
}

interface ViewProps {
  vaultId: string
  vaultName: string
  crumbs: { path: string; name: string }[]
  folders: FolderProbe[]
  looseFiles: FilePillFile[]
  hasMorePages: boolean
  pageIndex: number
  totalPages: number
  expandedFolders: Set<string>
  onDrillIn: (folder: PebbleFolder) => void
  onMoreToggle: (folder: PebbleFolder) => void
  onFileContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    file: FilePillFile,
    folder: PebbleFolder,
  ) => void
  onPageChange: (page: number) => void
  onCrumbClick: (index: number) => void
  totalFolderCount: number
}

function PebbleGardenView({
  vaultId,
  vaultName,
  crumbs,
  folders,
  looseFiles,
  hasMorePages,
  pageIndex,
  totalPages,
  expandedFolders,
  onDrillIn,
  onMoreToggle,
  onFileContextMenu,
  onPageChange,
  onCrumbClick,
  totalFolderCount,
}: ViewProps) {
  const cells = useMemo(() => {
    if (folders.length === 0) return []
    const list = [...folders]
    if (hasMorePages && pageIndex + 1 < totalPages) {
      const remaining = totalFolderCount - (pageIndex + 1) * PEBBLES_PER_PAGE
      // Synthetic "more folders →" tile lets users page through deep
      // vaults without leaving the surface. Its color is fixed; users
      // never see two pages share the same color signature anyway.
      list[list.length - 1] = {
        path: '__more__',
        name: 'more folders →',
        colorId: 'knowledge',
        childCount: Math.max(0, remaining),
        childFolders: 0,
        files: [],
        subFolderEntries: [],
        summary: `Page ${String(pageIndex + 2)} of ${String(totalPages)}.`,
      } satisfies FolderProbe
    }
    return list
  }, [folders, hasMorePages, pageIndex, totalPages, totalFolderCount])

  const inDrilledView = crumbs.length > 0
  const headingLabel = inDrilledView
    ? (crumbs[crumbs.length - 1]?.name ?? vaultName)
    : vaultName

  return (
    <section className="swirlread-pebble-garden">
      <header className="swirlread-pebble-garden__masthead">
        <div>
          <div className="swirlread-pebble-garden__kicker">
            {inDrilledView ? 'Folder' : 'Vault'} · {totalFolderCount}{' '}
            {totalFolderCount === 1 ? 'folder' : 'folders'}
          </div>
          <h1 className="swirlread-pebble-garden__title">{headingLabel}</h1>
          {inDrilledView && (
            <p className="swirlread-pebble-garden__breadcrumb">
              <button type="button" onClick={() => onCrumbClick(-1)}>
                {vaultName}
              </button>
              {crumbs.map((crumb, idx) => (
                <span key={crumb.path}>
                  <span style={{ color: 'var(--text-faint)' }}>/</span>
                  {idx === crumbs.length - 1 ? (
                    <span>{crumb.name}</span>
                  ) : (
                    <button type="button" onClick={() => onCrumbClick(idx)}>
                      {crumb.name}
                    </button>
                  )}
                </span>
              ))}
            </p>
          )}
        </div>
      </header>

      {cells.length > 0 && (
        <div
          className="swirlread-pebble-garden__grid"
          data-layout={cells.length >= 6 ? 'dense' : 'sparse'}
        >
          {cells.map((folder, i) => {
            const isMore = folder.path === '__more__'
            return (
              <div
                key={folder.path || `cell-${String(i)}`}
                className={`swirlread-pebble-garden__cell swirlread-pebble-garden__cell--${String(
                  i,
                )}`}
              >
                <Pebble
                  vaultId={vaultId}
                  folder={folder}
                  size={isMore ? 'sm' : sizeForChildCount(folder.childCount)}
                  shapeIdx={i}
                  isExpanded={expandedFolders.has(folder.path)}
                  onTitleClick={
                    isMore
                      ? () => onPageChange(pageIndex + 1)
                      : (clicked) => onDrillIn(clicked)
                  }
                  onMoreToggle={isMore ? undefined : onMoreToggle}
                  onFileContextMenu={onFileContextMenu}
                />
              </div>
            )
          })}
        </div>
      )}

      {looseFiles.length > 0 && (
        <div className="swirlread-pebble-garden__loose">
          <div className="swirlread-pebble-garden__kicker">
            Files in this folder
          </div>
          <div className="swirlread-pebble-garden__loose-files">
            {looseFiles.map((file) => {
              const colorId = inDrilledView
                ? folderColorId(crumbs[crumbs.length - 1]!.path)
                : folderColorId('')
              return (
                <FilePill
                  key={file.path}
                  vaultId={vaultId}
                  file={file}
                  folderId={colorId}
                  onContextMenu={(event, pill) =>
                    onFileContextMenu(event, pill, {
                      path: inDrilledView
                        ? crumbs[crumbs.length - 1]!.path
                        : '',
                      name: headingLabel,
                      colorId,
                      childCount: looseFiles.length,
                      childFolders: 0,
                      files: looseFiles,
                    })
                  }
                />
              )
            })}
          </div>
        </div>
      )}

      <footer className="swirlread-pebble-garden__footer">
        <span>↵ open</span>
        <span>⌘↵ split (coming)</span>
        <span>space peek (coming)</span>
        <span>vault is local-only</span>
      </footer>
    </section>
  )
}
