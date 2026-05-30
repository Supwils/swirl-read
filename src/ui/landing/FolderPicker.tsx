import { useEffect, useRef, useState } from 'react'
import { FSAPIVaultAdapter } from '@/core/vault'

export interface FolderPickerProps {
  /** Whether the consent panel is currently visible. */
  open: boolean
  /** Called when the user dismisses the panel without picking. */
  onClose: () => void
  /** Called with the wrapped adapter after a successful pick + grant. */
  onPicked: (adapter: FSAPIVaultAdapter) => void | Promise<void>
}

type PanelState = 'idle' | 'picking' | 'error'

export function FolderPicker({ open, onClose, onPicked }: FolderPickerProps) {
  const [state, setState] = useState<PanelState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  // Reset state when the panel opens; focus the safe action.
  useEffect(() => {
    if (open) {
      setState('idle')
      setErrorMessage(null)
      // Focus Cancel by default — never trap a user inside an OS dialog.
      requestAnimationFrame(() => cancelButtonRef.current?.focus())
    }
  }, [open])

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state !== 'picking') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, state, onClose])

  if (!open) return null

  const fsapiSupported =
    typeof window !== 'undefined' && 'showDirectoryPicker' in window

  async function handleChooseFolder() {
    setState('picking')
    setErrorMessage(null)
    try {
      const adapter = await FSAPIVaultAdapter.pick()
      await onPicked(adapter)
    } catch (err) {
      // User dismissed the OS dialog → silent return to idle.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState('idle')
        return
      }
      setState('error')
      // Permission-denied gets a clear, actionable message rather than the
      // raw DOMException text ("The user aborted a request." etc.).
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      ) {
        setErrorMessage(
          'SwirlRead needs permission to read that folder. Try again and choose “Allow”.',
        )
        return
      }
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not open the folder. Please try again.',
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-picker-title"
      aria-describedby="folder-picker-body"
      className="mx-auto mt-10 max-w-md rounded-xl px-7 py-6 text-left shadow-md"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        borderWidth: '1px',
        borderStyle: 'solid',
        boxShadow: '0 4px 24px var(--color-shadow)',
      }}
    >
      <h2
        id="folder-picker-title"
        className="font-serif text-2xl font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Open your vault
      </h2>

      <div
        id="folder-picker-body"
        className="mt-4 space-y-3 font-serif text-base leading-relaxed"
        style={{ color: 'var(--color-text)' }}
      >
        <p>
          Choose any folder containing your Markdown files. SwirlRead reads them
          directly from your device. Nothing is uploaded.
        </p>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Compatible with: plain folders, Obsidian vaults, Logseq graphs.
        </p>
      </div>

      {!fsapiSupported && (
        <p
          className="mt-4 rounded-md px-3 py-2 font-serif text-sm"
          style={{
            backgroundColor: 'var(--color-code-bg)',
            color: 'var(--color-text-muted)',
          }}
        >
          Your browser does not support the File System Access API. Try the
          latest Chrome, Edge, or Brave.
        </p>
      )}

      {state === 'error' && errorMessage && (
        <p
          role="alert"
          className="mt-4 rounded-md px-3 py-2 font-serif text-sm"
          style={{
            backgroundColor: 'var(--color-code-bg)',
            color: 'var(--color-text)',
          }}
        >
          {errorMessage}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          ref={cancelButtonRef}
          type="button"
          onClick={onClose}
          disabled={state === 'picking'}
          className="rounded-md px-4 py-2 font-serif text-base disabled:opacity-50"
          style={{
            color: 'var(--color-text-muted)',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleChooseFolder}
          disabled={state === 'picking' || !fsapiSupported}
          className="rounded-md px-5 py-2 font-serif text-base font-medium disabled:opacity-60"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-bg)',
          }}
        >
          {state === 'picking' ? 'Opening…' : 'Choose folder'}
        </button>
      </div>
    </div>
  )
}
