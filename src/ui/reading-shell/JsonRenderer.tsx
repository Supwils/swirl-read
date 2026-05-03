/**
 * JsonRenderer (M7.4 + polish).
 *
 * Renders `.json` / `.jsonc` as a foldable tree by default, with a
 * one-click toggle into the syntax-highlighted source view (Shiki via
 * CodeFileRenderer). Mirrors the Preview/Source pattern from HtmlRenderer.
 *
 * M7 polish: in-tree search (force-expands matching ancestors, highlights
 * matched substrings) + per-node copy-path button.
 *
 * Parser policy: `.jsonc` strips `//` and `/* … *\/` comments before
 * `JSON.parse`. Parse failures fall back to the source view automatically.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Code2, Search, Workflow } from 'lucide-react'
import { stripJsonComments, collectMatchAncestors } from './json-utils'
import { CodeFileRenderer } from './CodeFileRenderer'
import { JsonNode } from './JsonTreeNode'

interface JsonRendererProps {
  source: string
}

type ViewMode = 'tree' | 'source'

interface ParsedJson {
  ok: true
  value: unknown
}
interface ParseFailure {
  ok: false
  message: string
}

export function JsonRenderer({ source }: JsonRendererProps): ReactNode {
  const parsed = useMemo<ParsedJson | ParseFailure>(() => {
    try {
      const stripped =
        source.includes('//') || source.includes('/*')
          ? stripJsonComments(source)
          : source
      const value: unknown = JSON.parse(stripped)
      return { ok: true, value }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }, [source])

  const [mode, setMode] = useState<ViewMode>(parsed.ok ? 'tree' : 'source')
  const [query, setQuery] = useState('')

  const forceOpenPaths = useMemo(() => {
    if (!parsed.ok || query.trim() === '') return new Set<string>()
    const set = new Set<string>()
    collectMatchAncestors(parsed.value, query.toLowerCase(), [], set)
    return set
  }, [parsed, query])

  return (
    <section className="swirlread-json" data-testid="json-renderer">
      <div className="swirlread-json__toolbar">
        {parsed.ok && mode === 'tree' && (
          <label className="swirlread-json__search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              placeholder="Filter keys or values…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
              }}
              aria-label="Filter JSON tree"
              data-testid="json-renderer-search"
            />
          </label>
        )}
        {!parsed.ok && (
          <span className="swirlread-json__error" role="alert">
            Couldn&apos;t parse JSON: {parsed.message}
          </span>
        )}
        <div className="swirlread-json__toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'tree'}
            disabled={!parsed.ok}
            className={`swirlread-json__toggle-btn ${
              mode === 'tree' ? 'is-active' : ''
            }`}
            onClick={() => {
              setMode('tree')
            }}
          >
            <Workflow size={14} aria-hidden="true" />
            Tree
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'source'}
            className={`swirlread-json__toggle-btn ${
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

      {mode === 'tree' && parsed.ok ? (
        <div className="swirlread-json__tree" data-testid="json-renderer-tree">
          <JsonNode
            value={parsed.value}
            depth={0}
            path={[]}
            query={query}
            forceOpenPaths={forceOpenPaths}
          />
        </div>
      ) : (
        <CodeFileRenderer source={source} language="json" />
      )}
    </section>
  )
}
