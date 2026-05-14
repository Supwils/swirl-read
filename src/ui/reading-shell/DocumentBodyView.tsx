/**
 * DocumentBodyView — renders the <article> shell and all content branches
 * for the active document state. Lazy-loaded file renderers live here so
 * they stay out of the main DocumentPage chunk.
 */

import { lazy, useEffect, type ReactNode, type RefObject } from 'react'
import { ChunkBoundary } from '@/ui/components/ChunkBoundary'
import { Pencil, Sparkles } from 'lucide-react'
import { useReviewStore } from '@/stores/review-store'
import type { WikilinkIndex } from '@/core/navigation/wikilink-resolver'
import { useEditorStore } from '@/stores/editor-store'
import { useUIStore } from '@/stores/ui-store'
import { getAdapter } from '@/stores/vault-store'
import { DirectoryListing } from './DirectoryListing'
import { ReauthorizeVault } from './ReauthorizeVault'
import { DocumentSkeleton } from './DocumentSkeleton'
import { FrontmatterPanel } from './Frontmatter'
import { BacklinksPanel } from './BacklinksPanel'
import { WikilinkContext } from './wikilink-context'
import { EmbedContext } from './embed-context'
import { PlainTextRenderer } from './PlainTextRenderer'
import { customComponents } from './document-components'
import { DocNav } from './DocNav'
import { useAdjacentFiles } from './use-adjacent-files'
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

// Phase 2C: CodeMirror runtime + EditSurface chrome are quarantined in
// their own chunk. Readers who never enter edit mode never download it.
const DocumentEditSurface = lazy(() =>
  import('./DocumentEditSurface').then((m) => ({
    default: m.DocumentEditSurface,
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
  externalChange: 'clean' | 'changed'
  onReloadExternalChange: () => void
  onDismissExternalChange: () => void
}

/**
 * True when an editor session is active and targets the file currently
 * displayed by DocumentBodyView. Subscribes to the store so the surface
 * swap triggers a re-render.
 */
function useIsEditingThisDocument(
  vaultId: string | undefined,
  filePath: string,
): boolean {
  const session = useEditorStore((s) => s.active)
  if (!session || !vaultId) return false
  return session.vaultId === vaultId && session.path === filePath
}

export function DocumentBodyView({
  state,
  vaultId,
  filePath,
  wikilinkIndex,
  proseRef,
  headerTitle,
  setRetryToken,
  externalChange,
  onReloadExternalChange,
  onDismissExternalChange,
}: DocumentBodyViewProps): ReactNode {
  const frontmatterDisplay = useUIStore((s) => s.frontmatterDisplay)
  const adjacent = useAdjacentFiles(vaultId, filePath)
  const isEditing = useIsEditingThisDocument(vaultId, filePath)
  const requestGenerate = useReviewStore((s) => s.requestGenerate)

  const ctxValue = vaultId
    ? { vaultId, currentPath: filePath, index: wikilinkIndex }
    : null

  function exitEditMode(): void {
    setRetryToken((n) => n + 1)
  }

  function startEditing(rawSource: string): void {
    if (!vaultId || !filePath) return
    useEditorStore.getState().enter(vaultId, filePath, rawSource)
  }

  // Edit mode is offered for Markdown documents whose adapter is not
  // statically read-only. `isReadOnly` is a sync capability flag (see
  // VaultFileSystem) so we can hide the affordance entirely on the
  // sample vault rather than letting the user enter edit mode and
  // bounce off a read-only error from the first save.
  const adapter = vaultId ? getAdapter(vaultId) : null
  const canEdit =
    state.kind === 'rendered' && adapter !== null && !adapter.isReadOnly

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

  // HTML previews benefit from a wider canvas than the prose reading
  // column — they often contain full-bleed layouts, tables, or stylesheets
  // tuned for desktop widths. We expand the article max-width only for
  // this kind so prose docs keep their measured column. The value is
  // capped by the content column, so left/right sidebars are unaffected.
  const isHtmlPreview = state.kind === 'html'
  const articleMaxWidth = isHtmlPreview
    ? 'max(var(--reader-content-width, 720px), min(1180px, 100%))'
    : 'var(--reader-content-width, 720px)'

  return (
    <article
      className="mx-auto px-6 py-12 font-serif"
      style={{
        color: 'var(--color-text)',
        maxWidth: articleMaxWidth,
      }}
    >
      <header className="swirlread-doc-header">
        <h1 className="swirlread-doc-header__title">
          {headerTitle || '(no file selected)'}
        </h1>
        {filePath && vaultId && (
          <p
            className="swirlread-doc-header__breadcrumb"
            aria-label="File location"
          >
            <span className="swirlread-doc-header__vault">{vaultId}</span>
            <span aria-hidden="true" className="swirlread-doc-header__sep">
              /
            </span>
            <span className="swirlread-doc-header__path">{filePath}</span>
          </p>
        )}
        {canEdit && !isEditing && state.kind === 'rendered' && (
          <button
            type="button"
            className="swirlread-doc-header__edit"
            onClick={() => {
              startEditing(state.raw)
            }}
            aria-label="Edit this document"
          >
            <Pencil size={13} aria-hidden="true" />
            <span>Edit</span>
          </button>
        )}
        {state.kind === 'rendered' && vaultId && filePath && !isEditing && (
          <button
            type="button"
            className="swirlread-doc-header__edit"
            onClick={() => {
              requestGenerate({ vaultId, path: filePath })
            }}
            aria-label="Generate review cards from this document"
          >
            <Sparkles size={13} aria-hidden="true" />
            <span>Review cards</span>
          </button>
        )}
      </header>

      {externalChange === 'changed' && vaultId && filePath && (
        <ExternalChangeBanner
          isEditing={isEditing}
          onReload={() => {
            if (isEditing) {
              void useEditorStore
                .getState()
                .reloadFromDisk()
                .then(onReloadExternalChange)
              return
            }
            onReloadExternalChange()
          }}
          onDismiss={onDismissExternalChange}
        />
      )}

      {state.kind === 'loading' && <DocumentSkeleton />}

      {state.kind === 'missing-vault' && vaultId && (
        <ReauthorizeVault vaultId={vaultId} />
      )}

      {state.kind === 'missing-file' && (
        <div className="swirlread-doc-empty" role="status">
          <p className="swirlread-doc-empty__title">File not found</p>
          <p className="swirlread-doc-empty__body">
            This path doesn&apos;t exist in the current vault. Check the file
            tree or pick another file from the command palette (⌘K).
          </p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="swirlread-doc-empty" role="alert">
          <p className="swirlread-doc-empty__title">
            Couldn&apos;t open this file
          </p>
          <p className="swirlread-doc-empty__body">
            Something went wrong while reading this file from the vault. Your
            content is still on disk; this is a SwirlRead-side problem.
          </p>
          <div className="swirlread-doc-empty__actions">
            <button
              type="button"
              className="swirlread-doc-empty__action"
              onClick={() => {
                setRetryToken((n) => n + 1)
              }}
            >
              Try again
            </button>
          </div>
          <details className="swirlread-doc-empty__details">
            <summary>Technical details</summary>
            <pre className="swirlread-doc-empty__pre">{state.message}</pre>
          </details>
        </div>
      )}

      {state.kind === 'rendered' && ctxValue && !isEditing && (
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
            <div ref={proseRef} className="swirlread-prose">
              {state.content}
            </div>
          </EmbedContext.Provider>
          <BacklinksPanel
            vaultId={ctxValue.vaultId}
            currentPath={ctxValue.currentPath}
          />
        </WikilinkContext.Provider>
      )}

      {state.kind === 'rendered' && isEditing && vaultId && (
        <ChunkBoundary label="editor">
          <DocumentEditSurface
            vaultId={vaultId}
            path={filePath}
            onExit={exitEditMode}
          />
        </ChunkBoundary>
      )}

      {state.kind === 'text' && <PlainTextRenderer source={state.raw} />}

      {state.kind === 'code' && (
        <ChunkBoundary label="code renderer">
          <CodeFileRenderer source={state.raw} language={state.language} />
        </ChunkBoundary>
      )}

      {state.kind === 'table' && (
        <ChunkBoundary label="CSV renderer">
          <CsvRenderer source={state.raw} delimiter={state.delimiter} />
        </ChunkBoundary>
      )}

      {state.kind === 'html' && (
        <ChunkBoundary label="HTML renderer">
          <HtmlRenderer source={state.raw} />
        </ChunkBoundary>
      )}

      {state.kind === 'json' && (
        <ChunkBoundary label="JSON renderer">
          <JsonRenderer source={state.raw} />
        </ChunkBoundary>
      )}

      {state.kind === 'media' && (
        <ChunkBoundary label="media renderer">
          <MediaRenderer
            vault={state.vault}
            file={state.file}
            media={state.media}
          />
        </ChunkBoundary>
      )}

      {state.kind === 'binary' && (
        <ChunkBoundary label="unsupported-file message">
          <UnsupportedRenderer file={state.file} />
        </ChunkBoundary>
      )}

      {vaultId &&
        state.kind !== 'idle' &&
        state.kind !== 'loading' &&
        state.kind !== 'missing-vault' &&
        state.kind !== 'missing-file' &&
        state.kind !== 'error' &&
        state.kind !== 'directory' && (
          <DocNav vaultId={vaultId} prev={adjacent.prev} next={adjacent.next} />
        )}
    </article>
  )
}

function ExternalChangeBanner({
  isEditing,
  onReload,
  onDismiss,
}: {
  isEditing: boolean
  onReload: () => void
  onDismiss: () => void
}): ReactNode {
  // Reader-mode keyboard shortcuts: R reloads the latest on-disk
  // version, Esc dismisses the banner. We deliberately skip these
  // while editing — DocumentEditSurface owns Esc (cancel) and a single
  // R keypress would silently destroy the draft. Edit-mode users get
  // the explicit buttons only.
  useEffect(() => {
    if (isEditing) return
    function handle(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return
      }
      if (isEditableTarget(event.target)) return
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        onReload()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
    }
  }, [isEditing, onReload, onDismiss])

  return (
    <div
      className="swirlread-edit__banner swirlread-edit__banner--conflict"
      role="status"
    >
      <span className="swirlread-edit__banner-title">
        This file changed outside SwirlRead
      </span>
      <span>
        {isEditing
          ? 'Your draft is preserved. Reload only if you want to replace it with the on-disk version.'
          : 'The open document may be stale. Press R to reload, Esc to dismiss.'}
      </span>
      <div className="swirlread-edit__banner-actions">
        <button
          type="button"
          className="swirlread-edit__btn"
          onClick={onReload}
        >
          {isEditing ? 'Reload from disk (discard my draft)' : 'Reload (R)'}
        </button>
        <button
          type="button"
          className="swirlread-edit__btn"
          onClick={onDismiss}
        >
          {isEditing ? 'Keep editing' : 'Dismiss (Esc)'}
        </button>
      </div>
    </div>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const ceProp = target.contentEditable
  if (ceProp === 'true' || ceProp === 'plaintext-only') return true
  const ceAttr = target.getAttribute('contenteditable')
  if (ceAttr === '' || ceAttr === 'true' || ceAttr === 'plaintext-only') {
    return true
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
