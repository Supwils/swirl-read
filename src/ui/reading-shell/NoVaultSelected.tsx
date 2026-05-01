export function NoVaultSelected() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <p
        className="font-serif text-base italic"
        style={{ color: 'var(--color-text-muted)' }}
      >
        No vault selected. Open one to begin reading.
      </p>
    </main>
  )
}
