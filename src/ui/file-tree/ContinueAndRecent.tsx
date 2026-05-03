import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { BookOpen, Clock } from 'lucide-react'
import { basename } from '@/core/vault'
import type { VaultId, VaultPath } from '@/core/vault'
import type { RecentFile, ScrollPosition } from '@/stores/reader-store'

interface ContinueAndRecentProps {
  vaultId: VaultId
  currentPath: VaultPath
  recents: RecentFile[]
  scrollByPath: Record<VaultPath, ScrollPosition>
}

export function ContinueAndRecent({
  vaultId,
  currentPath,
  recents,
  scrollByPath,
}: ContinueAndRecentProps): ReactNode {
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
