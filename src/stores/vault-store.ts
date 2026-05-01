/**
 * Vault store — Zustand-backed state for registered vaults and the active vault.
 *
 * Responsibilities:
 *   - Track {@link VaultMeta} records (persisted to Dexie)
 *   - Track which vault is currently active (id only; persisted to Dexie)
 *   - Hold live {@link VaultFileSystem} adapters in a non-reactive Map
 *     (adapters are large + non-serializable; never put them in Zustand state)
 *
 * **NOT responsible for**:
 *   - Permission re-grant flow on returning users (see M6.3)
 *   - Per-vault reading state like recent files / scroll positions (M2.7 / M4.7)
 *
 * This store replaces the M1.3 `core/vault/registry.ts` shim. Migration is a
 * mechanical swap: `registerVault(adapter)` → `useVaultStore.getState().registerVault(adapter)`.
 */

import { create } from 'zustand'
import { db, metaToStored, storedToMeta } from '@/core/persistence/db'
import type { VaultFileSystem, VaultId, VaultMeta } from '@/core/vault'

const ACTIVE_VAULT_ID_PREF_KEY = 'activeVaultId'

/** Live adapters keyed by vault id. Module-scoped so they don't end up in
 *  Zustand's reactive store (they're large objects; equality checks would
 *  cause unnecessary re-renders). */
const adapters = new Map<VaultId, VaultFileSystem>()

interface VaultStoreState {
  registeredVaults: VaultMeta[]
  activeVaultId: VaultId | null
  /** True after `init()` has finished loading from Dexie. */
  ready: boolean
}

interface VaultStoreActions {
  /** Load registered vaults and the active id from Dexie. Idempotent. */
  init: () => Promise<void>

  /** Register a freshly-picked adapter. Persists metadata, sets active. */
  registerVault: (adapter: VaultFileSystem) => Promise<VaultMeta>

  /** Make a registered vault active. No-op if `id` is unknown. */
  switchVault: (id: VaultId) => Promise<void>

  /** Remove a vault from the registry. Does NOT delete vault content. */
  removeVault: (id: VaultId) => Promise<void>

  /** Bind a live adapter to an existing meta entry (e.g. after permission
   *  re-grant on a returning user). M6.3 calls this. */
  attachAdapter: (adapter: VaultFileSystem) => void
}

export type VaultStore = VaultStoreState & VaultStoreActions

export const useVaultStore = create<VaultStore>((set, get) => ({
  registeredVaults: [],
  activeVaultId: null,
  ready: false,

  async init() {
    if (get().ready) return
    const stored = await db.vaults.orderBy('lastOpenedAtMs').reverse().toArray()
    const activePref = await db.preferences.get(ACTIVE_VAULT_ID_PREF_KEY)
    const activeId =
      typeof activePref?.value === 'string' ? activePref.value : null
    set({
      registeredVaults: stored.map(storedToMeta),
      activeVaultId: activeId,
      ready: true,
    })
  },

  async registerVault(adapter) {
    const now = new Date()
    const existing = get().registeredVaults.find((v) => v.id === adapter.id)
    const meta: VaultMeta = {
      id: adapter.id,
      name: adapter.name,
      registeredAt: existing?.registeredAt ?? now,
      lastOpenedAt: now,
    }
    await db.vaults.put(metaToStored(meta))
    await db.preferences.put({ key: ACTIVE_VAULT_ID_PREF_KEY, value: meta.id })
    adapters.set(adapter.id, adapter)
    set((state) => {
      const others = state.registeredVaults.filter((v) => v.id !== meta.id)
      // Most-recently-opened first
      return {
        registeredVaults: [meta, ...others],
        activeVaultId: meta.id,
      }
    })
    return meta
  },

  async switchVault(id) {
    const meta = get().registeredVaults.find((v) => v.id === id)
    if (!meta) return
    const updated: VaultMeta = { ...meta, lastOpenedAt: new Date() }
    await db.vaults.put(metaToStored(updated))
    await db.preferences.put({ key: ACTIVE_VAULT_ID_PREF_KEY, value: id })
    set((state) => {
      const others = state.registeredVaults.filter((v) => v.id !== id)
      return {
        registeredVaults: [updated, ...others],
        activeVaultId: id,
      }
    })
  },

  async removeVault(id) {
    await db.vaults.delete(id)
    adapters.delete(id)
    if (get().activeVaultId === id) {
      await db.preferences.delete(ACTIVE_VAULT_ID_PREF_KEY)
    }
    set((state) => ({
      registeredVaults: state.registeredVaults.filter((v) => v.id !== id),
      activeVaultId: state.activeVaultId === id ? null : state.activeVaultId,
    }))
  },

  attachAdapter(adapter) {
    adapters.set(adapter.id, adapter)
  },
}))

/* ─── selectors / accessors that don't need to be reactive ─────────── */

/** Get the live adapter for a registered vault, or `null` if not loaded. */
export function getAdapter(id: VaultId): VaultFileSystem | null {
  return adapters.get(id) ?? null
}

/** Get the currently active adapter, or `null` if none / not loaded. */
export function getActiveAdapter(): VaultFileSystem | null {
  const id = useVaultStore.getState().activeVaultId
  return id ? (adapters.get(id) ?? null) : null
}

/** Test-only: clear in-memory adapters. Does NOT touch Dexie. */
export function __resetAdaptersForTests(): void {
  adapters.clear()
}
