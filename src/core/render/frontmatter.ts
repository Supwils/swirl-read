/**
 * Frontmatter — extract YAML or TOML frontmatter from a Markdown source string.
 *
 * Vault frontmatter is overwhelmingly flat key/value, with the occasional list.
 * Rather than ship a full YAML/TOML parser (~30 KB gzip combined), we ship a
 * deliberately small one that handles the common 95% and falls back to raw
 * display for anything more elaborate.
 *
 * What is supported:
 *
 *   - YAML (`---\n…\n---`) and TOML (`+++\n…\n+++`) delimiters at the start
 *   - Top-level `key: value` (YAML) or `key = value` (TOML)
 *   - Quoted (`"…"` or `'…'`) and unquoted scalars
 *   - Booleans (`true` / `false`), null (`null` / `~`), numbers
 *   - Inline arrays (`[a, b, "c"]`)
 *   - Block arrays:
 *       tags:
 *         - one
 *         - two
 *   - Comments (`#` for YAML, `#` for TOML at line start; trailing `#` is left
 *     alone to keep behavior predictable for paths/values that contain `#`)
 *   - Dates as strings (ISO `YYYY-MM-DD` etc.) — not converted to Date objects
 *
 * What is NOT supported (these survive as-is in `raw` for "raw view"):
 *
 *   - Nested mappings (top-level only)
 *   - Multi-line scalars (`>`, `|`)
 *   - YAML anchors/references
 *   - TOML `[section]` tables
 *
 * Pure utility — no DOM, no markdown parser. Safe to call on every page load.
 */

export type FrontmatterScalar = string | number | boolean | null
export type FrontmatterValue = FrontmatterScalar | FrontmatterScalar[]
export type FrontmatterFormat = 'yaml' | 'toml'

export interface Frontmatter {
  /** Parsed key/value map. Empty if no frontmatter or parser failed. */
  data: Record<string, FrontmatterValue>
  /** The exact raw block between delimiters (without the delimiters). */
  raw: string
  /** Format detected, or null if no frontmatter was present. */
  format: FrontmatterFormat | null
  /** The Markdown source with the frontmatter block removed. */
  body: string
  /** True if a delimiter pair was found. */
  present: boolean
}

const YAML_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const TOML_RE = /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+(?:\r?\n|$)/

const EMPTY: Frontmatter = {
  data: {},
  raw: '',
  format: null,
  body: '',
  present: false,
}

export function extractFrontmatter(source: string): Frontmatter {
  if (!source) return { ...EMPTY, body: source }

  const yamlMatch = YAML_RE.exec(source)
  if (yamlMatch?.[1] !== undefined) {
    const raw = yamlMatch[1]
    const body = source.slice(yamlMatch[0].length)
    return {
      data: parseYamlFlat(raw),
      raw,
      format: 'yaml',
      body,
      present: true,
    }
  }

  const tomlMatch = TOML_RE.exec(source)
  if (tomlMatch?.[1] !== undefined) {
    const raw = tomlMatch[1]
    const body = source.slice(tomlMatch[0].length)
    return {
      data: parseTomlFlat(raw),
      raw,
      format: 'toml',
      body,
      present: true,
    }
  }

  return { ...EMPTY, body: source }
}

/* ─── YAML (flat) ──────────────────────────────────────────────────────── */

function parseYamlFlat(raw: string): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {}
  const lines = raw.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (isCommentOrBlank(line)) {
      i++
      continue
    }
    const match = /^([A-Za-z0-9_\-.]+)\s*:\s*(.*)$/.exec(line)
    if (!match) {
      i++
      continue
    }
    const key = match[1]
    const rawValue = (match[2] ?? '').trim()
    if (!key) {
      i++
      continue
    }
    if (rawValue === '') {
      // Possible block array: indented `- item` lines that follow.
      const items: FrontmatterScalar[] = []
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j] ?? ''
        const itemMatch = /^\s+-\s*(.*)$/.exec(next)
        if (!itemMatch) break
        const itemRaw = (itemMatch[1] ?? '').trim()
        items.push(parseYamlScalar(stripTrailingComment(itemRaw)))
        j++
      }
      if (items.length > 0) {
        out[key] = items
        i = j
        continue
      }
      out[key] = ''
      i++
      continue
    }
    if (rawValue.startsWith('[')) {
      out[key] = parseYamlInlineArray(rawValue)
      i++
      continue
    }
    out[key] = parseYamlScalar(stripTrailingComment(rawValue))
    i++
  }
  return out
}

function isCommentOrBlank(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === '' || trimmed.startsWith('#')
}

function stripTrailingComment(value: string): string {
  // Only strip ` # comment` (with leading space) so `tag/#nested` survives.
  // Quoted values are handled before this is called.
  if (value.startsWith('"') || value.startsWith("'")) return value
  const m = / +#.*$/.exec(value)
  if (m?.index === undefined) return value
  return value.slice(0, m.index).trim()
}

function parseYamlScalar(value: string): FrontmatterScalar {
  if (value === '' || value === '~' || value.toLowerCase() === 'null') {
    return null
  }
  if (value === 'true' || value === 'True' || value === 'TRUE') return true
  if (value === 'false' || value === 'False' || value === 'FALSE') return false

  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return unescapeYaml(value.slice(1, -1), value.startsWith('"'))
  }

  if (/^-?(\d+\.\d+|\d+)$/.test(value)) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }

  return value
}

function unescapeYaml(inner: string, doubleQuoted: boolean): string {
  if (!doubleQuoted) return inner.replace(/''/g, "'")
  return inner.replace(/\\(["\\/bfnrt])/g, (_match, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n'
      case 't':
        return '\t'
      case 'r':
        return '\r'
      case 'b':
        return '\b'
      case 'f':
        return '\f'
      case '/':
        return '/'
      case '\\':
        return '\\'
      case '"':
        return '"'
      default:
        return ch
    }
  })
}

function parseYamlInlineArray(value: string): FrontmatterScalar[] {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return []
  const inner = trimmed.slice(1, -1)
  return splitTopLevel(inner).map((piece) => parseYamlScalar(piece.trim()))
}

/**
 * Split a comma-separated list while respecting quoted strings. Used by
 * inline-array parsers so quoted commas don't fragment items.
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i] ?? ''
    if (quote) {
      current += ch
      if (ch === quote && input[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === ',') {
      if (current.trim() !== '') parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim() !== '') parts.push(current)
  return parts
}

/* ─── TOML (flat) ──────────────────────────────────────────────────────── */

function parseTomlFlat(raw: string): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {}
  const lines = raw.split(/\r?\n/)
  let inSection = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (trimmed.startsWith('[')) {
      // Once we enter a section table we stop collecting top-level keys.
      inSection = true
      continue
    }
    if (inSection) continue
    const match = /^([A-Za-z0-9_\-.]+)\s*=\s*(.*)$/.exec(trimmed)
    if (!match) continue
    const key = match[1]
    const rawValue = (match[2] ?? '').trim()
    if (!key) continue
    if (rawValue.startsWith('[')) {
      out[key] = parseYamlInlineArray(rawValue)
      continue
    }
    out[key] = parseYamlScalar(stripTrailingComment(rawValue))
  }
  return out
}

/* ─── Display selection ────────────────────────────────────────────────── */

/**
 * A small curated view of frontmatter for the metadata bar.
 *
 * The reading shell uses this to surface the fields readers care about most
 * without forcing them through every key. The remaining fields can still be
 * shown via the "raw" view when the user opts in.
 */
export interface FrontmatterMetadata {
  title?: string
  description?: string
  date?: string
  author?: string
  tags: string[]
  aliases: string[]
  /** Anything not surfaced above, kept as-is for the "raw" view. */
  extras: Record<string, FrontmatterValue>
}

const TITLE_KEYS = ['title', 'name'] as const
const DESCRIPTION_KEYS = ['description', 'summary', 'subtitle'] as const
const DATE_KEYS = ['date', 'created', 'publishedAt', 'published'] as const
const AUTHOR_KEYS = ['author', 'authors', 'by'] as const
const TAG_KEYS = ['tags', 'tag', 'keywords'] as const
const ALIAS_KEYS = ['aliases', 'alias'] as const

const ALL_RECOGNIZED = new Set<string>([
  ...TITLE_KEYS,
  ...DESCRIPTION_KEYS,
  ...DATE_KEYS,
  ...AUTHOR_KEYS,
  ...TAG_KEYS,
  ...ALIAS_KEYS,
])

export function selectMetadata(
  data: Record<string, FrontmatterValue>,
): FrontmatterMetadata {
  const meta: FrontmatterMetadata = {
    tags: [],
    aliases: [],
    extras: {},
  }
  for (const key of TITLE_KEYS) {
    const value = stringOf(data[key])
    if (value) {
      meta.title = value
      break
    }
  }
  for (const key of DESCRIPTION_KEYS) {
    const value = stringOf(data[key])
    if (value) {
      meta.description = value
      break
    }
  }
  for (const key of DATE_KEYS) {
    const value = stringOf(data[key])
    if (value) {
      meta.date = value
      break
    }
  }
  for (const key of AUTHOR_KEYS) {
    const v = data[key]
    if (Array.isArray(v)) {
      const joined = v
        .map((item) => stringOf(item))
        .filter((item): item is string => Boolean(item))
        .join(', ')
      if (joined) {
        meta.author = joined
        break
      }
    }
    const value = stringOf(v)
    if (value) {
      meta.author = value
      break
    }
  }
  for (const key of TAG_KEYS) {
    const v = data[key]
    if (Array.isArray(v)) {
      meta.tags = v
        .map((item) => stringOf(item))
        .filter((item): item is string => Boolean(item))
      if (meta.tags.length > 0) break
    } else if (typeof v === 'string') {
      meta.tags = v
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
      if (meta.tags.length > 0) break
    }
  }
  for (const key of ALIAS_KEYS) {
    const v = data[key]
    if (Array.isArray(v)) {
      meta.aliases = v
        .map((item) => stringOf(item))
        .filter((item): item is string => Boolean(item))
      if (meta.aliases.length > 0) break
    } else if (typeof v === 'string' && v.trim()) {
      meta.aliases = [v.trim()]
      break
    }
  }
  for (const [key, value] of Object.entries(data)) {
    if (ALL_RECOGNIZED.has(key)) continue
    meta.extras[key] = value
  }
  return meta
}

function stringOf(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return undefined
}

/** Format a frontmatter value as a human-readable string (for raw view). */
export function formatFrontmatterValue(value: FrontmatterValue): string {
  if (value == null) return '—'
  if (Array.isArray(value)) {
    return value.map((v) => formatFrontmatterValue(v)).join(', ')
  }
  return String(value)
}
