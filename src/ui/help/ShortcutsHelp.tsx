/**
 * ShortcutsHelp (M9.4) — single-source-of-truth list of every keyboard
 * binding in SwirlRead, surfaced as a Radix Dialog overlay.
 *
 * Triggered by `?` from anywhere outside a text-entry surface. Lazy-
 * loaded by `AppShell` so the Radix Dialog instance only ships when the
 * user actually opens the panel.
 */

import { type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Keyboard, X } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'

interface Shortcut {
  /** Discrete key segments — rendered as separate <kbd> blocks. */
  keys: string[]
  /** Human-readable description for the right column. */
  description: string
}

interface ShortcutGroup {
  heading: string
  shortcuts: Shortcut[]
}

/** Source of truth for what keys do what. New hotkeys go here. */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    heading: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette (or Ctrl+K)' },
      { keys: ['↑', '↓'], description: 'Move selection in palette' },
      { keys: ['↵'], description: 'Open selected item' },
    ],
  },
  {
    heading: 'Reading',
    shortcuts: [
      { keys: ['F'], description: 'Toggle zen mode (chrome hidden)' },
      { keys: ['Esc'], description: 'Exit zen mode / dismiss overlay' },
      {
        keys: ['R'],
        description: 'Reload current file when it changed on disk',
      },
    ],
  },
  {
    heading: 'Tabs',
    shortcuts: [
      {
        keys: ['⌘', '⇧', 'T'],
        description: 'Reopen the last closed tab (or Ctrl+Shift+T)',
      },
    ],
  },
  {
    heading: 'Sidebar resize',
    shortcuts: [
      { keys: ['←', '→'], description: 'Narrow / widen sidebar by 16 px' },
      {
        keys: ['⇧', '←', '→'],
        description: 'Narrow / widen sidebar by 64 px',
      },
      { keys: ['Home'], description: 'Collapse sidebar to minimum width' },
      { keys: ['End'], description: 'Expand sidebar to maximum width' },
      { keys: ['↵'], description: 'Reset sidebar to default width' },
    ],
  },
  {
    heading: 'Help',
    shortcuts: [{ keys: ['?'], description: 'Show this list of shortcuts' }],
  },
]

export function ShortcutsHelp(): ReactNode {
  const open = useUIStore((s) => s.shortcutsHelpOpen)
  const setOpen = useUIStore((s) => s.setShortcutsHelpOpen)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="swirlread-shortcuts__overlay" />
        <Dialog.Content
          className="swirlread-shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <header className="swirlread-shortcuts__header">
            <div className="swirlread-shortcuts__heading">
              <Keyboard size={18} aria-hidden="true" />
              <Dialog.Title className="swirlread-shortcuts__title">
                Keyboard shortcuts
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="swirlread-shortcuts__close"
                aria-label="Close shortcuts"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            A list of every keyboard shortcut available in SwirlRead.
          </Dialog.Description>
          <div className="swirlread-shortcuts__body">
            {SHORTCUT_GROUPS.map((group) => (
              <section
                key={group.heading}
                className="swirlread-shortcuts__group"
              >
                <h3 className="swirlread-shortcuts__group-heading">
                  {group.heading}
                </h3>
                <ul className="swirlread-shortcuts__list">
                  {group.shortcuts.map((shortcut) => (
                    <li
                      key={shortcut.description}
                      className="swirlread-shortcuts__item"
                    >
                      <span className="swirlread-shortcuts__keys">
                        {shortcut.keys.map((key, i) => (
                          <kbd
                            key={`${shortcut.description}-${String(i)}`}
                            className="swirlread-shortcuts__kbd"
                          >
                            {key}
                          </kbd>
                        ))}
                      </span>
                      <span className="swirlread-shortcuts__description">
                        {shortcut.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
