import { useState } from 'react'
import { useNavigate } from 'react-router'
import { registerVault, saveHandle } from '@/core/vault'
import type { FSAPIVaultAdapter } from '@/core/vault'
import { FolderPicker } from './FolderPicker'

export function LandingPage() {
  const [pickerOpen, setPickerOpen] = useState(false)
  const navigate = useNavigate()

  async function handlePicked(adapter: FSAPIVaultAdapter) {
    registerVault(adapter)
    // Best-effort: persist the handle for future sessions. Real cross-session
    // restore lands in M6.3; for now this just primes IndexedDB.
    try {
      await saveHandle(adapter.id, adapter.rootHandle)
    } catch (err) {
      // Persistence failure is non-fatal — current session still works.
      console.warn('Failed to persist vault handle:', err)
    }
    setPickerOpen(false)
    void navigate(`/app/${adapter.id}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center">
        <h1
          className="font-serif text-6xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          SwilRead
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

        <nav className="mt-12 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            disabled
            title="Coming in M8"
            className="rounded-md px-5 py-2.5 font-serif text-base disabled:opacity-50"
            style={{
              borderColor: 'var(--color-border)',
              borderWidth: '1px',
              borderStyle: 'solid',
              color: 'var(--color-text-muted)',
              backgroundColor: 'transparent',
            }}
          >
            ✨ Try with sample vault
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-md px-5 py-2.5 font-serif text-base"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-bg)',
            }}
          >
            📁 Open my vault
          </button>
        </nav>
      </div>

      <FolderPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPicked={handlePicked}
      />
    </main>
  )
}
