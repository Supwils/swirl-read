import { useParams } from 'react-router'

export function DocumentPage() {
  const params = useParams<{ vaultId: string; '*': string }>()
  const vaultId = params.vaultId
  const filePath = params['*'] ?? ''

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <p
          className="font-serif text-sm uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Document Page · placeholder
        </p>
        <h2
          className="mt-3 font-serif text-2xl font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {vaultId ?? 'unknown vault'}
        </h2>
        <p
          className="mt-2 font-mono text-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {filePath || '(no file path)'}
        </p>
      </div>
    </main>
  )
}
