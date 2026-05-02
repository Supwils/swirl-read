import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import type { VaultEntry, VaultPath } from '@/core/vault'
import { findVaultHome } from '@/core/navigation/section-detector'
import { getAdapter } from '@/stores/vault-store'
import { DirectoryListing } from './DirectoryListing'
import { ReauthorizeVault } from './ReauthorizeVault'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'redirect'; to: VaultPath }
  | { kind: 'ready'; vaultName: string; entries: VaultEntry[] }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

export function VaultHome() {
  const { vaultId } = useParams<{ vaultId: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  useEffect(() => {
    if (!vaultId) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setState({ kind: 'missing' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    void (async () => {
      try {
        // Try the home-detection lookup first. If a sensible home file
        // exists (`index.md`, `home.md`, `README.md`, …) we redirect into
        // it so the user lands on content rather than a folder listing.
        const entries = await vault.list('')
        if (cancelled) return
        const home = await findVaultHome(vault).catch(() => null)
        if (cancelled) return
        if (home) {
          setState({ kind: 'redirect', to: home })
          return
        }
        setState({ kind: 'ready', vaultName: vault.name, entries })
      } catch (err: unknown) {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vaultId])

  if (state.kind === 'redirect' && vaultId) {
    return <Navigate to={`/app/${vaultId}/${state.to}`} replace />
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {state.kind === 'idle' && null}

      {state.kind === 'loading' && (
        <p
          className="mt-6 font-serif italic"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Reading vault…
        </p>
      )}

      {state.kind === 'missing' && vaultId && (
        <ReauthorizeVault vaultId={vaultId} />
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

      {state.kind === 'ready' && vaultId && (
        <DirectoryListing
          vaultId={vaultId}
          path=""
          entries={state.entries}
          kicker="Vault Home"
          title={state.vaultName}
          intro={
            <>
              No <code>index.md</code> / <code>README.md</code> in the root —
              showing {state.entries.length} top-level entries.
            </>
          }
        />
      )}
    </main>
  )
}
