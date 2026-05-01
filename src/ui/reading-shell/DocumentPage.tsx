import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { isMarkdown, VaultFileNotFoundError } from '@/core/vault'
import { renderMarkdown } from '@/core/render/pipeline'
import { getAdapter } from '@/stores/vault-store'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'rendered'; content: ReactNode; isMd: boolean; raw: string }
  | { kind: 'missing-vault' }
  | { kind: 'missing-file' }
  | { kind: 'error'; message: string }

export function DocumentPage() {
  const params = useParams<{ vaultId: string; '*': string }>()
  const vaultId = params.vaultId
  const filePath = params['*'] ?? ''
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  useEffect(() => {
    if (!vaultId || !filePath) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setState({ kind: 'missing-vault' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    void vault
      .readText(filePath)
      .then((raw) => {
        if (cancelled) return
        const md = isMarkdown(filePath)
        const content = md ? renderMarkdown(raw) : null
        setState({
          kind: 'rendered',
          content,
          isMd: md,
          raw,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof VaultFileNotFoundError) {
          setState({ kind: 'missing-file' })
          return
        }
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, filePath])

  return (
    <article
      className="mx-auto max-w-[720px] px-6 py-12 font-serif text-[18px] leading-[1.7]"
      style={{ color: 'var(--color-text)' }}
    >
      <header className="mb-8">
        <p
          className="font-serif text-xs uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {vaultId}
        </p>
        <h1
          className="mt-2 break-words font-serif text-2xl font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {filePath || '(no file selected)'}
        </h1>
      </header>

      {state.kind === 'loading' && (
        <p className="italic" style={{ color: 'var(--color-text-muted)' }}>
          Reading…
        </p>
      )}

      {state.kind === 'missing-vault' && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          This vault is not registered in the current session. Open it again
          from the landing page to read.
        </p>
      )}

      {state.kind === 'missing-file' && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          File not found in this vault.
        </p>
      )}

      {state.kind === 'error' && (
        <p role="alert" style={{ color: 'var(--color-text)' }}>
          Couldn&apos;t open this file: {state.message}
        </p>
      )}

      {state.kind === 'rendered' && state.isMd && (
        <div className="swilread-prose">{state.content}</div>
      )}

      {state.kind === 'rendered' && !state.isMd && (
        <pre
          className="overflow-auto rounded-md p-4 font-mono text-sm"
          style={{
            backgroundColor: 'var(--color-code-bg)',
            color: 'var(--color-code-text)',
          }}
        >
          {state.raw}
        </pre>
      )}
    </article>
  )
}
