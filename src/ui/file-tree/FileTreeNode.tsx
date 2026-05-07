import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ChevronRight,
  FileText,
  FolderClosed,
  FolderOpen,
  Library,
} from 'lucide-react'
import { isWithin } from '@/core/vault'
import type { VaultEntry, VaultId, VaultPath } from '@/core/vault'
import { pickSectionHomeFromEntries } from '@/core/navigation/section-detector'
import { useTabsStore } from '@/stores/tabs-store'
import { getAdapter } from '@/stores/vault-store'
import { getListing, sortEntries } from './file-tree-cache'

export interface FileTreeNodeProps {
  vaultId: VaultId
  entry: VaultEntry
  currentPath: VaultPath
  depth: number
  contentRevision: number
}

export function FileTreeNode({
  vaultId,
  entry,
  currentPath,
  depth,
  contentRevision,
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

  // Auto-expand ancestors of the active file once per (node, currentPath).
  // The ref records the path that triggered the last auto-expand; we only
  // force-expand when the path changes to one that newly makes this node
  // an ancestor. Manual collapses stick until the user navigates elsewhere.
  const lastAutoExpandFor = useRef<VaultPath | null>(null)
  useEffect(() => {
    if (isAncestor && lastAutoExpandFor.current !== currentPath) {
      setExpanded(true)
      lastAutoExpandFor.current = currentPath
    }
  }, [isAncestor, currentPath])

  // Lazy-load children the first time a directory is expanded.
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
  }, [
    vaultId,
    entry.path,
    entry.isDirectory,
    expanded,
    children,
    contentRevision,
  ])

  // Section-home detection — top-level directories only. Listings are
  // cached so an immediate expansion reuses the same promise.
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
        // Silently ignore — a missing section home is non-fatal.
      })
    return () => {
      cancelled = true
    }
  }, [
    vaultId,
    entry.isDirectory,
    entry.path,
    entry.name,
    depth,
    contentRevision,
  ])

  const indent: React.CSSProperties = { paddingLeft: `${depth * 12}px` }
  const isActive = !entry.isDirectory && currentPath === entry.path

  if (entry.isDirectory) {
    const Icon = expanded ? FolderOpen : FolderClosed
    const isSection = depth === 0 && sectionHome !== null
    const sectionActive = isSection && currentPath === sectionHome
    const childList = expanded ? (
      <ul role="group">
        {error && (
          <li
            className="swirlread-file-tree__status"
            style={{ paddingLeft: `${(depth + 1) * 12}px` }}
            role="alert"
          >
            {error}
          </li>
        )}
        {!error && children === null && (
          <li
            className="swirlread-file-tree__status"
            style={{ paddingLeft: `${(depth + 1) * 12}px` }}
          >
            Reading…
          </li>
        )}
        {!error && children !== null && children.length === 0 && (
          <li
            className="swirlread-file-tree__status"
            style={{ paddingLeft: `${(depth + 1) * 12}px` }}
          >
            (empty)
          </li>
        )}
        {!error &&
          children !== null &&
          sortEntries(children).map((child) => (
            <FileTreeNode
              key={`${child.path}:${String(contentRevision)}`}
              vaultId={vaultId}
              entry={child}
              currentPath={currentPath}
              depth={depth + 1}
              contentRevision={contentRevision}
            />
          ))}
      </ul>
    ) : null

    if (isSection && sectionHome) {
      return (
        <li role="treeitem" aria-expanded={expanded}>
          <div
            className={`swirlread-file-tree__row swirlread-file-tree__row--section${
              isAncestor ? ' is-ancestor' : ''
            }${sectionActive ? ' is-active' : ''}`}
            style={indent}
          >
            <button
              type="button"
              className="swirlread-file-tree__chevron-btn"
              onClick={() => setExpanded(!expanded)}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
            >
              <ChevronRight
                className={`swirlread-file-tree__chevron${
                  expanded ? ' is-expanded' : ''
                }`}
                size={12}
                aria-hidden="true"
              />
            </button>
            <Link
              to={`/app/${vaultId}/${sectionHome}`}
              className="swirlread-file-tree__section-link"
              aria-label={`Open ${entry.name} section`}
              aria-current={sectionActive ? 'page' : undefined}
              title={sectionHome}
            >
              <Library
                className="swirlread-file-tree__icon"
                size={14}
                aria-hidden="true"
              />
              <span className="swirlread-file-tree__name">{entry.name}</span>
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
          className={`swirlread-file-tree__row swirlread-file-tree__row--dir${
            isAncestor ? ' is-ancestor' : ''
          }`}
          style={indent}
          onClick={() => setExpanded(!expanded)}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
        >
          <ChevronRight
            className={`swirlread-file-tree__chevron${
              expanded ? ' is-expanded' : ''
            }`}
            size={12}
            aria-hidden="true"
          />
          <Icon
            className="swirlread-file-tree__icon"
            size={14}
            aria-hidden="true"
          />
          <span className="swirlread-file-tree__name">{entry.name}</span>
        </button>
        {childList}
      </li>
    )
  }

  return (
    <li role="treeitem">
      <Link
        to={`/app/${vaultId}/${entry.path}`}
        className={`swirlread-file-tree__row swirlread-file-tree__row--file${
          isActive ? ' is-active' : ''
        }`}
        style={indent}
        aria-current={isActive ? 'page' : undefined}
        onDoubleClick={() => {
          // Double-click pins the resulting tab — mirrors the tab strip's
          // own double-click-to-pin gesture (Cmd-click is reserved by
          // browsers for "open in new tab" and skips the SPA navigation).
          void useTabsStore.getState().pinTab(vaultId, entry.path)
        }}
      >
        <span
          className="swirlread-file-tree__chevron-spacer"
          aria-hidden="true"
        />
        <FileText
          className="swirlread-file-tree__icon"
          size={14}
          aria-hidden="true"
        />
        <span className="swirlread-file-tree__name">{entry.name}</span>
      </Link>
    </li>
  )
}
