/**
 * Pure helpers shared across the M7 file renderers. Lives in its own file
 * so the renderer components themselves can stay component-only (keeps Vite
 * fast-refresh happy and avoids react-refresh/only-export-components
 * warnings).
 */

/**
 * Longest run of consecutive backticks in `source`. Used by
 * `CodeFileRenderer` to pick a fence width strictly greater than any
 * internal backtick run, so the wrapping fence never closes early.
 *
 * Returns 2 for sources with no backticks — callers add 1 to get the
 * 3-tick CommonMark minimum.
 */
export function longestBacktickRun(source: string): number {
  const matches = source.match(/`+/g)
  if (!matches) return 2
  let longest = 2
  for (const run of matches) {
    if (run.length > longest) longest = run.length
  }
  return longest
}

/**
 * Format a byte count in human-readable units. Stays binary-correct
 * (1 KB = 1024 B) — file sizes from the OS are reported the same way.
 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes.toString()} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = units[0]
  for (let i = 1; i < units.length; i++) {
    if (value < 1024) break
    value /= 1024
    unit = units[i]
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value).toString()} ${unit ?? ''}`
}
