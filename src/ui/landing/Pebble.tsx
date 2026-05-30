import type { MouseEvent } from 'react'
import type { VaultId } from '@/core/vault'
import type { FolderColorId } from '@/core/vault'
import { FolderGlyph } from '@/ui/components/FolderGlyph'
import { FilePill, type FilePillFile } from './FilePill'
import { pebbleShapeAt } from './pebble-shapes'

export type PebbleSize = 'sm' | 'md' | 'lg'

/** A direct sub-folder of a pebble, rendered as a navigable chip. */
export interface PebbleSubFolder {
  path: string
  name: string
  colorId: FolderColorId
}

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
  /** Direct sub-folders, rendered as chips above the file pills so the
   *  folder structure is visible without drilling in. Optional so existing
   *  call sites that only carry files keep compiling. */
  subFolders?: PebbleSubFolder[]
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
  /** System / hidden folder — rendered de-emphasized (muted) but still
   *  interactive (right-click, drill). */
  muted?: boolean
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
  /** Right-click anywhere on the card (outside a file pill) — open the
   *  folder context menu. */
  onFolderContextMenu?: (
    event: MouseEvent<HTMLElement>,
    folder: PebbleFolder,
  ) => void
  /** Left-click a sub-folder chip — drill into that sub-folder. */
  onSubFolderClick?: (folder: PebbleSubFolder) => void
  /** Right-click a sub-folder chip — open the folder context menu for it. */
  onSubFolderContextMenu?: (
    event: MouseEvent<HTMLElement>,
    folder: PebbleSubFolder,
  ) => void
}

const SIZE_TUNINGS: Record<
  PebbleSize,
  {
    title: number
    filesToShow: number
    foldersToShow: number
    glyph: number
    padding: string
    showSummary: boolean
    showFooter: boolean
  }
> = {
  lg: {
    title: 36,
    filesToShow: 5,
    foldersToShow: 6,
    glyph: 14,
    padding: '26px 32px 22px',
    showSummary: true,
    showFooter: true,
  },
  md: {
    title: 30,
    filesToShow: 4,
    foldersToShow: 4,
    glyph: 13,
    padding: '22px 26px 20px',
    showSummary: true,
    showFooter: true,
  },
  sm: {
    title: 24,
    filesToShow: 3,
    foldersToShow: 3,
    glyph: 12,
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
  muted = false,
  focused,
  selectedFilePath,
  isExpanded,
  onTitleClick,
  onMoreToggle,
  onFileContextMenu,
  onFolderContextMenu,
  onSubFolderClick,
  onSubFolderContextMenu,
}: PebbleProps) {
  const tuning = SIZE_TUNINGS[size]
  const ink = `var(--f-${folder.colorId}-ink)`
  const subFolders = folder.subFolders ?? []
  // Folders first (structural skeleton), files after (leaves). A single
  // expand toggle reveals BOTH overflow folders and overflow files so the
  // card never stacks two competing "+N more" affordances.
  const visibleFolders = isExpanded
    ? subFolders
    : subFolders.slice(0, tuning.foldersToShow)
  const hiddenFolderCount = isExpanded
    ? 0
    : Math.max(0, subFolders.length - tuning.foldersToShow)
  // `folder.files` carries every direct file in the folder. We slice it
  // here so expanding the pebble is a pure render concern — the data
  // layer doesn't need to know whether the user clicked +more or not.
  const visibleFiles = isExpanded
    ? folder.files
    : folder.files.slice(0, tuning.filesToShow)
  const hiddenFileCount = isExpanded
    ? 0
    : Math.max(0, folder.files.length - tuning.filesToShow)
  // The single "+N more" affordance below the file pills covers both the
  // overflow sub-folder chips and the overflow file pills.
  const remaining = hiddenFileCount + hiddenFolderCount

  return (
    <div
      className="swirlread-pebble"
      data-size={size}
      data-folder-id={folder.colorId}
      data-muted={muted ? 'true' : undefined}
      onContextMenu={
        onFolderContextMenu
          ? (event) => {
              event.preventDefault()
              onFolderContextMenu(event, folder)
            }
          : undefined
      }
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

      {visibleFolders.length > 0 && (
        <div
          className="swirlread-pebble__folders"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 8,
          }}
        >
          {visibleFolders.map((sub) => (
            <button
              key={sub.path}
              type="button"
              className="swirlread-pebble__folder-chip"
              data-folder-id={sub.colorId}
              onClick={() => onSubFolderClick?.(sub)}
              onContextMenu={
                onSubFolderContextMenu
                  ? (event) => {
                      // Stop the bubble so the card-root folder menu (which
                      // targets THIS pebble) doesn't also fire for the chip.
                      event.preventDefault()
                      event.stopPropagation()
                      onSubFolderContextMenu(event, sub)
                    }
                  : undefined
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 11px 4px 8px',
                borderRadius: 999,
                border: `1px solid var(--f-${sub.colorId}-deep)`,
                background: `var(--f-${sub.colorId})`,
                color: `var(--f-${sub.colorId}-ink)`,
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                fontSize: 11.5,
                lineHeight: 1.2,
                cursor: onSubFolderClick ? 'pointer' : 'default',
                maxWidth: '100%',
              }}
            >
              <FolderGlyph id={sub.colorId} size={tuning.glyph} />
              <span
                className="swirlread-pebble__folder-chip-name"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {sub.name}
              </span>
            </button>
          ))}
        </div>
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
                ? (event, pillFile) => {
                    // Keep a pill right-click from also opening the folder menu
                    // attached to the pebble root.
                    event.stopPropagation()
                    onFileContextMenu(event, pillFile, folder)
                  }
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
        {isExpanded &&
          (folder.files.length > tuning.filesToShow ||
            subFolders.length > tuning.foldersToShow) && (
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
