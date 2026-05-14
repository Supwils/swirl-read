import { useNavigate } from 'react-router'
import type { CSSProperties, MouseEvent, KeyboardEvent } from 'react'
import type { VaultId } from '@/core/vault'
import type { FolderColorId } from '@/core/vault'
import { ExtChip } from '@/ui/components/ExtChip'

export interface FilePillFile {
  /** Vault-relative path including any extension. */
  path: string
  /** Filename without extension. */
  name: string
  /** Lowercase extension without leading dot — `"md"`, `"html"`, `""`. */
  ext: string
}

interface FilePillProps {
  vaultId: VaultId
  file: FilePillFile
  folderId: FolderColorId
  selected?: boolean
  onContextMenu?: (
    event: MouseEvent<HTMLButtonElement>,
    file: FilePillFile,
  ) => void
  style?: CSSProperties
}

/**
 * Single file rendered inside a pebble or a shelf row.
 *
 * Click + ⌘-click navigate; the right-click menu is owned by the surrounding
 * surface (PebbleGarden / FileShelf) so menu state survives parent re-renders.
 * Keyboard: Enter + Space activate; the ContextMenu key opens the same menu
 * as the right-click.
 */
export function FilePill({
  vaultId,
  file,
  folderId,
  selected,
  onContextMenu,
  style,
}: FilePillProps) {
  const navigate = useNavigate()
  const ext = file.ext.replace(/^\./, '').toLowerCase()

  const openHere = () => {
    const encoded = file.path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    void navigate(`/app/${vaultId}/${encoded}`)
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    // ⌘+click / Ctrl+click is reserved for split-pane semantics (PR B);
    // for now we navigate in-place so casual clicks behave naturally and
    // the upcoming pane split slots in without re-teaching the gesture.
    openHere()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openHere()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={
        onContextMenu
          ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              onContextMenu(event, file)
            }
          : undefined
      }
      className="swirlread-pebble__file-pill"
      data-selected={selected ? 'true' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '4px 9px 4px 8px',
        background: selected
          ? `var(--f-${folderId}-deep)`
          : 'rgb(255 255 255 / 0.35)',
        border: `1px solid ${selected ? `var(--f-${folderId}-ink)` : 'transparent'}`,
        borderRadius: 999,
        boxShadow: selected
          ? '0 2px 6px var(--shadow)'
          : 'inset 0 -1px 0 rgb(0 0 0 / 0.04)',
        color: `var(--f-${folderId}-ink)`,
        maxWidth: '100%',
        cursor: 'pointer',
        font: 'inherit',
        ...style,
      }}
      title={file.path}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.01em',
          color: `var(--f-${folderId}-ink)`,
          opacity: selected ? 1 : 0.92,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 200,
        }}
      >
        {file.name}
      </span>
      {ext && <ExtChip ext={ext} folderId={folderId} />}
    </button>
  )
}
