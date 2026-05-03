/**
 * TabStrip — horizontal list of open documents for the active vault.
 *
 * Sits at the top of `.swilread-vault-layout__content`. The URL drives
 * which tab is active; this component reads the location and compares
 * against `useTabsStore.tabsByVault[vaultId]`.
 *
 * Interactions:
 *   - single click  → navigate to tab's path (push history)
 *   - double click  → pin (promote a preview tab)
 *   - middle click  → close
 *   - close button  → close
 *   - drag + drop   → reorder (native HTML5 DnD; zero deps)
 *
 * Hidden in zen mode (CSS rule on body.zen-mode) and when the vault has
 * no tabs (component returns null). The strip itself is `position: sticky`
 * so it stays at the top of the reading column as the article scrolls.
 *
 * Keyboard: tabs are reachable in the natural Tab order. ArrowLeft and
 * ArrowRight move focus among siblings without changing selection.
 * Cmd/Ctrl-W and Cmd/Ctrl-1..9 are handled by `useTabHotkeys` at the
 * AppShell level, not here.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { X } from 'lucide-react'
import { basename, type VaultId, type VaultPath } from '@/core/vault'
import { useTabsStore, type Tab } from '@/stores/tabs-store'

interface TabStripProps {
  vaultId: VaultId
  /** The active file path derived from the URL (router splat). */
  currentPath: VaultPath
}

/** Module-level empty array — referenced as the fallback when the active
 *  vault has no tabs yet. Returning a fresh `[]` from the Zustand
 *  selector each render would trip React 19's infinite-loop detector. */
const EMPTY_TABS: Tab[] = [] as Tab[]

export function TabStrip({ vaultId, currentPath }: TabStripProps): ReactNode {
  const tabs = useTabsStore((s) => s.tabsByVault[vaultId] ?? EMPTY_TABS)
  const closeTab = useTabsStore((s) => s.closeTab)
  const pinTab = useTabsStore((s) => s.pinTab)
  const reorderTabs = useTabsStore((s) => s.reorderTabs)
  const navigate = useNavigate()

  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  // dragOverIdx = tab receiving the hover; dragInsertBefore = whether
  // the cursor is in the LEFT half of that tab (insert before) vs the
  // right half (insert after). Together they render a 2-px insertion
  // line on the correct side rather than an ambiguous whole-tab outline.
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [dragInsertBefore, setDragInsertBefore] = useState(true)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const activeTabRef = useRef<HTMLDivElement | null>(null)

  // Keep the active tab in view when the URL transitions to a path
  // that's already open further down the strip — common after reload
  // (when many tabs hydrate from Dexie) or after a command-palette
  // jump. `inline: 'nearest'` is the magic word: it only scrolls when
  // the tab is actually outside the viewport, so a tab that's already
  // visible doesn't trigger any motion. Audit: A.M1.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [currentPath])

  const onSelect = useCallback(
    (path: VaultPath) => {
      // Only navigate if not already on the path; avoids history-spam
      // when activating an already-active tab.
      if (path === currentPath) return
      void navigate(`/app/${vaultId}/${path}`)
    },
    [vaultId, currentPath, navigate],
  )

  const onClose = useCallback(
    (path: VaultPath, tabIndex: number) => {
      const wasActive = path === currentPath
      void closeTab(vaultId, path)
      if (!wasActive) return
      // Closing the active tab → activate the next-best neighbour.
      // Prefer the tab to the right (matches VS Code); fall back to
      // the tab on the left; if neither exists, navigate to the vault
      // home so the user lands on a coherent surface.
      const next = tabs[tabIndex + 1] ?? tabs[tabIndex - 1]
      if (next) {
        void navigate(`/app/${vaultId}/${next.path}`, { replace: true })
      } else {
        // No neighbour means the user just emptied the workspace. The
        // `empty=1` query opts VaultHome out of its auto-redirect to
        // index.md so we don't silently re-open a tab the user just
        // closed (audit A.H1).
        void navigate(`/app/${vaultId}?empty=1`, { replace: true })
      }
    },
    [closeTab, currentPath, navigate, tabs, vaultId],
  )

  const onMouseDownTab = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, tab: Tab, idx: number) => {
      // Middle-click closes the tab. Browsers fire `auxclick` only after
      // mousedown, so we handle it here for snappier feedback.
      if (event.button === 1) {
        event.preventDefault()
        onClose(tab.path, idx)
      }
    },
    [onClose],
  )

  const onDoubleClickTab = useCallback(
    (tab: Tab) => {
      if (!tab.pinned) {
        void pinTab(vaultId, tab.path)
      }
    },
    [pinTab, vaultId],
  )

  /* ─── Drag-and-drop reordering ───────────────────────────────────── */

  const onDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>, idx: number) => {
      setDragFromIdx(idx)
      event.dataTransfer.effectAllowed = 'move'
      // Some browsers refuse to start a drag without setData.
      event.dataTransfer.setData('text/plain', String(idx))
    },
    [],
  )

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>, idx: number) => {
      if (dragFromIdx === null) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const rect = event.currentTarget.getBoundingClientRect()
      const insertBefore = event.clientX < rect.left + rect.width / 2
      if (dragOverIdx !== idx) setDragOverIdx(idx)
      setDragInsertBefore(insertBefore)
    },
    [dragFromIdx, dragOverIdx],
  )

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>, idx: number) => {
      event.preventDefault()
      if (dragFromIdx !== null && dragFromIdx !== idx) {
        void reorderTabs(vaultId, dragFromIdx, idx)
      }
      setDragFromIdx(null)
      setDragOverIdx(null)
      setDragInsertBefore(true)
    },
    [dragFromIdx, reorderTabs, vaultId],
  )

  const onDragEnd = useCallback(() => {
    setDragFromIdx(null)
    setDragOverIdx(null)
    setDragInsertBefore(true)
  }, [])

  /* ─── Keyboard navigation along the strip ────────────────────────── */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
      const strip = stripRef.current
      if (!strip) return
      const buttons = strip.querySelectorAll<HTMLDivElement>(
        '[data-tab-button="true"]',
      )
      const lastIdx = buttons.length - 1
      let target: HTMLDivElement | null = null
      switch (event.key) {
        case 'ArrowLeft':
          target = buttons[Math.max(0, idx - 1)] ?? null
          break
        case 'ArrowRight':
          target = buttons[Math.min(lastIdx, idx + 1)] ?? null
          break
        case 'Home':
          target = buttons[0] ?? null
          break
        case 'End':
          target = buttons[lastIdx] ?? null
          break
        default:
          return
      }
      if (target) {
        event.preventDefault()
        target.focus()
      }
    },
    [],
  )

  if (tabs.length === 0) return null

  return (
    <div
      ref={stripRef}
      className="swilread-tab-strip swilread-scroll-thin"
      role="tablist"
      aria-label="Open documents"
    >
      {tabs.map((tab, idx) => {
        const active = tab.path === currentPath
        const isDropTarget = dragOverIdx === idx && dragFromIdx !== idx
        const display = basename(tab.path) || tab.path
        // A.L3 — preview tooltip surfaces the double-click-to-pin affordance.
        const tabTitle = tab.pinned
          ? tab.path
          : `${tab.path}\n(preview — double-click to keep)`
        return (
          <div
            key={tab.path}
            ref={active ? activeTabRef : undefined}
            data-tab-button="true"
            role="tab"
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            title={tabTitle}
            draggable
            className={[
              'swilread-tab-strip__tab',
              active ? 'is-active' : '',
              tab.pinned ? 'is-pinned' : 'is-preview',
              isDropTarget
                ? dragInsertBefore
                  ? 'is-drop-before'
                  : 'is-drop-after'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseDown={(e) => {
              onMouseDownTab(e, tab, idx)
            }}
            onClick={(e) => {
              // Plain left-click = activate. Modifier clicks fall through
              // to default behaviour (the tab itself isn't an anchor — no
              // browser default to suppress).
              if (e.button !== 0) return
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
              onSelect(tab.path)
            }}
            onDoubleClick={() => {
              onDoubleClickTab(tab)
            }}
            onDragStart={(e) => {
              onDragStart(e, idx)
            }}
            onDragOver={(e) => {
              onDragOver(e, idx)
            }}
            onDrop={(e) => {
              onDrop(e, idx)
            }}
            onDragEnd={onDragEnd}
            onKeyDown={(e) => {
              onKeyDown(e, idx)
            }}
          >
            <span className="swilread-tab-strip__label">{display}</span>
            <button
              type="button"
              className="swilread-tab-strip__close"
              aria-label={`Close ${display}`}
              onMouseDown={(e) => {
                // Stop the parent's mousedown handler from claiming this
                // as a tab activation or drag start.
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.path, idx)
              }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
