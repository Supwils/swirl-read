/**
 * PaletteAskAnswer — rich Markdown render surface for AI answers.
 *
 * Lives in its own chunk so the heavy `renderMarkdown` pipeline (Shiki +
 * remark plugins + sanitize + JSX runtime) and the custom-element
 * components (Wikilink, Callout, Mermaid, Math, Tag, Embed) don't bloat
 * the palette chunk for users who never invoke `?` mode.
 *
 * Streaming behaviour: `text` mutates as chunks arrive. We debounce the
 * Markdown reparse to ~120 ms while `isStreaming` is true so we don't
 * thrash Shiki on every token; the final reparse runs immediately when
 * streaming flips off, so the user sees the fully highlighted answer the
 * moment the model is done.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { renderMarkdown } from '@/core/render/pipeline'
import type { WikilinkIndex } from '@/core/navigation/wikilink-resolver'
import { customComponents } from '@/ui/reading-shell/document-components'
import { WikilinkContext } from '@/ui/reading-shell/wikilink-context'
import type { VaultId, VaultPath } from '@/core/vault'

interface PaletteAskAnswerProps {
  text: string
  isStreaming: boolean
  vaultId: VaultId | null
  currentPath: VaultPath | null
  wikilinkIndex: WikilinkIndex | null
}

const STREAMING_DEBOUNCE_MS = 120

export function PaletteAskAnswer({
  text,
  isStreaming,
  vaultId,
  currentPath,
  wikilinkIndex,
}: PaletteAskAnswerProps): ReactNode {
  const [rendered, setRendered] = useState<ReactNode>(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    if (text.length === 0) {
      setRendered(null)
      return
    }

    const myToken = ++tokenRef.current
    let cancelled = false

    function run(): void {
      void renderMarkdown(text, customComponents).then((tree) => {
        // Drop stale results — a newer reparse may have started before
        // this Shiki promise resolved.
        if (cancelled || tokenRef.current !== myToken) return
        setRendered(tree)
      })
    }

    if (!isStreaming) {
      // Final pass — render immediately so the user sees code blocks
      // syntax-highlighted the instant the stream closes.
      run()
      return () => {
        cancelled = true
      }
    }

    const timer = window.setTimeout(run, STREAMING_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [text, isStreaming])

  // Wikilinks resolve through the same context the reading shell uses.
  // When the index isn't ready yet, <Wikilink> degrades to a "pending"
  // span that's still readable — the click-through upgrades when the
  // index arrives.
  const ctxValue =
    vaultId && currentPath
      ? { vaultId, currentPath, index: wikilinkIndex }
      : null

  if (ctxValue) {
    return (
      <WikilinkContext.Provider value={ctxValue}>
        <div className="swirlread-ask__prose swirlread-prose">{rendered}</div>
      </WikilinkContext.Provider>
    )
  }

  return <div className="swirlread-ask__prose swirlread-prose">{rendered}</div>
}
