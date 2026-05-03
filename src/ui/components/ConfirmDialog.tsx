/**
 * ConfirmDialog — Radix-backed app-wide confirmation prompt.
 *
 * Mounted once at the AppShell level. Reads the live confirm payload
 * from `useDialogStore`; each call to `requestConfirmation(...)` opens
 * this dialog and resolves on user choice.
 *
 * Lazy-loaded by AppShell so the Radix Dialog instance only ships the
 * first time something asks for a confirmation (typically the dirty
 * editor leaving prompt).
 */

import { useEffect, useRef, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useDialogStore } from '@/stores/dialog-store'

export function ConfirmDialog(): ReactNode {
  const payload = useDialogStore((s) => s.confirmPayload)
  const answer = useDialogStore((s) => s.answerConfirmation)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  // Auto-focus Cancel rather than Confirm — destructive prompts should
  // default to the safe action so a stray Enter keypress doesn't
  // discard work.
  useEffect(() => {
    if (!payload) return
    cancelButtonRef.current?.focus()
  }, [payload])

  if (!payload) return null

  const cancelLabel = payload.cancelLabel ?? 'Cancel'

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) answer(false)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="swirlread-confirm__overlay" />
        <Dialog.Content
          className="swirlread-confirm"
          aria-describedby="swirlread-confirm-desc"
        >
          <Dialog.Title className="swirlread-confirm__title">
            {payload.title}
          </Dialog.Title>
          <Dialog.Description
            id="swirlread-confirm-desc"
            className="swirlread-confirm__desc"
          >
            {payload.description}
          </Dialog.Description>
          <div className="swirlread-confirm__actions">
            <button
              ref={cancelButtonRef}
              type="button"
              className="swirlread-edit__btn"
              onClick={() => {
                answer(false)
              }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={
                'swirlread-edit__btn swirlread-edit__btn--primary' +
                (payload.destructive ? ' swirlread-confirm__btn--danger' : '')
              }
              onClick={() => {
                answer(true)
              }}
            >
              {payload.confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
