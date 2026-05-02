/**
 * Helpers for the JsonRenderer (M7.4 + polish). Lives in its own file
 * so the renderer can stay component-only and play nicely with Vite
 * fast refresh.
 */

export type JsonPathSegment = string | number

/** Format a JSON path array as `a.b[0].c` (root → `$`). */
export function formatJsonPath(path: JsonPathSegment[]): string {
  if (path.length === 0) return '$'
  let out = ''
  for (const seg of path) {
    if (typeof seg === 'number') {
      out += `[${seg.toString()}]`
    } else if (/^[A-Za-z_$][\w$]*$/.test(seg)) {
      out += out === '' ? seg : `.${seg}`
    } else {
      const escaped = seg.replace(/"/g, '\\"')
      out += `["${escaped}"]`
    }
  }
  return out
}

/**
 * Strip `//` line comments and `/* … *\/` block comments so JSONC files
 * round-trip through `JSON.parse`. Aware of string boundaries so a string
 * containing `//` or `/*` doesn't get truncated mid-value.
 */
export function stripJsonComments(source: string): string {
  let out = ''
  let i = 0
  let inString = false
  let stringQuote: string | null = null

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (inString) {
      out += ch
      if (ch === '\\' && next !== undefined) {
        out += next
        i += 2
        continue
      }
      if (ch === stringQuote) {
        inString = false
        stringQuote = null
      }
      i++
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      stringQuote = ch
      out += ch
      i++
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (
        i < source.length &&
        !(source[i] === '*' && source[i + 1] === '/')
      ) {
        i++
      }
      i += 2
      continue
    }

    out += ch
    i++
  }

  return out
}
