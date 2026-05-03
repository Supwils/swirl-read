/**
 * useDocumentLoader — owns the async load/render pipeline for DocumentPage.
 *
 * Stat → branch (directory / media / binary / text / code / markdown / …)
 * → read → render → setState. Calling `setRetryToken((n) => n + 1)` from
 * the outside will re-run the entire pipeline.
 */

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  VaultFileNotFoundError,
  VaultPermissionDeniedError,
} from '@/core/vault'
import type { VaultEntry, VaultFile, VaultFileSystem } from '@/core/vault'
import { getRendererKind, type MediaKind } from '@/core/render/dispatcher'
import { extractFrontmatter, type Frontmatter } from '@/core/render/frontmatter'
import { renderMarkdown } from '@/core/render/pipeline'
import { useReaderStore } from '@/stores/reader-store'
import { useTabsStore } from '@/stores/tabs-store'
import { getAdapter, useVaultStore } from '@/stores/vault-store'
import { customComponents } from './document-components'

export type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'rendered'
      content: ReactNode
      raw: string
      frontmatter: Frontmatter
    }
  | { kind: 'text'; raw: string }
  | { kind: 'code'; raw: string; language: string }
  | { kind: 'table'; raw: string; delimiter: ',' | '\t' }
  | { kind: 'html'; raw: string }
  | { kind: 'json'; raw: string }
  | { kind: 'media'; file: VaultFile; media: MediaKind; vault: VaultFileSystem }
  | { kind: 'binary'; file: VaultFile }
  | { kind: 'directory'; entries: VaultEntry[] }
  | { kind: 'missing-vault' }
  | { kind: 'missing-file' }
  | { kind: 'error'; message: string }

interface UseDocumentLoaderParams {
  vaultId: string | undefined
  filePath: string
  retryToken: number
}

export function useDocumentLoader({
  vaultId,
  filePath,
  retryToken,
}: UseDocumentLoaderParams): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  // Re-run the load effect when an adapter is attached after page reload.
  // autoRestoreVaults() races with the initial render; adapterRevision bumps
  // on attachAdapter() so we don't stay stuck on missing-vault.
  const adapterRevision = useVaultStore((s) => s.adapterRevision)

  useEffect(() => {
    if (!vaultId || !filePath) return
    const currentVaultId = vaultId
    const vault = getAdapter(currentVaultId)
    if (!vault) {
      setState({ kind: 'missing-vault' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })

    async function loadAndRender(v: typeof vault): Promise<void> {
      if (!v) return
      try {
        const entry = await v.stat(filePath)
        if (cancelled) return
        if (entry.isDirectory) {
          const entries = await v.list(filePath)
          if (cancelled) return
          setState({ kind: 'directory', entries })
          return
        }

        const decision = getRendererKind(filePath)

        if (decision.kind === 'media') {
          if (cancelled) return
          setState({
            kind: 'media',
            file: entry,
            media: decision.media,
            vault: v,
          })
          return
        }

        if (decision.kind === 'binary') {
          if (cancelled) return
          setState({ kind: 'binary', file: entry })
          return
        }

        const raw = await v.readText(filePath)
        if (cancelled) return

        if (decision.kind === 'markdown') {
          const frontmatter = extractFrontmatter(raw)
          const content = await renderMarkdown(raw, customComponents)
          if (cancelled) return
          setState({ kind: 'rendered', content, raw, frontmatter })
        } else if (decision.kind === 'code') {
          setState({ kind: 'code', raw, language: decision.language })
        } else if (decision.kind === 'table') {
          setState({ kind: 'table', raw, delimiter: decision.delimiter })
        } else if (decision.kind === 'html') {
          setState({ kind: 'html', raw })
        } else if (decision.kind === 'json') {
          setState({ kind: 'json', raw })
        } else {
          setState({ kind: 'text', raw })
        }
        void useReaderStore.getState().markRecentFile(currentVaultId, filePath)
        // `pin: false` means single-click nav only ever reuses the preview slot.
        void useTabsStore.getState().openOrFocus(currentVaultId, filePath)
      } catch (err) {
        if (cancelled) return
        if (err instanceof VaultFileNotFoundError) {
          setState({ kind: 'missing-file' })
          return
        }
        // Mid-read permission revoke routes to missing-vault so the user
        // can re-grant from a real gesture (M9.5).
        if (err instanceof VaultPermissionDeniedError) {
          setState({ kind: 'missing-vault' })
          return
        }
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    void loadAndRender(vault)
    return () => {
      cancelled = true
    }
    // retryToken bumps force a re-run after "Try again".
    // adapterRevision bumps when autoRestoreVaults() attaches an adapter
    // after the initial render — prevents getting stuck on missing-vault.
  }, [vaultId, filePath, retryToken, adapterRevision])

  return state
}
