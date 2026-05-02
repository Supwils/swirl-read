/**
 * Re-authorize prompt (M6.3) — surfaced when navigating to a vault whose
 * FSAPI permission has lapsed since last session.
 *
 * Two states:
 *
 *   1. **Pending** — a saved handle exists; clicking the button calls
 *      `requestPermission()` (must be a user gesture) which opens the
 *      browser's grant dialog. On grant, the adapter is attached and
 *      the vault works again. Triggers a route refresh so the page
 *      re-runs its read effects.
 *   2. **Unknown** — no saved handle. Tells the user to re-pick from
 *      the landing page.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { LockKeyhole } from 'lucide-react'
import { listHandleIds } from '@/core/vault'
import { reauthorizeVault } from '@/app/auto-restore'
import type { VaultId } from '@/core/vault'

interface ReauthorizeVaultProps {
  vaultId: VaultId
}

type CheckState =
  | { kind: 'checking' }
  | { kind: 'has-handle' }
  | { kind: 'no-handle' }

export function ReauthorizeVault({
  vaultId,
}: ReauthorizeVaultProps): ReactNode {
  const [state, setState] = useState<CheckState>({ kind: 'checking' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let cancelled = false
    void listHandleIds()
      .then((ids) => {
        if (cancelled) return
        setState({
          kind: ids.includes(vaultId) ? 'has-handle' : 'no-handle',
        })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'no-handle' })
      })
    return () => {
      cancelled = true
    }
  }, [vaultId])

  const handleClick = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      const ok = await reauthorizeVault(vaultId)
      if (!ok) {
        setError(
          'Browser denied the read grant. Try again or open a different vault.',
        )
        return
      }
      // Trigger a re-run of the route's data effects by navigating to
      // the same router-side path. `replace: true` so the back button
      // still works. Reading from `useLocation()` (not `window.location`)
      // keeps this correct under memory routers + future SSR.
      void navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="swilread-reauthorize">
      <div className="swilread-reauthorize__icon" aria-hidden="true">
        <LockKeyhole size={22} />
      </div>
      <h2 className="swilread-reauthorize__title">{vaultId}</h2>
      {state.kind === 'has-handle' && (
        <>
          <p className="swilread-reauthorize__body">
            The browser requires you to re-grant read access for this vault
            after a reload. Your saved handle is intact — one click brings the
            vault back.
          </p>
          <button
            type="button"
            className="swilread-reauthorize__button"
            onClick={() => {
              void handleClick()
            }}
            disabled={busy}
          >
            {busy ? 'Waiting for browser…' : 'Re-authorize this vault'}
          </button>
          {error && (
            <p className="swilread-reauthorize__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
      {state.kind === 'no-handle' && (
        <>
          <p className="swilread-reauthorize__body">
            No saved handle for this vault. Pick the folder again from the
            landing page to register it.
          </p>
          <Link to="/" className="swilread-reauthorize__button">
            Back to landing
          </Link>
        </>
      )}
      {state.kind === 'checking' && (
        <p className="swilread-reauthorize__body">Checking saved handles…</p>
      )}
    </div>
  )
}
