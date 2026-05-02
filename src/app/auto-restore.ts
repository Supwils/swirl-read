/**
 * Returning-user auto-restore (M6.3).
 *
 * On every app boot we walk the persisted FSAPI directory handles. For
 * each one whose permission grant is still active we instantiate an
 * adapter and attach it to `useVaultStore`. Vaults whose grant has
 * lapsed (browser-revoked between sessions, the common case) are left
 * with metadata only — the UI prompts the user to re-authorize when
 * they navigate to that vault.
 *
 * Crucially, this never CALLS `requestPermission()` automatically. The
 * FSAPI requires a user gesture for the prompt; trying to call it on
 * boot fails with `SecurityError`. Re-authorize is on-demand from a
 * button click in the missing-vault UI.
 *
 * Idempotent — safe to call multiple times. Returns the count of
 * successfully restored adapters so callers (or tests) can inspect.
 */

import {
  FSAPIVaultAdapter,
  deleteHandle,
  loadHandle,
  listHandleIds,
} from '@/core/vault'
import type { VaultId } from '@/core/vault'
import { useVaultStore } from '@/stores/vault-store'

export interface AutoRestoreResult {
  restored: VaultId[]
  pending: VaultId[]
  errors: { id: VaultId; reason: string }[]
}

export async function autoRestoreVaults(): Promise<AutoRestoreResult> {
  const result: AutoRestoreResult = {
    restored: [],
    pending: [],
    errors: [],
  }

  // Make sure the store has hydrated metadata before we attach adapters
  // — otherwise the meta records won't exist and the UI won't have
  // names to render alongside the live adapters.
  await useVaultStore.getState().init()

  const known = new Set(
    useVaultStore.getState().registeredVaults.map((v) => v.id),
  )

  let ids: VaultId[]
  try {
    ids = await listHandleIds()
  } catch (err) {
    result.errors.push({
      id: '<list>',
      reason: err instanceof Error ? err.message : String(err),
    })
    return result
  }

  for (const id of ids) {
    if (!known.has(id)) {
      // Orphan handle: meta was deleted but the FSAPI handle survived
      // (older clients didn't delete it on removeVault). Garbage-collect
      // so listHandleIds doesn't grow unbounded across many register /
      // remove cycles. Failures swallowed — the orphan is harmless if
      // it stays.
      try {
        await deleteHandle(id)
      } catch {
        /* non-fatal */
      }
      continue
    }
    try {
      const handle = await loadHandle(id)
      if (!handle) continue
      const meta = useVaultStore
        .getState()
        .registeredVaults.find((v) => v.id === id)
      const adapter = FSAPIVaultAdapter.fromHandle(handle, {
        id,
        name: meta?.name ?? handle.name,
      })
      const granted = await adapter.hasPermission()
      if (granted) {
        useVaultStore.getState().attachAdapter(adapter)
        result.restored.push(id)
      } else {
        // Hold the adapter so a later user-gesture re-grant is one
        // `requestPermission()` call away — avoids reading IDB twice.
        pendingAdapters.set(id, adapter)
        result.pending.push(id)
      }
    } catch (err) {
      result.errors.push({
        id,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}

/**
 * Pending adapters are vaults whose handle exists but whose permission
 * needs re-granting. The UI calls `reauthorizeVault(id)` from a
 * user-gesture handler to walk the prompt → attach pipeline.
 */
const pendingAdapters = new Map<VaultId, FSAPIVaultAdapter>()

/**
 * Re-grant permission for a previously-registered vault. MUST be called
 * from a user gesture (the FSAPI requires it for `requestPermission`).
 *
 * Returns true if the user granted access and the adapter is now live;
 * false if the user dismissed the prompt or the grant failed.
 */
export async function reauthorizeVault(id: VaultId): Promise<boolean> {
  let adapter = pendingAdapters.get(id)
  if (!adapter) {
    // Lazy hydration — pending map is empty after a hard reload until
    // autoRestore runs, but the user might click "re-authorize" from
    // a deep link before then.
    const handle = await loadHandle(id)
    if (!handle) return false
    const meta = useVaultStore
      .getState()
      .registeredVaults.find((v) => v.id === id)
    adapter = FSAPIVaultAdapter.fromHandle(handle, {
      id,
      name: meta?.name ?? handle.name,
    })
  }
  const granted = await adapter.requestPermission()
  if (!granted) return false
  useVaultStore.getState().attachAdapter(adapter)
  pendingAdapters.delete(id)
  return true
}

/** Test-only — drop the pending-adapter map between cases. */
export function __resetPendingAdaptersForTests(): void {
  pendingAdapters.clear()
}
