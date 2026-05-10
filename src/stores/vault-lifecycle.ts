/**
 * Vault-lifecycle hooks — a tiny registry so per-vault state owners can
 * subscribe to "this vault is being removed" without the vault store
 * having to know they exist.
 *
 * Why this exists: prior to this module, `vault-store.removeVault` held
 * a hardcoded fan-out — `useReaderStore.getState().forgetVault(id)`,
 * `useTabsStore...`, `db.recentFiles.where(...).delete()`, ... — every
 * new store with per-vault data meant editing that fan-out, which is
 * exactly the kind of "easy to forget" coupling that leaks orphan rows
 * into Dexie when someone misses a step. Each owner now registers its
 * own hook at module load and the vault store iterates a Set.
 *
 * Contract:
 *
 *   - Hooks run in parallel; one slow hook does not block the others.
 *   - Each hook is wrapped in its own try/catch so a single failure
 *     never aborts vault removal — a half-deleted vault is worse than
 *     a vault deletion that left a stale row.
 *   - Hooks must be idempotent: calling them twice with the same id
 *     does no harm. This lets us re-run cleanup on suspect state.
 *   - Hooks should NOT call back into `vault-store` — circular work
 *     would deadlock the removal transaction.
 *
 * What DOES NOT belong in a hook:
 *
 *   - The `vaults` table row itself (vault metadata) — that's owned by
 *     vault-store directly.
 *   - The active-vault-id preference — same.
 *   - Adapter eviction / handle deletion — vault-store owns these too.
 *   - In-memory caches that aren't per-store (e.g. backlinks edge map,
 *     file-tree listing cache) — those are invalidated through their
 *     own dedicated invalidator functions called from vault-store.
 *
 * Pretty much everything else — Dexie row deletes, in-memory store
 * state, lazy chunk caches keyed by vault — should ride a hook.
 */

import type { VaultId } from '@/core/vault'

export type VaultDeletionHook = (vaultId: VaultId) => Promise<void> | void

const hooks = new Set<VaultDeletionHook>()

/**
 * Register a hook to fire when any vault is removed. Returns an
 * unregister function for tests / hot-reload — production callers
 * register at module load and never unregister.
 */
export function registerVaultDeletionHook(hook: VaultDeletionHook): () => void {
  hooks.add(hook)
  return () => hooks.delete(hook)
}

/**
 * Run every registered hook for `vaultId` in parallel. Each hook gets
 * its own try/catch — a single failure surfaces as a dev-only console
 * warning, never throws back to the caller. Resolves once every hook
 * has either resolved or rejected.
 */
export async function runVaultDeletionHooks(vaultId: VaultId): Promise<void> {
  await Promise.all(
    Array.from(hooks).map(async (hook) => {
      try {
        await hook(vaultId)
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn(
            '[vault-lifecycle] deletion hook failed for vault',
            vaultId,
            err,
          )
        }
      }
    }),
  )
}

/** Test-only — drop every registered hook so an isolated test can
 *  install a deterministic set without inheriting from previous tests. */
export function __resetVaultLifecycleHooksForTests(): void {
  hooks.clear()
}

/** Test-only — peek at the current count. */
export function __getVaultLifecycleHookCountForTests(): number {
  return hooks.size
}
