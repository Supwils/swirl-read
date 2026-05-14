/**
 * Deterministic folder → palette ID resolver for Pebble Garden + FileShelf.
 *
 * The six folder color IDs map 1:1 to a CSS token group in `themes.css`
 * (`--f-<id>` / `--f-<id>-deep` / `--f-<id>-ink`). When a vault contains a
 * folder whose top-level name matches one of the canonical IDs we return it
 * verbatim; otherwise we fall back to a stable hash so the same folder always
 * lands on the same color across sessions, devices, and re-renders.
 *
 * This is pure: no DOM, no I/O. Components consume the returned ID directly
 * as the CSS variable suffix.
 */

import { splitPath } from './path'
import type { VaultPath } from './types'

export const FOLDER_COLORS = [
  'knowledge',
  'career',
  'reading',
  'ai',
  'tasks',
  'journal',
] as const

export type FolderColorId = (typeof FOLDER_COLORS)[number]

const FOLDER_COLOR_SET = new Set<string>(FOLDER_COLORS)

/**
 * Stable 32-bit hash. djb2-like; collisions are acceptable because the output
 * is mod 6 anyway. The key requirement is that the same input always produces
 * the same output across page loads (so we hash on the path string directly).
 */
function hashFolderName(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * Resolve a folder path to a stable palette ID.
 *
 * Strategy:
 *   1. If the path's first segment is a canonical color name, return it
 *      verbatim so renaming is meaningful.
 *   2. Otherwise hash the first segment (or the whole path for the root) and
 *      mod into the six-color palette.
 *
 * Examples:
 *   folderColorId("knowledge")         → "knowledge"
 *   folderColorId("knowledge/react")   → "knowledge"  (sub-folders inherit)
 *   folderColorId("frontend")          → stable hash bucket
 *   folderColorId("")                  → stable hash on "" → "knowledge"
 */
export function folderColorId(folderPath: VaultPath): FolderColorId {
  const segments = splitPath(folderPath)
  const first = segments[0] ?? ''
  const lowered = first.toLowerCase()
  if (FOLDER_COLOR_SET.has(lowered)) {
    return lowered as FolderColorId
  }
  const idx = hashFolderName(first || folderPath) % FOLDER_COLORS.length
  return FOLDER_COLORS[idx]!
}
