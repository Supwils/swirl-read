import { lazy, Suspense } from 'react'
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
import { useUIStore } from '@/stores/ui-store'
import { useVaultStore } from '@/stores/vault-store'
import { Logo } from '@/ui/components/Logo'
import { TabStrip } from '@/ui/reading-shell/TabStrip'
import { VaultSwitcher } from '@/ui/reading-shell/VaultSwitcher'
import { deriveCurrentPathFromPathname } from './derive-current-path'
import { useCommandPaletteHotkey } from './use-command-palette-hotkey'
import { useShortcutsHelpHotkey } from './use-shortcuts-help-hotkey'
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

export function AppShell() {
  const fileTreeOpen = useUIStore((s) => s.fileTreeOpen)
  const toggleFileTree = useUIStore((s) => s.toggleFileTree)
  const setFileTreeOpen = useUIStore((s) => s.setFileTreeOpen)
  const tocOpen = useUIStore((s) => s.tocOpen)
  const toggleToc = useUIStore((s) => s.toggleToc)
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen)
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette)
  const shortcutsHelpOpen = useUIStore((s) => s.shortcutsHelpOpen)
  const chromeMode = useUIStore((s) => s.chromeMode)
  const toggleChromeMode = useUIStore((s) => s.toggleChromeMode)
  const setChromeMode = useUIStore((s) => s.setChromeMode)
  const zenMode = useUIStore((s) => s.zenMode)
  const toggleZenMode = useUIStore((s) => s.toggleZenMode)
  // Whether the file tree is actually pinned (visible persistently).
  // In reading mode the tree is never pinned — only hover-summoned.
  const fileTreePinned = chromeMode === 'working' && fileTreeOpen
  const hasAnyVault = useVaultStore((s) => s.registeredVaults.length > 0)
  useCommandPaletteHotkey()
  useZenModeHotkey()
  useShortcutsHelpHotkey()

  // The header's tab strip needs to know which vault we're inside and
  // the active document path; both come from the URL. Matching here
  // (rather than in TabStrip) keeps the strip a dumb child and lets us
  // hide it cleanly when the user is on a non-vault route like `/app`.
  const vaultMatch = useMatch('/app/:vaultId/*')
  const vaultId = vaultMatch?.params.vaultId
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
        className="swilread-shell__header sticky top-0 z-50 flex h-[var(--shell-header-height)] items-center justify-between gap-3 border-b px-4"
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
            className="swilread-shell__icon-button"
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
            aria-label="SwilRead — back to vaults"
          >
            <Logo size={20} decorative />
            <span>SwilRead</span>
          </Link>
          {hasAnyVault && <VaultSwitcher />}
        </div>
        {vaultId && (
          <div className="swilread-shell__tabs">
            <TabStrip vaultId={vaultId} currentPath={currentPath} />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleChromeMode()}
            className="swilread-shell__icon-button"
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
            className="swilread-shell__icon-button"
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
            className="swilread-shell__icon-button"
            aria-label="Open command palette"
            title="Command palette (⌘K)"
          >
            <Search size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void toggleToc()}
            className="swilread-shell__icon-button"
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
          <Suspense
            fallback={
              <button
                type="button"
                className="swilread-shell__icon-button"
                aria-label="Open settings"
                title="Settings"
                disabled
              >
                <Settings size={18} aria-hidden="true" />
              </button>
            }
          >
            <SettingsPanel />
          </Suspense>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      {shortcutsHelpOpen && (
        <Suspense fallback={null}>
          <ShortcutsHelp />
        </Suspense>
      )}
    </div>
  )
}
