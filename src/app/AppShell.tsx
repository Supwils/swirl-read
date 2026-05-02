import { lazy, Suspense } from 'react'
import { Link, Outlet } from 'react-router'
import {
  BookOpen,
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
import { VaultSwitcher } from '@/ui/reading-shell/VaultSwitcher'
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
  const tocOpen = useUIStore((s) => s.tocOpen)
  const toggleToc = useUIStore((s) => s.toggleToc)
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen)
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette)
  const shortcutsHelpOpen = useUIStore((s) => s.shortcutsHelpOpen)
  const chromeMode = useUIStore((s) => s.chromeMode)
  const toggleChromeMode = useUIStore((s) => s.toggleChromeMode)
  const hasAnyVault = useVaultStore((s) => s.registeredVaults.length > 0)
  useCommandPaletteHotkey()
  useZenModeHotkey()
  useShortcutsHelpHotkey()

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="swilread-shell__header sticky top-0 z-50 flex h-[var(--shell-header-height)] items-center justify-between gap-3 border-b px-4"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleFileTree()}
            className="swilread-shell__icon-button"
            aria-label={fileTreeOpen ? 'Hide file tree' : 'Show file tree'}
            aria-pressed={fileTreeOpen}
            title={fileTreeOpen ? 'Hide file tree' : 'Show file tree'}
          >
            {fileTreeOpen ? (
              <PanelLeftClose size={18} aria-hidden="true" />
            ) : (
              <PanelLeftOpen size={18} aria-hidden="true" />
            )}
          </button>
          <Link
            to="/"
            className="font-serif text-lg font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            SwilRead
          </Link>
          {hasAnyVault && <VaultSwitcher />}
        </div>
        <div className="flex items-center gap-1">
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
