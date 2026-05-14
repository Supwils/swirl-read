import type { MouseEvent } from 'react'
import type { VaultId } from '@/core/vault'
import type { FolderColorId } from '@/core/vault'
import { FilePill, type FilePillFile } from './FilePill'
import { pebbleShapeAt } from './pebble-shapes'

export type PebbleSize = 'sm' | 'md' | 'lg'

export interface PebbleFolder {
  /** Vault-relative folder path. `""` is the vault root. */
  path: string
  /** Display name (last path segment). */
  name: string
  /** Stable color bucket from {@link folderColorId}. */
  colorId: FolderColorId
  /** Total children inside this folder (direct files + sub-folders). */
  childCount: number
  /** Direct sub-folder count. */
  childFolders: number
  /** A preview slice of the folder's direct files, in display order. */
  files: FilePillFile[]
  /** "today" / "yesterday" / "3d ago" — left blank when unknown. */
  lastOpened?: string
  /** Free-form folder description, surfaced as italic prose. */
  summary?: string
}

interface PebbleProps {
  vaultId: VaultId
  folder: PebbleFolder
  size: PebbleSize
  shapeIdx: number
  focused?: boolean
  /** Path of the file currently in view, used to highlight one pill. */
  selectedFilePath?: string
  /** Whether `+N more` has been clicked — expanded pebbles show every file. */
  isExpanded?: boolean
  /** Click on the folder title — drill into the folder. */
  onTitleClick?: (folder: PebbleFolder) => void
  /** Click on `+N more` — toggle inline expansion in the same pebble. */
  onMoreToggle?: (folder: PebbleFolder) => void
  onFileContextMenu?: (
    event: MouseEvent<HTMLButtonElement>,
    file: FilePillFile,
    folder: PebbleFolder,
  ) => void
}

const SIZE_TUNINGS: Record<
  PebbleSize,
  {
    title: number
    filesToShow: number
    padding: string
    showSummary: boolean
    showFooter: boolean
  }
> = {
  lg: {
    title: 36,
    filesToShow: 5,
    padding: '26px 32px 22px',
    showSummary: true,
    showFooter: true,
  },
  md: {
    title: 30,
    filesToShow: 4,
    padding: '22px 26px 20px',
    showSummary: true,
    showFooter: true,
  },
  sm: {
    title: 24,
    filesToShow: 3,
    padding: '20px 22px 18px',
    showSummary: false,
    showFooter: false,
  },
}

export function Pebble({
  vaultId,
  folder,
  size,
  shapeIdx,
  focused,
  selectedFilePath,
  isExpanded,
  onTitleClick,
  onMoreToggle,
  onFileContextMenu,
}: PebbleProps) {
  const tuning = SIZE_TUNINGS[size]
  const ink = `var(--f-${folder.colorId}-ink)`
  // `folder.files` carries every direct file in the folder. We slice it
  // here so expanding the pebble is a pure render concern — the data
  // layer doesn't need to know whether the user clicked +more or not.
  const visibleFiles = isExpanded
    ? folder.files
    : folder.files.slice(0, tuning.filesToShow)
  const hiddenFileCount = isExpanded
    ? 0
    : Math.max(0, folder.files.length - tuning.filesToShow)
  // childCount counts files + sub-folders; the hint accounts for
  // sub-folders that don't appear in the file pills row.
  const remaining = hiddenFileCount

  return (
    <div
      className="swirlread-pebble"
      data-size={size}
      data-folder-id={folder.colorId}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: pebbleShapeAt(shapeIdx),
        background: `var(--f-${folder.colorId})`,
        boxShadow:
          'inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 -1px 0 rgb(0 0 0 / 0.06), 0 8px 20px var(--shadow), 0 1px 2px var(--shadow)',
        padding: tuning.padding,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: size === 'lg' ? 8 : 6,
        }}
      >
        <button
          type="button"
          onClick={() => onTitleClick?.(folder)}
          className="swirlread-pebble__title"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            font: 'inherit',
            fontFamily: 'var(--font-serif)',
            fontWeight: 600,
            fontSize: tuning.title,
            color: ink,
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            cursor: onTitleClick ? 'pointer' : 'default',
            textAlign: 'left',
          }}
        >
          {folder.name}
        </button>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: ink,
            opacity: 0.55,
          }}
        >
          {folder.childCount} {folder.childCount === 1 ? 'item' : 'items'}
          {folder.childFolders > 0
            ? ` · ${String(folder.childFolders)} sub`
            : ''}
        </span>
        <div style={{ flex: 1 }} />
        {focused && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: ink,
              borderBottom: `1.5px solid ${ink}`,
              paddingBottom: 1,
              alignSelf: 'flex-end',
            }}
          >
            open
          </span>
        )}
      </header>

      {tuning.showSummary && folder.summary && (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 13.5,
            lineHeight: 1.45,
            color: ink,
            opacity: 0.75,
            margin: '0 0 14px',
            maxWidth: '92%',
          }}
        >
          {folder.summary}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignContent: 'flex-start',
          flex: 1,
          minHeight: 0,
          overflowY: isExpanded ? 'auto' : 'hidden',
        }}
      >
        {visibleFiles.map((file) => (
          <FilePill
            key={file.path}
            vaultId={vaultId}
            file={file}
            folderId={folder.colorId}
            selected={selectedFilePath === file.path}
            onContextMenu={
              onFileContextMenu
                ? (event, pillFile) =>
                    onFileContextMenu(event, pillFile, folder)
                : undefined
            }
          />
        ))}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => onMoreToggle?.(folder)}
            className="swirlread-pebble__more"
            aria-label={`Show ${String(remaining)} more files`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 11px',
              borderRadius: 999,
              border: `1px dashed ${ink}`,
              color: ink,
              opacity: 0.55,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: 11,
              background: 'transparent',
              cursor: onMoreToggle ? 'pointer' : 'default',
            }}
          >
            +{remaining} more
          </button>
        )}
        {isExpanded && folder.files.length > tuning.filesToShow && (
          <button
            type="button"
            onClick={() => onMoreToggle?.(folder)}
            className="swirlread-pebble__more"
            aria-label="Collapse file list"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 11px',
              borderRadius: 999,
              border: `1px dashed ${ink}`,
              color: ink,
              opacity: 0.55,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: 11,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            show less
          </button>
        )}
      </div>

      {tuning.showFooter && (
        <footer
          style={{
            marginTop: 14,
            paddingTop: 10,
            borderTop: `1px solid ${ink}`,
            opacity: 0.85,
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'var(--font-sans)',
            fontSize: 10.5,
            fontWeight: 500,
            color: ink,
            letterSpacing: '0.04em',
          }}
        >
          {folder.lastOpened && (
            <span style={{ opacity: 0.7 }}>opened {folder.lastOpened}</span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ opacity: 0.7 }}>click · right-click for options</span>
        </footer>
      )}
    </div>
  )
}
