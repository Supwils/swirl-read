/**
 * VaultLayout — wraps every vault-scoped route.
 *
 * Provides the persistent left-rail file tree (M4.3) and a flex container
 * for the active document/folder/home view (rendered via `<Outlet />`).
 *
 * Why a separate layout: AppShell is shared by routes that don't have a
 * `:vaultId` (the no-vault `/app` index). Putting the sidebar in AppShell
 * would require runtime URL parsing to find the vaultId; layouts give us
 * `useParams` directly.
 *
 * The sidebar is keyed on vaultId so switching vaults remounts the tree
 * (clears cached expansion state).
 *
 * RX2 + M2.5: hover-to-summon is the **primary** sidebar interaction in
 * every chrome mode. Edge hover zones reveal a floating sidebar
 * transiently; leaving the zone + sidebar dismisses after a short grace
 * period. Working chrome additionally pins the sidebars in flex flow
 * (sticky, takes layout space) when their persistent toggle is on —
 * users who want a constantly-visible tree opt into that explicitly.
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router'
import { deriveCurrentPathFromPathname } from '@/app/derive-current-path'
import { useUIStore } from '@/stores/ui-store'
import { MAX_TABS_PER_VAULT, useTabsStore } from '@/stores/tabs-store'
import { FileTree } from '@/ui/file-tree/FileTree'
import { HintToast } from './HintToast'
import { SidebarResizeHandle } from './SidebarResizeHandle'

const TableOfContents = lazy(() =>
  import('@/ui/reading-shell/TableOfContents').then((module) => ({
    default: module.TableOfContents,
  })),
)

const TagsPanel = lazy(() =>
  import('@/ui/reading-shell/TagsPanel').then((module) => ({
    default: module.TagsPanel,
  })),
)

const HOVER_DISMISS_MS = 800

export function VaultLayout() {
  const { vaultId } = useParams<{ vaultId: string }>()
  const fileTreeOpen = useUIStore((s) => s.fileTreeOpen)
  const setFileTreeOpen = useUIStore((s) => s.setFileTreeOpen)
  const tocOpen = useUIStore((s) => s.tocOpen)
  const chromeMode = useUIStore((s) => s.chromeMode)
  const tabCapHit = useTabsStore((s) => s.tabCapHit)
  const previewReplaced = useTabsStore((s) => s.previewReplaced)
  const { pathname } = useLocation()

  // Transient hover-summoned visibility — works in both chrome modes.
  // The persistent toggle (working mode + fileTreeOpen) is on top of
  // this and pins the sidebar into flex flow; otherwise hover gives the
  // user a peek-and-leave experience without permanently giving up
  // reading width.
  const [hoverFileTree, setHoverFileTree] = useState(false)
  const [hoverToc, setHoverToc] = useState(false)
  const fileTreeTimerRef = useRef<number | null>(null)
  const tocTimerRef = useRef<number | null>(null)

  useEffect(() => {
    // Capture refs at effect-mount so the cleanup closure doesn't read
    // a `.current` that React may have already moved on from. The refs
    // here are timer ids, not DOM nodes — the lint warning is mostly
    // theoretical, but the capture is also clearer.
    const fileTreeRef = fileTreeTimerRef
    const tocRef = tocTimerRef
    return () => {
      if (fileTreeRef.current !== null) window.clearTimeout(fileTreeRef.current)
      if (tocRef.current !== null) window.clearTimeout(tocRef.current)
    }
  }, [])

  // Two paths to visibility:
  //   1. Persistent (working mode + the user's toggle is on) — sidebar
  //      sits in flex flow, takes layout width, never auto-dismisses.
  //   2. Hover-summon — works in any chrome mode, shows the floating
  //      treatment, dismisses 800 ms after the cursor leaves.
  const fileTreePersistent = chromeMode === 'working' && fileTreeOpen
  const tocPersistent = chromeMode === 'working' && tocOpen
  const showFileTree = fileTreePersistent || hoverFileTree
  const showToc = tocPersistent || hoverToc
  // When the sidebar is shown via hover (i.e. NOT persistent), render
  // it floating regardless of chromeMode so it doesn't shove content
  // sideways for a transient peek.
  const fileTreeFloating = !fileTreePersistent
  const tocFloating = !tocPersistent

  const currentPath = deriveCurrentPathFromPathname(pathname)

  const cancelTimer = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current)
      ref.current = null
    }
  }

  const scheduleHide = (
    ref: React.MutableRefObject<number | null>,
    setter: (v: boolean) => void,
  ) => {
    cancelTimer(ref)
    ref.current = window.setTimeout(() => {
      setter(false)
      ref.current = null
    }, HOVER_DISMISS_MS)
  }

  return (
    <div
      className={`swirlread-vault-layout swirlread-vault-layout--${chromeMode}`}
    >
      {/* Edge hover zones — invisible 14 px strips along the page edges.
          Active in every chrome mode; CSS hides them only when their
          corresponding sidebar is already pinned persistently so they
          don't fight a sidebar that already owns the same column. */}
      {!fileTreePersistent && (
        <div
          className="swirlread-vault-layout__hover-zone swirlread-vault-layout__hover-zone--left"
          aria-hidden="true"
          onMouseEnter={() => {
            cancelTimer(fileTreeTimerRef)
            setHoverFileTree(true)
          }}
        />
      )}
      {!tocPersistent && (
        <div
          className="swirlread-vault-layout__hover-zone swirlread-vault-layout__hover-zone--right"
          aria-hidden="true"
          onMouseEnter={() => {
            cancelTimer(tocTimerRef)
            setHoverToc(true)
          }}
        />
      )}

      {showFileTree && vaultId && (
        <>
          <button
            type="button"
            className={`swirlread-vault-layout__sidebar-backdrop${
              fileTreeFloating
                ? ' swirlread-vault-layout__sidebar-backdrop--floating'
                : ''
            }`}
            aria-label="Dismiss file tree"
            onClick={() => {
              if (fileTreeFloating) {
                setHoverFileTree(false)
                cancelTimer(fileTreeTimerRef)
              } else {
                void setFileTreeOpen(false)
              }
            }}
          />
          <aside
            className={`swirlread-vault-layout__sidebar${
              fileTreeFloating
                ? ' swirlread-vault-layout__sidebar--floating'
                : ''
            }`}
            aria-label="File tree"
            onMouseEnter={() => {
              cancelTimer(fileTreeTimerRef)
            }}
            onMouseLeave={() => {
              if (fileTreeFloating) {
                scheduleHide(fileTreeTimerRef, setHoverFileTree)
              }
            }}
          >
            <FileTree
              key={vaultId}
              vaultId={vaultId}
              currentPath={currentPath}
            />
            {fileTreePersistent && <SidebarResizeHandle />}
          </aside>
        </>
      )}
      <div className="swirlread-vault-layout__content">
        <Outlet />
      </div>
      {showToc && vaultId && (
        <aside
          className={`swirlread-vault-layout__toc${
            tocFloating ? ' swirlread-vault-layout__toc--floating' : ''
          }`}
          aria-label="Table of contents"
          onMouseEnter={() => {
            cancelTimer(tocTimerRef)
          }}
          onMouseLeave={() => {
            if (tocFloating) {
              scheduleHide(tocTimerRef, setHoverToc)
            }
          }}
        >
          <Suspense fallback={null}>
            <TableOfContents />
          </Suspense>
        </aside>
      )}
      {vaultId && (
        <Suspense fallback={null}>
          <TagsPanel vaultId={vaultId} />
        </Suspense>
      )}
      <HintToast id="first-vault-tour" title="Welcome to your reading shell">
        Press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> to jump anywhere · <kbd>F</kbd>{' '}
        for zen mode · <kbd>?</kbd> for the full shortcut list.
      </HintToast>
      {previewReplaced && (
        <HintToast id="preview-tab-replaced" title="Tabs replace each other">
          A single click opens a <strong>preview</strong> tab. The next file you
          open replaces it in place. Double-click a tab (or use Cmd-click on a
          link) to pin it so it stays.
        </HintToast>
      )}
      {tabCapHit && (
        <HintToast
          id="tab-cap-hit"
          title={`Tab limit reached (${String(MAX_TABS_PER_VAULT)} tabs)`}
        >
          The oldest tab was closed to make room. Press <kbd>⌘+⇧+T</kbd> /{' '}
          <kbd>Ctrl+Shift+T</kbd> to bring it back, or double-click a tab to pin
          it so it is never auto-evicted.
        </HintToast>
      )}
    </div>
  )
}
