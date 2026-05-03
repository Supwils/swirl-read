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
import { getAdapter } from '@/stores/vault-store'
import { useScrollMemory } from './use-scroll-memory'
import { useDocumentLoader } from './use-document-loader'
import { DocumentBodyView } from './DocumentBodyView'

export function DocumentPage() {
  const params = useParams<{ vaultId: string; '*': string }>()
  const vaultId = params.vaultId
  const filePath = params['*'] ?? ''
  const [retryToken, setRetryToken] = useState(0)
  const [wikilinkIndex, setWikilinkIndex] = useState<WikilinkIndex | null>(null)

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
    />
  )
}
