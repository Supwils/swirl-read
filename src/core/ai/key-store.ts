/**
 * AES-GCM-encrypted API key storage (Phase 3).
 *
 * Threat model:
 *   - **In scope**: casual exfiltration via Dexie inspection, browser
 *     extension snapshots, malicious tabs sharing the origin, casual
 *     dumps of the IDB store from devtools.
 *   - **Out of scope**: a fully-malicious script running in our origin
 *     with full DOM access. SubtleCrypto with a non-extractable
 *     CryptoKey raises the cost of that attack but doesn't make it
 *     impossible — only Tauri's keychain integration does, and that's
 *     a Phase 3+ deliverable on the AI roadmap.
 *
 * Implementation:
 *   - One AES-GCM 256 master key per browser profile, generated lazily
 *     on first write, stored in `preferences` under `ai:masterKey`.
 *     `extractable: false`, so even though the key sits inside IDB it
 *     can never be read out as raw bytes.
 *   - Per-provider rows in `aiKeys` carry `{ ciphertext, iv, meta }`.
 *     `iv` is a fresh 12-byte random per encrypt, never reused.
 *   - `meta` is a free-form non-secret string map (base URL, model
 *     override) so the rest of the app can read it without going
 *     through decrypt.
 *
 * All public functions degrade gracefully on environments without
 * SubtleCrypto (e.g. ancient browsers) by throwing a clearly-labelled
 * error — the AI surface refuses to mount in that case.
 */

import { db } from '@/core/persistence/db'
import type { AIProviderId } from './types'

const MASTER_KEY_PREF = 'ai:masterKey'
const ACTIVE_PROVIDER_PREF = 'ai:activeProvider'
const ALG = 'AES-GCM'
const KEY_LENGTH = 256

const VALID_PROVIDERS: ReadonlySet<string> = new Set([
  'anthropic',
  'openai-compat',
  'xiaomi',
])

class CryptoUnavailableError extends Error {
  constructor() {
    super('SubtleCrypto is not available in this environment')
    this.name = 'CryptoUnavailableError'
  }
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new CryptoUnavailableError()
  return subtle
}

async function getOrCreateMasterKey(): Promise<CryptoKey> {
  const subtle = getSubtle()
  const row = await db.preferences.get(MASTER_KEY_PREF)
  if (row && row.value instanceof CryptoKey) return row.value
  const key = await subtle.generateKey(
    { name: ALG, length: KEY_LENGTH },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  )
  await db.preferences.put({ key: MASTER_KEY_PREF, value: key })
  return key
}

export interface AIKeyMeta {
  /** OpenAI-compatible base URL, when applicable. */
  baseURL?: string
  /** Optional model id override. */
  model?: string
}

export interface StoredAIKey {
  provider: AIProviderId
  apiKey: string
  meta: AIKeyMeta
}

export async function setAIKey(
  provider: AIProviderId,
  apiKey: string,
  meta: AIKeyMeta = {},
): Promise<void> {
  const subtle = getSubtle()
  const key = await getOrCreateMasterKey()
  // Allocate via ArrayBuffer so the resulting Uint8Array's `buffer`
  // type is `ArrayBuffer` (not `ArrayBufferLike`), matching the
  // BufferSource shape SubtleCrypto expects in TS 5.7+.
  const iv = new Uint8Array(new ArrayBuffer(12))
  globalThis.crypto.getRandomValues(iv)
  const plaintext = new Uint8Array(new TextEncoder().encode(apiKey))
  const ciphertext = await subtle.encrypt({ name: ALG, iv }, key, plaintext)
  await db.aiKeys.put({
    provider,
    ciphertext,
    iv,
    meta: serializeMeta(meta),
  })
}

export async function getAIKey(
  provider: AIProviderId,
): Promise<StoredAIKey | null> {
  const row = await db.aiKeys.get(provider)
  if (!row) return null
  const subtle = getSubtle()
  const key = await getOrCreateMasterKey()
  // Copy the IV into a fresh ArrayBuffer-backed view so the resulting
  // Uint8Array<ArrayBuffer> matches SubtleCrypto's BufferSource shape.
  // Dexie returns Uint8Array<ArrayBufferLike>, which TS 5.7+ refuses.
  const ivBuffer = new Uint8Array(new ArrayBuffer(row.iv.byteLength))
  ivBuffer.set(row.iv)
  let plaintext: ArrayBuffer
  try {
    plaintext = await subtle.decrypt(
      { name: ALG, iv: ivBuffer },
      key,
      row.ciphertext,
    )
  } catch {
    // Ciphertext doesn't match the current master key — the user reset
    // hints / cleared site data partially, leaving an orphan row. Drop
    // it so the next setAIKey starts fresh.
    await db.aiKeys.delete(provider)
    return null
  }
  return {
    provider,
    apiKey: new TextDecoder().decode(plaintext),
    meta: deserializeMeta(row.meta),
  }
}

export async function hasAIKey(provider: AIProviderId): Promise<boolean> {
  const count = await db.aiKeys.where('provider').equals(provider).count()
  return count > 0
}

export async function clearAIKey(provider: AIProviderId): Promise<void> {
  await db.aiKeys.delete(provider)
}

export async function clearAllAIKeys(): Promise<void> {
  await db.aiKeys.clear()
  // Drop the master key too so the next configure cycle generates a
  // fresh one — useful when a user wants a hard reset.
  await db.preferences.delete(MASTER_KEY_PREF)
  await db.preferences.delete(ACTIVE_PROVIDER_PREF)
}

/**
 * Read the user-selected default provider for ⌘K. Returns `null` when
 * the user hasn't picked one — callers fall back to a deterministic
 * chain over the configured keys (see `PaletteAskResult.resolveProvider`).
 *
 * Self-heals stale values: if the stored id was once valid but the
 * provider no longer exists in {@link VALID_PROVIDERS}, we drop it and
 * return `null` so the fallback chain takes over.
 */
export async function getActiveProvider(): Promise<AIProviderId | null> {
  const row = await db.preferences.get(ACTIVE_PROVIDER_PREF)
  const value = row?.value
  if (typeof value === 'string' && VALID_PROVIDERS.has(value)) {
    return value as AIProviderId
  }
  if (row !== undefined) {
    // Stored value is junk (legacy format, hand-edited, etc.) — clean up
    // so the fallback chain wins on the next read.
    await db.preferences.delete(ACTIVE_PROVIDER_PREF)
  }
  return null
}

/**
 * Persist (or clear, when passed `null`) the user-selected default
 * provider. The UI should only call this after confirming the target
 * provider has a saved key — picking a default with no configured key
 * would just produce a "no provider configured" error in the palette.
 */
export async function setActiveProvider(
  provider: AIProviderId | null,
): Promise<void> {
  if (provider === null) {
    await db.preferences.delete(ACTIVE_PROVIDER_PREF)
    return
  }
  await db.preferences.put({ key: ACTIVE_PROVIDER_PREF, value: provider })
}

function serializeMeta(meta: AIKeyMeta): Record<string, string> | undefined {
  const entries: [string, string][] = []
  if (meta.baseURL) entries.push(['baseURL', meta.baseURL])
  if (meta.model) entries.push(['model', meta.model])
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function deserializeMeta(meta: Record<string, string> | undefined): AIKeyMeta {
  if (!meta) return {}
  const result: AIKeyMeta = {}
  if (typeof meta.baseURL === 'string') result.baseURL = meta.baseURL
  if (typeof meta.model === 'string') result.model = meta.model
  return result
}
