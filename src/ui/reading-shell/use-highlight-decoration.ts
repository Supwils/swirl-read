/**
 * use-highlight-decoration — bind the highlights store to the prose DOM
 * with the React-DOM-safety discipline (see decorate.ts for the contract).
 *
 * The prose subtree is React-rendered; we decorate it ONLY post-commit via
 * the `proseRef` DOM, never via a render-time plugin. The effect:
 *
 *   1. Runs `unwrapAll(root)` FIRST so the DOM is byte-identical to what
 *      React believes it owns (in case a prior pass / StrictMode double-run
 *      left wrappers behind).
 *   2. Applies the full current highlight set fresh (idempotent, full-set,
 *      not incremental).
 *   3. Returns a cleanup that fully unwraps again — so before React ever
 *      replaces the content (new document), the DOM is already restored.
 *      This is what prevents React `removeChild` / reconciliation throws.
 *
 * It is a `useLayoutEffect` keyed on `[state, highlights, disabled]` so the
 * paint lands before the browser shows the frame (no flash of un-highlighted
 * text) and re-runs whenever the document or the highlight set changes.
 *
 * Interactions are attached via a SINGLE delegated listener on the root —
 * the spans live outside React's tree, so we must NOT put React handlers on
 * them. A click on a span calls `onHighlightClick` with the resolved
 * highlight id.
 */

import { useLayoutEffect } from 'react'
import {
  decorate,
  unwrapAll,
  HL_CLASS,
  HL_ID_ATTR,
} from '@/core/highlights/decorate'
import type { Highlight } from '@/core/highlights/types'

interface UseHighlightDecorationOptions {
  rootRef: React.RefObject<HTMLElement | null>
  highlights: Highlight[]
  /** Re-run trigger — pass the doc-identity object so a new document
   *  forces a fresh decorate pass after React swaps the content. */
  renderKey: unknown
  /** When true (edit mode / not rendered) the prose is left undecorated
   *  and any existing wrappers are removed. */
  disabled?: boolean
  /** Called when a painted highlight span is clicked. Receives the id and
   *  the clicked element (for popover anchoring). */
  onHighlightClick?: (id: string, target: HTMLElement) => void
  /** Reports the anchored/orphaned partition after each pass so the list
   *  can surface orphans distinctly. */
  onResolved?: (anchored: Set<string>, orphaned: Set<string>) => void
}

export function useHighlightDecoration({
  rootRef,
  highlights,
  renderKey,
  disabled = false,
  onHighlightClick,
  onResolved,
}: UseHighlightDecorationOptions): void {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Always start from a clean (React-owned) DOM.
    unwrapAll(root)

    if (disabled || highlights.length === 0) {
      if (onResolved) {
        onResolved(new Set(), new Set(highlights.map((h) => h.id)))
      }
      // Returned cleanup is a no-op unwrap (nothing painted) but kept for
      // symmetry so React never finds a stray wrapper. Uses the captured
      // `root` (not rootRef.current) so cleanup acts on the node this pass
      // decorated, even if the ref has since changed.
      return () => {
        unwrapAll(root)
      }
    }

    const result = decorate(root, highlights)
    if (onResolved) onResolved(result.anchored, result.orphaned)

    return () => {
      result.cleanup()
    }
    // Decoration runs only on a document load / re-render (`renderKey`) or a
    // highlight-set change — never via a DOM observer. This keeps the React-
    // DOM-safety contract simple: highlight spans are painted right after a
    // React commit and fully removed before the next one, so they never live
    // across a React reconcile of in-prose async components (math/embeds).
    // (Trade-off: a highlight inside an `![[embed]]` that resolves AFTER this
    // pass only paints on the next re-render — an accepted first-cut limit.)
  }, [rootRef, highlights, renderKey, disabled, onResolved])

  // Delegated click listener — separate effect so it doesn't churn on every
  // highlight-set change. The spans are outside React; this is how we hear
  // clicks on them.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || disabled || !onHighlightClick) return
    function handle(event: MouseEvent): void {
      const target = event.target
      if (!(target instanceof Element)) return
      const span = target.closest<HTMLElement>(`span.${HL_CLASS}`)
      if (!span) return
      // A highlight may wrap a link (wikilink / external). Let the link win —
      // don't hijack navigation to open the edit popover. The highlight is
      // still editable from the document-bottom list.
      if (target.closest('a')) return
      const id = span.getAttribute(HL_ID_ATTR)
      if (!id) return
      event.preventDefault()
      onHighlightClick!(id, span)
    }
    root.addEventListener('click', handle)
    return () => {
      root.removeEventListener('click', handle)
    }
  }, [rootRef, disabled, onHighlightClick])
}

/** Scroll the first painted span for `id` into view + flash it. Used by the
 *  document-bottom list's click-to-scroll. Lives here (not in a component)
 *  so it can be reused and stays out of any react-refresh-only file. */
export function scrollToHighlight(root: HTMLElement | null, id: string): void {
  if (!root) return
  const span = root.querySelector<HTMLElement>(
    `span.${HL_CLASS}[${HL_ID_ATTR}="${cssEscapeId(id)}"]`,
  )
  if (!span) return
  span.scrollIntoView({ behavior: 'smooth', block: 'center' })
  span.classList.add('swirlread-hl--flash')
  window.setTimeout(() => {
    span.classList.remove('swirlread-hl--flash')
  }, 1200)
}

/** Minimal attribute-selector escape — highlight ids are uuids so this is
 *  belt-and-braces, but stays correct if the id format ever changes. */
function cssEscapeId(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id)
  }
  return id.replace(/["\\]/g, '\\$&')
}
