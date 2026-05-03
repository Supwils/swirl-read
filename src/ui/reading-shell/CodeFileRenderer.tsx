/**
 * CodeFileRenderer (M7.7).
 *
 * Treats a source-code file like a single fenced code block: wraps the
 * content in `\`\`\`<language>` … `\`\`\`` and runs it through the existing
 * Markdown pipeline so Shiki picks it up. This buys us:
 *
 *   - dual-theme highlighting (M3.12), already wired
 *   - graceful fallback for unknown languages (Shiki ships a plain-text
 *     fallback inside the same <pre>)
 *   - no new dependencies
 *
 * The fence width adapts to the source: if the file itself contains a long
 * run of backticks, we use one more than the longest run so the fence never
 * closes prematurely. Markdown's CommonMark fence rule allows any 3+ run.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { renderMarkdown } from '@/core/render/pipeline'
import { longestBacktickRun } from './file-renderer-utils'

interface CodeFileRendererProps {
  source: string
  language: string
}

type State =
  | { kind: 'loading' }
  | { kind: 'rendered'; tree: ReactNode }
  | { kind: 'error'; message: string }

export function CodeFileRenderer({
  source,
  language,
}: CodeFileRendererProps): ReactNode {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    const fence = '`'.repeat(longestBacktickRun(source) + 1)
    const wrapped = `${fence}${language}\n${source}\n${fence}\n`

    void renderMarkdown(wrapped).then(
      (tree) => {
        if (!cancelled) setState({ kind: 'rendered', tree })
      },
      (err: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [source, language])

  if (state.kind === 'loading') {
    return (
      <p className="swirlread-codefile__status" role="status">
        Highlighting…
      </p>
    )
  }

  if (state.kind === 'error') {
    // Highlighting failed for some reason — never lose the content. Drop
    // straight to a plain pre so the user can still read the source.
    return (
      <div data-testid="code-file-renderer-fallback">
        <p className="swirlread-codefile__status" role="alert">
          Couldn&apos;t highlight: {state.message}
        </p>
        <pre className="swirlread-plaintext">{source}</pre>
      </div>
    )
  }

  return (
    <div className="swirlread-codefile" data-testid="code-file-renderer">
      {state.tree}
    </div>
  )
}
