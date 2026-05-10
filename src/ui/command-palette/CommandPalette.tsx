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
import { Clock, Library, RotateCcw, Sparkles } from 'lucide-react'
import { basename } from '@/core/vault'
import { useReviewStore } from '@/stores/review-store'
import { useTabsStore, type Tab } from '@/stores/tabs-store'
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
import { PaletteAskResult } from './PaletteAskResult'

// Stable empty-array reference for the recently-closed selector. Zustand
// uses identity equality by default; returning a fresh `[]` from the
// selector on every render would loop the component endlessly.
const EMPTY_RECENTLY_CLOSED: Tab[] = []

export function CommandPalette(): ReactNode {
  const open = useUIStore((state) => state.commandPaletteOpen)
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="swirlread-cmdk__overlay" />
        <Dialog.Content
          className="swirlread-cmdk__content"
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
  const recentlyClosed = useTabsStore((state) =>
    currentVaultId
      ? (state.recentlyClosedByVault[currentVaultId] ?? EMPTY_RECENTLY_CLOSED)
      : EMPTY_RECENTLY_CLOSED,
  )
  const [input, setInput] = useState('')

  const mode = useMemo(() => classifyInput(input), [input])
  const fullText = useFullTextIndex(currentVaultId, mode)

  const headingsActive =
    tocContext.vaultId === currentVaultId &&
    tocContext.path !== null &&
    tocContext.path === currentFilePath &&
    headings.length > 0

  // Static groups (recents / recently-closed / headings / sections) are
  // shown in the empty + files modes — never in search or ask, where
  // they would be irrelevant noise above the actual answer surface.
  const showStaticGroups = mode.kind === 'recents' || mode.kind === 'files'

  const handleSelect = (href: string): void => {
    onSelect()
    void navigate(href)
  }

  const handleGenerateCards = (): void => {
    if (!currentVaultId || !currentFilePath) return
    onSelect()
    useReviewStore.getState().requestGenerate({
      vaultId: currentVaultId,
      path: currentFilePath,
    })
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
      className="swirlread-cmdk"
    >
      <Command.Input
        autoFocus
        value={input}
        onValueChange={setInput}
        placeholder={placeholderFor(mode, currentVaultName, currentVaultId)}
        className="swirlread-cmdk__input"
      />
      <Command.List className="swirlread-cmdk__list">
        <Command.Empty className="swirlread-cmdk__empty">
          {emptyMessage(mode, recents.length, currentVaultId)}
        </Command.Empty>

        {showStaticGroups && recents.length > 0 && (
          <Command.Group
            heading="Recent files"
            className="swirlread-cmdk__group"
          >
            {recents.map((item) => (
              <Command.Item
                key={`recent::${item.vaultId}::${item.path}`}
                value={`${item.vaultName} ${item.path}`}
                onSelect={() => handleSelect(item.href)}
                className="swirlread-cmdk__item"
              >
                <Clock
                  className="swirlread-cmdk__item-icon"
                  size={14}
                  aria-hidden="true"
                />
                <span className="swirlread-cmdk__item-primary">
                  {basename(item.path)}
                </span>
                <span className="swirlread-cmdk__item-secondary">
                  {item.vaultName} · {item.path}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {showStaticGroups && currentVaultId && recentlyClosed.length > 0 && (
          <Command.Group
            heading="Recently closed"
            className="swirlread-cmdk__group"
          >
            {recentlyClosed.map((tab) => (
              <Command.Item
                key={`closed::${tab.vaultId}::${tab.path}`}
                value={`closed ${tab.path}`}
                onSelect={() => {
                  // Pop the entry from the closed stack so the same
                  // row doesn't keep showing up after we've already
                  // brought it back. DocumentPage handles the actual
                  // tab open via its `openOrFocus` effect.
                  useTabsStore.getState().reopenClosed(tab.vaultId, tab.path)
                  handleSelect(`/app/${tab.vaultId}/${tab.path}`)
                }}
                className="swirlread-cmdk__item"
              >
                <RotateCcw
                  className="swirlread-cmdk__item-icon"
                  size={14}
                  aria-hidden="true"
                />
                <span className="swirlread-cmdk__item-primary">
                  {basename(tab.path)}
                </span>
                <span className="swirlread-cmdk__item-secondary">
                  Reopen · {tab.path}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {showStaticGroups && headingsActive && (
          <Command.Group
            heading="Headings (this document)"
            className="swirlread-cmdk__group"
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

        {showStaticGroups && currentVaultId && currentFilePath && (
          <Command.Group
            heading="Document actions"
            className="swirlread-cmdk__group"
          >
            <Command.Item
              key={`doc-action::generate-cards::${currentFilePath}`}
              value={`generate review cards flashcards study quiz ${currentFilePath}`}
              onSelect={handleGenerateCards}
              className="swirlread-cmdk__item"
            >
              <Sparkles
                className="swirlread-cmdk__item-icon"
                size={14}
                aria-hidden="true"
              />
              <span className="swirlread-cmdk__item-primary">
                Generate review cards
              </span>
              <span className="swirlread-cmdk__item-secondary">
                {basename(currentFilePath)}
              </span>
            </Command.Item>
          </Command.Group>
        )}

        {showStaticGroups && currentVaultId && sections.length > 0 && (
          <Command.Group
            heading={`Sections in ${currentVaultName ?? currentVaultId}`}
            className="swirlread-cmdk__group"
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
                  className="swirlread-cmdk__item"
                >
                  <Library
                    className="swirlread-cmdk__item-icon"
                    size={14}
                    aria-hidden="true"
                  />
                  <span className="swirlread-cmdk__item-primary">
                    {section.directory.name}
                  </span>
                  <span className="swirlread-cmdk__item-secondary">
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

        {mode.kind === 'ask' && mode.query.length > 0 && (
          <PaletteAskResult
            question={mode.query}
            vaultId={currentVaultId}
            path={currentFilePath}
            onSelect={onSelect}
          />
        )}
      </Command.List>
      <footer className="swirlread-cmdk__footer">
        <span className="swirlread-cmdk__hint">
          <kbd className="swirlread-cmdk__kbd">&gt;</kbd> full-text search
        </span>
        <span className="swirlread-cmdk__hint">
          <kbd className="swirlread-cmdk__kbd">?</kbd> ask AI
        </span>
        <kbd className="swirlread-cmdk__kbd">↑↓</kbd> navigate
        <kbd className="swirlread-cmdk__kbd">↵</kbd> open
        <kbd className="swirlread-cmdk__kbd">esc</kbd> close
      </footer>
    </Command>
  )
}
