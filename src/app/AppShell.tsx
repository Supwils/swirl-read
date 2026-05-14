import { lazy } from 'react'
import { ChunkBoundary } from '@/ui/components/ChunkBoundary'
import { Link, Outlet, useMatch } from 'react-router'
import {
  BookOpen,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelTop,
  Search,
  Settings,
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
  const fileTreeOpen = useUIStore((s) => s.fileTreeOpen)
  const toggleFileTree = useUIStore((s) => s.toggleFileTree)
  const setFileTreeOpen = useUIStore((s) => s.setFileTreeOpen)
  const tocOpen = useUIStore((s) => s.tocOpen)
  const toggleToc = useUIStore((s) => s.toggleToc)
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen)
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette)
  const shortcutsHelpOpen = useUIStore((s) => s.shortcutsHelpOpen)
  const confirmDialogPayload = useDialogStore((s) => s.confirmPayload)
  const reviewIntent = useReviewStore((s) => s.pending)
  const dismissReview = useReviewStore((s) => s.dismissGenerate)
  const chromeMode = useUIStore((s) => s.chromeMode)
  const toggleChromeMode = useUIStore((s) => s.toggleChromeMode)
  const setChromeMode = useUIStore((s) => s.setChromeMode)
  const zenMode = useUIStore((s) => s.zenMode)
  const toggleZenMode = useUIStore((s) => s.toggleZenMode)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  // Whether the file tree is actually pinned (visible persistently).
  // In reading mode the tree is never pinned — only hover-summoned.
  const fileTreePinned = chromeMode === 'working' && fileTreeOpen
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
                if (chromeMode === 'reading') {
                  // Promote to working mode so the toggle has a visible
                  // effect (A.H4). Ensure fileTreeOpen is true so the
                  // sidebar appears immediately after the mode switch.
                  await setChromeMode('working')
                  if (!fileTreeOpen) await setFileTreeOpen(true)
                } else {
                  await toggleFileTree()
                }
              })()
            }
            className="swirlread-shell__icon-button"
            aria-label={fileTreePinned ? 'Hide file tree' : 'Show file tree'}
            aria-pressed={fileTreePinned}
            title={fileTreePinned ? 'Hide file tree' : 'Show file tree'}
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
        </div>
        {vaultId && (
          <div className="swirlread-shell__tabs">
            <TabStrip vaultId={vaultId} currentPath={currentPath} />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {vaultViewMode !== null && (
            <Toggle<ViewMode>
              value={vaultViewMode}
              ariaLabel="Reading mode"
              options={[
                { value: 'single', label: 'Single' },
                { value: 'dual', label: 'Dual' },
              ]}
              onChange={handleViewModeChange}
            />
          )}
          <Toggle<'light' | 'dark'>
            value={themePrimary}
            ariaLabel="Theme"
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={handleThemePrimaryChange}
          />
          <button
            type="button"
            onClick={() => void toggleChromeMode()}
            className="swirlread-shell__icon-button"
            aria-label={
              chromeMode === 'reading'
                ? 'Switch to working mode'
                : 'Switch to reading mode'
            }
            aria-pressed={chromeMode === 'reading'}
            title={
              chromeMode === 'reading'
                ? 'Reading mode — sidebars hover-summon. Click for working mode.'
                : 'Working mode — sidebars persistent. Click for reading mode.'
            }
          >
            {chromeMode === 'reading' ? (
              <BookOpen size={18} aria-hidden="true" />
            ) : (
              <PanelTop size={18} aria-hidden="true" />
            )}
          </button>
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
            onClick={() => void toggleToc()}
            className="swirlread-shell__icon-button"
            aria-label={
              tocOpen ? 'Hide table of contents' : 'Show table of contents'
            }
            aria-pressed={tocOpen}
            title={
              tocOpen ? 'Hide table of contents' : 'Show table of contents'
            }
          >
            {tocOpen ? (
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
            onOpenChange={(open) => {
              if (!open) dismissReview()
            }}
          />
        </ChunkBoundary>
      )}
    </div>
  )
}
