/**
 * CsvRenderer (M7.3).
 *
 * Renders a `.csv` / `.tsv` / `.tab` file as a styled HTML table. The first
 * row is treated as the header (no auto-detection — most spreadsheet files
 * lead with a header row, and even when they don't, calling row 1 the
 * header costs the reader at most one extra cell to scan).
 *
 * Large files render the first 1000 rows by default. A "Show all" button
 * lifts the cap when the user wants the full grid; an explicit row counter
 * keeps the user oriented either way.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { parseDelimited, type DelimiterChar } from '@/core/render/csv-parse'

const DEFAULT_VISIBLE_ROWS = 1000

interface CsvRendererProps {
  source: string
  delimiter: DelimiterChar
}

export function CsvRenderer({
  source,
  delimiter,
}: CsvRendererProps): ReactNode {
  const [showAll, setShowAll] = useState(false)
  const maxRows = showAll ? Number.POSITIVE_INFINITY : DEFAULT_VISIBLE_ROWS + 1

  const parsed = useMemo(
    () => parseDelimited(source, { delimiter, maxRows }),
    [source, delimiter, maxRows],
  )

  if (parsed.rows.length === 0) {
    return (
      <p className="swirlread-csv__status" role="status">
        This file looks empty.
      </p>
    )
  }

  const [headerRow, ...bodyRows] = parsed.rows
  const headers = headerRow ?? []
  const visibleBody = showAll
    ? bodyRows
    : bodyRows.slice(0, DEFAULT_VISIBLE_ROWS)
  const hiddenCount = bodyRows.length - visibleBody.length
  const showLoadMore = !showAll && (parsed.truncated || hiddenCount > 0)

  return (
    <section className="swirlread-csv" data-testid="csv-renderer">
      <div className="swirlread-csv__scroll" role="region" aria-label="Table">
        <table className="swirlread-csv__table">
          <thead>
            <tr>
              {headers.map((cell, idx) => (
                <th key={idx} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleBody.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="swirlread-csv__meta">
        {showAll || !parsed.truncated ? (
          <>
            {bodyRows.length} {bodyRows.length === 1 ? 'row' : 'rows'} ·{' '}
            {headers.length} {headers.length === 1 ? 'column' : 'columns'}
          </>
        ) : (
          <>
            Showing first {visibleBody.length} of more than {visibleBody.length}{' '}
            rows
          </>
        )}
        {showLoadMore && (
          <>
            {' · '}
            <button
              type="button"
              className="swirlread-csv__load-more"
              onClick={() => {
                setShowAll(true)
              }}
            >
              Show all
            </button>
          </>
        )}
      </p>
    </section>
  )
}
