import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import {
  buildWikilinkIndex,
  type WikilinkIndex,
} from '@/core/navigation/wikilink-resolver'
import {
  extractWikilinkReferences,
  indexBacklinksForFile,
} from '@/core/navigation/backlinks'
import { derivePageTitle } from '@/core/render/page-title'
import { useTocStore } from '@/stores/toc-store'
import { getAdapter, useVaultStore } from '@/stores/vault-store'
import type { VaultFile } from '@/core/vault'
import { useScrollMemory } from './use-scroll-memory'
import { useDocumentLoader } from './use-document-loader'
import type { LoadState } from './use-document-loader'
import { DocumentBodyView } from './DocumentBodyView'

interface FileVersion {
  size: number
  modifiedAtMs: number
}

type ExternalChangeState = 'clean' | 'changed'

export function DocumentPage() {
  const params = useParams<{ vaultId: string; '*': string }>()
  const vaultId = params.vaultId
  const filePath = params['*'] ?? ''
  const [retryToken, setRetryToken] = useState(0)
  const [wikilinkIndex, setWikilinkIndex] = useState<WikilinkIndex | null>(null)
  const [externalChange, setExternalChange] =
    useState<ExternalChangeState>('clean')
  const loadedVersionRef = useRef<FileVersion | null>(null)
  const contentRevision = useVaultStore((s) =>
    vaultId ? (s.contentRevisionByVault[vaultId] ?? 0) : 0,
  )

  // Build the wikilink index once per vault. Cheap walk; re-runs only on vaultId change.
  useEffect(() => {
    if (!vaultId) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setWikilinkIndex(null)
      return
    }
    let cancelled = false
    void buildWikilinkIndex(vault)
      .then((index) => {
        if (!cancelled) setWikilinkIndex(index)
      })
      .catch(() => {
        if (!cancelled) setWikilinkIndex(null)
      })
    return () => {
      cancelled = true
    }
  }, [vaultId])

  const state = useDocumentLoader({ vaultId, filePath, retryToken })

  useEffect(() => {
    const file = fileFromLoadState(state)
    loadedVersionRef.current = file ? versionFromFile(file) : null
    setExternalChange('clean')
  }, [state, vaultId, filePath])

  useEffect(() => {
    if (!vaultId || !filePath || state.kind === 'loading') return
    const loadedVersion = loadedVersionRef.current
    if (!loadedVersion) return
    const vault = getAdapter(vaultId)
    if (!vault) return

    let cancelled = false
    void vault
      .stat(filePath)
      .then((entry) => {
        if (cancelled || entry.isDirectory) return
        if (!sameVersion(loadedVersion, versionFromFile(entry))) {
          setExternalChange('changed')
        }
      })
      .catch(() => {
        // Missing / unreadable files already surface through normal reload paths.
      })

    return () => {
      cancelled = true
    }
  }, [vaultId, filePath, contentRevision, state.kind])

  useEffect(() => {
    if (!vaultId || !filePath || !wikilinkIndex) return
    if (state.kind !== 'rendered') return
    void indexBacklinksForFile(vaultId, filePath, state.raw, wikilinkIndex)
  }, [vaultId, filePath, wikilinkIndex, state])

  const proseRef = useRef<HTMLDivElement | null>(null)

  // Publish heading list to the TOC store after each successful render.
  // Walking the rendered DOM keeps headings, slugs, and ids in one place.
  useEffect(() => {
    if (state.kind !== 'rendered') {
      useTocStore.getState().clear()
      return
    }
    const node = proseRef.current
    if (!node) return
    let cancelled = false
    void import('@/core/navigation/headings').then(({ extractHeadings }) => {
      if (cancelled) return
      const headings = extractHeadings(node, { maxLevel: 4 })
      useTocStore.getState().setHeadings(headings)
    })

    // RX4: publish compact "what is this document" context to the right rail.
    void import('@/core/navigation/tag-index').then(
      ({ tagsInMarkdownSource }) => {
        if (cancelled) return
        const tags = tagsInMarkdownSource(state.raw)
        const refs = extractWikilinkReferences(state.raw)
        const distinctTargets = new Set(refs.map((r) => r.target.toLowerCase()))
        useTocStore.getState().setContext({
          vaultId: vaultId ?? null,
          path: filePath || null,
          tags,
          outgoingLinks: distinctTargets.size,
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [state, vaultId, filePath])

  // Always clear on unmount so the TOC doesn't outlive the document.
  useEffect(() => {
    return () => {
      useTocStore.getState().clear()
    }
  }, [])

  // Scroll memory: restore once content has rendered.
  useScrollMemory({
    vaultId,
    path: filePath,
    restoreToken: state.kind === 'rendered' ? state : null,
  })

  // RX1: derive an article-style title.
  const renderedFrontmatter =
    state.kind === 'rendered' ? state.frontmatter : null
  const renderedRaw = state.kind === 'rendered' ? state.raw : ''
  const derivedTitle = useMemo(
    () =>
      derivePageTitle({
        frontmatter: renderedFrontmatter ?? {
          data: {},
          raw: '',
          format: null,
          body: '',
          present: false,
        },
        raw: renderedRaw,
        filePath: filePath || '',
      }),
    [renderedFrontmatter, renderedRaw, filePath],
  )
  const headerTitle =
    state.kind === 'rendered'
      ? derivedTitle.title
      : derivePageTitle({
          frontmatter: {
            data: {},
            raw: '',
            format: null,
            body: '',
            present: false,
          },
          raw: '',
          filePath: filePath || '',
        }).title

  return (
    <DocumentBodyView
      state={state}
      vaultId={vaultId}
      filePath={filePath}
      wikilinkIndex={wikilinkIndex}
      proseRef={proseRef}
      headerTitle={headerTitle}
      setRetryToken={setRetryToken}
      externalChange={externalChange}
      onReloadExternalChange={() => {
        setExternalChange('clean')
        setRetryToken((n) => n + 1)
      }}
      onDismissExternalChange={() => {
        setExternalChange('clean')
      }}
    />
  )
}

function fileFromLoadState(state: LoadState): VaultFile | null {
  switch (state.kind) {
    case 'rendered':
    case 'text':
    case 'code':
    case 'table':
    case 'html':
    case 'json':
    case 'media':
    case 'binary':
      return state.file
    default:
      return null
  }
}

function versionFromFile(file: VaultFile): FileVersion {
  return {
    size: file.size,
    modifiedAtMs: file.modifiedAt.getTime(),
  }
}

function sameVersion(a: FileVersion, b: FileVersion): boolean {
  return a.size === b.size && a.modifiedAtMs === b.modifiedAtMs
}
