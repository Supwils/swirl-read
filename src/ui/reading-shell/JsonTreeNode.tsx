import { useState, type ReactNode } from 'react'
import { pathKey, type JsonPathSegment } from './json-utils'
import { LeafRow, CollectionNode } from './JsonNodeParts'

export interface NodeProps {
  value: unknown
  depth: number
  path: JsonPathSegment[]
  fieldKey?: string
  query: string
  forceOpenPaths: Set<string>
}

/** Wrap each case-insensitive match of `query` in <mark>. */
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

export function JsonNode({
  value,
  depth,
  path,
  fieldKey,
  query,
  forceOpenPaths,
}: NodeProps): ReactNode {
  const [open, setOpen] = useState(depth < 2)
  const pathStr = pathKey(path)
  // Search forcibly expands matching ancestors. `open` still owns the
  // steady-state — the force flag only nudges the initial render.
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
