import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import type { VaultFile, VaultId } from '@/core/vault'
import type { FullTextIndex, SearchHit } from '@/core/search/full-text'
import { searchIndex } from '@/core/search/full-text'
import {
  detectSections,
  type VaultSection,
} from '@/core/navigation/section-detector'
import { useUIStore } from '@/stores/ui-store'
import { getAdapter } from '@/stores/vault-store'
import { getFullTextIndex } from './full-text-cache'
import { getWalkedFiles } from './walked-files-cache'

/**
 * Route an input string to one of three palette modes. The prefix is
 * consumed: a query of `> hooks` becomes mode `search` with body `hooks`.
 */
export type PaletteMode =
  | { kind: 'recents' }
  | { kind: 'files'; query: string }
  | { kind: 'search'; query: string }

export function classifyInput(raw: string): PaletteMode {
  const trimmed = raw.trimStart()
  if (trimmed === '') return { kind: 'recents' }
  if (trimmed.startsWith('>')) {
    return { kind: 'search', query: trimmed.slice(1).trimStart() }
  }
  return { kind: 'files', query: raw.trim() }
}

/**
 * Resolve the active vault id from the URL. Reading from URL (rather
 * than `vaultStore.activeVaultId`) keeps the palette in sync with the
 * route the user is actually on.
 */
export function useCurrentVaultId(): VaultId | null {
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
 * null when the URL targets a vault root or is not on an `/app/` route.
 */
export function useCurrentFilePath(): string | null {
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

export type VaultFilesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; files: VaultFile[] }
  | { status: 'error'; message: string }

/**
 * Fetch the flat file list for a vault on demand. Walking is cached at
 * the module level (`walked-files-cache`) so subsequent palette opens
 * for the same vault are instant.
 */
export function useVaultFiles(vaultId: VaultId | null): VaultFilesState {
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

/**
 * Lazy-loaded `detectSections` for the active vault. Only fires when
 * the palette is open AND a vault is in scope.
 */
export function useVaultSections(vaultId: VaultId | null): VaultSection[] {
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

export type FullTextState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; hits: SearchHit[] }
  | { status: 'error'; message: string }

/**
 * Run a full-text search against the vault when in `search` mode.
 * The MiniSearch index is built lazily on first `search` mode entry
 * and cached per-vault via `getFullTextIndex`.
 */
export function useFullTextIndex(
  vaultId: VaultId | null,
  mode: PaletteMode,
): FullTextState {
  const open = useUIStore((state) => state.commandPaletteOpen)
  const [index, setIndex] = useState<FullTextIndex | null>(null)
  const [state, setState] = useState<FullTextState>({ status: 'idle' })

  useEffect(() => {
    if (!open) setIndex(null)
  }, [open])

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

export function placeholderFor(
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

export function emptyMessage(
  mode: PaletteMode,
  recentsCount: number,
  vaultId: VaultId | null,
): string {
  if (mode.kind === 'recents') {
    return recentsCount === 0
      ? 'Open a file from the sidebar to see it here.'
      : 'No matches.'
  }
  if (!vaultId) return 'Open a vault to search its files.'
  if (mode.kind === 'search' && mode.query === '') {
    return 'Type a query after > to search file contents…'
  }
  return 'No matches.'
}
