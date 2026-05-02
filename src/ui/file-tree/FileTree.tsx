/**
 * FileTree — left-rail navigator over the active vault.
 *
 * Two responsibilities:
 *   1. Fetch root entries on mount (and on vault switch via `key={vaultId}`).
 *   2. Render the recursive `<FileTreeNode>` tree, which lazy-fetches
 *      children only when a directory is expanded.
 *
 * State that lives here:
 *   - `rootEntries` — top-level listing
 *   - per-node `expanded` / `children` (in `FileTreeNode`)
 *   - a *cross-render module-level cache* of `vault.list(path)` promises so
 *     repeatedly collapsing/expanding a folder doesn't re-walk it
 *
 * Active-file highlighting and ancestor auto-expansion both derive from
 * the `currentPath` prop (which is the URL splat or the vault root).
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  BookOpen,
  ChevronRight,
  Clock,
  FileText,
  FolderClosed,
  FolderOpen,
  Library,
} from 'lucide-react'
import { basename, isWithin } from '@/core/vault'
import type { VaultEntry, VaultId, VaultPath } from '@/core/vault'
import {
  detectSections,
  pickSectionHomeFromEntries,
  type VaultSection,
} from '@/core/navigation/section-detector'
import {
  useReaderStore,
  type RecentFile,
  type ScrollPosition,
} from '@/stores/reader-store'
import { getAdapter } from '@/stores/vault-store'
import { getListing } from './file-tree-cache'

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

  const sorted = sortEntries(rootEntries)
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
        rootEntries={sorted}
      />
    </div>
  )
}

/* ─── Continue / Recent (RX3) ─────────────────────────────────────── */

function ContinueAndRecent({
  vaultId,
  currentPath,
  recents,
  scrollByPath,
}: {
  vaultId: VaultId
  currentPath: VaultPath
  recents: RecentFile[]
  scrollByPath: Record<VaultPath, ScrollPosition>
}): ReactNode {
  if (recents.length === 0) return null

  // RX3: "Continue" is the most recent file ONLY if it has a saved
  // scroll position — that's what makes it a resume affordance rather
  // than a duplicate of the first Recent row. When no scroll memory
  // exists yet (fresh open), the file just falls into the Recent list.
  const head = recents[0]
  const headScroll = head ? scrollByPath[head.path] : undefined
  const continueFile = headScroll && headScroll.scrollY > 0 ? head : null

  const recentList = continueFile ? recents.slice(1, 5) : recents.slice(0, 5)

  return (
    <>
      {continueFile && (
        <ContinueBlock
          vaultId={vaultId}
          file={continueFile}
          currentPath={currentPath}
        />
      )}
      {recentList.length > 0 && (
        <RecentBlock
          vaultId={vaultId}
          currentPath={currentPath}
          files={recentList}
        />
      )}
    </>
  )
}

function ContinueBlock({
  vaultId,
  file,
  currentPath,
}: {
  vaultId: VaultId
  file: RecentFile
  currentPath: VaultPath
}): ReactNode {
  const isActive = currentPath === file.path
  return (
    <nav className="swilread-file-tree__recent" aria-label="Continue reading">
      <p className="swilread-file-tree__section-label">Continue</p>
      <ul>
        <li>
          <Link
            to={`/app/${vaultId}/${file.path}`}
            className={`swilread-file-tree__row swilread-file-tree__row--continue${
              isActive ? ' is-active' : ''
            }`}
            aria-label={`Resume reading ${file.path}`}
            aria-current={isActive ? 'page' : undefined}
            title={`Resume ${file.path}`}
          >
            <BookOpen
              className="swilread-file-tree__icon"
              size={14}
              aria-hidden="true"
            />
            <span className="swilread-file-tree__name">
              {basename(file.path)}
            </span>
            <span className="swilread-file-tree__resume-tag" aria-hidden="true">
              Resume
            </span>
          </Link>
        </li>
      </ul>
    </nav>
  )
}

function RecentBlock({
  vaultId,
  currentPath,
  files,
}: {
  vaultId: VaultId
  currentPath: VaultPath
  files: RecentFile[]
}): ReactNode {
  return (
    <nav className="swilread-file-tree__recent" aria-label="Recent files">
      <p className="swilread-file-tree__section-label">Recent</p>
      <ul>
        {files.map((file) => {
          const isActive = currentPath === file.path
          return (
            <li key={file.path}>
              <Link
                to={`/app/${vaultId}/${file.path}`}
                className={`swilread-file-tree__row swilread-file-tree__row--recent${
                  isActive ? ' is-active' : ''
                }`}
                aria-label={`Recent file ${file.path}`}
                aria-current={isActive ? 'page' : undefined}
                title={file.path}
              >
                <Clock
                  className="swilread-file-tree__icon"
                  size={13}
                  aria-hidden="true"
                />
                <span className="swilread-file-tree__name">
                  {basename(file.path)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ─── Sections (RX3) ──────────────────────────────────────────────── */

function SectionsNav({
  vaultId,
  currentPath,
}: {
  vaultId: VaultId
  currentPath: VaultPath
}): ReactNode {
  const [sections, setSections] = useState<VaultSection[] | null>(null)

  useEffect(() => {
    const vault = getAdapter(vaultId)
    if (!vault) return
    let cancelled = false
    detectSections(vault)
      .then((found) => {
        if (cancelled) return
        // Only sections that resolved to a home file — empty
        // directories don't earn a top-level entry in the navigator.
        setSections(found.filter((s) => s.home !== null))
      })
      .catch(() => {
        if (!cancelled) setSections([])
      })
    return () => {
      cancelled = true
    }
  }, [vaultId])

  if (!sections || sections.length === 0) return null

  // Stable display order: alphabetical so the rail matches the file
  // tree's directories-first sort.
  const sorted = [...sections].sort((a, b) =>
    a.directory.name.localeCompare(b.directory.name, undefined, {
      sensitivity: 'base',
    }),
  )

  return (
    <nav className="swilread-file-tree__sections" aria-label="Sections">
      <p className="swilread-file-tree__section-label">Sections</p>
      <ul>
        {sorted.map((section) => {
          if (!section.home) return null
          const isActive = currentPath === section.home
          return (
            <li key={section.directory.path}>
              <Link
                to={`/app/${vaultId}/${section.home}`}
                className={`swilread-file-tree__row swilread-file-tree__row--section-link${
                  isActive ? ' is-active' : ''
                }`}
                aria-label={`Open ${section.directory.name} section`}
                aria-current={isActive ? 'page' : undefined}
                title={section.home}
              >
                <Library
                  className="swilread-file-tree__icon"
                  size={14}
                  aria-hidden="true"
                />
                <span className="swilread-file-tree__name">
                  {section.directory.name}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ─── Files (full tree, unchanged behaviour) ─────────────────────── */

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

interface FileTreeNodeProps {
  vaultId: VaultId
  entry: VaultEntry
  currentPath: VaultPath
  depth: number
}

function FileTreeNode({
  vaultId,
  entry,
  currentPath,
  depth,
}: FileTreeNodeProps): ReactNode {
  const isAncestor =
    entry.isDirectory && isWithin(currentPath, entry.path) && currentPath !== ''
  const [expanded, setExpanded] = useState(isAncestor)
  const [children, setChildren] = useState<VaultEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // M4.2: top-level directories may have a "section home" file
  // (`<dirname>-map.md`, `index.md`, …). When present, the directory
  // name itself navigates to that file and the chevron handles expansion.
  const [sectionHome, setSectionHome] = useState<VaultPath | null>(null)

  // Auto-expand ancestors of the active file when navigation changes.
  // We don't auto-collapse — manual user expansion is sticky.
  useEffect(() => {
    if (isAncestor && !expanded) setExpanded(true)
  }, [isAncestor, expanded])

  // Lazy-load children the first time a directory is expanded.
  // Top-level dirs additionally pre-fetch their listing in the
  // section-home effect below so the section affordance can show
  // without forcing the user to expand first.
  useEffect(() => {
    if (!entry.isDirectory || !expanded || children !== null) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setError('Vault unavailable')
      return
    }
    let cancelled = false
    getListing(vault, entry.path)
      .then((entries) => {
        if (!cancelled) setChildren(entries)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, entry.path, entry.isDirectory, expanded, children])

  // Section-home detection — top-level directories only. Runs
  // independently of expansion so the directory name can become a link
  // to the section's `*-map.md` (or fallback) on first paint. Listings
  // are cached, so an immediate user-driven expansion reuses the same
  // promise and pays no extra round trip.
  useEffect(() => {
    if (!entry.isDirectory || depth !== 0) return
    const vault = getAdapter(vaultId)
    if (!vault) return
    let cancelled = false
    getListing(vault, entry.path)
      .then((entries) => {
        if (cancelled) return
        const home = pickSectionHomeFromEntries(entries, entry.name)
        setSectionHome(home)
      })
      .catch(() => {
        // Silently ignore — a missing section home is non-fatal; the
        // dir still renders as a normal expandable folder.
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, entry.isDirectory, entry.path, entry.name, depth])

  const indent: React.CSSProperties = { paddingLeft: `${depth * 12 + 8}px` }
  const isActive = !entry.isDirectory && currentPath === entry.path

  if (entry.isDirectory) {
    const Icon = expanded ? FolderOpen : FolderClosed
    const isSection = depth === 0 && sectionHome !== null
    const sectionActive = isSection && currentPath === sectionHome
    const childList = expanded ? (
      <ul role="group">
        {error && (
          <li
            className="swilread-file-tree__status"
            style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            role="alert"
          >
            {error}
          </li>
        )}
        {!error && children === null && (
          <li
            className="swilread-file-tree__status"
            style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
          >
            Reading…
          </li>
        )}
        {!error && children !== null && children.length === 0 && (
          <li
            className="swilread-file-tree__status"
            style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
          >
            (empty)
          </li>
        )}
        {!error &&
          children !== null &&
          sortEntries(children).map((child) => (
            <FileTreeNode
              key={child.path}
              vaultId={vaultId}
              entry={child}
              currentPath={currentPath}
              depth={depth + 1}
            />
          ))}
      </ul>
    ) : null

    if (isSection && sectionHome) {
      return (
        <li role="treeitem" aria-expanded={expanded}>
          <div
            className={`swilread-file-tree__row swilread-file-tree__row--section${
              isAncestor ? ' is-ancestor' : ''
            }${sectionActive ? ' is-active' : ''}`}
            style={indent}
          >
            <button
              type="button"
              className="swilread-file-tree__chevron-btn"
              onClick={() => setExpanded(!expanded)}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
            >
              <ChevronRight
                className={`swilread-file-tree__chevron${
                  expanded ? ' is-expanded' : ''
                }`}
                size={12}
                aria-hidden="true"
              />
            </button>
            <Link
              to={`/app/${vaultId}/${sectionHome}`}
              className="swilread-file-tree__section-link"
              aria-label={`Open ${entry.name} section`}
              aria-current={sectionActive ? 'page' : undefined}
              title={sectionHome}
            >
              <Library
                className="swilread-file-tree__icon"
                size={14}
                aria-hidden="true"
              />
              <span className="swilread-file-tree__name">{entry.name}</span>
            </Link>
          </div>
          {childList}
        </li>
      )
    }

    return (
      <li role="treeitem" aria-expanded={expanded}>
        <button
          type="button"
          className={`swilread-file-tree__row swilread-file-tree__row--dir${
            isAncestor ? ' is-ancestor' : ''
          }`}
          style={indent}
          onClick={() => setExpanded(!expanded)}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
        >
          <ChevronRight
            className={`swilread-file-tree__chevron${
              expanded ? ' is-expanded' : ''
            }`}
            size={12}
            aria-hidden="true"
          />
          <Icon
            className="swilread-file-tree__icon"
            size={14}
            aria-hidden="true"
          />
          <span className="swilread-file-tree__name">{entry.name}</span>
        </button>
        {childList}
      </li>
    )
  }

  return (
    <li role="treeitem">
      <Link
        to={`/app/${vaultId}/${entry.path}`}
        className={`swilread-file-tree__row swilread-file-tree__row--file${
          isActive ? ' is-active' : ''
        }`}
        style={indent}
        aria-current={isActive ? 'page' : undefined}
      >
        <span
          className="swilread-file-tree__chevron-spacer"
          aria-hidden="true"
        />
        <FileText
          className="swilread-file-tree__icon"
          size={14}
          aria-hidden="true"
        />
        <span className="swilread-file-tree__name">{entry.name}</span>
      </Link>
    </li>
  )
}

function sortEntries(entries: VaultEntry[]): VaultEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}
