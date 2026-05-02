/**
 * JsonRenderer (M7.4 + polish).
 *
 * Renders `.json` / `.jsonc` as a foldable tree by default, with a
 * one-click toggle into the syntax-highlighted source view (Shiki via
 * CodeFileRenderer). Mirrors the Preview/Source pattern from HtmlRenderer
 * so the reader gets a consistent toolbar across structured-file kinds.
 *
 * M7 polish:
 *   - In-tree search input (filters paths to those containing the query
 *     in any key or stringified value; force-expands matching ancestors;
 *     highlights matched substrings via <mark>).
 *   - Per-node "copy path" button — hover-revealed dot-notation path
 *     (e.g. `users[0].name`) written to the clipboard.
 *
 * Parser policy: `.jsonc` is parsed by stripping `//` and `/* … *\/`
 * comments before `JSON.parse`. If parsing fails for any reason, the
 * renderer falls into the source view automatically and surfaces the
 * parse error — content is never lost.
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Search,
  Workflow,
} from 'lucide-react'
import { CodeFileRenderer } from './CodeFileRenderer'
import {
  formatJsonPath,
  stripJsonComments,
  type JsonPathSegment,
} from './json-utils'

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

  // Force-expand ancestors of any path whose key or value contains the
  // search query. Empty query → no forced expansions, defaults rule.
  const forceOpenPaths = useMemo(() => {
    if (!parsed.ok || query.trim() === '') return new Set<string>()
    const set = new Set<string>()
    collectMatchAncestors(parsed.value, query.toLowerCase(), [], set)
    return set
  }, [parsed, query])

  return (
    <section className="swilread-json" data-testid="json-renderer">
      <div className="swilread-json__toolbar">
        {parsed.ok && mode === 'tree' && (
          <label className="swilread-json__search">
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
          <span className="swilread-json__error" role="alert">
            Couldn&apos;t parse JSON: {parsed.message}
          </span>
        )}
        <div className="swilread-json__toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'tree'}
            disabled={!parsed.ok}
            className={`swilread-json__toggle-btn ${
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
            className={`swilread-json__toggle-btn ${
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
        <div className="swilread-json__tree" data-testid="json-renderer-tree">
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

interface NodeProps {
  value: unknown
  depth: number
  path: PathSegment[]
  fieldKey?: string
  query: string
  forceOpenPaths: Set<string>
}

type PathSegment = JsonPathSegment

function JsonNode({
  value,
  depth,
  path,
  fieldKey,
  query,
  forceOpenPaths,
}: NodeProps): ReactNode {
  const [open, setOpen] = useState(depth < 2)
  const pathStr = pathKey(path)
  // Search forcibly expands matching ancestors. The user can still
  // collapse manually after — `open` state owns the steady-state
  // truth, the force flag only nudges the initial render after a
  // query change.
  const effectiveOpen = open || forceOpenPaths.has(pathStr)

  if (value === null) {
    return (
      <LeafRow
        path={path}
        keyName={fieldKey}
        query={query}
        valueClass="swilread-json__null"
        rendered={<>null</>}
      />
    )
  }

  if (typeof value === 'boolean') {
    return (
      <LeafRow
        path={path}
        keyName={fieldKey}
        query={query}
        valueClass="swilread-json__boolean"
        rendered={<>{String(value)}</>}
      />
    )
  }

  if (typeof value === 'number') {
    return (
      <LeafRow
        path={path}
        keyName={fieldKey}
        query={query}
        valueClass="swilread-json__number"
        rendered={<>{String(value)}</>}
      />
    )
  }

  if (typeof value === 'string') {
    return (
      <LeafRow
        path={path}
        keyName={fieldKey}
        query={query}
        valueClass="swilread-json__string"
        rendered={<>&quot;{highlight(value, query)}&quot;</>}
      />
    )
  }

  if (Array.isArray(value)) {
    const items: unknown[] = value
    return (
      <CollectionNode
        path={path}
        keyName={fieldKey}
        query={query}
        open={effectiveOpen}
        onToggle={() => {
          setOpen((v) => !v)
        }}
        openMark="["
        closeMark="]"
        summary={`${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        depth={depth}
      >
        {items.map((child, idx) => (
          <li key={idx} className="swilread-json__item">
            <JsonNode
              value={child}
              depth={depth + 1}
              path={[...path, idx]}
              query={query}
              forceOpenPaths={forceOpenPaths}
            />
          </li>
        ))}
      </CollectionNode>
    )
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entries: [string, unknown][] = Object.entries(record)
    return (
      <CollectionNode
        path={path}
        keyName={fieldKey}
        query={query}
        open={effectiveOpen}
        onToggle={() => {
          setOpen((v) => !v)
        }}
        openMark="{"
        closeMark="}"
        summary={`${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`}
        depth={depth}
      >
        {entries.map(([k, v]) => (
          <li key={k} className="swilread-json__item">
            <JsonNode
              value={v}
              depth={depth + 1}
              path={[...path, k]}
              fieldKey={k}
              query={query}
              forceOpenPaths={forceOpenPaths}
            />
          </li>
        ))}
      </CollectionNode>
    )
  }

  return (
    <LeafRow
      path={path}
      keyName={fieldKey}
      query={query}
      valueClass="swilread-json__null"
      rendered={<>(unsupported)</>}
    />
  )
}

function LeafRow({
  path,
  keyName,
  query,
  valueClass,
  rendered,
}: {
  path: PathSegment[]
  keyName?: string
  query: string
  valueClass: string
  rendered: ReactNode
}): ReactNode {
  return (
    <span className="swilread-json__row swilread-json__row--leaf">
      <KeyLabel keyName={keyName} query={query} />
      <span className={valueClass}>{rendered}</span>
      <CopyPathButton path={path} />
    </span>
  )
}

function CollectionNode({
  path,
  keyName,
  query,
  open,
  onToggle,
  openMark,
  closeMark,
  summary,
  depth,
  children,
}: {
  path: PathSegment[]
  keyName?: string
  query: string
  open: boolean
  onToggle: () => void
  openMark: string
  closeMark: string
  summary: string
  depth: number
  children: ReactNode
}): ReactNode {
  return (
    <div className="swilread-json__collection" data-depth={depth}>
      <span className="swilread-json__row swilread-json__row--collection">
        <button
          type="button"
          className="swilread-json__toggle-row"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? (
            <ChevronDown
              size={12}
              aria-hidden="true"
              className="swilread-json__chevron"
            />
          ) : (
            <ChevronRight
              size={12}
              aria-hidden="true"
              className="swilread-json__chevron"
            />
          )}
          <KeyLabel keyName={keyName} query={query} />
          <span className="swilread-json__brace">{openMark}</span>
          {!open && (
            <>
              <span className="swilread-json__summary">{summary}</span>
              <span className="swilread-json__brace">{closeMark}</span>
            </>
          )}
        </button>
        <CopyPathButton path={path} />
      </span>
      {open && (
        <>
          <ul className="swilread-json__list">{children}</ul>
          <span className="swilread-json__row swilread-json__close">
            <span className="swilread-json__brace">{closeMark}</span>
          </span>
        </>
      )}
    </div>
  )
}

function KeyLabel({
  keyName,
  query,
}: {
  keyName?: string
  query: string
}): ReactNode {
  if (keyName === undefined) return null
  return (
    <>
      <span className="swilread-json__key">
        &quot;{highlight(keyName, query)}&quot;
      </span>
      <span className="swilread-json__colon">:</span>
    </>
  )
}

/**
 * Hover-revealed copy-path button. Path is formatted in dot/bracket
 * notation (`users[0].name`); root is `$`. Uses the async clipboard
 * API; if it's unavailable (very old browsers, restrictive iframes)
 * the click silently no-ops rather than throwing.
 */
function CopyPathButton({ path }: { path: PathSegment[] }): ReactNode {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="swilread-json__copy"
      aria-label={`Copy path ${formatJsonPath(path)}`}
      title={`Copy path · ${formatJsonPath(path)}`}
      data-testid="json-copy-path"
      onClick={(e) => {
        e.stopPropagation()
        const formatted = formatJsonPath(path)
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          void navigator.clipboard.writeText(formatted).then(
            () => {
              setCopied(true)
              window.setTimeout(() => {
                setCopied(false)
              }, 1200)
            },
            () => {
              // Clipboard write rejected (permission, focus); ignore.
            },
          )
        }
      }}
    >
      <Copy size={11} aria-hidden="true" />
      {copied && <span className="swilread-json__copied">Copied</span>}
    </button>
  )
}

/** Stable string key for a path (set membership only). */
function pathKey(path: PathSegment[]): string {
  return path.map((seg) => String(seg)).join(' ')
}

/**
 * Walk the value tree; for every leaf whose key or stringified value
 * contains the (lowercased) query, add the path of *every ancestor* to
 * `out`. The root is `[]` and never excluded — its inclusion in `out`
 * is a no-op for top-level rendering.
 */
function collectMatchAncestors(
  value: unknown,
  queryLower: string,
  path: PathSegment[],
  out: Set<string>,
): boolean {
  // Returns true if this subtree contains a match.
  if (value === null || typeof value !== 'object') {
    const haystack =
      typeof value === 'string'
        ? value.toLowerCase()
        : String(value).toLowerCase()
    const keyHay =
      typeof path.at(-1) === 'string' ? String(path.at(-1)).toLowerCase() : ''
    return haystack.includes(queryLower) || keyHay.includes(queryLower)
  }

  let hit = false
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const childPath = [...path, i]
      if (collectMatchAncestors(value[i], queryLower, childPath, out)) {
        hit = true
        // Add every ancestor (including this collection's path).
        for (let j = 0; j <= path.length; j++) {
          out.add(pathKey(path.slice(0, j)))
        }
      }
    }
  } else {
    const record = value as Record<string, unknown>
    for (const [k, v] of Object.entries(record)) {
      const keyHit = k.toLowerCase().includes(queryLower)
      const childPath = [...path, k]
      const childHit = collectMatchAncestors(v, queryLower, childPath, out)
      if (keyHit || childHit) {
        hit = true
        for (let j = 0; j <= path.length; j++) {
          out.add(pathKey(path.slice(0, j)))
        }
      }
    }
  }
  return hit
}

/**
 * Wrap every case-insensitive substring match of `query` in `<mark>`.
 * Returns the input string unchanged when query is empty or no match.
 */
function highlight(text: string, query: string): ReactNode {
  if (query.trim() === '') return text
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  if (!lower.includes(q)) return text
  const parts: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    const idx = lower.indexOf(q, i)
    if (idx === -1) {
      parts.push(text.slice(i))
      break
    }
    if (idx > i) parts.push(text.slice(i, idx))
    parts.push(
      <mark key={key++} className="swilread-json__match">
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
  }
  return parts
}
