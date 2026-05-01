/**
 * Session-only in-memory registry of active vault adapters.
 *
 * **TEMPORARY** — M1.4 replaces this with a Zustand store backed by Dexie
 * for full multi-vault state, persistence, and reactive subscription.
 * For M1.3 we only need a working pick → register → look-up cycle within
 * a single session.
 *
 * Keep the surface minimal so the M1.4 migration is a drop-in: anything
 * that imports from here should keep working with the new store via a
 * compatibility shim, then migrate one call site at a time.
 */

import type { VaultFileSystem, VaultId } from './types'

const adapters = new Map<VaultId, VaultFileSystem>()
const listeners = new Set<() => void>()

/** Register an adapter under its own `id`. Replaces any existing entry. */
export function registerVault(adapter: VaultFileSystem): void {
  adapters.set(adapter.id, adapter)
  notify()
}

/** Look up a registered adapter by ID. Returns `undefined` if not registered. */
export function getVault(id: VaultId): VaultFileSystem | undefined {
  return adapters.get(id)
}

/** All currently-registered adapters, in insertion order. */
export function listVaults(): VaultFileSystem[] {
  return Array.from(adapters.values())
}

/** Remove an adapter from the registry. No-op if unknown. */
export function unregisterVault(id: VaultId): void {
  adapters.delete(id)
  notify()
}

/**
 * Subscribe to registry mutations. Returns an unsubscribe function.
 * Useful for `useSyncExternalStore` integration in components.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const listener of listeners) listener()
}

/** Test-only: clear all state. Not exported via barrel. */
export function __resetRegistryForTests(): void {
  adapters.clear()
  listeners.clear()
}
