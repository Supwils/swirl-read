/**
 * Leaf and collection rendering components for the JSON tree view.
 * Kept separate so JsonTreeNode.tsx stays under 250 LOC and Vite
 * fast-refresh boundaries remain clean (all exports are React components).
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { formatJsonPath, type JsonPathSegment } from './json-utils'

/** Highlight every case-insensitive match of `query` with <mark>. */
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

export function LeafRow({
  path,
  keyName,
  query,
  valueClass,
  rendered,
}: {
  path: JsonPathSegment[]
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

export function CollectionNode({
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
  path: JsonPathSegment[]
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

export function KeyLabel({
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
 * notation (`users[0].name`); root is `$`.
 */
export function CopyPathButton({
  path,
}: {
  path: JsonPathSegment[]
}): ReactNode {
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
              // Clipboard write rejected; ignore.
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
