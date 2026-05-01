import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import type { VaultEntry } from '@/core/vault'
import { getAdapter } from '@/stores/vault-store'

interface VaultPreview {
  vaultName: string
  entries: VaultEntry[]
}

export function VaultHome() {
  const { vaultId } = useParams<{ vaultId: string }>()
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ready'; preview: VaultPreview }
    | { kind: 'missing' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  useEffect(() => {
    if (!vaultId) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setState({ kind: 'missing' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    void vault
      .list('')
      .then((entries) => {
        if (cancelled) return
        setState({
          kind: 'ready',
          preview: { vaultName: vault.name, entries },
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [vaultId])

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p
        className="font-serif text-sm uppercase tracking-wider"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Vault Home
      </p>
      <h2
        className="mt-2 font-serif text-3xl font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        {vaultId ?? 'unknown vault'}
      </h2>

      {state.kind === 'idle' && null}

      {state.kind === 'loading' && (
        <p
          className="mt-6 font-serif italic"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Reading vault…
        </p>
      )}

      {state.kind === 'missing' && (
        <p
          className="mt-6 font-serif"
          style={{ color: 'var(--color-text-muted)' }}
        >
          This vault is not registered in the current session. Open it again
          from the landing page to read.
        </p>
      )}

      {state.kind === 'error' && (
        <p
          role="alert"
          className="mt-6 font-serif"
          style={{ color: 'var(--color-text)' }}
        >
          Couldn&apos;t read this vault: {state.message}
        </p>
      )}

      {state.kind === 'ready' && (
        <section className="mt-6">
          <p
            className="font-serif text-base"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Connected to <strong>{state.preview.vaultName}</strong> ·{' '}
            {state.preview.entries.length} top-level entries.
          </p>
          <ul className="mt-4 space-y-1 font-serif text-base">
            {state.preview.entries.map((entry) => (
              <li
                key={entry.path}
                className="flex items-baseline gap-2"
                style={{ color: 'var(--color-text)' }}
              >
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {entry.isDirectory ? '📁' : '📄'}
                </span>
                <span>{entry.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
