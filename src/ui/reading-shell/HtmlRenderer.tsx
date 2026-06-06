/**
 * HtmlRenderer (M7.5 + asset/theme upgrade).
 *
 * Renders an `.html` / `.htm` file as a sandboxed iframe preview, with a
 * toggle into the highlighted source view (CodeFileRenderer + Shiki).
 *
 * Security model (unchanged):
 *   - `srcDoc` (never `src=blob:`) → unique opaque origin, no same-origin
 *     handle to the parent.
 *   - `sandbox=""` → no scripts, no top-nav, no forms, no plugins, no popups.
 *     Do NOT loosen without a sanitization pass.
 *
 * Upgrade: relative assets (`<img src="./a.png">`, `<link href>`, CSS
 * `url(...)`) are rewritten to the vault's `blob:` URLs so self-contained
 * HTML actually renders (see `html-asset-rewrite.ts`), the iframe is themed to
 * match the app, and the toolbar offers expand / reading-width / open-in-tab.
 * The build is async (blob URLs resolve via the adapter), so the preview has
 * building / ready / error states.
 */

import { useEffect, useState, type ReactNode } from 'react'
import {
  Code2,
  ExternalLink,
  Eye,
  Maximize2,
  Minimize2,
  Text,
} from 'lucide-react'
import type { VaultFileSystem, VaultPath } from '@/core/vault'
import { useUIStore } from '@/stores/ui-store'
import { useVaultStore } from '@/stores/vault-store'
import { CodeFileRenderer } from './CodeFileRenderer'
import { buildSrcDoc } from './html-asset-rewrite'

interface HtmlRendererProps {
  source: string
  vault: VaultFileSystem
  /** The HTML file's vault path — resolves relative assets. */
  path: VaultPath
}

type ViewMode = 'preview' | 'source'
type BuildState =
  | { kind: 'building' }
  | { kind: 'ready'; srcDoc: string }
  | { kind: 'error'; message: string }

export function HtmlRenderer({
  source,
  vault,
  path,
}: HtmlRendererProps): ReactNode {
  const [mode, setMode] = useState<ViewMode>('preview')
  const [expanded, setExpanded] = useState(false)
  const [readingWidth, setReadingWidth] = useState(false)
  const theme = useUIStore((s) => s.theme)
  const contentRevision = useVaultStore(
    (s) => s.contentRevisionByVault[vault.id] ?? 0,
  )
  const [build, setBuild] = useState<BuildState>({ kind: 'building' })

  useEffect(() => {
    let cancelled = false
    setBuild({ kind: 'building' })
    void buildSrcDoc({ source, vault, path, theme, readingWidth })
      .then((srcDoc) => {
        if (!cancelled) setBuild({ kind: 'ready', srcDoc })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBuild({
            kind: 'error',
            message:
              err instanceof Error ? err.message : 'Failed to build preview',
          })
        }
      })
    return () => {
      cancelled = true
    }
    // contentRevision is in deps so an external file/asset change rebuilds
    // with fresh blob URLs (the adapter blob cache is cleared on refresh).
  }, [source, vault, path, theme, readingWidth, contentRevision])

  const openInNewTab = (): void => {
    if (build.kind !== 'ready') return
    const blob = new Blob([build.srcDoc], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    // Revoke after a tick so the new tab has time to start loading.
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 10_000)
  }

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

        {mode === 'preview' && (
          <div className="swirlread-html__actions">
            <button
              type="button"
              className={`swirlread-html__action ${readingWidth ? 'is-active' : ''}`}
              aria-pressed={readingWidth}
              title="Constrain to a comfortable reading width"
              onClick={() => setReadingWidth((v) => !v)}
            >
              <Text size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`swirlread-html__action ${expanded ? 'is-active' : ''}`}
              aria-pressed={expanded}
              title={
                expanded ? 'Collapse preview height' : 'Expand preview height'
              }
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <Minimize2 size={14} aria-hidden="true" />
              ) : (
                <Maximize2 size={14} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="swirlread-html__action"
              title="Open preview in a new tab"
              onClick={openInNewTab}
              disabled={build.kind !== 'ready'}
            >
              <ExternalLink size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {mode === 'source' ? (
        <CodeFileRenderer source={source} language="html" />
      ) : build.kind === 'building' ? (
        <div className="swirlread-html__status">Preparing preview…</div>
      ) : build.kind === 'error' ? (
        <div className="swirlread-html__status swirlread-html__status--error">
          {build.message}
        </div>
      ) : (
        <iframe
          // sandbox="" is the most restrictive value the platform offers.
          // Do NOT loosen this without a sanitization pass.
          sandbox=""
          srcDoc={build.srcDoc}
          title="HTML preview"
          className={`swirlread-html__frame${expanded ? ' is-expanded' : ''}`}
          data-testid="html-renderer-iframe"
        />
      )}
    </section>
  )
}
