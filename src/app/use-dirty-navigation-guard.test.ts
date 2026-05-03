import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogStore } from '@/stores/dialog-store'
import { useEditorStore } from '@/stores/editor-store'
import {
  confirmLeaveIfDirty,
  useDirtyNavigationGuard,
} from './use-dirty-navigation-guard'

beforeEach(() => {
  useEditorStore.setState({ active: null })
  useDialogStore.getState().reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function fireBeforeUnload(): Event {
  // jsdom doesn't ship a BeforeUnloadEvent constructor, so synthesize one
  // shaped like the real event. preventDefault + returnValue are the only
  // surface our handler touches; both live on the base Event type in
  // TypeScript's DOM lib so no cast is needed.
  const event = new Event('beforeunload', { cancelable: true })
  Object.defineProperty(event, 'returnValue', {
    writable: true,
    value: '',
  })
  window.dispatchEvent(event)
  return event
}

describe('useDirtyNavigationGuard', () => {
  it('does NOT block beforeunload when no editor session is active', () => {
    renderHook(() => {
      useDirtyNavigationGuard()
    })
    const event = fireBeforeUnload()
    expect(event.defaultPrevented).toBe(false)
    expect(event.returnValue).toBe('')
  })

  it('does NOT block beforeunload when session is clean', () => {
    useEditorStore.getState().enter('v', 'a.md', 'one')
    renderHook(() => {
      useDirtyNavigationGuard()
    })
    const event = fireBeforeUnload()
    expect(event.defaultPrevented).toBe(false)
  })

  it('blocks beforeunload when session is dirty', () => {
    useEditorStore.getState().enter('v', 'a.md', 'one')
    useEditorStore.getState().updateDraft('two')
    renderHook(() => {
      useDirtyNavigationGuard()
    })
    const event = fireBeforeUnload()
    expect(event.defaultPrevented).toBe(true)
    expect(event.returnValue).toContain('unsaved changes')
  })

  it('removes the listener on unmount', () => {
    useEditorStore.getState().enter('v', 'a.md', 'one')
    useEditorStore.getState().updateDraft('two')
    const { unmount } = renderHook(() => {
      useDirtyNavigationGuard()
    })
    unmount()
    const event = fireBeforeUnload()
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('confirmLeaveIfDirty', () => {
  it('returns true when there is no active session', async () => {
    await expect(confirmLeaveIfDirty()).resolves.toBe(true)
  })

  it('returns true when the active session is clean', async () => {
    useEditorStore.getState().enter('v', 'a.md', 'one')
    await expect(confirmLeaveIfDirty()).resolves.toBe(true)
  })

  it('opens the Radix confirm dialog and forwards the user choice when dirty', async () => {
    useEditorStore.getState().enter('v', 'a.md', 'one')
    useEditorStore.getState().updateDraft('two')

    const acceptedPromise = confirmLeaveIfDirty()
    expect(useDialogStore.getState().confirmPayload?.title).toBe(
      'Discard unsaved changes?',
    )
    useDialogStore.getState().answerConfirmation(true)
    await expect(acceptedPromise).resolves.toBe(true)

    const rejectedPromise = confirmLeaveIfDirty()
    useDialogStore.getState().answerConfirmation(false)
    await expect(rejectedPromise).resolves.toBe(false)
  })
})
