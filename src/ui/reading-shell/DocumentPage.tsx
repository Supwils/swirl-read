import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import {
  VaultFileNotFoundError,
  VaultPermissionDeniedError,
} from '@/core/vault'
import type { VaultEntry, VaultFile, VaultFileSystem } from '@/core/vault'
import { getRendererKind, type MediaKind } from '@/core/render/dispatcher'
import {
  buildWikilinkIndex,
  type WikilinkIndex,
} from '@/core/navigation/wikilink-resolver'
import {
  extractWikilinkReferences,
  indexBacklinksForFile,
} from '@/core/navigation/backlinks'
import { extractFrontmatter, type Frontmatter } from '@/core/render/frontmatter'
import { derivePageTitle } from '@/core/render/page-title'
import { renderMarkdown } from '@/core/render/pipeline'
import { useReaderStore } from '@/stores/reader-store'
import { useTocStore } from '@/stores/toc-store'
import { useUIStore } from '@/stores/ui-store'
import { getAdapter } from '@/stores/vault-store'
import { Wikilink } from './Wikilink'
import { Callout } from './Callout'
import { EmbedNode } from './EmbedNode'
import { BacklinksPanel } from './BacklinksPanel'
import { DirectoryListing } from './DirectoryListing'
import { FrontmatterPanel } from './Frontmatter'
import { MermaidDiagram } from './MermaidDiagram'
import { MathBlock, MathInline } from './MathBlock'
import { Tag } from './Tag'
import { ReauthorizeVault } from './ReauthorizeVault'
import { DocumentSkeleton } from './DocumentSkeleton'
import { WikilinkContext } from './wikilink-context'
import { EmbedContext } from './embed-context'
import { useScrollMemory } from './use-scroll-memory'
// PlainText stays eager (tiny, no dependencies, also serves as the
// Suspense fallback for the heavier renderers below).
import { PlainTextRenderer } from './PlainTextRenderer'

// M9.1 perf pass: the M7 universal-file renderers are paid for on every
// Markdown page that doesn't open them. React.lazy puts each in its own
// chunk; Suspense renders nothing while the chunk resolves (the lazy
// chunks are tiny and the file path that gets here is already async via
// stat() + readText()).
const CodeFileRenderer = lazy(() =>
  import('./CodeFileRenderer').then((m) => ({ default: m.CodeFileRenderer })),
)
const CsvRenderer = lazy(() =>
  import('./CsvRenderer').then((m) => ({ default: m.CsvRenderer })),
)
const HtmlRenderer = lazy(() =>
  import('./HtmlRenderer').then((m) => ({ default: m.HtmlRenderer })),
)
const JsonRenderer = lazy(() =>
  import('./JsonRenderer').then((m) => ({ default: m.JsonRenderer })),
)
const MediaRenderer = lazy(() =>
  import('./MediaRenderer').then((m) => ({ default: m.MediaRenderer })),
)
const UnsupportedRenderer = lazy(() =>
  import('./UnsupportedRenderer').then((m) => ({
    default: m.UnsupportedRenderer,
  })),
)

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'rendered'
      content: ReactNode
      raw: string
      frontmatter: Frontmatter
    }
  // M7 universal file reader — non-Markdown surfaces.
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

const customComponents = {
  // hast-util-to-jsx-runtime accepts custom tag names via lowercase keys.
  // Our remark plugins emit `<wikilink>`, `<callout>`, `<vault-embed>`,
  // `<mermaid-diagram>`, `<tag>`, `<math-inline>`, `<math-block>` —
  // map each to its React component.
  wikilink: Wikilink,
  callout: Callout,
  'vault-embed': EmbedNode,
  'mermaid-diagram': MermaidDiagram,
  tag: Tag,
  'math-inline': MathInline,
  'math-block': MathBlock,
}

export function DocumentPage() {
  const params = useParams<{ vaultId: string; '*': string }>()
  const vaultId = params.vaultId
  const filePath = params['*'] ?? ''
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [retryToken, setRetryToken] = useState(0)
  const [wikilinkIndex, setWikilinkIndex] = useState<WikilinkIndex | null>(null)

  // Build the wikilink index once per vault. Cheap walk for typical vaults
  // (M1.2 walk is lazy and streams). Re-runs only when vaultId changes.
  useEffect(() => {
    if (!vaultId) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setWikilinkIndex(null)
      return
    }
    let cancelled = false
    void buildIndexSafe(vault)
      .then((index) => {
        if (!cancelled) setWikilinkIndex(index)
      })
      .catch(() => {
        // Index build failure is non-fatal — wikilinks render in pending state.
        if (!cancelled) setWikilinkIndex(null)
      })
    return () => {
      cancelled = true
    }
  }, [vaultId])

  // Read + render the current document.
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
        // Stat first so we can branch directory vs file. One extra round
        // trip per page load — negligible vs. always trying readText and
        // having to ambiguously interpret the resulting error.
        const entry = await v.stat(filePath)
        if (cancelled) return
        if (entry.isDirectory) {
          const entries = await v.list(filePath)
          if (cancelled) return
          setState({ kind: 'directory', entries })
          return
        }

        // M7: route the file to its renderer kind. Markdown stays on the
        // existing pipeline. Plain text + source code go through readText
        // (utf-8 safe). Binaries skip readText entirely so we never feed
        // garbled bytes into the UI.
        const decision = getRendererKind(filePath)

        if (decision.kind === 'media') {
          if (cancelled) return
          setState({
            kind: 'media',
            file: entry,
            media: decision.media,
            vault: v,
          })
          // Image/video/audio aren't "read" in the recent-files sense.
          return
        }

        if (decision.kind === 'binary') {
          if (cancelled) return
          setState({ kind: 'binary', file: entry })
          // Binary files aren't "read" in the recent-files sense; skip
          // markRecentFile to avoid polluting the reading history with
          // images / archives the user merely browsed past.
          return
        }

        const raw = await v.readText(filePath)
        if (cancelled) return

        if (decision.kind === 'markdown') {
          const frontmatter = extractFrontmatter(raw)
          const content = await renderMarkdown(raw, customComponents)
          if (cancelled) return
          setState({
            kind: 'rendered',
            content,
            raw,
            frontmatter,
          })
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
      } catch (err) {
        if (cancelled) return
        if (err instanceof VaultFileNotFoundError) {
          setState({ kind: 'missing-file' })
          return
        }
        // M9.5: a mid-read permission revoke (user pulled the FSAPI
        // grant from the browser settings while we were reading) routes
        // to the same missing-vault flow that fires when the adapter
        // is missing at effect start. ReauthorizeVault offers the user
        // a one-click re-grant from a real user gesture.
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
    // retryToken bumps force a re-run after the user clicks "Try again".
  }, [vaultId, filePath, retryToken])

  useEffect(() => {
    if (!vaultId || !filePath || !wikilinkIndex) return
    if (state.kind !== 'rendered') return
    void indexBacklinksForFile(vaultId, filePath, state.raw, wikilinkIndex)
  }, [vaultId, filePath, wikilinkIndex, state])

  const ctxValue = useMemo(
    () =>
      vaultId
        ? {
            vaultId,
            currentPath: filePath,
            index: wikilinkIndex,
          }
        : null,
    [vaultId, filePath, wikilinkIndex],
  )

  const frontmatterDisplay = useUIStore((s) => s.frontmatterDisplay)
  const proseRef = useRef<HTMLDivElement | null>(null)

  // Publish heading list to the TOC store after each successful render.
  // Walking the rendered DOM keeps headings, slugs, and ids in one place
  // (no need to also slugify in the markdown pipeline). Heading extraction
  // is dynamic-imported so the slugify code lives in the TOC chunk,
  // keeping the main reader bundle lean.
  useEffect(() => {
    if (state.kind !== 'rendered') {
      // text / code / binary / directory all clear the TOC — nothing to
      // anchor against. The right rail collapses to nothing per RX4.
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

    // RX4: publish a compact "what is this document about right now"
    // context to the right rail. Tags + outgoing-link count are derived
    // from the same `raw` source the renderer just consumed, so no
    // extra round-trip is needed. Backlinks count is fetched inside
    // the rail itself (it requires a Dexie read).
    // `tag-index` is dynamic-imported so its body extractor stays out
    // of the eager pipeline chunk; `backlinks` is already eager via
    // BacklinksPanel.
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

  // Scroll memory: restore once content has rendered (the `state` reference
  // changes on each transition, which acts as a layout-ready token).
  useScrollMemory({
    vaultId,
    path: filePath,
    restoreToken: state.kind === 'rendered' ? state : null,
  })

  // RX1: derive an article-style title. Frontmatter title beats body
  // H1 beats cleaned filename. Computed before any conditional render
  // so the hook order stays stable across state transitions (incl.
  // the directory branch below).
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

  // Directory paths get a navigable listing rendered at full container
  // width — `<article>`'s reading column is too narrow for a folder view.
  if (state.kind === 'directory' && vaultId) {
    return (
      <DirectoryListing
        vaultId={vaultId}
        path={filePath}
        entries={state.entries}
        kicker="Folder"
      />
    )
  }

  return (
    <article
      className="mx-auto px-6 py-12 font-serif"
      style={{
        color: 'var(--color-text)',
        maxWidth: 'var(--reader-content-width, 720px)',
      }}
    >
      <header className="swilread-doc-header">
        <h1 className="swilread-doc-header__title">
          {headerTitle || '(no file selected)'}
        </h1>
        {filePath && vaultId && (
          <p
            className="swilread-doc-header__breadcrumb"
            aria-label="File location"
          >
            <span className="swilread-doc-header__vault">{vaultId}</span>
            <span aria-hidden="true" className="swilread-doc-header__sep">
              /
            </span>
            <span className="swilread-doc-header__path">{filePath}</span>
          </p>
        )}
      </header>

      {state.kind === 'loading' && <DocumentSkeleton />}

      {state.kind === 'missing-vault' && vaultId && (
        <ReauthorizeVault vaultId={vaultId} />
      )}

      {state.kind === 'missing-file' && (
        <div className="swilread-doc-empty" role="status">
          <p className="swilread-doc-empty__title">File not found</p>
          <p className="swilread-doc-empty__body">
            This path doesn&apos;t exist in the current vault. Check the file
            tree or pick another file from the command palette (⌘K).
          </p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="swilread-doc-empty" role="alert">
          <p className="swilread-doc-empty__title">
            Couldn&apos;t open this file
          </p>
          <p className="swilread-doc-empty__body">
            Something went wrong while reading this file from the vault. Your
            content is still on disk; this is a SwilRead-side problem.
          </p>
          <div className="swilread-doc-empty__actions">
            <button
              type="button"
              className="swilread-doc-empty__action"
              onClick={() => {
                setRetryToken((n) => n + 1)
              }}
            >
              Try again
            </button>
          </div>
          <details className="swilread-doc-empty__details">
            <summary>Technical details</summary>
            <pre className="swilread-doc-empty__pre">{state.message}</pre>
          </details>
        </div>
      )}

      {state.kind === 'rendered' && ctxValue && (
        <WikilinkContext.Provider value={ctxValue}>
          <FrontmatterPanel
            frontmatter={state.frontmatter}
            display={frontmatterDisplay}
          />
          <EmbedContext.Provider
            value={{
              stack: filePath ? [filePath] : [],
              components: customComponents,
            }}
          >
            <div ref={proseRef} className="swilread-prose">
              {state.content}
            </div>
          </EmbedContext.Provider>
          <BacklinksPanel
            vaultId={ctxValue.vaultId}
            currentPath={ctxValue.currentPath}
          />
        </WikilinkContext.Provider>
      )}

      {state.kind === 'text' && <PlainTextRenderer source={state.raw} />}

      {state.kind === 'code' && (
        <Suspense fallback={null}>
          <CodeFileRenderer source={state.raw} language={state.language} />
        </Suspense>
      )}

      {state.kind === 'table' && (
        <Suspense fallback={null}>
          <CsvRenderer source={state.raw} delimiter={state.delimiter} />
        </Suspense>
      )}

      {state.kind === 'html' && (
        <Suspense fallback={null}>
          <HtmlRenderer source={state.raw} />
        </Suspense>
      )}

      {state.kind === 'json' && (
        <Suspense fallback={null}>
          <JsonRenderer source={state.raw} />
        </Suspense>
      )}

      {state.kind === 'media' && (
        <Suspense fallback={null}>
          <MediaRenderer
            vault={state.vault}
            file={state.file}
            media={state.media}
          />
        </Suspense>
      )}

      {state.kind === 'binary' && (
        <Suspense fallback={null}>
          <UnsupportedRenderer file={state.file} />
        </Suspense>
      )}
    </article>
  )
}

async function buildIndexSafe(vault: VaultFileSystem): Promise<WikilinkIndex> {
  return buildWikilinkIndex(vault)
}
