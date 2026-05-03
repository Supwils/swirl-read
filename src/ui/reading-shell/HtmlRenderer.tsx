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
          srcDoc={source}
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
