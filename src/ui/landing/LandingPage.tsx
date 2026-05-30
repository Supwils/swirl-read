import { useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { FolderOpen, Library, Plus, Sparkles, X } from 'lucide-react'
import { saveHandle } from '@/core/vault'
import type { FSAPIVaultAdapter } from '@/core/vault'
import { SampleVaultAdapter } from '@/core/vault/sample-adapter'
import {
  buildSampleVaultSpec,
  SAMPLE_VAULT_ID,
} from '@/core/vault/sample-content'
import { requestConfirmation } from '@/stores/dialog-store'
import { useVaultStore } from '@/stores/vault-store'
import { Logo } from '@/ui/components/Logo'
import { FolderPicker } from './FolderPicker'

export function LandingPage(): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false)
  const navigate = useNavigate()
  const registerVault = useVaultStore((s) => s.registerVault)
  const removeVault = useVaultStore((s) => s.removeVault)
  // Selecting `registeredVaults` directly returns a stable array slice;
  // Zustand re-renders only on identity change.
  const vaults = useVaultStore((s) => s.registeredVaults)

  async function handleTrySample(): Promise<void> {
    const adapter = new SampleVaultAdapter(buildSampleVaultSpec())
    await registerVault(adapter)
    void navigate(`/app/${SAMPLE_VAULT_ID}`)
  }

  async function handlePicked(adapter: FSAPIVaultAdapter): Promise<void> {
    await registerVault(adapter)
    // Persist the handle so the next session can auto-restore (M6.3).
    try {
      await saveHandle(adapter.id, adapter.rootHandle)
    } catch (err) {
      // Persistence failure is non-fatal — current session still works.
      console.warn('Failed to persist vault handle:', err)
    }
    setPickerOpen(false)
    void navigate(`/app/${adapter.id}`)
  }

  async function handleRemove(id: string, name: string): Promise<void> {
    const confirmed = await requestConfirmation({
      title: 'Remove vault from SwirlRead?',
      description: `“${name}” will be removed from your vault list. The folder on disk and its files are not touched — you can re-open it later from "Open my vault".`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      destructive: true,
    })
    if (!confirmed) return
    await removeVault(id)
  }

  const isReturning = vaults.length > 0
  // Show the most recently opened vaults first (vault-store keeps this order).
  const recentVaults = vaults.slice(0, 5)
  const hiddenCount = Math.max(0, vaults.length - recentVaults.length)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl text-center">
        <Logo
          size={56}
          decorative
          className="mx-auto mb-4"
          style={{ color: 'var(--color-text)' }}
        />
        <h1
          className="font-serif text-6xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          SwirlRead
        </h1>
        <p
          className="mt-6 font-serif text-xl italic"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Read your knowledge. Beautifully.
        </p>
        <p
          className="mt-2 font-serif text-base"
          style={{ color: 'var(--color-text-muted)' }}
        >
          A reading sanctuary for the AI era.
        </p>

        {isReturning ? (
          <ReturningSection
            vaults={recentVaults}
            hiddenCount={hiddenCount}
            onPick={() => setPickerOpen(true)}
            onRemove={(id, name) => {
              void handleRemove(id, name)
            }}
          />
        ) : (
          <FreshSection
            onPick={() => setPickerOpen(true)}
            onTrySample={() => {
              void handleTrySample()
            }}
          />
        )}
      </div>

      <FolderPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPicked={handlePicked}
      />
    </main>
  )
}

function FreshSection({
  onPick,
  onTrySample,
}: {
  onPick: () => void
  onTrySample: () => void
}): ReactNode {
  return (
    <nav className="mt-12 flex flex-wrap justify-center gap-3">
      <button
        type="button"
        onClick={onTrySample}
        className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 font-serif text-base"
        style={{
          borderColor: 'var(--color-border)',
          borderWidth: '1px',
          borderStyle: 'solid',
          color: 'var(--color-text)',
          backgroundColor: 'transparent',
        }}
      >
        <Sparkles size={16} aria-hidden="true" />
        Try with sample vault
      </button>
      <button
        type="button"
        onClick={onPick}
        className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 font-serif text-base"
        style={{
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-bg)',
        }}
      >
        <FolderOpen size={16} aria-hidden="true" />
        Open my vault
      </button>
    </nav>
  )
}

function ReturningSection({
  vaults,
  hiddenCount,
  onPick,
  onRemove,
}: {
  vaults: ReturnType<typeof useVaultStore.getState>['registeredVaults']
  hiddenCount: number
  onPick: () => void
  onRemove: (id: string, name: string) => void
}): ReactNode {
  return (
    <section className="swirlread-landing-recents" aria-label="Your vaults">
      <p className="swirlread-landing-recents__label">Your vaults</p>
      <ul className="swirlread-landing-recents__list">
        {vaults.map((vault) => (
          <li key={vault.id} className="swirlread-landing-recents__item">
            <Link
              to={`/app/${vault.id}`}
              className="swirlread-landing-recents__link"
            >
              <Library
                size={16}
                aria-hidden="true"
                className="swirlread-landing-recents__icon"
              />
              <span className="swirlread-landing-recents__name">
                {vault.name}
              </span>
              <span className="swirlread-landing-recents__meta">
                {formatRelativeDate(vault.lastOpenedAt)}
              </span>
            </Link>
            <button
              type="button"
              className="swirlread-landing-recents__remove"
              aria-label={`Remove ${vault.name} from your vaults`}
              title="Remove from SwirlRead (does not delete files)"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                onRemove(vault.id, vault.name)
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <p className="swirlread-landing-recents__overflow">
          + {String(hiddenCount)} more {hiddenCount === 1 ? 'vault' : 'vaults'}{' '}
          not shown. Open the vault switcher inside SwirlRead to see them all.
        </p>
      )}
      <button
        type="button"
        onClick={onPick}
        className="swirlread-landing-recents__cta"
      >
        <Plus size={14} aria-hidden="true" />
        Open another vault
      </button>
    </section>
  )
}

/**
 * Tiny relative-date formatter for the recents list. Avoids pulling in
 * Intl.RelativeTimeFormat boilerplate for the four buckets we actually
 * care about. "Just now" / "Today" / "X days ago" / absolute date.
 */
function formatRelativeDate(date: Date): string {
  const now = Date.now()
  const diffMs = now - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute * 5) return 'just now'
  if (diffMs < hour) return `${String(Math.round(diffMs / minute))} min ago`
  if (diffMs < day) return `${String(Math.round(diffMs / hour))} h ago`
  if (diffMs < 7 * day) return `${String(Math.round(diffMs / day))} d ago`
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() && {
      year: 'numeric',
    }),
  })
}
