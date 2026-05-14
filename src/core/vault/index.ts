/**
 * Vault layer — filesystem abstraction over user content.
 *
 * Public surface:
 *   - {@link VaultFileSystem} interface
 *   - {@link VaultEntry}, {@link VaultFile}, {@link VaultDirectory} types
 *   - {@link VaultMeta} for persisted metadata
 *   - Vault error classes
 *   - Path utilities ({@link joinPath}, {@link dirname}, etc.)
 *
 * Adapters (FSAPIVaultAdapter, SampleVaultAdapter, ...) live in sibling files
 * and implement {@link VaultFileSystem}.
 */

export type {
  VaultId,
  VaultPath,
  VaultFile,
  VaultDirectory,
  VaultEntry,
  VaultMeta,
  VaultFileSystem,
} from './types'

export {
  VaultError,
  VaultPermissionDeniedError,
  VaultFileNotFoundError,
  VaultReadError,
  VaultWriteError,
} from './types'

export {
  normalizePath,
  joinPath,
  dirname,
  basename,
  extname,
  splitPath,
  isMarkdown,
  isImage,
  isWithin,
} from './path'

export { slugify, generateVaultId } from './id'

export { FOLDER_COLORS, folderColorId } from './folder-color'
export type { FolderColorId } from './folder-color'

export { FSAPIVaultAdapter } from './fsapi-adapter'
export type { FSAPIVaultAdapterInit } from './fsapi-adapter'

export { walkAllFiles } from './walk-files'
export type { WalkOptions } from './walk-files'

export {
  saveHandle,
  loadHandle,
  deleteHandle,
  listHandleIds,
} from './handle-storage'
