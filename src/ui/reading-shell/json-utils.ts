/**
 * Helpers for the JsonRenderer (M7.4 + polish). Lives in its own file
 * so the renderer can stay component-only and play nicely with Vite
 * fast refresh.
 */

export type JsonPathSegment = string | number

/** Stable string key for a path — used for Set membership checks. */
export function pathKey(path: JsonPathSegment[]): string {
  return path.map((seg) => String(seg)).join(' ')
}

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

/**
 * Walk a JSON value tree; for every leaf whose key or stringified value
 * contains `queryLower`, add every ancestor's path to `out`. The root
 * `[]` entry is a no-op for rendering (the root is always expanded).
 */
export function collectMatchAncestors(
  value: unknown,
  queryLower: string,
  path: JsonPathSegment[],
  out: Set<string>,
): boolean {
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
