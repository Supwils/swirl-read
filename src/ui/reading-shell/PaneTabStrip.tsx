/**
 * PaneTabStrip — lightweight per-pane tab row used in dual-pane Workspace.
 *
 * Tabs are stored at vault level (`useTabsStore`); this strip filters that
 * shared list down to a single pane's perspective. Clicking a tab here
 * sets the destination pane's `currentPath` via `panes-store` — no URL
 * navigation, no global active-pane reshuffling — so each pane can
 * independently surface a different document from the same open set.
 *
 * In single mode the chrome's full TabStrip handles everything; this
 * compact variant only mounts when the vault is in dual mode (Workspace
 * decides that gating).
 */

import { useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { X } from 'lucide-react'
import { basename, type VaultId, type VaultPath } from '@/core/vault'
import { useTabsStore, type Tab } from '@/stores/tabs-store'
import { usePanesStore, PANE_1, type PaneId } from '@/stores/panes-store'

interface PaneTabStripProps {
  vaultId: VaultId
  paneId: PaneId
  currentPath: VaultPath | null
  /** Whether this pane is currently the active one in panes-store. We
   *  only navigate the browser URL when the active pane changes a tab,
   *  so the URL keeps reflecting the focused document. */
  isActive: boolean
}

const EMPTY_TABS: Tab[] = [] as Tab[]

function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function PaneTabStrip({
  vaultId,
  paneId,
  currentPath,
  isActive,
}: PaneTabStripProps): ReactNode {
  const tabs = useTabsStore((s) => s.tabsByVault[vaultId] ?? EMPTY_TABS)
  const navigate = useNavigate()

  const handleTabClick = useCallback(
    (path: VaultPath) => {
      const store = usePanesStore.getState()
      void store.setCurrentPath(vaultId, paneId, path)
      void store.setActivePane(vaultId, paneId)
      // Only the active pane drives the URL; keeping pane 1 (the
      // URL-driven pane) in sync covers the common case while leaving
      // pane 2's URL untouched until the user focuses it.
      if (isActive || paneId === PANE_1) {
        void navigate(`/app/${vaultId}/${encodePathForUrl(path)}`)
      }
    },
    [vaultId, paneId, navigate, isActive],
  )

  const handleClose = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, path: VaultPath) => {
      event.stopPropagation()
      // Closing a tab pops it from the vault-wide tabs-store; both panes
      // see the change. If the pane was showing that file, fall back to
      // a neighbouring tab so we don't leave the pane staring at a
      // missing document.
      void useTabsStore.getState().closeTab(vaultId, path)
      if (currentPath === path) {
        const remaining = tabs.filter((t) => t.path !== path)
        const next = remaining[0]?.path ?? null
        const store = usePanesStore.getState()
        void store.setCurrentPath(vaultId, paneId, next)
        if (next && (isActive || paneId === PANE_1)) {
          void navigate(`/app/${vaultId}/${encodePathForUrl(next)}`)
        }
      }
    },
    [vaultId, paneId, currentPath, tabs, navigate, isActive],
  )

  if (tabs.length === 0) return null

  return (
    <div
      className="swirlread-pane-tabs"
      role="tablist"
      aria-label={`Tabs in ${paneId}`}
    >
      {tabs.map((tab) => {
        const isCurrent = tab.path === currentPath
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isCurrent}
            className="swirlread-pane-tabs__tab"
            data-current={isCurrent ? 'true' : undefined}
            data-pinned={tab.pinned ? 'true' : undefined}
            title={tab.path}
          >
            <button
              type="button"
              className="swirlread-pane-tabs__label-button"
              onClick={() => handleTabClick(tab.path)}
              onAuxClick={(event) => {
                if (event.button === 1) handleClose(event, tab.path)
              }}
            >
              {basename(tab.path) || tab.path}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.path}`}
              className="swirlread-pane-tabs__close"
              onClick={(event) => handleClose(event, tab.path)}
            >
              <X size={11} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
