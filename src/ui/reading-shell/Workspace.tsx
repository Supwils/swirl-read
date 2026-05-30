/**
 * Workspace — single|dual pane wrapper for the reading view.
 *
 * Replaces a bare `<DocumentPage />` at `/app/:vaultId/*`. In single mode
 * it forwards rendering to a single `<DocumentPage />` so window-scroll
 * scroll memory, TOC publication, and external-change detection all work
 * exactly as they did before. In dual mode it mounts a second pane next
 * to it; each pane gets its own scrollable container and a paneId-scoped
 * scroll memory key.
 *
 * URL contract: only pane 1's path is encoded in the URL (the splat).
 * Pane 2 is restored from the Dexie `panes` row on reload. This keeps
 * sharable links sane — copying the URL always lands the recipient on
 * the active document, never on a half-broken dual-pane state they
 * didn't ask for.
 */

import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useUIStore } from '@/stores/ui-store'
import {
  PANE_1,
  PANE_2,
  usePanesStore,
  type PaneId,
} from '@/stores/panes-store'
import { usePaneHotkeys } from '@/app/use-pane-hotkeys'
import { confirmLeaveIfDirty } from '@/app/use-dirty-navigation-guard'
import { useEditorStore } from '@/stores/editor-store'
import { DocumentPage } from './DocumentPage'
import { PaneTabStrip } from './PaneTabStrip'
import { Splitter } from './Splitter'

function encodePathForUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

interface PaneBodyProps {
  vaultId: string
  filePath: string
  paneId: PaneId
  isActive: boolean
  onFocus: () => void
  onClose?: () => void
  onExpand?: () => void
  showControls: boolean
  isUrlDriven: boolean
}

function PaneBody({
  vaultId,
  filePath,
  paneId,
  isActive,
  onFocus,
  onClose,
  onExpand,
  showControls,
  isUrlDriven,
}: PaneBodyProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  return (
    <section
      className="swirlread-workspace__pane"
      data-pane-id={paneId}
      data-active={isActive ? 'true' : undefined}
      onMouseDown={onFocus}
    >
      {showControls && (
        <header className="swirlread-workspace__pane-head">
          <span className="swirlread-workspace__pane-label">
            {paneId === PANE_1 ? 'Pane 1' : 'Pane 2'}
          </span>
          <PaneTabStrip
            vaultId={vaultId}
            paneId={paneId}
            currentPath={filePath || null}
            isActive={isActive}
          />
          <div className="swirlread-workspace__pane-controls">
            {onExpand && (
              <button
                type="button"
                aria-label="Expand pane"
                title="Expand to single pane"
                onClick={onExpand}
              >
                ⤢
              </button>
            )}
            {onClose && (
              <button
                type="button"
                aria-label="Close pane"
                title="Close pane"
                onClick={onClose}
              >
                ×
              </button>
            )}
          </div>
        </header>
      )}
      <div className="swirlread-workspace__pane-scroll" ref={containerRef}>
        {filePath ? (
          isUrlDriven ? (
            <DocumentPage />
          ) : (
            <DocumentPage
              vaultIdProp={vaultId}
              filePathProp={filePath}
              scrollContainerRef={containerRef}
              scrollKeyScope={paneId}
              publishTOC={isActive}
            />
          )
        ) : (
          <div className="swirlread-workspace__pane-empty">
            Pane is empty — open a file in this pane via ⌘+click on the file
            shelf, or via the right-click menu.
          </div>
        )}
      </div>
    </section>
  )
}

export function Workspace() {
  const params = useParams<{ vaultId: string; '*': string }>()
  const vaultId = params.vaultId
  const urlFilePath = params['*'] ?? ''
  const navigate = useNavigate()
  const panesByVault = usePanesStore((s) => s.panesByVault)
  const ratio = useUIStore((s) => s.paneSplitRatio)
  const setRatio = useUIStore((s) => s.setPaneSplitRatio)

  // ⌘\ / ⌘W / ⌘1 / ⌘2 hotkeys are panes-only — mount them here so they
  // never fire on routes that don't have a vault context (LandingPage,
  // NoVaultSelected).
  usePaneHotkeys()

  // Ensure a panes row exists for this vault, then sync URL → pane 1.
  useEffect(() => {
    if (!vaultId) return
    const store = usePanesStore.getState()
    const current = store.panesByVault[vaultId]
    if (!current) {
      store.getOrInit(vaultId)
    }
  }, [vaultId])

  // URL → pane 1 sync. Only meaningful in single mode: there the URL is the
  // source of truth and drives pane 1. In dual mode, pane state owns both
  // panes and the URL stays frozen on pane 1, so this effect must NOT run —
  // otherwise it would clobber a deliberately-different pane-1 doc. Read the
  // freshest store state here (not the render snapshot) because this effect
  // can fire before getOrInit lands in the render cycle.
  useEffect(() => {
    if (!vaultId) return
    if (!urlFilePath) return
    const store = usePanesStore.getState()
    const current = store.getOrInit(vaultId)
    if (current.viewMode === 'dual') return
    const pane1 = current.panes[0]
    if (pane1 && pane1.currentPath !== urlFilePath) {
      void store.setCurrentPath(vaultId, PANE_1, urlFilePath)
    }
  }, [vaultId, urlFilePath])

  if (!vaultId) return null

  const vaultPanes = panesByVault[vaultId]
  // First-render fallback before getOrInit lands in state — render pane 1
  // directly from the URL so the active doc still appears.
  const viewMode = vaultPanes?.viewMode ?? 'single'
  const activePaneId = vaultPanes?.activePaneId ?? PANE_1
  const pane1Path = vaultPanes?.panes[0]?.currentPath ?? urlFilePath ?? ''
  const pane2Path = vaultPanes?.panes[1]?.currentPath ?? ''

  const handleFocus = (paneId: PaneId) => {
    if (activePaneId === paneId) return
    // Focus is pane-state only. We deliberately do NOT navigate the URL to
    // the focused pane's doc: the URL is frozen on pane 1 in dual mode, and
    // rewriting it would re-trigger the URL→pane-1 sync and clobber pane 1.
    void usePanesStore.getState().setActivePane(vaultId, paneId)
  }

  const handleClose = (paneId: PaneId) => {
    // Closing a pane unmounts whatever it renders — including a live
    // editor surface — without a pathname change, so neither the router
    // blocker nor `beforeunload` would catch an unsaved draft. Gate here.
    void (async () => {
      if (!(await confirmLeaveIfDirty())) return
      // The user accepted leaving (or wasn't dirty). Drop any editor session
      // now so the surface unmount doesn't strand a zombie dirty session and
      // the survivor navigate below doesn't re-trip the router dirty blocker.
      useEditorStore.getState().cancel()
      await usePanesStore.getState().closePane(vaultId, paneId)
      // If we closed pane 1 with pane 2 surviving, the survivor's path
      // becomes the new URL.
      const survivor =
        usePanesStore.getState().panesByVault[vaultId]?.panes[0]?.currentPath ??
        ''
      if (survivor) {
        void navigate(`/app/${vaultId}/${encodePathForUrl(survivor)}`)
      }
    })()
  }

  const handleExpand = (paneId: PaneId) => {
    // Expanding closes the *other* pane; same edit-loss exposure as close.
    void (async () => {
      if (!(await confirmLeaveIfDirty())) return
      useEditorStore.getState().cancel()
      const other: PaneId = paneId === PANE_1 ? PANE_2 : PANE_1
      await usePanesStore.getState().closePane(vaultId, other)
      const target = paneId === PANE_1 ? pane1Path : pane2Path
      if (target) {
        void navigate(`/app/${vaultId}/${encodePathForUrl(target)}`)
      }
    })()
  }

  if (viewMode === 'single') {
    return (
      <div className="swirlread-workspace swirlread-workspace--single">
        <PaneBody
          vaultId={vaultId}
          filePath={pane1Path}
          paneId={PANE_1}
          isActive={activePaneId === PANE_1}
          onFocus={() => handleFocus(PANE_1)}
          showControls={false}
          isUrlDriven={true}
        />
      </div>
    )
  }

  return (
    <div className="swirlread-workspace swirlread-workspace--dual">
      <div
        className="swirlread-workspace__panes"
        style={{
          gridTemplateColumns: `${ratio * 100}% 6px ${(1 - ratio) * 100}%`,
        }}
      >
        <PaneBody
          vaultId={vaultId}
          filePath={pane1Path}
          paneId={PANE_1}
          isActive={activePaneId === PANE_1}
          onFocus={() => handleFocus(PANE_1)}
          onClose={() => handleClose(PANE_1)}
          onExpand={() => handleExpand(PANE_1)}
          showControls
          isUrlDriven={false}
        />
        <Splitter
          ratio={ratio}
          onChange={(next) => {
            void setRatio(next)
          }}
        />
        <PaneBody
          vaultId={vaultId}
          filePath={pane2Path}
          paneId={PANE_2}
          isActive={activePaneId === PANE_2}
          onFocus={() => handleFocus(PANE_2)}
          onClose={() => handleClose(PANE_2)}
          onExpand={() => handleExpand(PANE_2)}
          showControls
          isUrlDriven={false}
        />
      </div>
    </div>
  )
}
