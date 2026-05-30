import { beforeEach, describe, expect, it } from 'vitest'
import { requestConfirmation, useDialogStore } from './dialog-store'

beforeEach(() => {
  useDialogStore.getState().reset()
})

describe('dialog-store — requestConfirmation', () => {
  it('publishes the payload and resolves true on confirm', async () => {
    const promise = requestConfirmation({
      title: 'Discard?',
      description: 'Throw away your edits',
      confirmLabel: 'Discard',
    })
    expect(useDialogStore.getState().confirmPayload?.title).toBe('Discard?')
    useDialogStore.getState().answerConfirmation(true)
    await expect(promise).resolves.toBe(true)
    expect(useDialogStore.getState().confirmPayload).toBeNull()
  })

  it('resolves false on cancel', async () => {
    const promise = requestConfirmation({
      title: 'Leave?',
      description: 'Nav away',
      confirmLabel: 'Leave',
    })
    useDialogStore.getState().answerConfirmation(false)
    await expect(promise).resolves.toBe(false)
    expect(useDialogStore.getState().confirmPayload).toBeNull()
  })

  it('serializes concurrent confirmations so each caller gets its own answer', async () => {
    const first = requestConfirmation({
      title: 'A',
      description: 'a',
      confirmLabel: 'A',
    })
    const second = requestConfirmation({
      title: 'B',
      description: 'b',
      confirmLabel: 'B',
    })
    // The first prompt is on screen; the second is queued behind it.
    expect(useDialogStore.getState().confirmPayload?.title).toBe('A')
    // Answering advances to the queued prompt; the first caller gets ITS own
    // answer, not a forced cancel.
    useDialogStore.getState().answerConfirmation(true)
    await expect(first).resolves.toBe(true)
    expect(useDialogStore.getState().confirmPayload?.title).toBe('B')
    useDialogStore.getState().answerConfirmation(false)
    await expect(second).resolves.toBe(false)
    expect(useDialogStore.getState().confirmPayload).toBeNull()
  })

  it('reset() rejects any pending prompt as false and clears payload', async () => {
    const promise = requestConfirmation({
      title: 'X',
      description: 'x',
      confirmLabel: 'X',
    })
    useDialogStore.getState().reset()
    await expect(promise).resolves.toBe(false)
    expect(useDialogStore.getState().confirmPayload).toBeNull()
  })
})
