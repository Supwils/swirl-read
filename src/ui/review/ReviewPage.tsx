/**
 * ReviewPage — `/app/:vaultId/__review__/:batchId` — focused full-page
 * surface for stepping through a batch of AI-generated cards.
 *
 * One card at a time. Click the card (or press Space) to flip between
 * question and answer + explanation. ←/→ to walk the deck, Esc to leave.
 *
 * Phase A intentionally renders Q/A as plain text-with-newlines rather
 * than running it through the Markdown pipeline. The pipeline is heavy
 * (Shiki, KaTeX, ...) and the card content is short — reading the
 * answer should feel instant. Phase B can swap in `renderMarkdown` if
 * the AI starts emitting code blocks or math.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Clock, Download, X } from 'lucide-react'
import {
  deleteBatch,
  getBatch,
  getCardsForBatch,
} from '@/core/review/card-store'
import type { ReviewBatch, ReviewCard } from '@/core/review/types'
import { requestConfirmation } from '@/stores/dialog-store'

type Phase =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; batch: ReviewBatch; cards: ReviewCard[] }

export function ReviewPage(): ReactNode {
  const params = useParams()
  const navigate = useNavigate()
  const vaultId = params.vaultId
  const batchId = params.batchId
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    if (!vaultId || !batchId) {
      setPhase({ kind: 'missing' })
      return
    }
    let cancelled = false
    void (async () => {
      const batch = await getBatch(batchId)
      if (cancelled) return
      if (batch?.vaultId !== vaultId) {
        setPhase({ kind: 'missing' })
        return
      }
      const cards = await getCardsForBatch(batchId)
      if (cancelled) return
      setPhase({ kind: 'ready', batch, cards })
      setIndex(0)
      setFlipped(false)
    })()
    return () => {
      cancelled = true
    }
  }, [vaultId, batchId])

  const handleExit = useCallback(() => {
    if (vaultId) {
      void navigate(`/app/${vaultId}`)
    } else {
      void navigate('/app')
    }
  }, [navigate, vaultId])

  const handleDelete = useCallback(async () => {
    if (!batchId) return
    const confirmed = await requestConfirmation({
      title: 'Delete review batch?',
      description:
        'All cards in this batch will be removed immediately. This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      destructive: true,
    })
    if (!confirmed) return
    await deleteBatch(batchId)
    handleExit()
  }, [batchId, handleExit])

  const cardsLength = phase.kind === 'ready' ? phase.cards.length : 0

  const next = useCallback(() => {
    if (cardsLength === 0) return
    setIndex((i) => (i + 1) % cardsLength)
    setFlipped(false)
  }, [cardsLength])

  const prev = useCallback(() => {
    if (cardsLength === 0) return
    setIndex((i) => (i - 1 + cardsLength) % cardsLength)
    setFlipped(false)
  }, [cardsLength])

  const flip = useCallback(() => {
    setFlipped((f) => !f)
  }, [])

  // Keyboard navigation. Per the project-wide hotkey rule, every global
  // keydown hook must refuse to fire when the active element is an
  // editable target — otherwise typing space inside the ⌘K palette (or
  // any future inline input on top of the page) would also flip the
  // card behind it.
  useEffect(() => {
    function handle(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        next()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        prev()
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        flip()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        handleExit()
      }
    }
    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
    }
  }, [next, prev, flip, handleExit])

  if (phase.kind === 'loading') {
    return (
      <div className="swirlread-review">
        <p className="swirlread-review__status">Loading cards…</p>
      </div>
    )
  }

  if (phase.kind === 'missing') {
    return (
      <div className="swirlread-review">
        <header className="swirlread-review__header">
          <button
            type="button"
            className="swirlread-review__exit"
            onClick={handleExit}
            aria-label="Close review"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="swirlread-review__empty">
          <p className="swirlread-review__empty-title">
            This review batch is no longer available.
          </p>
          <p className="swirlread-review__empty-body">
            Cards expire 24 hours after generation. Generate a new batch from
            any document.
          </p>
        </div>
      </div>
    )
  }

  const { batch, cards } = phase
  if (cards.length === 0) {
    return (
      <div className="swirlread-review">
        <ReviewHeader
          batch={batch}
          onExit={handleExit}
          onDelete={() => void handleDelete()}
        />
        <div className="swirlread-review__empty">
          <p className="swirlread-review__empty-title">
            No cards in this batch.
          </p>
        </div>
      </div>
    )
  }

  const card = cards[index]!

  return (
    <div className="swirlread-review">
      <ReviewHeader
        batch={batch}
        onExit={handleExit}
        onDelete={() => void handleDelete()}
      />

      <main className="swirlread-review__main">
        <p className="swirlread-review__progress">
          Card {index + 1} of {cards.length}
        </p>

        <button
          type="button"
          className={
            'swirlread-review__card' +
            (flipped ? ' swirlread-review__card--flipped' : '')
          }
          onClick={flip}
          aria-label={flipped ? 'Show question' : 'Show answer'}
        >
          {flipped ? (
            <CardBack card={card} />
          ) : (
            <CardFront question={card.question} />
          )}
        </button>

        <div className="swirlread-review__nav">
          <button
            type="button"
            className="swirlread-review__nav-btn"
            onClick={prev}
            aria-label="Previous card"
            disabled={cards.length <= 1}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Prev
          </button>
          <span className="swirlread-review__hint">
            Click card or press Space to flip · ← / → to navigate · Esc to exit
          </span>
          <button
            type="button"
            className="swirlread-review__nav-btn"
            onClick={next}
            aria-label="Next card"
            disabled={cards.length <= 1}
          >
            Next
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        <ProgressDots
          count={cards.length}
          activeIndex={index}
          onJump={(i) => {
            setIndex(i)
            setFlipped(false)
          }}
        />
      </main>
    </div>
  )
}

/* ─── Header (label + TTL countdown + export menu + exit) ──────────── */

function ReviewHeader({
  batch,
  onExit,
  onDelete,
}: {
  batch: ReviewBatch
  onExit: () => void
  onDelete: () => void
}): ReactNode {
  const [now, setNow] = useState(() => Date.now())
  // The ticker keeps the "expires in" string honest. 60s granularity is
  // plenty — we're showing hours and minutes, not seconds.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now())
    }, 60_000)
    return () => {
      window.clearInterval(id)
    }
  }, [])

  return (
    <header className="swirlread-review__header">
      <div className="swirlread-review__header-meta">
        <h1 className="swirlread-review__title">{batch.label}</h1>
        <p className="swirlread-review__sub">
          <Clock size={11} aria-hidden="true" />
          {expiryLabel(batch.expiresAt.getTime() - now)}
          <span className="swirlread-review__sep">·</span>
          {batch.providerLabel}
        </p>
      </div>
      <div className="swirlread-review__header-actions">
        <ExportMenu batch={batch} />
        <button
          type="button"
          className="swirlread-review__nav-btn"
          onClick={onDelete}
        >
          Delete batch
        </button>
        <button
          type="button"
          className="swirlread-review__exit"
          onClick={onExit}
          aria-label="Close review (Esc)"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

function expiryLabel(msRemaining: number): string {
  if (msRemaining <= 0) return 'expired'
  const totalMin = Math.floor(msRemaining / 60_000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours === 0) return `expires in ${String(minutes)}m`
  if (minutes === 0) return `expires in ${String(hours)}h`
  return `expires in ${String(hours)}h ${String(minutes)}m`
}

/* ─── Card faces ───────────────────────────────────────────────────── */

function CardFront({ question }: { question: string }): ReactNode {
  return (
    <div className="swirlread-review__face swirlread-review__face--front">
      <span className="swirlread-review__face-label">Question</span>
      <p className="swirlread-review__face-body">{question}</p>
      <span className="swirlread-review__face-hint">tap to reveal answer</span>
    </div>
  )
}

function CardBack({ card }: { card: ReviewCard }): ReactNode {
  return (
    <div className="swirlread-review__face swirlread-review__face--back">
      <span className="swirlread-review__face-label">Answer</span>
      <p className="swirlread-review__face-body">{card.answer}</p>
      {card.explanation.trim().length > 0 && (
        <>
          <span className="swirlread-review__face-label">Why</span>
          <p className="swirlread-review__face-explanation">
            {card.explanation}
          </p>
        </>
      )}
      <p className="swirlread-review__face-source">
        Source: <code>{card.sourcePath}</code>
      </p>
    </div>
  )
}

/* ─── Progress dots ────────────────────────────────────────────────── */

function ProgressDots({
  count,
  activeIndex,
  onJump,
}: {
  count: number
  activeIndex: number
  onJump: (index: number) => void
}): ReactNode {
  return (
    <div className="swirlread-review__dots" role="tablist">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === activeIndex}
          className={
            'swirlread-review__dot' +
            (i === activeIndex ? ' swirlread-review__dot--active' : '')
          }
          onClick={() => {
            onJump(i)
          }}
          aria-label={`Card ${String(i + 1)} of ${String(count)}`}
        />
      ))}
    </div>
  )
}

/* ─── Export menu (Markdown / JSON) ────────────────────────────────── */

function ExportMenu({ batch }: { batch: ReviewBatch }): ReactNode {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape — same UX expectation as the
  // sidebar context menu / vault switcher. Only mounts the listeners
  // while the menu is actually open.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent): void {
      const node = wrapperRef.current
      if (!node) return
      if (event.target instanceof Node && node.contains(event.target)) return
      setOpen(false)
    }
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleExport = useCallback(
    async (format: 'markdown' | 'json') => {
      const cards = await getCardsForBatch(batch.id)
      const blob =
        format === 'markdown'
          ? new Blob([toMarkdown(batch, cards)], {
              type: 'text/markdown;charset=utf-8',
            })
          : new Blob([toJson(batch, cards)], {
              type: 'application/json;charset=utf-8',
            })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Keep CJK / accented filenames readable: drop only chars that
      // are invalid on common filesystems. `\p{L}` / `\p{N}` cover any
      // Unicode letter / digit.
      a.download = `review-${batch.label.replace(/[^\p{L}\p{N}.-]+/gu, '_')}.${format === 'markdown' ? 'md' : 'json'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setOpen(false)
    },
    [batch],
  )

  return (
    <div className="swirlread-review__export" ref={wrapperRef}>
      <button
        type="button"
        className="swirlread-review__nav-btn"
        onClick={() => {
          setOpen((v) => !v)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={14} aria-hidden="true" />
        Export
      </button>
      {open && (
        <div className="swirlread-review__export-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="swirlread-review__export-item"
            onClick={() => void handleExport('markdown')}
          >
            Markdown (.md)
          </button>
          <button
            type="button"
            role="menuitem"
            className="swirlread-review__export-item"
            onClick={() => void handleExport('json')}
          >
            JSON (.json)
          </button>
        </div>
      )}
    </div>
  )
}

function toMarkdown(batch: ReviewBatch, cards: ReviewCard[]): string {
  const lines: string[] = [
    `# Review cards — ${batch.label}`,
    '',
    `*Generated by ${batch.providerLabel} on ${batch.createdAt.toISOString()}.*`,
    '',
  ]
  for (const card of cards) {
    lines.push(`## Q${String(card.order + 1)}. ${card.question}`)
    lines.push('')
    lines.push(`**Answer.** ${card.answer}`)
    lines.push('')
    if (card.explanation.trim().length > 0) {
      lines.push(`**Why.** ${card.explanation}`)
      lines.push('')
    }
    lines.push(`*Source: ${card.sourcePath}*`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  return lines.join('\n')
}

/** Mirror of the project-wide `isEditableTarget` helper from the reading
 *  shell — kept inline here so the review chunk doesn't pull in the
 *  shell module just for this one check. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function toJson(batch: ReviewBatch, cards: ReviewCard[]): string {
  return JSON.stringify(
    {
      batch: {
        id: batch.id,
        label: batch.label,
        sourcePaths: batch.sourcePaths,
        providerLabel: batch.providerLabel,
        createdAt: batch.createdAt.toISOString(),
        expiresAt: batch.expiresAt.toISOString(),
      },
      cards: cards.map((c) => ({
        order: c.order,
        question: c.question,
        answer: c.answer,
        explanation: c.explanation,
        sourcePath: c.sourcePath,
      })),
    },
    null,
    2,
  )
}
