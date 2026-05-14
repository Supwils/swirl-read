/**
 * Pure helpers shared between FileShelf and FolderRow. Lives outside the
 * component file so the react-refresh boundary stays clean (component
 * files must export components only).
 */

import { extname, type VaultEntry } from '@/core/vault'
import type { ContextMenuFile } from '@/ui/landing/ContextMenu'

export function pillFromEntry(entry: VaultEntry): ContextMenuFile | null {
  if (entry.isDirectory) return null
  const ext = extname(entry.path).replace(/^\./, '')
  const name = ext
    ? entry.name.slice(0, entry.name.length - (ext.length + 1))
    : entry.name
  return { path: entry.path, name, ext }
}
