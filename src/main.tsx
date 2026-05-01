import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { useVaultStore } from '@/stores/vault-store'
import '@/styles/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in document')
}

// Fire-and-forget: load registered vaults from Dexie. UI components branch
// on `useVaultStore(s => s.ready)` if they need to wait.
void useVaultStore.getState().init()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
