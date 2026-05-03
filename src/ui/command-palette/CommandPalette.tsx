/**
 * CommandPalette (M5.x + RX6) — primary navigation surface.
 *
 * Mounts only when `commandPaletteOpen` flips. Loads cmdk + Radix Dialog
 * in its own chunk. Three input modes:
 *
 *   - **Empty input** → Recents + Headings (this document) + Sections.
 *   - **Anything else** → same groups PLUS Files in vault; cmdk filters.
 *   - **`>` prefix** → full-text search via `getFullTextIndex` (M5.4).
 */

import { useMemo, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router'
import { Clock, Library } from 'lucide-react'
import { basename } from '@/core/vault'
import { useUIStore } from '@/stores/ui-store'
import { useTocStore } from '@/stores/toc-store'
import { useVaultStore } from '@/stores/vault-store'
import { useFlatRecents } from './use-flat-recents'
import {
  classifyInput,
  emptyMessage,
  placeholderFor,
  useCurrentVaultId,
  useCurrentFilePath,
  useVaultFiles,
  useVaultSections,
  useFullTextIndex,
} from './use-palette-search'
import {
  HeadingItem,
  PaletteFilesGroup,
  PaletteSearchResults,
} from './PaletteGroups'

export function CommandPalette(): ReactNode {
  const open = useUIStore((state) => state.commandPaletteOpen)
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="swilread-cmdk__overlay" />
        <Dialog.Content
          className="swilread-cmdk__content"
          aria-label="Command palette"
          // Prevent Radix from auto-focusing its first focusable child;
          // cmdk's input below uses `autoFocus` and we want it to win.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Type to fuzzy-search files in the current vault, or arrow through
            recently opened files. Enter opens, Escape closes.
          </Dialog.Description>
          <PaletteBody onSelect={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteBody({ onSelect }: { onSelect: () => void }): ReactNode {
  const navigate = useNavigate()
  const recents = useFlatRecents()
  const currentVaultId = useCurrentVaultId()
  const currentVaultName = useVaultStore((state) =>
    currentVaultId
      ? (state.registeredVaults.find((v) => v.id === currentVaultId)?.name ??
        currentVaultId)
      : null,
  )
  const vaultFiles = useVaultFiles(currentVaultId)
  const headings = useTocStore((state) => state.headings)
  const tocContext = useTocStore((state) => state.context)
  const sections = useVaultSections(currentVaultId)
  const currentFilePath = useCurrentFilePath()
  const [input, setInput] = useState('')

  const mode = useMemo(() => classifyInput(input), [input])
  const fullText = useFullTextIndex(currentVaultId, mode)

  const headingsActive =
    tocContext.vaultId === currentVaultId &&
    tocContext.path !== null &&
    tocContext.path === currentFilePath &&
    headings.length > 0

  const handleSelect = (href: string): void => {
    onSelect()
    void navigate(href)
  }

  const handleSelectHeading = (id: string): void => {
    onSelect()
    requestAnimationFrame(() => {
      const target = document.getElementById(id)
      if (!target) return
      const top = target.getBoundingClientRect().top + window.scrollY - 64
      window.scrollTo({ top, left: 0, behavior: 'smooth' })
      if (history.replaceState) history.replaceState(null, '', `#${id}`)
    })
  }

  return (
    <Command
      label="Command palette"
      shouldFilter={mode.kind === 'files'}
      className="swilread-cmdk"
    >
      <Command.Input
        autoFocus
        value={input}
        onValueChange={setInput}
        placeholder={placeholderFor(mode, currentVaultName, currentVaultId)}
        className="swilread-cmdk__input"
      />
      <Command.List className="swilread-cmdk__list">
        <Command.Empty className="swilread-cmdk__empty">
          {emptyMessage(mode, recents.length, currentVaultId)}
        </Command.Empty>

        {mode.kind !== 'search' && recents.length > 0 && (
          <Command.Group
            heading="Recent files"
            className="swilread-cmdk__group"
          >
            {recents.map((item) => (
              <Command.Item
                key={`recent::${item.vaultId}::${item.path}`}
                value={`${item.vaultName} ${item.path}`}
                onSelect={() => handleSelect(item.href)}
                className="swilread-cmdk__item"
              >
                <Clock
                  className="swilread-cmdk__item-icon"
                  size={14}
                  aria-hidden="true"
                />
                <span className="swilread-cmdk__item-primary">
                  {basename(item.path)}
                </span>
                <span className="swilread-cmdk__item-secondary">
                  {item.vaultName} · {item.path}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {mode.kind !== 'search' && headingsActive && (
          <Command.Group
            heading="Headings (this document)"
            className="swilread-cmdk__group"
          >
            {headings.map((heading) => (
              <HeadingItem
                key={`heading::${heading.id}`}
                heading={heading}
                onSelect={handleSelectHeading}
              />
            ))}
          </Command.Group>
        )}

        {mode.kind !== 'search' && currentVaultId && sections.length > 0 && (
          <Command.Group
            heading={`Sections in ${currentVaultName ?? currentVaultId}`}
            className="swilread-cmdk__group"
          >
            {sections.map((section) => {
              if (!section.home) return null
              return (
                <Command.Item
                  key={`section::${section.directory.path}`}
                  value={`section ${section.directory.name} ${section.home}`}
                  onSelect={() =>
                    handleSelect(`/app/${currentVaultId}/${section.home}`)
                  }
                  className="swilread-cmdk__item"
                >
                  <Library
                    className="swilread-cmdk__item-icon"
                    size={14}
                    aria-hidden="true"
                  />
                  <span className="swilread-cmdk__item-primary">
                    {section.directory.name}
                  </span>
                  <span className="swilread-cmdk__item-secondary">
                    {section.home}
                  </span>
                </Command.Item>
              )
            })}
          </Command.Group>
        )}

        {mode.kind === 'files' && currentVaultId && (
          <PaletteFilesGroup
            vaultFiles={vaultFiles}
            vaultId={currentVaultId}
            vaultName={currentVaultName}
            onSelect={handleSelect}
          />
        )}

        {mode.kind === 'search' && currentVaultId && (
          <PaletteSearchResults
            fullText={fullText}
            vaultId={currentVaultId}
            vaultName={currentVaultName}
            onSelect={handleSelect}
          />
        )}
      </Command.List>
      <footer className="swilread-cmdk__footer">
        <span className="swilread-cmdk__hint">
          <kbd className="swilread-cmdk__kbd">&gt;</kbd> full-text search
        </span>
        <kbd className="swilread-cmdk__kbd">↑↓</kbd> navigate
        <kbd className="swilread-cmdk__kbd">↵</kbd> open
        <kbd className="swilread-cmdk__kbd">esc</kbd> close
      </footer>
    </Command>
  )
}
