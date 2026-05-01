import { useParams } from 'react-router'

export function VaultHome() {
  const { vaultId } = useParams<{ vaultId: string }>()

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <p
          className="font-serif text-sm uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Vault Home · placeholder
        </p>
        <h2
          className="mt-3 font-serif text-3xl font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {vaultId ?? 'unknown vault'}
        </h2>
      </div>
    </main>
  )
}
