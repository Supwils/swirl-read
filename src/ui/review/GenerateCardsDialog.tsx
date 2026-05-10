/**
 * GenerateCardsDialog — modal for kicking off a card-generation run.
 *
 * The dialog steps through three phases:
 *   1. **idle** — user picks a card count (5–25) and confirms.
 *   2. **generating** — the AI is streaming; we show a spinner and a
 *      Cancel button that aborts the underlying request.
 *   3. **error** — surface the problem with a Retry / Close pair.
 *
 * On success we navigate the user straight into the review page rather
 * than dropping them back at the document — the whole point of the
 * action was to review.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router'
import { Loader2, Sparkles } from 'lucide-react'
import { resolveActiveProvider } from '@/core/ai/resolve-active-provider'
import {
  CardGenerationError,
  generateBatch,
} from '@/core/review/card-generator'
import { DEFAULT_CARD_COUNT, MAX_CARD_COUNT } from '@/core/review/types'
import { basename } from '@/core/vault'
import { getAdapter } from '@/stores/vault-store'
import type { VaultId, VaultPath } from '@/core/vault'

type Status =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'error'; message: string; rawOutput?: string }

interface GenerateCardsDialogProps {
  open: boolean
  vaultId: VaultId
  path: VaultPath
  onOpenChange: (open: boolean) => void
}

export function GenerateCardsDialog({
  open,
  vaultId,
  path,
  onOpenChange,
}: GenerateCardsDialogProps): ReactNode {
  const navigate = useNavigate()
  const [cardCount, setCardCount] = useState(DEFAULT_CARD_COUNT)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const cancelRef = useRef<AbortController | null>(null)

  // Reset every time the dialog reopens. We deliberately don't carry
  // an error from a prior session into a fresh open — same UX as a
  // fresh "Generate" click should follow.
  useEffect(() => {
    if (open) {
      setStatus({ kind: 'idle' })
      setCardCount(DEFAULT_CARD_COUNT)
    }
  }, [open])

  const handleClose = useCallback(() => {
    // Cancel any in-flight generation. AbortController is one-shot —
    // null the ref afterwards so a subsequent open starts clean.
    cancelRef.current?.abort()
    cancelRef.current = null
    onOpenChange(false)
  }, [onOpenChange])

  const handleGenerate = useCallback(async () => {
    setStatus({ kind: 'generating' })

    // Fresh controller per generation. We hold onto it via the ref so
    // {@link handleClose} can fire .abort() — that's what wires Cancel
    // through the provider stream all the way down to fetch.
    cancelRef.current?.abort()
    const controller = new AbortController()
    cancelRef.current = controller

    const adapter = getAdapter(vaultId)
    if (!adapter) {
      setStatus({
        kind: 'error',
        message: 'Vault is no longer accessible. Try refreshing.',
      })
      return
    }
    let source: string
    try {
      source = await adapter.readText(path)
    } catch {
      setStatus({
        kind: 'error',
        message: 'Could not read the source document.',
      })
      return
    }
    if (controller.signal.aborted) return

    const resolved = await resolveActiveProvider()
    if (controller.signal.aborted) return
    if (!resolved) {
      setStatus({
        kind: 'error',
        message:
          'No AI provider configured. Open Settings → AI assistant first.',
      })
      return
    }

    try {
      const batch = await generateBatch(
        {
          vaultId,
          sources: [{ path, content: source }],
          options: { cardCount },
          signal: controller.signal,
        },
        { provider: resolved.provider, providerLabel: resolved.label },
      )
      // Guard against the user having cancelled mid-stream. The underlying
      // generator races: fetch may have buffered a complete response by
      // the time we abort, so generateBatch can still resolve. Without
      // this gate we'd navigate to a review page the user already
      // dismissed.
      if (controller.signal.aborted) return
      onOpenChange(false)
      void navigate(`/app/${vaultId}/__review__/${batch.id}`)
    } catch (err) {
      if (err instanceof CardGenerationError) {
        if (err.kind === 'aborted') return
        setStatus({
          kind: 'error',
          message: humanError(err),
          ...(err.rawOutput !== undefined && { rawOutput: err.rawOutput }),
        })
      } else {
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }, [vaultId, path, cardCount, navigate, onOpenChange])

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="swirlread-generate__overlay" />
        <Dialog.Content className="swirlread-generate">
          <Dialog.Title className="swirlread-generate__title">
            <Sparkles size={16} aria-hidden="true" />
            Generate review cards
          </Dialog.Title>
          <Dialog.Description className="swirlread-generate__desc">
            Source: <code>{basename(path)}</code>
          </Dialog.Description>

          {status.kind === 'idle' && (
            <>
              <label
                className="swirlread-generate__label"
                htmlFor="generate-card-count"
              >
                Number of cards: <strong>{cardCount}</strong>
              </label>
              <input
                id="generate-card-count"
                type="range"
                min={5}
                max={MAX_CARD_COUNT}
                step={1}
                value={cardCount}
                onChange={(event) => {
                  setCardCount(Number(event.target.value))
                }}
                className="swirlread-generate__slider"
              />
              <p className="swirlread-generate__hint">
                Cards expire after 24 hours. Export them from the review page if
                you want to keep them.
              </p>
              <div className="swirlread-generate__actions">
                <button
                  type="button"
                  className="swirlread-edit__btn"
                  onClick={handleClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="swirlread-edit__btn swirlread-edit__btn--primary"
                  onClick={() => void handleGenerate()}
                >
                  Generate
                </button>
              </div>
            </>
          )}

          {status.kind === 'generating' && (
            <div className="swirlread-generate__progress" role="status">
              <Loader2
                size={18}
                aria-hidden="true"
                className="swirlread-ask__spinner"
              />
              <span>Asking the model for {cardCount} cards…</span>
              <button
                type="button"
                className="swirlread-edit__btn"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          )}

          {status.kind === 'error' && (
            <div className="swirlread-generate__error" role="alert">
              <p>{status.message}</p>
              {status.rawOutput !== undefined &&
                status.rawOutput.length > 0 && (
                  <details className="swirlread-generate__raw">
                    <summary>Show raw response (for debugging)</summary>
                    <pre className="swirlread-generate__raw-pre">
                      {status.rawOutput.length > 2000
                        ? status.rawOutput.slice(0, 2000) + '\n…[truncated]…'
                        : status.rawOutput}
                    </pre>
                  </details>
                )}
              <div className="swirlread-generate__actions">
                <button
                  type="button"
                  className="swirlread-edit__btn"
                  onClick={handleClose}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="swirlread-edit__btn swirlread-edit__btn--primary"
                  onClick={() => void handleGenerate()}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function humanError(err: CardGenerationError): string {
  switch (err.kind) {
    case 'no-provider':
      return 'No AI provider configured.'
    case 'parse-failed':
      return 'The model returned a response we could not parse as cards. Try again or pick a different provider.'
    case 'empty':
      return 'No source content to generate cards from.'
    default:
      return err.message
  }
}
