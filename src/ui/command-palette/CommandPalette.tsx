/**
 * CommandPalette (M5.x + RX6) — primary navigation surface.
 *
 * Mounts only when `commandPaletteOpen` flips. Loads cmdk + Radix Dialog
 * in its own chunk. Three input modes:
 *
 *   - **Empty input** → default navigator: `Recents` + `Headings (this
 *     document)` + `Sections (this vault)`. Each group hides itself
 *     when its data set is empty so a fresh vault doesn't show empty
 *     headers. RX6 added the Headings + Sections groups.
 *   - **Anything else with content** → all the same groups remain visible
 *     PLUS a `Files in <vault>` group; cmdk filters across all of them
 *     so typing "intro" can hit a heading, a file name, or a section
 *     equally well.
 *   - **`>` prefix** → `Search results in <vault>` — full-text content
 *     match via `getFullTextIndex` (M5.4). The prefix is consumed and
 *     the rest of the input becomes the query (M5.5 routing).
 *
 * Composition note: Radix Dialog gives focus trap, Esc, portal, and
 * accessible labelling. cmdk gives list semantics + arrow nav + scoring.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { useLocation, useNavigate } from 'react-router'
import {
  Clock,
  FileText,
  Hash,
  Library,
  Search as SearchIcon,
} from 'lucide-react'
import { basename, dirname } from '@/core/vault'
import type { VaultFile, VaultId, VaultPath } from '@/core/vault'
import type { FullTextIndex, SearchHit } from '@/core/search/full-text'
import { searchIndex } from '@/core/search/full-text'
import {
  detectSections,
  type VaultSection,
} from '@/core/navigation/section-detector'
import type { DocumentHeading } from '@/core/navigation/headings'
import { useReaderStore } from '@/stores/reader-store'
import { useUIStore } from '@/stores/ui-store'
import { useTocStore } from '@/stores/toc-store'
import { useVaultStore, getAdapter } from '@/stores/vault-store'
import { getFullTextIndex } from './full-text-cache'
import { getWalkedFiles } from './walked-files-cache'

/**
 * Route an input string to one of three palette modes. The prefix is
 * consumed: a query of `> hooks` becomes mode `search` with body `hooks`.
 */
type PaletteMode =
  | { kind: 'recents' }
  | { kind: 'files'; query: string }
  | { kind: 'search'; query: string }

function classifyInput(raw: string): PaletteMode {
  const trimmed = raw.trimStart()
  if (trimmed === '') return { kind: 'recents' }
  if (trimmed.startsWith('>')) {
    return { kind: 'search', query: trimmed.slice(1).trimStart() }
  }
  return { kind: 'files', query: raw.trim() }
}

interface RecentItem {
  vaultId: VaultId
  vaultName: string
  path: VaultPath
  openedAt: Date
  href: string
}

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

  // Headings only make sense as palette items when the user is reading
  // the EXACT document they belong to — anchor scrolling targets DOM
  // ids on the current page. Both vault id AND file path must match
  // the toc-store's published context.
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
    // Defer the scroll one frame so React commits the dialog close
    // before we measure positions.
    requestAnimationFrame(() => {
      const target = document.getElementById(id)
      if (!target) return
      const headerOffset = 64
      const top =
        target.getBoundingClientRect().top + window.scrollY - headerOffset
      window.scrollTo({ top, left: 0, behavior: 'smooth' })
      if (history.replaceState) {
        history.replaceState(null, '', `#${id}`)
      }
    })
  }

  // cmdk filters per-keystroke. We disable for `recents` (keep order)
  // and `search` (already MiniSearch-ranked). Files mode hands ranking
  // to cmdk's scorer across every group on screen.
  const shouldFilter = mode.kind === 'files'

  return (
    <Command
      label="Command palette"
      shouldFilter={shouldFilter}
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

        {mode.kind === 'files' &&
          currentVaultId &&
          vaultFiles.status === 'ready' && (
            <Command.Group
              heading={`Files in ${currentVaultName ?? currentVaultId}`}
              className="swilread-cmdk__group"
            >
              {vaultFiles.files.map((file) => (
                <Command.Item
                  key={`file::${currentVaultId}::${file.path}`}
                  // cmdk scores against `value` — include both the
                  // basename and the full path so a query can match the
                  // shortest-meaningful prefix OR a parent folder name.
                  value={`${file.name} ${file.path}`}
                  onSelect={() =>
                    handleSelect(`/app/${currentVaultId}/${file.path}`)
                  }
                  className="swilread-cmdk__item"
                >
                  <FileText
                    className="swilread-cmdk__item-icon"
                    size={14}
                    aria-hidden="true"
                  />
                  <span className="swilread-cmdk__item-primary">
                    {file.name}
                  </span>
                  <span className="swilread-cmdk__item-secondary">
                    {dirname(file.path) || '/'}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

        {mode.kind === 'files' &&
          currentVaultId &&
          vaultFiles.status === 'loading' && (
            <p className="swilread-cmdk__status">Walking the vault…</p>
          )}
        {mode.kind === 'files' &&
          currentVaultId &&
          vaultFiles.status === 'error' && (
            <p className="swilread-cmdk__status" role="alert">
              Couldn’t walk this vault: {vaultFiles.message}
            </p>
          )}

        {mode.kind === 'search' &&
          currentVaultId &&
          fullText.status === 'ready' &&
          fullText.hits.length > 0 && (
            <Command.Group
              heading={`Search results in ${
                currentVaultName ?? currentVaultId
              }`}
              className="swilread-cmdk__group"
            >
              {fullText.hits.map((hit) => (
                <Command.Item
                  key={`search::${currentVaultId}::${hit.path}`}
                  // Stable per-hit value; cmdk filtering is off in
                  // search mode (we already ranked).
                  value={`${hit.path}::${String(hit.score)}`}
                  onSelect={() =>
                    handleSelect(`/app/${currentVaultId}/${hit.path}`)
                  }
                  className="swilread-cmdk__item"
                >
                  <SearchIcon
                    className="swilread-cmdk__item-icon"
                    size={14}
                    aria-hidden="true"
                  />
                  <span className="swilread-cmdk__item-primary">
                    {hit.name}
                  </span>
                  <span className="swilread-cmdk__item-secondary">
                    {hit.snippet || hit.path}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

        {mode.kind === 'search' &&
          currentVaultId &&
          fullText.status === 'loading' && (
            <p className="swilread-cmdk__status">Indexing vault content…</p>
          )}
        {mode.kind === 'search' &&
          currentVaultId &&
          fullText.status === 'error' && (
            <p className="swilread-cmdk__status" role="alert">
              Couldn’t index this vault: {fullText.message}
            </p>
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

function placeholderFor(
  mode: PaletteMode,
  vaultName: string | null,
  vaultId: VaultId | null,
): string {
  if (mode.kind === 'search') {
    return `Search content in ${vaultName ?? vaultId ?? 'vault'}…`
  }
  if (vaultId) {
    return `Search files in ${vaultName ?? vaultId}… (start with > for content)`
  }
  return 'Jump to a recent file…'
}

function emptyMessage(
  mode: PaletteMode,
  recentsCount: number,
  vaultId: VaultId | null,
): string {
  if (mode.kind === 'recents') {
    return recentsCount === 0
      ? 'Open a file from the sidebar to see it here.'
      : 'No matches.'
  }
  if (!vaultId) {
    return 'Open a vault to search its files.'
  }
  if (mode.kind === 'search' && mode.query === '') {
    return 'Type a query after > to search file contents…'
  }
  return 'No matches.'
}

/**
 * Resolve the active vault id from the URL. The palette renders inside
 * AppShell, which is always inside the router, so `useLocation` is
 * available. Reading from URL (rather than from `vaultStore.activeVaultId`)
 * keeps the palette in sync with the route the user is actually on,
 * which matches their mental model.
 */
function useCurrentVaultId(): VaultId | null {
  const { pathname } = useLocation()
  return useMemo(() => {
    const match = /^\/app\/([^/]+)/.exec(pathname)
    if (!match?.[1]) return null
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }, [pathname])
}

/**
 * Resolve the active vault-relative file path from the URL. Returns
 * null when the URL targets a vault root (no document in scope) or
 * when not on an `/app/:vaultId/...` route. Used by the Headings
 * group to verify the toc-store's headings actually belong to the
 * document the user is reading right now.
 */
function useCurrentFilePath(): VaultPath | null {
  const { pathname } = useLocation()
  return useMemo(() => {
    const match = /^\/app\/[^/]+\/(.+)$/.exec(pathname)
    if (!match?.[1]) return null
    return match[1]
      .split('/')
      .map((seg) => {
        try {
          return decodeURIComponent(seg)
        } catch {
          return seg
        }
      })
      .join('/')
  }, [pathname])
}

type VaultFilesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; files: VaultFile[] }
  | { status: 'error'; message: string }

/**
 * Fetch the flat file list for a vault on demand. Walking is cached at
 * the module level (`walked-files-cache`) so subsequent palette opens
 * for the same vault are instant.
 *
 * The hook deliberately does NOT auto-fetch on mount — it kicks off
 * the walk only when the palette is open AND a vault is in scope. That
 * keeps the page-load cost at zero for users who never hit ⌘K.
 */
function useVaultFiles(vaultId: VaultId | null): VaultFilesState {
  const open = useUIStore((state) => state.commandPaletteOpen)
  const [state, setState] = useState<VaultFilesState>({ status: 'idle' })

  useEffect(() => {
    if (!open || !vaultId) {
      setState({ status: 'idle' })
      return
    }
    const adapter = getAdapter(vaultId)
    if (!adapter) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    getWalkedFiles(adapter)
      .then((files) => {
        if (!cancelled) setState({ status: 'ready', files })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, vaultId])

  return state
}

function HeadingItem({
  heading,
  onSelect,
}: {
  heading: DocumentHeading
  onSelect: (id: string) => void
}): ReactNode {
  return (
    <Command.Item
      value={`heading ${heading.text}`}
      onSelect={() => onSelect(heading.id)}
      className="swilread-cmdk__item"
    >
      <Hash className="swilread-cmdk__item-icon" size={14} aria-hidden="true" />
      <span className="swilread-cmdk__item-primary">
        {heading.text || '(untitled)'}
      </span>
      <span className="swilread-cmdk__item-secondary">H{heading.level}</span>
    </Command.Item>
  )
}

/**
 * Lazy-loaded `detectSections` for the active vault. Mirrors the shape
 * of `useVaultFiles`: only fires when the palette is open AND a vault
 * is in scope, so closed-palette pages pay zero.
 */
function useVaultSections(vaultId: VaultId | null): VaultSection[] {
  const open = useUIStore((state) => state.commandPaletteOpen)
  const [sections, setSections] = useState<VaultSection[]>([])

  useEffect(() => {
    if (!open || !vaultId) {
      setSections([])
      return
    }
    const adapter = getAdapter(vaultId)
    if (!adapter) return
    let cancelled = false
    detectSections(adapter)
      .then((found) => {
        if (cancelled) return
        // Only sections with a resolved home — empty directories don't
        // earn a quick-jump entry.
        setSections(
          found
            .filter((s) => s.home !== null)
            .sort((a, b) =>
              a.directory.name.localeCompare(b.directory.name, undefined, {
                sensitivity: 'base',
              }),
            ),
        )
      })
      .catch(() => {
        if (!cancelled) setSections([])
      })
    return () => {
      cancelled = true
    }
  }, [open, vaultId])

  return sections
}

type FullTextState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; hits: SearchHit[] }
  | { status: 'error'; message: string }

/**
 * Run a full-text search against the vault when in `search` mode.
 *
 * The MiniSearch index is built lazily on first `search` mode entry
 * and cached per-vault via `getFullTextIndex`. Subsequent keystrokes
 * just call `searchIndex(index, query)` which is cheap (~O(n) over the
 * stored doc list — typically sub-millisecond for Wilson's vault).
 */
function useFullTextIndex(
  vaultId: VaultId | null,
  mode: PaletteMode,
): FullTextState {
  const open = useUIStore((state) => state.commandPaletteOpen)
  const [index, setIndex] = useState<FullTextIndex | null>(null)
  const [state, setState] = useState<FullTextState>({ status: 'idle' })

  // Drop the cached index reference when the open flag flips false so
  // a closed-then-reopened palette starts from idle (the per-vault
  // promise cache below still memoizes the actual build).
  useEffect(() => {
    if (!open) setIndex(null)
  }, [open])

  // Build the index the first time we enter search mode for a vault.
  useEffect(() => {
    if (!open || !vaultId || mode.kind !== 'search') return
    if (index) return
    const adapter = getAdapter(vaultId)
    if (!adapter) return
    let cancelled = false
    setState({ status: 'loading' })
    getFullTextIndex(adapter)
      .then((built) => {
        if (cancelled) return
        setIndex(built)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [open, vaultId, mode, index])

  // Re-run search whenever the query changes against an existing index.
  useEffect(() => {
    if (mode.kind !== 'search') return
    if (!index) return
    if (mode.query === '') {
      setState({ status: 'ready', hits: [] })
      return
    }
    setState({ status: 'ready', hits: searchIndex(index, mode.query) })
  }, [mode, index])

  if (mode.kind !== 'search') return { status: 'idle' }
  return state
}

/**
 * Flatten the per-vault recent map into a single recency-ordered list,
 * decorated with vault names so the secondary line is meaningful when
 * multiple vaults are registered.
 */
function useFlatRecents(): RecentItem[] {
  const recentByVault = useReaderStore((state) => state.recentByVault)
  const registeredVaults = useVaultStore((state) => state.registeredVaults)

  return useMemo(() => {
    const nameById = new Map<VaultId, string>(
      registeredVaults.map((v) => [v.id, v.name]),
    )
    const flat: RecentItem[] = []
    for (const [vaultId, files] of Object.entries(recentByVault)) {
      for (const file of files) {
        flat.push({
          vaultId,
          vaultName: nameById.get(vaultId) ?? vaultId,
          path: file.path,
          openedAt: file.openedAt,
          href: `/app/${vaultId}/${file.path}`,
        })
      }
    }
    flat.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
    // Cap at 30 — `recentByVault` is already capped per-vault but we
    // bound the cross-vault list too.
    return flat.slice(0, 30)
  }, [recentByVault, registeredVaults])
}
