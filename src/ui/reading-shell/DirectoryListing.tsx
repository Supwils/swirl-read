/**
 * DirectoryListing — navigable view of a directory inside the active vault.
 *
 * Used for two purposes today:
 *   1. Vault root, when no home file exists (rendered by VaultHome).
 *   2. Any sub-directory the user navigates to (rendered by DocumentPage
 *      when `vault.stat(path)` reports `isDirectory: true`).
 *
 * Keep the surface minimal — the proper file tree (M4.3) replaces this
 * with a hover panel and lazy expansion. For now it's a flat, click-able
 * listing with breadcrumb navigation back to root.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { FolderClosed, FileText } from 'lucide-react'
import { splitPath } from '@/core/vault'
import type { VaultEntry, VaultId, VaultPath } from '@/core/vault'

interface DirectoryListingProps {
  vaultId: VaultId
  /** Vault-relative path of the directory being listed. `""` = root. */
  path: VaultPath
  entries: VaultEntry[]
  /** Optional badge above the heading (e.g. "VAULT HOME" / "FOLDER"). */
  kicker?: string
  /** Optional override for the heading. Defaults to the directory name. */
  title?: string
  /** Optional intro line shown under the heading. */
  intro?: ReactNode
}

export function DirectoryListing({
  vaultId,
  path,
  entries,
  kicker,
  title,
  intro,
}: DirectoryListingProps): ReactNode {
  const segments = splitPath(path)
  const heading = title ?? segments[segments.length - 1] ?? vaultId
  const sorted = sortEntries(entries)

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 font-serif">
      {kicker && (
        <p
          className="font-serif text-xs uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {kicker}
        </p>
      )}
      <h2
        className="mt-2 break-words font-serif text-3xl font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        {heading}
      </h2>

      <Breadcrumbs vaultId={vaultId} segments={segments} />

      {intro && (
        <p
          className="mt-3 font-serif text-base"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {intro}
        </p>
      )}

      {sorted.length === 0 ? (
        <p
          className="mt-6 font-serif italic"
          style={{ color: 'var(--color-text-muted)' }}
        >
          (this folder is empty)
        </p>
      ) : (
        <ul className="swirlread-directory mt-6">
          {sorted.map((entry) => (
            <DirectoryItem key={entry.path} vaultId={vaultId} entry={entry} />
          ))}
        </ul>
      )}
    </main>
  )
}

function DirectoryItem({
  vaultId,
  entry,
}: {
  vaultId: VaultId
  entry: VaultEntry
}): ReactNode {
  const Icon = entry.isDirectory ? FolderClosed : FileText
  const to = `/app/${vaultId}/${entry.path}`
  return (
    <li className="swirlread-directory__row">
      <Link to={to} className="swirlread-directory__link">
        <Icon
          className="swirlread-directory__icon"
          size={16}
          aria-hidden="true"
        />
        <span className="swirlread-directory__name">{entry.name}</span>
        {!entry.isDirectory && entry.size > 0 && (
          <span
            className="swirlread-directory__meta"
            aria-label={`${entry.size} bytes`}
          >
            {formatSize(entry.size)}
          </span>
        )}
      </Link>
    </li>
  )
}

function Breadcrumbs({
  vaultId,
  segments,
}: {
  vaultId: VaultId
  segments: string[]
}): ReactNode {
  return (
    <nav
      className="swirlread-directory__breadcrumbs mt-3"
      aria-label="Breadcrumb"
    >
      <Link to={`/app/${vaultId}`} className="swirlread-directory__crumb">
        Vault root
      </Link>
      {segments.map((seg, i) => {
        const segPath = segments.slice(0, i + 1).join('/')
        const isLast = i === segments.length - 1
        return (
          <span key={segPath} className="swirlread-directory__crumb-wrap">
            <span className="swirlread-directory__crumb-sep" aria-hidden="true">
              /
            </span>
            {isLast ? (
              <span
                className="swirlread-directory__crumb swirlread-directory__crumb--current"
                aria-current="page"
              >
                {seg}
              </span>
            ) : (
              <Link
                to={`/app/${vaultId}/${segPath}`}
                className="swirlread-directory__crumb"
              >
                {seg}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

function sortEntries(entries: VaultEntry[]): VaultEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
