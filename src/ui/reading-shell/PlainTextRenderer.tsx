/**
 * PlainTextRenderer (M7.2).
 *
 * Renders plain-text files (`.txt`, `.log`, `LICENSE`, `Makefile`, …) as a
 * monospace pre block that preserves whitespace and line breaks, themed via
 * the existing code-block tokens.
 *
 * No syntax highlighting; that's M7.7's job for known source-code
 * extensions. This surface stays cheap and predictable for everything else.
 */

import type { ReactNode } from 'react'

interface PlainTextRendererProps {
  source: string
}

export function PlainTextRenderer({
  source,
}: PlainTextRendererProps): ReactNode {
  return (
    <pre className="swirlread-plaintext" data-testid="plain-text-renderer">
      {source}
    </pre>
  )
}
