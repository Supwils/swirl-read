/**
 * Vault ID generation.
 *
 * IDs are stable strings derived from a folder name plus a short random
 * suffix. They appear in URL paths (`/app/:vaultId`) and IndexedDB keys,
 * so they must be URL-safe and reasonably short.
 */

import type { VaultId } from './types'

/**
 * Convert an arbitrary folder name to a URL-safe slug.
 *
 * - Unicode letters/numbers preserved (so 思源 → 思源, no transliteration)
 * - Spaces and punctuation collapse to single hyphens
 * - Trimmed, lowercased, capped at 32 characters
 * - Empty / non-alphanumeric input falls back to `"vault"`
 *
 * @example
 *   slugify("My Knowledge")        // → "my-knowledge"
 *   slugify("supwil")              // → "supwil"
 *   slugify("Reading & Writing")   // → "reading-writing"
 *   slugify("    ")                // → "vault"
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return slug || 'vault'
}

/**
 * Generate a random 4-character suffix using base36 alphabet.
 * Provides ~1.6M unique values — enough for collision avoidance among a
 * single user's vaults (which is the only namespace).
 */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0')
}

/**
 * Build a vault ID from a folder name. Always produces a fresh ID — call
 * once per registration, then persist alongside the folder handle.
 *
 * @example
 *   generateVaultId("supwil")        // → "supwil-a3f7"
 *   generateVaultId("My Knowledge")  // → "my-knowledge-9k2x"
 */
export function generateVaultId(folderName: string): VaultId {
  return `${slugify(folderName)}-${randomSuffix()}`
}
