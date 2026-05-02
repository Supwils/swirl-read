/**
 * ShortcutsHelp (M9.4) — single-source-of-truth list of every keyboard
 * binding in SwilRead, surfaced as a Radix Dialog overlay.
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
        <Dialog.Overlay className="swilread-shortcuts__overlay" />
        <Dialog.Content
          className="swilread-shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <header className="swilread-shortcuts__header">
            <div className="swilread-shortcuts__heading">
              <Keyboard size={18} aria-hidden="true" />
              <Dialog.Title className="swilread-shortcuts__title">
                Keyboard shortcuts
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="swilread-shortcuts__close"
                aria-label="Close shortcuts"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            A list of every keyboard shortcut available in SwilRead.
          </Dialog.Description>
          <div className="swilread-shortcuts__body">
            {SHORTCUT_GROUPS.map((group) => (
              <section
                key={group.heading}
                className="swilread-shortcuts__group"
              >
                <h3 className="swilread-shortcuts__group-heading">
                  {group.heading}
                </h3>
                <ul className="swilread-shortcuts__list">
                  {group.shortcuts.map((shortcut) => (
                    <li
                      key={shortcut.description}
                      className="swilread-shortcuts__item"
                    >
                      <span className="swilread-shortcuts__keys">
                        {shortcut.keys.map((key, i) => (
                          <kbd
                            key={`${shortcut.description}-${String(i)}`}
                            className="swilread-shortcuts__kbd"
                          >
                            {key}
                          </kbd>
                        ))}
                      </span>
                      <span className="swilread-shortcuts__description">
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
