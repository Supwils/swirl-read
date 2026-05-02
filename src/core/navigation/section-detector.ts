/**
 * Section / vault-home detection.
 *
 * Two related lookups:
 *
 *  1. **Vault home** (`findVaultHome`) — the file the user lands on when
 *     opening a vault root: `index.md`, `home.md`, `README.md`.
 *  2. **Section home** (`findSectionHome`) — the file a top-level
 *     directory "is about." Wilson's vault convention is
 *     `<dirname>-map.md` (e.g. `career/career-map.md`), with falls
 *     through to `<dirname>.md`, then index/home/README.
 *
 * Lowercased name matching is intentional — macOS HFS+ is case-insensitive
 * and people are inconsistent. We probe in priority order and return the
 * first hit.
 */

import { basename } from '@/core/vault'
import type { VaultEntry, VaultFileSystem, VaultPath } from '@/core/vault'

/** Vault-root home filenames, in priority order, lowercased for matching. */
const HOME_CANDIDATES_LC = [
  'index.md',
  'home.md',
  'readme.md',
  'index.mdx',
  'home.mdx',
  'readme.mdx',
] as const

/**
 * Find a sensible "home" file at the vault root, or `null` if none exists.
 *
 * Errors during listing (permission revoked, etc.) bubble up — callers
 * decide whether to fall back to a directory listing or surface the error.
 */
export async function findVaultHome(
  vault: VaultFileSystem,
): Promise<VaultPath | null> {
  const entries = await vault.list('')
  return pickHomeFromEntries(entries)
}

/**
 * Pure helper — given a flat list of root-level entries, pick the home
 * file path or `null`. Exported for unit testing without an adapter.
 */
export function pickHomeFromEntries(entries: VaultEntry[]): VaultPath | null {
  // Build a lowercased-name → path lookup so we case-insensitive-match
  // each candidate without scanning the array per probe.
  const filesByLcName = new Map<string, VaultPath>()
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const lc = entry.name.toLowerCase()
    if (!filesByLcName.has(lc)) filesByLcName.set(lc, entry.path)
  }
  for (const candidate of HOME_CANDIDATES_LC) {
    const hit = filesByLcName.get(candidate)
    if (hit) return hit
  }
  return null
}

/* ─── Section homes (M4.2) ─────────────────────────────────────────── */

/** Metadata describing a top-level "section" within the vault. */
export interface VaultSection {
  /** The directory entry — listing parent for this section. */
  directory: VaultEntry
  /** Vault-relative path to the section home file, or `null` if none. */
  home: VaultPath | null
}

/**
 * Pure helper — given a directory's entries and the directory's own name,
 * pick its section home file or `null`.
 *
 * Priority order (lowercased compare):
 *
 *   1. `<dirname>-map.md`     ← Wilson's vault convention
 *   2. `<dirname>.md`         ← directory-as-doc convention
 *   3. `index.md` / `home.md` / `README.md`
 *
 * `.mdx` variants are accepted at every slot for parity with `findVaultHome`.
 */
export function pickSectionHomeFromEntries(
  entries: VaultEntry[],
  dirName: string,
): VaultPath | null {
  if (dirName === '') return null
  const filesByLcName = new Map<string, VaultPath>()
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const lc = entry.name.toLowerCase()
    if (!filesByLcName.has(lc)) filesByLcName.set(lc, entry.path)
  }

  const lcDir = dirName.toLowerCase()
  const candidates = [
    `${lcDir}-map.md`,
    `${lcDir}-map.mdx`,
    `${lcDir}.md`,
    `${lcDir}.mdx`,
    ...HOME_CANDIDATES_LC,
  ]
  for (const candidate of candidates) {
    const hit = filesByLcName.get(candidate)
    if (hit) return hit
  }
  return null
}

/**
 * Async wrapper — list `dirPath` and return its section home, if any.
 *
 * Listing failures bubble up; callers can choose to swallow them (a
 * missing section home is non-fatal — the directory still renders).
 */
export async function findSectionHome(
  vault: VaultFileSystem,
  dirPath: VaultPath,
): Promise<VaultPath | null> {
  const entries = await vault.list(dirPath)
  return pickSectionHomeFromEntries(entries, basename(dirPath))
}

/**
 * Detect every top-level directory section in a vault, with each one's
 * resolved home file (or `null`). The list is in adapter order — callers
 * sort it for display.
 *
 * Implementation note: each per-directory `findSectionHome` runs in
 * parallel. For Wilson's vault (~5 top-level dirs) the round-trip cost is
 * a single `Promise.all` and the FSAPI mock; large vaults stay bounded
 * because top-level dir count is naturally small.
 */
export async function detectSections(
  vault: VaultFileSystem,
): Promise<VaultSection[]> {
  const rootEntries = await vault.list('')
  const dirs = rootEntries.filter((entry) => entry.isDirectory)
  return Promise.all(
    dirs.map(async (directory) => ({
      directory,
      home: await findSectionHome(vault, directory.path).catch(() => null),
    })),
  )
}
