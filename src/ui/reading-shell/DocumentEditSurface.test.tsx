/**
 * DocumentEditSurface tests cover the SwirlRead chrome (toolbar, banners,
 * store-driven state). The CodeMirror 6 EditorView is mocked because
 * jsdom can't host its contenteditable measurement reliably; we still
 * verify the host element renders and is wired to the editor's lifecycle.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useDialogStore } from '@/stores/dialog-store'
import { useEditorStore } from '@/stores/editor-store'
import { DocumentEditSurface } from './DocumentEditSurface'

const destroyMock = vi.fn()
const focusMock = vi.fn()
const dispatchMock = vi.fn()
const updateListenerCallbacks: ((u: unknown) => void)[] = []
let lastEditorViewState: { docToString: () => string } | null = null

vi.mock('@codemirror/view', () => {
  class FakeEditorView {
    contentDOM = document.createElement('div')
    state: { doc: { toString: () => string; length: number } }
    constructor(opts: { state: { doc: string }; parent: HTMLElement }) {
      const text = opts.state.doc
      this.state = {
        doc: {
          toString: () => text,
          length: text.length,
        },
      }
      lastEditorViewState = { docToString: () => text }
      opts.parent.appendChild(this.contentDOM)
    }
    focus = focusMock
    destroy = destroyMock
    dispatch = dispatchMock
    static updateListener = {
      of(cb: (u: unknown) => void) {
        updateListenerCallbacks.push(cb)
        return { type: 'updateListener' as const }
      },
    }
    static lineWrapping = { type: 'lineWrapping' as const }
    static theme() {
      return { type: 'theme' as const }
    }
  }
  return {
    EditorView: FakeEditorView,
    keymap: { of: () => ({ type: 'keymap' as const }) },
    lineNumbers: () => ({ type: 'lineNumbers' as const }),
  }
})

vi.mock('@codemirror/state', () => {
  class FakeCompartment {
    of(ext: unknown) {
      return ext
    }
    reconfigure(ext: unknown) {
      return ext
    }
  }
  return {
    EditorState: {
      create: (cfg: { doc: string }) => ({ doc: cfg.doc }),
    },
    Compartment: FakeCompartment,
  }
})

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: () => ({ type: 'history' as const }),
  historyKeymap: [],
}))

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({ type: 'markdown' as const }),
}))

vi.mock('@codemirror/language', () => ({
  defaultHighlightStyle: { type: 'highlightStyle' as const },
  syntaxHighlighting: () => ({ type: 'syntaxHighlighting' as const }),
}))

vi.mock('@codemirror/search', () => ({
  search: () => ({ type: 'search' as const }),
  searchKeymap: [],
}))

beforeEach(() => {
  useEditorStore.setState({ active: null })
  useDialogStore.getState().reset()
  destroyMock.mockClear()
  focusMock.mockClear()
  dispatchMock.mockClear()
  updateListenerCallbacks.length = 0
  lastEditorViewState = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

function enterSession(opts?: {
  vaultId?: string
  path?: string
  source?: string
}): void {
  useEditorStore
    .getState()
    .enter(opts?.vaultId ?? 'v', opts?.path ?? 'a.md', opts?.source ?? 'hello')
}

describe('DocumentEditSurface — chrome', () => {
  it('mounts the editor host and seeds CodeMirror with the current draft', () => {
    enterSession({ source: 'first draft' })
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={vi.fn()} />)
    expect(screen.getByTestId('document-edit-surface')).toBeInTheDocument()
    expect(screen.getByTestId('codemirror-host')).toBeInTheDocument()
    expect(focusMock).toHaveBeenCalledOnce()
    expect(lastEditorViewState?.docToString()).toBe('first draft')
  })

  it('returns null when no session matches the current document', () => {
    enterSession({ vaultId: 'other-vault', path: 'a.md' })
    const { container } = render(
      <DocumentEditSurface vaultId="v" path="a.md" onExit={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('reflects status pill: saved → dirty → saving', () => {
    enterSession({ source: 'one' })
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={vi.fn()} />)
    expect(screen.getByText('All changes saved')).toBeInTheDocument()

    act(() => {
      useEditorStore.getState().updateDraft('two')
    })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    act(() => {
      const session = useEditorStore.getState().active!
      useEditorStore.setState({ active: { ...session, saving: true } })
    })
    expect(screen.getAllByText('Saving…')[0]).toBeInTheDocument()
  })

  it('cancel button (clean session) calls onExit immediately', () => {
    enterSession()
    const onExit = vi.fn()
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useEditorStore.getState().active).toBeNull()
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('cancel button (dirty session) opens the Radix confirm dialog before exiting', async () => {
    enterSession({ source: 'one' })
    act(() => {
      useEditorStore.getState().updateDraft('two')
    })
    const onExit = vi.fn()
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={onExit} />)

    // First click: user keeps editing
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(useDialogStore.getState().confirmPayload?.title).toBe(
        'Discard unsaved changes?',
      )
    })
    act(() => {
      useDialogStore.getState().answerConfirmation(false)
    })
    await waitFor(() => {
      expect(useDialogStore.getState().confirmPayload).toBeNull()
    })
    expect(onExit).not.toHaveBeenCalled()
    expect(useEditorStore.getState().active).not.toBeNull()

    // Second click: user discards
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(useDialogStore.getState().confirmPayload).not.toBeNull()
    })
    act(() => {
      useDialogStore.getState().answerConfirmation(true)
    })
    await waitFor(() => {
      expect(onExit).toHaveBeenCalled()
    })
    expect(useEditorStore.getState().active).toBeNull()
  })

  it('Save is disabled when the session is clean', () => {
    enterSession()
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Save calls editor-store.save and exits on clean result', async () => {
    enterSession({ source: 'one' })
    act(() => {
      useEditorStore.getState().updateDraft('two')
    })
    const saveSpy = vi
      .spyOn(useEditorStore.getState(), 'save')
      .mockResolvedValue('clean')
    const onExit = vi.fn()
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(onExit).toHaveBeenCalled()
    })
    expect(useEditorStore.getState().active).toBeNull()
  })

  it('Save stays in edit mode when the result is stale-on-disk', async () => {
    enterSession({ source: 'one' })
    act(() => {
      useEditorStore.getState().updateDraft('two')
    })
    vi.spyOn(useEditorStore.getState(), 'save').mockResolvedValue(
      'stale-on-disk',
    )
    const onExit = vi.fn()
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(useEditorStore.getState().active).not.toBeNull()
    })
    expect(onExit).not.toHaveBeenCalled()
  })
})

describe('DocumentEditSurface — banners', () => {
  it('renders conflict banner with Reload + Overwrite buttons when stale', () => {
    enterSession({ source: 'one' })
    act(() => {
      useEditorStore.getState().updateDraft('two')
      const session = useEditorStore.getState().active!
      useEditorStore.setState({
        active: { ...session, conflict: 'stale-on-disk' },
      })
    })
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={vi.fn()} />)
    expect(
      screen.getByText(/This file changed outside SwirlRead/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Reload from disk/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Overwrite anyway' }),
    ).toBeInTheDocument()
  })

  it('renders the permission-denied error banner with Dismiss', () => {
    enterSession()
    act(() => {
      const session = useEditorStore.getState().active!
      useEditorStore.setState({
        active: {
          ...session,
          error: {
            kind: 'permission-denied',
            message: 'Write permission denied — your draft is preserved',
          },
        },
      })
    })
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={vi.fn()} />)
    expect(screen.getByText('Write permission denied')).toBeInTheDocument()
    expect(screen.getByText(/your draft is preserved/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(useEditorStore.getState().active?.error).toBeNull()
  })

  it('renders the read-only-vault error banner', () => {
    enterSession()
    act(() => {
      const session = useEditorStore.getState().active!
      useEditorStore.setState({
        active: {
          ...session,
          error: {
            kind: 'read-only-vault',
            message: 'Sample vault is read-only — open your own vault to edit',
          },
        },
      })
    })
    render(<DocumentEditSurface vaultId="v" path="a.md" onExit={vi.fn()} />)
    expect(screen.getByText('This vault is read-only')).toBeInTheDocument()
  })
})
