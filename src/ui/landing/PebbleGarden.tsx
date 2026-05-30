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
  folderWeight,
  isSystemFolder,
  type FolderColorId,
  type VaultDirectory,
  type VaultEntry,
  type VaultFileSystem,
} from '@/core/vault'
import { useVaultStore, getAdapter } from '@/stores/vault-store'
import { ReauthorizeVault } from '@/ui/reading-shell/ReauthorizeVault'
import {
  Pebble,
  type PebbleFolder,
  type PebbleSize,
  type PebbleSubFolder,
} from './Pebble'
import { FilePill, type FilePillFile } from './FilePill'
import { ContextMenu, type ContextMenuFile } from './ContextMenu'

/** Pebbles per page before pagination + "more folders →" handoff. */
const PEBBLES_PER_PAGE = 6

interface FolderProbe extends PebbleFolder {
  /** Direct sub-folder entries from the listing — used so the drilled
   *  view can render each one as its own Pebble without an extra fetch. */
  subFolderEntries: VaultDirectory[]
  /** System / hidden folder (`.git`, `node_modules`, …). Sorted last and
   *  forced to the smallest, muted variant. */
  isSystem: boolean
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

/**
 * Map a folder's recursive descendant FILE count ({@link folderWeight}) to a
 * card size bucket. Thresholds tuned against the live vault where content
 * folders carry dozens of nested notes while leaf folders hold a handful.
 */
function sizeForWeight(weight: number): PebbleSize {
  if (weight >= 40) return 'lg'
  if (weight >= 12) return 'md'
  return 'sm'
}

/**
 * Immediate first-paint size derived from the shallow direct-child count,
 * shown until the recursive {@link folderWeight} resolves and upgrades it.
 * Deliberately conservative so the grid never over-sizes before the real
 * weight lands.
 */
function fallbackSizeForChildCount(count: number): PebbleSize {
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
    // Direct children = files + sub-folders. This drives the human-readable
    // "N items · M sub" label; the SIZE bucket uses the recursive weight.
    childCount: entries.length,
    childFolders: subFolders.length,
    files: pills,
    subFolders: subFolders.map((dir) => ({
      path: dir.path,
      name: dir.name,
      colorId: folderColorId(dir.path),
    })),
    subFolderEntries: subFolders,
    isSystem: isSystemFolder(displayName),
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
    target: ContextMenuFile
    kind: 'file' | 'folder'
    folderColor: FolderColorId
  } | null>(null)
  /** Recursive descendant file count per folder path, resolved lazily after
   *  the shallow probe so the grid paints instantly and upgrades sizes as
   *  each weight lands. */
  const [weights, setWeights] = useState<Map<string, number>>(() => new Map())

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

  // Identity of the resolved folder set (vault + path + folder paths). Drives
  // the weight effect so it fires once per folder set, not on every render.
  const folderListKey =
    state.kind === 'ready'
      ? state.folders.map((folder) => folder.path).join('')
      : ''

  // Progressive weight upgrade: after the shallow probe paints, fetch each
  // (non-system) folder's recursive descendant file count concurrently and
  // fold the results into `weights`. Sizes recompute as each weight resolves.
  useEffect(() => {
    if (!vaultId || state.kind !== 'ready') return
    const vault = getAdapter(vaultId)
    if (!vault) return
    let cancelled = false
    setWeights(new Map())

    // Resolve every (non-system) folder's recursive weight, then commit the
    // results in ONE setState. Two wins over per-folder updates: (1) the grid
    // re-renders ~once instead of N times (no full re-sort storm), and (2) a
    // small concurrency pool caps simultaneous recursive walks so a vault with
    // many top-level folders doesn't fan out unbounded `list()` calls.
    const targets = state.folders.filter((f) => !f.isSystem)
    const POOL = 6
    // `vault` is passed as a typed arg so its non-null narrowing survives
    // into the nested worker closure (TS drops outer-scope narrowing inside
    // hoisted function declarations).
    void (async (activeVault: VaultFileSystem) => {
      const resolved = new Map<string, number>()
      let cursor = 0
      async function worker(): Promise<void> {
        while (cursor < targets.length && !cancelled) {
          const folder = targets[cursor++]!
          try {
            resolved.set(
              folder.path,
              await folderWeight(activeVault, folder.path),
            )
          } catch {
            // Best-effort hint — on failure the folder keeps its fallback size.
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(POOL, targets.length) }, worker),
      )
      if (!cancelled) setWeights(resolved)
    })(vault)

    return () => {
      cancelled = true
    }
    // `folderListKey` captures the folder set; `state.folders` is read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, folderListKey])

  const drillInto = useCallback((folder: PebbleFolder) => {
    setCrumbs((trail) => [...trail, { path: folder.path, name: folder.name }])
    setCurrentPath(folder.path)
  }, [])

  const goToCrumb = useCallback((index: number) => {
    if (index < 0) {
      // -1 means "all folders" / vault root.
      setCrumbs([])
      setCurrentPath('')
      return
    }
    // Functional updater so rapid Back clicks compose against the latest
    // trail rather than a stale render-time snapshot (off-by-one otherwise).
    setCrumbs((trail) => {
      const target = trail[index]
      if (target) setCurrentPath(target.path)
      return target ? trail.slice(0, index + 1) : trail
    })
  }, [])

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
        target: { path: file.path, name: file.name, ext: file.ext },
        kind: 'file',
        folderColor: folder.colorId,
      })
    },
    [],
  )

  const handleFolderContextMenu = useCallback(
    (
      event: MouseEvent<HTMLElement>,
      folder: { path: string; name: string; colorId: FolderColorId },
    ) => {
      event.preventDefault()
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: { path: folder.path, name: folder.name, ext: '' },
        kind: 'folder',
        folderColor: folder.colorId,
      })
    },
    [],
  )

  // Drill into a sub-folder chip. Mirrors `drillInto` but takes the minimal
  // chip shape rather than a full `PebbleFolder`.
  const handleSubFolderClick = useCallback((folder: PebbleSubFolder) => {
    setCrumbs((trail) => [...trail, { path: folder.path, name: folder.name }])
    setCurrentPath(folder.path)
  }, [])

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
            <button
              type="button"
              className="swirlread-pebble-garden__back"
              onClick={() =>
                goToCrumb(crumbs.length === 1 ? -1 : crumbs.length - 2)
              }
            >
              ← Back
            </button>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <button type="button" onClick={() => goToCrumb(-1)}>
              all folders
            </button>
          </p>
        )}
      </section>
    )
  }

  if (!vaultId || state.kind !== 'ready') return null

  const ready = state
  // Size each folder by its recursive weight (resolved lazily into `weights`),
  // falling back to the shallow direct-child count until the real weight lands.
  // System folders are forced to the smallest variant regardless of weight.
  const sizeFor = (folder: FolderProbe): PebbleSize => {
    if (folder.isSystem) return 'sm'
    const weight = weights.get(folder.path)
    return weight === undefined
      ? fallbackSizeForChildCount(folder.childCount)
      : sizeForWeight(weight)
  }
  // Ordering happens BEFORE pagination so the heaviest content folder always
  // lands first (and grabs the 2×2 dense slot). Content folders sort by weight
  // DESC; system folders are pinned LAST, each group stable internally.
  const orderedFolders = [...ready.folders]
    .map((folder, index) => ({ folder, index }))
    .sort((a, b) => {
      if (a.folder.isSystem !== b.folder.isSystem) {
        return a.folder.isSystem ? 1 : -1
      }
      const aw = weights.get(a.folder.path) ?? a.folder.childCount
      const bw = weights.get(b.folder.path) ?? b.folder.childCount
      if (aw !== bw) return bw - aw
      return a.index - b.index
    })
    .map((entry) => entry.folder)

  const totalPages = Math.ceil(orderedFolders.length / PEBBLES_PER_PAGE)
  const pageIndex = Math.min(Math.max(page, 0), Math.max(0, totalPages - 1))
  const pageSlice = orderedFolders.slice(
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
        sizeFor={sizeFor}
        looseFiles={ready.looseFiles}
        hasMorePages={hasMorePages}
        pageIndex={pageIndex}
        totalPages={totalPages}
        expandedFolders={expandedFolders}
        onDrillIn={drillInto}
        onMoreToggle={toggleExpanded}
        onFileContextMenu={handleFileContextMenu}
        onFolderContextMenu={handleFolderContextMenu}
        onSubFolderClick={handleSubFolderClick}
        onSubFolderContextMenu={handleFolderContextMenu}
        onPageChange={setPage}
        onCrumbClick={goToCrumb}
        totalFolderCount={orderedFolders.length}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          vaultId={vaultId}
          file={contextMenu.target}
          kind={contextMenu.kind}
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
  /** Resolve a folder's card-size bucket (weight-driven; system → 'sm'). */
  sizeFor: (folder: FolderProbe) => PebbleSize
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
  onFolderContextMenu: (
    event: MouseEvent<HTMLElement>,
    folder: PebbleFolder,
  ) => void
  onSubFolderClick: (folder: PebbleSubFolder) => void
  onSubFolderContextMenu: (
    event: MouseEvent<HTMLElement>,
    folder: PebbleSubFolder,
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
  sizeFor,
  looseFiles,
  hasMorePages,
  pageIndex,
  totalPages,
  expandedFolders,
  onDrillIn,
  onMoreToggle,
  onFileContextMenu,
  onFolderContextMenu,
  onSubFolderClick,
  onSubFolderContextMenu,
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
        subFolders: [],
        subFolderEntries: [],
        isSystem: false,
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
              <button
                type="button"
                className="swirlread-pebble-garden__back"
                onClick={() =>
                  onCrumbClick(crumbs.length === 1 ? -1 : crumbs.length - 2)
                }
              >
                ← Back
              </button>
              <span style={{ color: 'var(--text-faint)' }}>·</span>
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
            const size: PebbleSize = isMore ? 'sm' : sizeFor(folder)
            return (
              <div
                key={folder.path || `cell-${String(i)}`}
                className="swirlread-pebble-garden__cell"
                data-size={size}
              >
                <Pebble
                  vaultId={vaultId}
                  folder={folder}
                  size={size}
                  muted={folder.isSystem}
                  shapeIdx={i}
                  isExpanded={expandedFolders.has(folder.path)}
                  onTitleClick={
                    isMore
                      ? () => onPageChange(pageIndex + 1)
                      : (clicked) => onDrillIn(clicked)
                  }
                  onMoreToggle={isMore ? undefined : onMoreToggle}
                  onFileContextMenu={onFileContextMenu}
                  onFolderContextMenu={isMore ? undefined : onFolderContextMenu}
                  onSubFolderClick={isMore ? undefined : onSubFolderClick}
                  onSubFolderContextMenu={
                    isMore ? undefined : onSubFolderContextMenu
                  }
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
        <span>click to open</span>
        <span>⌘-click opens right</span>
        <span>right-click for options</span>
        <span>vault is local-only</span>
      </footer>
    </section>
  )
}
