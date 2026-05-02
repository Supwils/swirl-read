/**
 * DOM-based heading extraction for the table-of-contents (M4.6).
 *
 * The render pipeline already emits clean h1–h6 elements; the sanitize
 * schema permits an `id` attribute on each. Rather than add a remark/rehype
 * slug plugin (and ~2 KB to the main bundle), we walk the rendered DOM
 * once after layout and assign stable, deduplicated slugs in place.
 *
 * Headings inside embeds are intentionally included — the user is reading
 * the merged document, not the source.
 */

export interface DocumentHeading {
  /** Stable id assigned to the heading element (existing or generated). */
  id: string
  /** Visible heading text (innerText, normalized whitespace). */
  text: string
  /** 1–6 — pulled from the tag name. Filtered by caller. */
  level: number
}

const HEADING_SELECTOR = 'h1, h2, h3, h4'

export interface ExtractHeadingsOptions {
  /** Maximum heading depth to include. Default 4 — H5/H6 are usually run-in. */
  maxLevel?: 1 | 2 | 3 | 4 | 5 | 6
}

export function extractHeadings(
  root: HTMLElement,
  options: ExtractHeadingsOptions = {},
): DocumentHeading[] {
  const max = options.maxLevel ?? 4
  const selector = Array.from({ length: max }, (_, i) => `h${i + 1}`).join(', ')
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(selector || HEADING_SELECTOR),
  )

  const used = new Set<string>()
  return elements.map((el) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    let id = el.id
    if (!id) {
      id = uniqueSlug(text, used)
      el.id = id
    } else if (used.has(id)) {
      // Two headings with identical existing ids — disambiguate the second
      // copy so anchor links resolve deterministically.
      id = uniqueSlug(text || el.id, used)
      el.id = id
    } else {
      used.add(id)
    }
    return {
      id,
      text,
      level: parseLevel(el.tagName),
    }
  })
}

function parseLevel(tagName: string): number {
  const n = Number.parseInt(tagName.slice(1), 10)
  return Number.isFinite(n) ? n : 1
}

/**
 * Slugify Unicode-aware: keep letters/numbers from any script, collapse
 * everything else to dashes. Wilson's vault is bilingual; ASCII-only slugs
 * would lose Chinese headings entirely.
 */
export function slugify(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '') return 'section'
  // \p{L} / \p{N} require the `u` flag — kept letters/numbers in any
  // script, replaced everything else with dashes.
  const slug = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'section' : slug
}

function uniqueSlug(input: string, used: Set<string>): string {
  const base = slugify(input)
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  for (let i = 2; i < 1_000; i += 1) {
    const candidate = `${base}-${i}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
  // Pathological fallback — append a timestamp; never expected in practice.
  const fallback = `${base}-${Date.now()}`
  used.add(fallback)
  return fallback
}
