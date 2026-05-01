import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { useVaultStore } from '@/stores/vault-store'
import { useUIStore } from '@/stores/ui-store'
import '@/styles/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in document')
}

// Fire-and-forget: load registered vaults + UI prefs from Dexie.
// UI components branch on the respective `ready` flags if they need to wait.
void useVaultStore.getState().init()
void useUIStore.getState().init()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
