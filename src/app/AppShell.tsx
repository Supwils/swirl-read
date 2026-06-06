import { lazy } from 'react'
import { ChunkBoundary } from '@/ui/components/ChunkBoundary'
import { Link, Outlet, useMatch, useNavigate } from 'react-router'
import {
  Home,
  Maximize2,
  Minimize2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import { useDialogStore } from '@/stores/dialog-store'
import { useReviewStore } from '@/stores/review-store'
import { useUIStore } from '@/stores/ui-store'
import { useVaultStore } from '@/stores/vault-store'
import { Logo } from '@/ui/components/Logo'
import { Toggle } from '@/ui/components/Toggle'
import { TabStrip } from '@/ui/reading-shell/TabStrip'
import { VaultSwitcher } from '@/ui/reading-shell/VaultSwitcher'
import {
  PANE_1,
  PANE_2,
  usePanesStore,
  type ViewMode,
} from '@/stores/panes-store'
import type { Theme } from '@/stores/ui-store'
import { deriveCurrentPathFromPathname } from './derive-current-path'
import { useCommandPaletteHotkey } from './use-command-palette-hotkey'
import { useDirtyNavigationGuard } from './use-dirty-navigation-guard'
import { useRouterDirtyBlocker } from './use-router-dirty-blocker'
import { useShortcutsHelpHotkey } from './use-shortcuts-help-hotkey'
import { useTabReopenHotkey } from './use-tab-reopen-hotkey'
import { useVaultFocusSync } from './use-vault-focus-sync'
import { useVaultPollSync } from './use-vault-poll-sync'
import { useZenModeHotkey } from './use-zen-mode-hotkey'

const SettingsPanel = lazy(() =>
  import('@/ui/settings-panel/SettingsPanel').then((module) => ({
    default: module.SettingsPanel,
  })),
)

// CommandPalette pulls in cmdk (~6 KB gz) and an extra Radix Dialog
// instance — keep it out of the eager bundle. The hotkey hook above
// lives in main and flips `commandPaletteOpen`; Suspense here loads the
// chunk on first open.
const CommandPalette = lazy(() =>
  import('@/ui/command-palette/CommandPalette').then((module) => ({
    default: module.CommandPalette,
  })),
)

// ShortcutsHelp is rare-use chrome — same lazy treatment as the palette
// so the Radix Dialog instance only ships when the user hits `?`.
const ShortcutsHelp = lazy(() =>
  import('@/ui/help/ShortcutsHelp').then((module) => ({
    default: module.ShortcutsHelp,
  })),
)

// Phase 2D: app-wide imperative confirm dialog (driven by useDialogStore).
// Only mounts when something requests a confirmation, so the Radix
// Dialog runtime stays out of the hot path for read-only sessions.
const ConfirmDialog = lazy(() =>
  import('@/ui/components/ConfirmDialog').then((module) => ({
    default: module.ConfirmDialog,
  })),
)

// Phase 3 review: card-generation modal driven by useReviewStore.
// Mounted once at shell level so any caller (doc header button, palette
// command, future file-tree multi-select) opens the same dialog instance.
const GenerateCardsDialog = lazy(() =>
  import('@/ui/review/GenerateCardsDialog').then((module) => ({
    default: module.GenerateCardsDialog,
  })),
)

export function AppShell() {
  // fileTreeOpen / tocOpen / chromeMode are still subscribed — they drive the
  // pinned-state derived values (fileTreePinned / tocPinned) used for icon and
  // aria-pressed. The action functions are read via getState() inside handlers.
  const fileTreeOpen = useUIStore((s) => s.fileTreeOpen)
  const tocOpen = useUIStore((s) => s.tocOpen)
  const chromeMode = useUIStore((s) => s.chromeMode)
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen)
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette)
  const shortcutsHelpOpen = useUIStore((s) => s.shortcutsHelpOpen)
  const confirmDialogPayload = useDialogStore((s) => s.confirmPayload)
  const reviewIntent = useReviewStore((s) => s.pending)
  const dismissReview = useReviewStore((s) => s.dismissGenerate)
  const zenMode = useUIStore((s) => s.zenMode)
  const toggleZenMode = useUIStore((s) => s.toggleZenMode)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const wideRails = useUIStore((s) => s.wideRails)
  const setWideRails = useUIStore((s) => s.setWideRails)
  const navigate = useNavigate()
  // Whether each sidebar is actually pinned (visible persistently).
  // In reading mode neither is ever pinned — only hover-summoned.
  const fileTreePinned = chromeMode === 'working' && fileTreeOpen
  const tocPinned = chromeMode === 'working' && tocOpen
  const hasAnyVault = useVaultStore((s) => s.registeredVaults.length > 0)
  useCommandPaletteHotkey()
  useZenModeHotkey()
  useShortcutsHelpHotkey()
  useTabReopenHotkey()
  useDirtyNavigationGuard()
  useRouterDirtyBlocker()
  useVaultFocusSync()
  useVaultPollSync()

  // The header's tab strip needs to know which vault we're inside and
  // the active document path; both come from the URL. Matching here
  // (rather than in TabStrip) keeps the strip a dumb child and lets us
  // hide it cleanly when the user is on a non-vault route like `/app`.
  const vaultMatch = useMatch('/app/:vaultId/*')
  const vaultId = vaultMatch?.params.vaultId
  // Mode toggle only meaningful on a vault route. Sub to the whole
  // record so React re-renders when the active vault's pane shape flips.
  const panesByVault = usePanesStore((s) => s.panesByVault)
  const vaultViewMode: ViewMode | null = vaultId
    ? (panesByVault[vaultId]?.viewMode ?? 'single')
    : null

  /** Map between the chrome theme toggle (which only exposes the two
   *  primary modes) and the underlying ui-store value (which also has
   *  sepia / oled / auto, settable from the settings panel). The
   *  toggle picks 'dark' when the current theme is dark/oled; anything
   *  else is presented as 'light'. */
  const themePrimary: 'light' | 'dark' =
    theme === 'dark' || theme === 'oled' ? 'dark' : 'light'

  const handleThemePrimaryChange = (next: 'light' | 'dark') => {
    if (next === themePrimary) return
    const target: Theme = next === 'dark' ? 'dark' : 'sepia'
    void setTheme(target)
  }

  const handleViewModeChange = (next: ViewMode) => {
    if (!vaultId) return
    const store = usePanesStore.getState()
    if (next === 'dual' && vaultViewMode === 'single') {
      void store.splitPane(vaultId)
      return
    }
    if (next === 'single' && vaultViewMode === 'dual') {
      const active = store.panesByVault[vaultId]?.activePaneId ?? PANE_1
      const closeTarget = active === PANE_1 ? PANE_2 : PANE_1
      void store.closePane(vaultId, closeTarget)
    }
  }
  // `useMatch` already decodes the splat segment-aware, but route
  // parameters preserve `%` sequences as escaped — run through the
  // shared deriver so we get the same result as `VaultLayout`.
  const currentPath = vaultId
    ? deriveCurrentPathFromPathname(
        `/app/${vaultId}/${vaultMatch?.params['*'] ?? ''}`,
      )
    : ''

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="swirlread-shell__header sticky top-0 z-50 flex h-[var(--shell-header-height)] items-center justify-between gap-3 border-b px-4"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void (async () => {
                // Read live store state — not the closed-over render value —
                // so rapid double-clicks don't race on a stale chromeMode.
                const s = useUIStore.getState()
                if (s.chromeMode === 'reading') {
                  await s.setChromeMode('working')
                  if (!s.fileTreeOpen) await s.setFileTreeOpen(true)
                } else {
                  await s.toggleFileTree()
                }
              })()
            }
            className="swirlread-shell__icon-button"
            aria-label={fileTreePinned ? 'Hide file shelf' : 'Show file shelf'}
            aria-pressed={fileTreePinned}
            title={fileTreePinned ? 'Hide file shelf' : 'Show file shelf'}
          >
            {fileTreePinned ? (
              <PanelLeftClose size={18} aria-hidden="true" />
            ) : (
              <PanelLeftOpen size={18} aria-hidden="true" />
            )}
          </button>
          <Link
            to="/"
            className="flex items-center gap-1.5 font-serif text-lg font-semibold"
            style={{ color: 'var(--color-text)' }}
            aria-label="SwirlRead — back to vaults"
          >
            <Logo size={20} decorative />
            <span>SwirlRead</span>
          </Link>
          {hasAnyVault && <VaultSwitcher />}
          {vaultId && (
            <button
              type="button"
              onClick={() => void navigate(`/app/${vaultId}`)}
              className="swirlread-shell__icon-button"
              aria-label="Back to vault home"
              title="Back to vault home (Pebble Garden)"
            >
              <Home size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {vaultId && (
          <div className="swirlread-shell__tabs">
            <TabStrip vaultId={vaultId} currentPath={currentPath} />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {/* View + theme hover menu — single icon reveals a dropdown */}
          <div className="swirlread-view-menu">
            <button
              type="button"
              className="swirlread-shell__icon-button"
              aria-label="Layout and theme options"
              title="Layout and theme"
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
            </button>
            <div className="swirlread-view-menu__panel">
              <div className="swirlread-view-menu__panel-box">
                {vaultViewMode !== null && (
                  <div className="swirlread-view-menu__row">
                    <span className="swirlread-view-menu__label">Layout</span>
                    <Toggle<ViewMode>
                      value={vaultViewMode}
                      ariaLabel="Reading mode"
                      options={[
                        { value: 'single', label: 'Single' },
                        { value: 'dual', label: 'Dual' },
                      ]}
                      onChange={handleViewModeChange}
                    />
                  </div>
                )}
                <div className="swirlread-view-menu__row">
                  <span className="swirlread-view-menu__label">Theme</span>
                  <Toggle<'light' | 'dark'>
                    value={themePrimary}
                    ariaLabel="Theme"
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]}
                    onChange={handleThemePrimaryChange}
                  />
                </div>
                <div className="swirlread-view-menu__row">
                  <span className="swirlread-view-menu__label">Wide rails</span>
                  <Toggle<'on' | 'off'>
                    value={wideRails ? 'on' : 'off'}
                    ariaLabel="Wide rails"
                    options={[
                      { value: 'on', label: 'On' },
                      { value: 'off', label: 'Off' },
                    ]}
                    onChange={(next) => {
                      void setWideRails(next === 'on')
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleZenMode}
            className="swirlread-shell__icon-button"
            aria-label={zenMode ? 'Exit zen mode' : 'Enter zen mode'}
            aria-pressed={zenMode}
            title={zenMode ? 'Exit zen mode (F or Esc)' : 'Zen mode (F)'}
          >
            {zenMode ? (
              <Minimize2 size={18} aria-hidden="true" />
            ) : (
              <Maximize2 size={18} aria-hidden="true" />
            )}
          </button>
          {vaultId && (
            <button
              type="button"
              onClick={() =>
                void navigate(
                  currentPath
                    ? `/app/${vaultId}/__graph__?from=${encodeURIComponent(currentPath)}`
                    : `/app/${vaultId}/__graph__`,
                )
              }
              className="swirlread-shell__icon-button"
              aria-label="Open knowledge graph"
              title="Knowledge graph"
            >
              <Network size={18} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleCommandPalette}
            className="swirlread-shell__icon-button"
            aria-label="Open command palette"
            title="Command palette (⌘K)"
          >
            <Search size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() =>
              void (async () => {
                const s = useUIStore.getState()
                if (s.chromeMode === 'reading') {
                  await s.setChromeMode('working')
                  if (!s.tocOpen) await s.setTocOpen(true)
                } else {
                  await s.toggleToc()
                }
              })()
            }
            className="swirlread-shell__icon-button"
            aria-label={
              tocPinned ? 'Hide table of contents' : 'Show table of contents'
            }
            aria-pressed={tocPinned}
            title={
              tocPinned ? 'Hide table of contents' : 'Show table of contents'
            }
          >
            {tocPinned ? (
              <PanelRightClose size={18} aria-hidden="true" />
            ) : (
              <PanelRightOpen size={18} aria-hidden="true" />
            )}
          </button>
          <ChunkBoundary
            label="settings panel"
            loadingFallback={
              <button
                type="button"
                className="swirlread-shell__icon-button"
                aria-label="Open settings"
                title="Settings"
                disabled
              >
                <Settings size={18} aria-hidden="true" />
              </button>
            }
          >
            <SettingsPanel />
          </ChunkBoundary>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      {commandPaletteOpen && (
        <ChunkBoundary label="command palette">
          <CommandPalette />
        </ChunkBoundary>
      )}
      {shortcutsHelpOpen && (
        <ChunkBoundary label="shortcuts help">
          <ShortcutsHelp />
        </ChunkBoundary>
      )}
      {confirmDialogPayload && (
        <ChunkBoundary label="confirmation dialog">
          <ConfirmDialog />
        </ChunkBoundary>
      )}
      {reviewIntent && (
        <ChunkBoundary label="card generator">
          <GenerateCardsDialog
            open
            vaultId={reviewIntent.vaultId}
            path={reviewIntent.path}
            inlineContent={reviewIntent.inlineContent}
            sourceLabel={reviewIntent.sourceLabel}
            onOpenChange={(open) => {
              if (!open) dismissReview()
            }}
          />
        </ChunkBoundary>
      )}
    </div>
  )
}
