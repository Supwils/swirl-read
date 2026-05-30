/**
 * ContextMenu — design-spec right-click menu for file pills.
 *
 * Order is locked by HANDOFF §3.6. The first four actions exist so the user
 * can decide where the document lands without leaving the browse surface;
 * the rest cover the supporting workflow (clipboard, reveal, peek).
 *
 * Some actions are stubbed in PR A and re-pointed in later PRs:
 *   - Open in split pane / Open beside → wired to navigate-here until
 *     panes-store lands; the user gesture is preserved.
 *   - Reveal in folder / Peek preview → disabled state with a tooltip.
 *
 * Closes on Escape, outside click, or after any item is selected.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import type { VaultId } from '@/core/vault'
import { getAdapter } from '@/stores/vault-store'
import { useTabsStore } from '@/stores/tabs-store'
import { usePanesStore, PANE_1, PANE_2 } from '@/stores/panes-store'
import type { FolderColorId } from '@/core/vault'
import { ExtChip } from '@/ui/components/ExtChip'

export interface ContextMenuFile {
  /** Vault-relative path including extension. */
  path: string
  /** Filename without extension (for the header label). */
  name: string
  /** Lowercase extension without leading dot — drives the ExtChip. For a
   *  folder target this is the empty string (no chip is shown). */
  ext: string
}

interface ContextMenuProps {
  x: number
  y: number
  vaultId: VaultId
  file: ContextMenuFile
  folderColor: FolderColorId
  /** Whether the target is a file (default) or a directory. Folders hide
   *  file-only actions (new tab, peek, copy contents) but still support
   *  Open here/left/right because a pane can render a DirectoryListing. */
  kind?: 'file' | 'folder'
  onClose: () => void
}

type Action =
  | {
      kind: 'item'
      key: string
      label: string
      shortcut: string
      disabled?: boolean
      run: () => Promise<void> | void
      reason?: string
    }
  | { kind: 'divider'; key: string }

function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function copyTextSafe(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ContextMenu({
  x,
  y,
  vaultId,
  file,
  folderColor,
  kind = 'file',
  onClose,
}: ContextMenuProps): ReactNode {
  const isFolder = kind === 'folder'
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const [focusedIdx, setFocusedIdx] = useState(0)

  const openHere = useCallback(() => {
    void navigate(`/app/${vaultId}/${encodePathForUrl(file.path)}`)
  }, [navigate, vaultId, file.path])

  const openPinned = useCallback(async () => {
    await useTabsStore.getState().openOrFocus(vaultId, file.path, { pin: true })
    void navigate(`/app/${vaultId}/${encodePathForUrl(file.path)}`)
  }, [navigate, vaultId, file.path])

  /**
   * Open the target in pane 1. In single mode this is the URL-driven pane,
   * so we navigate so the URL → pane-1 sync stays consistent. In dual mode
   * pane 1 is the URL-encoded pane, so we navigate there too — both halves
   * agree on pane 1's doc.
   */
  const openLeft = useCallback(async () => {
    await usePanesStore.getState().openInPane(vaultId, PANE_1, file.path)
    void navigate(`/app/${vaultId}/${encodePathForUrl(file.path)}`)
  }, [navigate, vaultId, file.path])

  /**
   * Open the target in pane 2. Splits single → dual if needed; in dual mode
   * this swaps pane 2's target. We deliberately do NOT navigate: the URL
   * encodes pane 1's doc only, and pane 2 reads from pane state.
   */
  const openRight = useCallback(async () => {
    await usePanesStore.getState().openInPane(vaultId, PANE_2, file.path)
    // Ensure the Workspace is on screen. Invoked from the Pebble Garden the
    // URL is still the vault root, so without navigating the split happens
    // invisibly and the action looks like a no-op. Navigate to pane 1's doc
    // if it has one (the URL encodes pane 1); otherwise to the just-opened
    // doc so the route mounts and the dual layout appears.
    const panes = usePanesStore.getState().panesByVault[vaultId]
    const target = panes?.panes[0]?.currentPath ?? file.path
    void navigate(`/app/${vaultId}/${encodePathForUrl(target)}`)
  }, [navigate, vaultId, file.path])

  const copyPath = useCallback(async () => {
    await copyTextSafe(file.path)
  }, [file.path])

  const copyContents = useCallback(async () => {
    const adapter = getAdapter(vaultId)
    if (!adapter) return
    try {
      const text = await adapter.readText(file.path)
      await copyTextSafe(text)
    } catch {
      /* swallow — the user gets no clipboard, but the menu still closes */
    }
  }, [vaultId, file.path])

  const actions: Action[] = [
    {
      kind: 'item',
      key: 'open-here',
      label: 'Open here',
      shortcut: '↵',
      run: () => openHere(),
    },
    {
      kind: 'item',
      key: 'open-left',
      label: 'Open left',
      shortcut: '⌘↵',
      run: () => openLeft(),
    },
    {
      kind: 'item',
      key: 'open-right',
      label: 'Open right',
      shortcut: '⇧⌘↵',
      run: () => openRight(),
    },
    // File-only: a folder has no single doc to open in a fresh tab.
    ...(isFolder
      ? []
      : [
          {
            kind: 'item' as const,
            key: 'open-new-tab',
            label: 'Open in new tab',
            shortcut: '⌥⌘↵',
            run: () => openPinned(),
          },
        ]),
    { kind: 'divider', key: 'div-1' },
    // File-only: peek + copy-contents act on a single document.
    ...(isFolder
      ? []
      : [
          {
            kind: 'item' as const,
            key: 'peek',
            label: 'Peek preview',
            shortcut: 'Space',
            disabled: true,
            reason: 'Pinned preview lands with the FileShelf step.',
            run: () => undefined,
          },
        ]),
    {
      kind: 'item',
      key: 'reveal',
      label: 'Reveal in folder',
      shortcut: '⌘R',
      disabled: true,
      reason: 'OS reveal needs the desktop adapter (post-Tauri).',
      run: () => undefined,
    },
    {
      kind: 'item',
      key: 'copy-path',
      label: 'Copy path',
      shortcut: '⌘C',
      run: () => copyPath(),
    },
    ...(isFolder
      ? []
      : [
          {
            kind: 'item' as const,
            key: 'copy-contents',
            label: 'Copy contents',
            shortcut: '⇧⌘C',
            run: () => copyContents(),
          },
        ]),
  ]

  const itemIndexes = actions
    .map((a, i) => (a.kind === 'item' && !a.disabled ? i : -1))
    .filter((i) => i >= 0)

  // Reposition before paint (useLayoutEffect) so a menu opened near a
  // viewport edge never flashes off-screen for a frame; then focus the menu
  // so Arrow/Enter/Escape work immediately without a click-in first.
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    let nextLeft = x
    let nextTop = y
    if (x + rect.width + 8 > window.innerWidth) {
      nextLeft = Math.max(8, window.innerWidth - rect.width - 8)
    }
    if (y + rect.height + 8 > window.innerHeight) {
      nextTop = Math.max(8, window.innerHeight - rect.height - 8)
    }
    if (nextLeft !== x || nextTop !== y) {
      setPosition({ left: nextLeft, top: nextTop })
    }
  }, [x, y])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      const node = containerRef.current
      if (!node) return
      if (event.target instanceof Node && node.contains(event.target)) return
      onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [onClose])

  const handleRoot = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusedIdx((prev) => {
        const order = itemIndexes
        const cur = order.indexOf(prev)
        return order[(cur + 1) % order.length] ?? prev
      })
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusedIdx((prev) => {
        const order = itemIndexes
        const cur = order.indexOf(prev)
        return order[(cur - 1 + order.length) % order.length] ?? prev
      })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const action = actions[focusedIdx]
      if (action?.kind === 'item' && !action.disabled) {
        void Promise.resolve(action.run()).finally(onClose)
      }
    }
  }

  const activate = (idx: number) => {
    const action = actions[idx]
    if (action?.kind !== 'item' || action.disabled) return
    void Promise.resolve(action.run()).finally(onClose)
  }

  return createPortal(
    <div
      ref={containerRef}
      role="menu"
      aria-label={`Actions for ${file.path}`}
      className="swirlread-pebble-context-menu"
      style={{ left: position.left, top: position.top }}
      onKeyDown={handleRoot}
      tabIndex={-1}
      onContextMenu={(event) => {
        event.preventDefault()
      }}
    >
      <div className="swirlread-pebble-context-menu__header">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text)',
            fontWeight: 500,
          }}
        >
          {file.name}
          {file.ext ? `.${file.ext}` : ''}
        </span>
        <div style={{ flex: 1 }} />
        {file.ext && <ExtChip ext={file.ext} folderId={folderColor} />}
      </div>
      <ul role="presentation" className="swirlread-pebble-context-menu__list">
        {actions.map((action, idx) => {
          if (action.kind === 'divider') {
            return (
              <li
                key={action.key}
                role="separator"
                className="swirlread-pebble-context-menu__divider"
              />
            )
          }
          const isFocused = idx === focusedIdx
          return (
            <li key={action.key} role="presentation">
              <button
                type="button"
                role="menuitem"
                aria-disabled={action.disabled ? 'true' : undefined}
                disabled={action.disabled}
                data-focused={isFocused ? 'true' : undefined}
                title={action.disabled ? action.reason : undefined}
                onMouseEnter={() => {
                  if (!action.disabled) setFocusedIdx(idx)
                }}
                onClick={() => activate(idx)}
                className="swirlread-pebble-context-menu__item"
              >
                <span>{action.label}</span>
                {/* Disabled items advertise no shortcut — the binding
                    doesn't exist yet, so showing it would mislead. */}
                {!action.disabled && (
                  <span className="swirlread-pebble-context-menu__shortcut">
                    {action.shortcut}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>,
    document.body,
  )
}
