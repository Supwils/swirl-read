/**
 * HtmlRenderer (M7.5).
 *
 * Renders an `.html` / `.htm` file as a sandboxed iframe preview, with a
 * one-click toggle into the highlighted source view (which is just the
 * existing CodeFileRenderer + Shiki pipeline).
 *
 * Security model:
 *
 *   - `srcDoc` is used instead of `src=blob:` so the iframe never gets a
 *     same-origin handle to the parent. (`srcDoc` always renders as a
 *     unique opaque origin.)
 *   - `sandbox=""` (empty string) is the most restrictive possible
 *     sandbox: no script execution, no top-level navigation, no form
 *     submission, no plugins, no popups, no same-origin escape hatch.
 *   - The user can opt into a less-restrictive preview later if we ever
 *     ship a "trusted vault" toggle, but the default has to be safe by
 *     construction.
 *
 * The browser's iframe sandbox already prevents script execution, so we
 * deliberately do NOT pull in DOMPurify here — it would add bundle weight
 * for a defense layer the platform already provides. If a future feature
 * needs script execution inside the preview (e.g. allow-scripts), then a
 * sanitization pass becomes required at the same time.
 */

import { useState, type ReactNode } from 'react'
import { Code2, Eye } from 'lucide-react'
import { CodeFileRenderer } from './CodeFileRenderer'

interface HtmlRendererProps {
  source: string
}

type ViewMode = 'preview' | 'source'

/**
 * Theme-matched scrollbar styles injected into the iframe's srcDoc. The
 * iframe lives in its own document so the app-level scrollbars.css can't
 * reach inside; this small block keeps the scrollbar visually consistent
 * with the rest of the reader. Auto-themes via `prefers-color-scheme`
 * so it stays in sync if the user flips OS dark mode while reading.
 */
const HTML_SCROLLBAR_CSS = `<style data-injected="swirlread-scrollbar">
  html { scrollbar-color: rgba(58, 47, 36, 0.40) transparent; scrollbar-width: thin; }
  *::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
  *::-webkit-scrollbar-thumb {
    background-color: rgba(58, 47, 36, 0.30);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  *::-webkit-scrollbar-thumb:hover { background-color: rgba(58, 47, 36, 0.55); }
  *::-webkit-scrollbar-corner { background: transparent; }
  @media (prefers-color-scheme: dark) {
    html { scrollbar-color: rgba(228, 219, 199, 0.40) transparent; }
    *::-webkit-scrollbar-thumb { background-color: rgba(228, 219, 199, 0.30); }
    *::-webkit-scrollbar-thumb:hover { background-color: rgba(228, 219, 199, 0.55); }
  }
</style>`

/**
 * Splice the scrollbar style into the iframe srcDoc. If the source has a
 * `<head>`, we insert at its start so the user's own rules can still
 * override. If not, we just prepend.
 */
function injectScrollbarStyles(source: string): string {
  const headOpen = source.search(/<head\b[^>]*>/i)
  if (headOpen >= 0) {
    const tagEnd = source.indexOf('>', headOpen) + 1
    return source.slice(0, tagEnd) + HTML_SCROLLBAR_CSS + source.slice(tagEnd)
  }
  return HTML_SCROLLBAR_CSS + source
}

export function HtmlRenderer({ source }: HtmlRendererProps): ReactNode {
  const [mode, setMode] = useState<ViewMode>('preview')

  return (
    <section className="swirlread-html" data-testid="html-renderer">
      <div className="swirlread-html__toolbar">
        <span className="swirlread-html__badge" title="Sandboxed preview">
          Sandboxed
        </span>
        <div className="swirlread-html__toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'preview'}
            className={`swirlread-html__toggle-btn ${
              mode === 'preview' ? 'is-active' : ''
            }`}
            onClick={() => {
              setMode('preview')
            }}
          >
            <Eye size={14} aria-hidden="true" />
            Preview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'source'}
            className={`swirlread-html__toggle-btn ${
              mode === 'source' ? 'is-active' : ''
            }`}
            onClick={() => {
              setMode('source')
            }}
          >
            <Code2 size={14} aria-hidden="true" />
            Source
          </button>
        </div>
      </div>

      {mode === 'preview' ? (
        <iframe
          // sandbox="" is the most restrictive value the platform offers:
          // unique opaque origin, no scripts, no top-nav, no forms, no
          // plugins. Do NOT loosen this without a sanitization pass.
          sandbox=""
          srcDoc={injectScrollbarStyles(source)}
          title="HTML preview"
          className="swirlread-html__frame"
          data-testid="html-renderer-iframe"
        />
      ) : (
        <CodeFileRenderer source={source} language="html" />
      )}
    </section>
  )
}
