/**
 * Minimal RFC 4180-compatible delimited-text parser (M7.3).
 *
 * Hand-rolled instead of pulling in Papa Parse so the main bundle stays
 * lean; the table renderer does no heavy CSV gymnastics, so a 60-line state
 * machine is enough.
 *
 * Supports:
 *
 *   - configurable delimiter (`,` for CSV, `\t` for TSV)
 *   - double-quoted fields (`"hello"`)
 *   - escaped double quotes inside a quoted field (`""` → `"`)
 *   - newlines inside a quoted field
 *   - CRLF and bare-LF line endings
 *   - trailing newline (does NOT produce a phantom empty row)
 *
 * Out of scope: comments (`#` lines), header sniffing, type coercion,
 * configurable quote char. Add later behind this seam if a vault needs it.
 */

export type DelimiterChar = ',' | '\t'

export interface ParsedTable {
  rows: string[][]
  /** True if parsing stopped early because `maxRows` was reached. */
  truncated: boolean
}

export interface ParseOptions {
  delimiter?: DelimiterChar
  /**
   * Maximum number of rows to materialize. The 1001st row triggers
   * `truncated: true` and the parser stops. Default: unlimited.
   */
  maxRows?: number
}

export function parseDelimited(
  source: string,
  options: ParseOptions = {},
): ParsedTable {
  const delimiter = options.delimiter ?? ','
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  let truncated = false

  const pushRow = (): boolean => {
    rows.push(row)
    row = []
    if (rows.length >= maxRows) {
      truncated = true
      return true
    }
    return false
  }

  while (i < source.length) {
    const ch = source[i]

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }

    if (ch === '"' && cell === '') {
      inQuotes = true
      i++
      continue
    }

    if (ch === delimiter) {
      row.push(cell)
      cell = ''
      i++
      continue
    }

    if (ch === '\r') {
      // Handled together with the following \n below.
      i++
      continue
    }

    if (ch === '\n') {
      row.push(cell)
      cell = ''
      if (pushRow()) break
      i++
      continue
    }

    cell += ch
    i++
  }

  // Flush any trailing cell/row that didn't end with a newline.
  if (!truncated && (cell !== '' || row.length > 0)) {
    row.push(cell)
    rows.push(row)
  }

  return { rows, truncated }
}
