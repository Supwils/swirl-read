import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { autoRestoreVaults } from '@/app/auto-restore'
import { purgeExpired as purgeExpiredReviewBatches } from '@/core/review/card-store'
import { useHintsStore } from '@/stores/hints-store'
import { useReaderStore } from '@/stores/reader-store'
import { useSidebarVisibilityStore } from '@/stores/sidebar-visibility-store'
import { useTabsStore } from '@/stores/tabs-store'
import { useVaultStore } from '@/stores/vault-store'
import { useUIStore } from '@/stores/ui-store'
import '@/styles/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in document')
}

// Fire-and-forget: load registered vaults + UI prefs from Dexie.
// UI components branch on the respective `ready` flags if they need to wait.
// `autoRestoreVaults` calls `useVaultStore.init()` itself so it has the
// metadata needed to attach adapters correctly — the explicit init call
// here is kept for callers that don't await auto-restore.
void useVaultStore.getState().init()
void useUIStore.getState().init()
void useReaderStore.getState().init()
void useTabsStore.getState().init()
void useHintsStore.getState().init()
void useSidebarVisibilityStore.getState().init()
// Auto-restore lives in its own task: re-attach FSAPI adapters whose
// browser permission grant survived the page reload (M6.3).
void autoRestoreVaults()
// Phase 3 review: drop any review batches whose 24h TTL elapsed while
// the tab was closed. Cheap range query; never blocks render.
void purgeExpiredReviewBatches()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
