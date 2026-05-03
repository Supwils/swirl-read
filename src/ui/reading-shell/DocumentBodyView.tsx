/**
 * DocumentBodyView — renders the <article> shell and all content branches
 * for the active document state. Lazy-loaded file renderers live here so
 * they stay out of the main DocumentPage chunk.
 */

import { lazy, Suspense, type ReactNode, type RefObject } from 'react'
import type { WikilinkIndex } from '@/core/navigation/wikilink-resolver'
import { useUIStore } from '@/stores/ui-store'
import { DirectoryListing } from './DirectoryListing'
import { ReauthorizeVault } from './ReauthorizeVault'
import { DocumentSkeleton } from './DocumentSkeleton'
import { FrontmatterPanel } from './Frontmatter'
import { BacklinksPanel } from './BacklinksPanel'
import { WikilinkContext } from './wikilink-context'
import { EmbedContext } from './embed-context'
import { PlainTextRenderer } from './PlainTextRenderer'
import { customComponents } from './document-components'
import type { LoadState } from './use-document-loader'

// M9.1 perf pass: the M7 universal-file renderers are paid for on every
// Markdown page that doesn't open them. React.lazy puts each in its own
// chunk; Suspense renders nothing while the chunk resolves.
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

interface DocumentBodyViewProps {
  state: LoadState
  vaultId: string | undefined
  filePath: string
  wikilinkIndex: WikilinkIndex | null
  proseRef: RefObject<HTMLDivElement | null>
  headerTitle: string
  setRetryToken: (fn: (n: number) => number) => void
}

export function DocumentBodyView({
  state,
  vaultId,
  filePath,
  wikilinkIndex,
  proseRef,
  headerTitle,
  setRetryToken,
}: DocumentBodyViewProps): ReactNode {
  const frontmatterDisplay = useUIStore((s) => s.frontmatterDisplay)

  const ctxValue = vaultId
    ? { vaultId, currentPath: filePath, index: wikilinkIndex }
    : null

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
