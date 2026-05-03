/**
 * DocumentEditSurface — Phase 2C lightweight editor UI.
 *
 * Owned by DocumentBodyView and lazy-loaded so the CodeMirror 6 runtime
 * stays out of the read-only reader bundle. This surface handles three
 * concerns:
 *
 *   1. Mount a minimal CodeMirror 6 editor scoped to the current
 *      document. Wires save / cancel / find via keymap and pipes every
 *      doc change into `useEditorStore.updateDraft`.
 *   2. Render a toolbar with Save / Cancel / find affordance + a status
 *      pill (`saved` / `dirty` / `saving`).
 *   3. Surface conflict and error banners from the editor session — for
 *      stale-on-disk we show Reload-from-disk + Overwrite-anyway buttons
 *      so the user has a real choice before losing either side.
 *
 * The component is mounted only when the editor session targets the
 * current (vaultId, path); DocumentBodyView gates that.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { requestConfirmation } from '@/stores/dialog-store'
import { useEditorStore, type EditorError } from '@/stores/editor-store'
import {
  EDITOR_FONT_SIZE_PX,
  useUIStore,
  type EditorFontSize,
} from '@/stores/ui-store'

interface Props {
  vaultId: string
  path: string
  /**
   * Callback fired when the user explicitly leaves edit mode (Cancel,
   * or Save success). DocumentPage uses this to refresh the loader so
   * the read view picks up the on-disk changes.
   */
  onExit: () => void
}

/**
 * Save then exit on success. Per the lightweight-editing plan UX:
 * "Save -> write file -> re-render -> return to reading mode". If the
 * save surfaces a conflict / error, stay in edit mode so the user can
 * resolve.
 */
async function saveAndMaybeExit(onExit: () => void): Promise<void> {
  const result = await useEditorStore.getState().save()
  if (result !== 'clean') return
  if (useEditorStore.getState().active?.error) return
  useEditorStore.getState().cancel()
  onExit()
}

export function DocumentEditSurface({
  vaultId,
  path,
  onExit,
}: Props): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Compartments let us swap individual extensions without rebuilding
  // the whole EditorState — keeps undo history alive across pref changes.
  const lineNumbersCompartmentRef = useRef(new Compartment())
  const lineWrapCompartmentRef = useRef(new Compartment())
  // Read live session state — re-renders the chrome (toolbar / banners)
  // on every store change. The CodeMirror view itself does NOT re-mount
  // on each render; it lives inside the ref-guarded effect below.
  const session = useEditorStore((s) => s.active)
  const editorLineNumbers = useUIStore((s) => s.editorLineNumbers)
  const editorLineWrap = useUIStore((s) => s.editorLineWrap)
  const editorFontSize = useUIStore((s) => s.editorFontSize)

  // Mount CodeMirror once per (vaultId, path) pair. If the user exits
  // edit and re-enters from a different file, the parent unmounts this
  // component first, so the keying via vaultId+path here is just
  // belt-and-suspenders against a future shared-instance refactor.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const initial = useEditorStore.getState().active?.draft ?? ''

    const initialPrefs = {
      lineNumbers: useUIStore.getState().editorLineNumbers,
      lineWrap: useUIStore.getState().editorLineWrap,
    }
    const view = new EditorView({
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          markdown(),
          search({ top: true }),
          syntaxHighlighting(defaultHighlightStyle),
          lineNumbersCompartmentRef.current.of(
            lineNumbersExtension(initialPrefs.lineNumbers),
          ),
          lineWrapCompartmentRef.current.of(
            lineWrapExtension(initialPrefs.lineWrap),
          ),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                void saveAndMaybeExit(onExit)
                return true
              },
            },
            {
              key: 'Escape',
              preventDefault: true,
              run: () => {
                void handleCancel(onExit)
                return true
              },
            },
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const next = update.state.doc.toString()
            // Avoid an echo loop with reloadFromDisk: only push to the
            // store when the editor doc actually diverges from what the
            // store already holds.
            const live = useEditorStore.getState().active
            if (live && live.draft !== next) {
              useEditorStore.getState().updateDraft(next)
            }
          }),
        ],
      }),
      parent: container,
    })
    viewRef.current = view
    // Focus on mount so the user can start typing immediately.
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Mount-once: subsequent draft changes flow through the store and
    // back-propagation effect below. Re-running on every render would
    // wipe undo history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, path])

  // Back-propagation: when the store's draft changes from outside the
  // editor (reloadFromDisk, overwrite race), push the new value into
  // CodeMirror so the visible doc stays consistent. updateListener
  // above guards the reverse direction so we don't ping-pong.
  useEffect(() => {
    if (!session) return
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== session.draft) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: session.draft },
      })
    }
  }, [session?.draft, session])

  // Reconfigure compartments when the user toggles editor prefs in
  // settings. Cheap dispatches; no full state rebuild = undo history
  // intact.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: lineNumbersCompartmentRef.current.reconfigure(
        lineNumbersExtension(editorLineNumbers),
      ),
    })
  }, [editorLineNumbers])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: lineWrapCompartmentRef.current.reconfigure(
        lineWrapExtension(editorLineWrap),
      ),
    })
  }, [editorLineWrap])

  if (session?.vaultId !== vaultId || session.path !== path) {
    // Defensive: the parent gates rendering, but if the session
    // changes mid-render we render nothing rather than a stale editor.
    return null
  }

  const { dirty, saving, error, conflict } = session
  const status = saving ? 'saving' : dirty ? 'dirty' : 'saved'
  const statusLabel = saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : 'All changes saved'

  return (
    <section
      className="swirlread-edit"
      aria-label={`Editing ${path}`}
      data-testid="document-edit-surface"
    >
      <div className="swirlread-edit__toolbar" role="toolbar">
        <span
          className={
            'swirlread-edit__status' +
            (dirty ? ' swirlread-edit__status--dirty' : '')
          }
          aria-live="polite"
          data-status={status}
        >
          {statusLabel}
        </span>
        <span className="swirlread-edit__spacer" aria-hidden="true" />
        <button
          type="button"
          className="swirlread-edit__btn"
          onClick={() => {
            void handleCancel(onExit)
          }}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="swirlread-edit__btn swirlread-edit__btn--primary"
          onClick={() => {
            void saveAndMaybeExit(onExit)
          }}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="swirlread-edit__btn"
          onClick={() => {
            const view = viewRef.current
            if (!view) return
            view.focus()
            // CodeMirror's search panel exposes itself via the same
            // commands the keymap binds; trigger via a synthetic keydown
            // so we get the panel rather than re-implementing it.
            const evt = new KeyboardEvent('keydown', {
              key: 'f',
              code: 'KeyF',
              metaKey: true,
              ctrlKey: true,
              bubbles: true,
            })
            view.contentDOM.dispatchEvent(evt)
          }}
          disabled={saving}
        >
          Find
        </button>
      </div>

      {conflict === 'stale-on-disk' && (
        <div
          className="swirlread-edit__banner swirlread-edit__banner--conflict"
          role="alert"
        >
          <span className="swirlread-edit__banner-title">
            This file changed outside SwirlRead
          </span>
          <span>
            Your draft is preserved in memory. Choose how to resolve before
            saving.
          </span>
          <div className="swirlread-edit__banner-actions">
            <button
              type="button"
              className="swirlread-edit__btn"
              onClick={() => {
                void useEditorStore.getState().reloadFromDisk()
              }}
              disabled={saving}
            >
              Reload from disk (discard my draft)
            </button>
            <button
              type="button"
              className="swirlread-edit__btn"
              onClick={() => {
                void useEditorStore.getState().overwrite()
              }}
              disabled={saving}
            >
              Overwrite anyway
            </button>
          </div>
        </div>
      )}

      {error && <EditorErrorBanner error={error} />}

      <div
        ref={containerRef}
        className="swirlread-edit__editor"
        data-testid="codemirror-host"
        style={{ fontSize: `${editorFontSizePx(editorFontSize)}px` }}
      />
    </section>
  )
}

function EditorErrorBanner({ error }: { error: EditorError }): ReactNode {
  const title =
    error.kind === 'permission-denied'
      ? 'Write permission denied'
      : error.kind === 'file-missing'
        ? 'File no longer exists'
        : error.kind === 'read-only-vault'
          ? 'This vault is read-only'
          : error.kind === 'write-failed'
            ? 'Save failed'
            : 'Something went wrong'

  return (
    <div
      className="swirlread-edit__banner swirlread-edit__banner--error"
      role="alert"
    >
      <span className="swirlread-edit__banner-title">{title}</span>
      <span>{error.message}</span>
      <div className="swirlread-edit__banner-actions">
        <button
          type="button"
          className="swirlread-edit__btn"
          onClick={() => {
            useEditorStore.getState().clearError()
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function lineNumbersExtension(on: boolean): Extension {
  return on ? lineNumbers() : []
}

function lineWrapExtension(on: boolean): Extension {
  return on ? EditorView.lineWrapping : []
}

function editorFontSizePx(size: EditorFontSize): number {
  return EDITOR_FONT_SIZE_PX[size]
}

async function handleCancel(onExit: () => void): Promise<void> {
  const session = useEditorStore.getState().active
  if (session?.dirty) {
    const ok = await requestConfirmation({
      title: 'Discard unsaved changes?',
      description:
        'You have unsaved edits. Closing the editor will throw them away.',
      confirmLabel: 'Discard and close',
      cancelLabel: 'Keep editing',
      destructive: true,
    })
    if (!ok) return
  }
  useEditorStore.getState().cancel()
  onExit()
}
