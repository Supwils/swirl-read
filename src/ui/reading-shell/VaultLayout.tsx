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
 * RX2 + M2.5: chromeMode controls whether sidebars are persistent
 * (`working`) or hover-summoned (`reading`). In reading mode, edge
 * hover zones reveal the sidebar transiently — leaving the zone +
 * sidebar dismisses after a short grace period.
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router'
import { useUIStore } from '@/stores/ui-store'
import { FileTree } from '@/ui/file-tree/FileTree'
import { HintToast } from './HintToast'

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
  const { pathname } = useLocation()

  // Transient hover-summoned visibility for reading mode. Working mode
  // ignores these — its sidebars are driven by the persistent prefs.
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

  // Reading mode hides persistent sidebars regardless of prefs; working
  // mode honours them. Either mode can show a sidebar transiently when
  // the user moves into the corresponding hover zone.
  const showFileTree =
    (chromeMode === 'working' && fileTreeOpen) ||
    (chromeMode === 'reading' && hoverFileTree)
  const showToc =
    (chromeMode === 'working' && tocOpen) ||
    (chromeMode === 'reading' && hoverToc)

  const currentPath = pathname
    .split('/')
    .slice(3)
    .map((seg) => safeDecode(seg))
    .filter(Boolean)
    .join('/')

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
      className={`swilread-vault-layout swilread-vault-layout--${chromeMode}`}
    >
      {/* Reading-mode hover zones — invisible 14 px strips along the page
          edges. The CSS hides them in working mode so they don't compete
          with the persistent sidebars there. */}
      <div
        className="swilread-vault-layout__hover-zone swilread-vault-layout__hover-zone--left"
        aria-hidden="true"
        onMouseEnter={() => {
          cancelTimer(fileTreeTimerRef)
          setHoverFileTree(true)
        }}
      />
      <div
        className="swilread-vault-layout__hover-zone swilread-vault-layout__hover-zone--right"
        aria-hidden="true"
        onMouseEnter={() => {
          cancelTimer(tocTimerRef)
          setHoverToc(true)
        }}
      />

      {showFileTree && vaultId && (
        <>
          <button
            type="button"
            className="swilread-vault-layout__sidebar-backdrop"
            aria-label="Dismiss file tree"
            onClick={() => {
              if (chromeMode === 'reading') {
                setHoverFileTree(false)
                cancelTimer(fileTreeTimerRef)
              } else {
                void setFileTreeOpen(false)
              }
            }}
          />
          <aside
            className="swilread-vault-layout__sidebar"
            aria-label="File tree"
            onMouseEnter={() => {
              cancelTimer(fileTreeTimerRef)
            }}
            onMouseLeave={() => {
              if (chromeMode === 'reading') {
                scheduleHide(fileTreeTimerRef, setHoverFileTree)
              }
            }}
          >
            <FileTree
              key={vaultId}
              vaultId={vaultId}
              currentPath={currentPath}
            />
          </aside>
        </>
      )}
      <div className="swilread-vault-layout__content">
        <Outlet />
      </div>
      {showToc && vaultId && (
        <aside
          className="swilread-vault-layout__toc"
          aria-label="Table of contents"
          onMouseEnter={() => {
            cancelTimer(tocTimerRef)
          }}
          onMouseLeave={() => {
            if (chromeMode === 'reading') {
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
    </div>
  )
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
