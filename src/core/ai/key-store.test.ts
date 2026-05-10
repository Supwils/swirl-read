import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetDbForTests, db } from '@/core/persistence/db'
import {
  clearAIKey,
  clearAllAIKeys,
  getAIKey,
  getActiveProvider,
  hasAIKey,
  setAIKey,
  setActiveProvider,
} from './key-store'

beforeEach(async () => {
  await __resetDbForTests()
})

afterEach(async () => {
  await __resetDbForTests()
})

describe('ai key-store', () => {
  it('round-trips a stored key through encrypt + decrypt', async () => {
    await setAIKey('anthropic', 'sk-ant-secret-123')
    const stored = await getAIKey('anthropic')
    expect(stored).not.toBeNull()
    expect(stored!.apiKey).toBe('sk-ant-secret-123')
    expect(stored!.provider).toBe('anthropic')
  })

  it('persists meta alongside the encrypted key', async () => {
    await setAIKey('openai-compat', 'sk-openai', {
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    })
    const stored = await getAIKey('openai-compat')
    expect(stored?.meta).toEqual({
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    })
  })

  it('encrypts the value at rest — Dexie row never holds the plaintext', async () => {
    await setAIKey('anthropic', 'sk-ant-rest')
    const row = await db.aiKeys.get('anthropic')
    expect(row).not.toBeUndefined()
    const ciphertextBytes = new Uint8Array(row!.ciphertext)
    expect(new TextDecoder().decode(ciphertextBytes)).not.toContain(
      'sk-ant-rest',
    )
    expect(row!.iv.byteLength).toBe(12)
  })

  it('returns null for an unset provider', async () => {
    expect(await getAIKey('anthropic')).toBeNull()
    expect(await hasAIKey('anthropic')).toBe(false)
  })

  it('hasAIKey reflects writes and clears', async () => {
    await setAIKey('anthropic', 'sk1')
    expect(await hasAIKey('anthropic')).toBe(true)
    await clearAIKey('anthropic')
    expect(await hasAIKey('anthropic')).toBe(false)
  })

  it('overwriting a key uses a fresh IV', async () => {
    await setAIKey('anthropic', 'sk-1')
    const first = await db.aiKeys.get('anthropic')
    await setAIKey('anthropic', 'sk-2')
    const second = await db.aiKeys.get('anthropic')
    expect(Array.from(first!.iv)).not.toEqual(Array.from(second!.iv))
    const decrypted = await getAIKey('anthropic')
    expect(decrypted!.apiKey).toBe('sk-2')
  })

  it('clearAllAIKeys drops every row + the master key, so the next set starts fresh', async () => {
    await setAIKey('anthropic', 'sk-a')
    await setAIKey('openai-compat', 'sk-o', { baseURL: 'http://x', model: 'm' })
    await clearAllAIKeys()
    expect(await db.aiKeys.count()).toBe(0)
    expect(await db.preferences.get('ai:masterKey')).toBeUndefined()
  })

  it('returns null when no active provider has been selected', async () => {
    expect(await getActiveProvider()).toBeNull()
  })

  it('round-trips an active provider selection through preferences', async () => {
    await setActiveProvider('xiaomi')
    expect(await getActiveProvider()).toBe('xiaomi')
    await setActiveProvider('anthropic')
    expect(await getActiveProvider()).toBe('anthropic')
  })

  it('clears the active provider when set to null', async () => {
    await setActiveProvider('xiaomi')
    await setActiveProvider(null)
    expect(await getActiveProvider()).toBeNull()
  })

  it('self-heals and drops a junk active-provider value', async () => {
    await db.preferences.put({ key: 'ai:activeProvider', value: 'gemini' })
    expect(await getActiveProvider()).toBeNull()
    expect(await db.preferences.get('ai:activeProvider')).toBeUndefined()
  })

  it('clearAllAIKeys also drops the active-provider selection', async () => {
    await setAIKey('anthropic', 'sk-ant')
    await setActiveProvider('anthropic')
    await clearAllAIKeys()
    expect(await getActiveProvider()).toBeNull()
  })

  it('drops orphan rows whose ciphertext does not match the current master key', async () => {
    // Simulate a partial-clear scenario: row exists but the master key
    // got reset out from under it. getAIKey should self-heal.
    await setAIKey('anthropic', 'sk-old')
    await db.preferences.delete('ai:masterKey')
    expect(await getAIKey('anthropic')).toBeNull()
    // The orphan row should have been cleaned up.
    expect(await db.aiKeys.count()).toBe(0)
  })
})
