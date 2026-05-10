/**
 * Pull every distinct `[[wikilink]]` target out of a Markdown source,
 * in document order.
 *
 * Used by the AI palette `?` mode to expand the answer context with
 * 1-hop neighbour notes. Independent of the remark plugin so it can run
 * outside the render pipeline (e.g. on a raw fetched string before any
 * AST exists).
 *
 * What gets stripped before scanning:
 *   - Fenced code blocks (`\`\`\``) and inline code (`` ` ``) — `[[X]]`
 *     inside a code sample is a literal example, not a reference.
 *   - HTML comments — same reasoning.
 *
 * What's preserved:
 *   - `![[embed]]` — the inner `[[embed]]` is still a wikilink target,
 *     and an embed is in fact the strongest signal that the user wants
 *     the linked content next to the host doc.
 *   - Aliases (`[[target|alias]]`), heading anchors (`[[target#h]]`),
 *     and block refs (`[[target^id]]`) — the bare `target` is what we
 *     return; alias / heading / block parts are dropped.
 */

const FENCED_CODE_RE = /```[\s\S]*?```/g
const INLINE_CODE_RE = /`[^`\n]+`/g
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const WIKILINK_RE = /\[\[([^\]\n]+)]]/g

export function extractWikilinkTargets(source: string): string[] {
  const cleaned = source
    .replace(FENCED_CODE_RE, '')
    .replace(INLINE_CODE_RE, '')
    .replace(HTML_COMMENT_RE, '')

  const targets: string[] = []
  const seen = new Set<string>()
  for (const match of cleaned.matchAll(WIKILINK_RE)) {
    const body = match[1]
    if (!body) continue
    const target = parseTarget(body)
    if (!target || seen.has(target)) continue
    seen.add(target)
    targets.push(target)
  }
  return targets
}

/** Strip alias / heading / block-ref decorations to leave the bare path. */
function parseTarget(body: string): string {
  let head = body
  const pipeIdx = head.indexOf('|')
  if (pipeIdx >= 0) head = head.slice(0, pipeIdx)
  const blockIdx = head.indexOf('^')
  if (blockIdx >= 0) head = head.slice(0, blockIdx)
  const headingIdx = head.indexOf('#')
  if (headingIdx >= 0) head = head.slice(0, headingIdx)
  return head.trim()
}
