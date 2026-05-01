/**
 * Core vault types and abstractions.
 *
 * A "vault" is any folder of files that SwilRead can read. Concrete adapters
 * (FSAPI, Sample, future Tauri) implement {@link VaultFileSystem}; the rest
 * of the app only knows the interface.
 */

/**
 * Stable opaque identifier for a registered vault.
 *
 * Format: lowercase slug derived from folder name + 4-char random suffix,
 * e.g. `supwil-a3f7`. Generated on first registration and persisted.
 */
export type VaultId = string

/**
 * A POSIX-style relative path within a vault. Always uses `/` as separator.
 * Never starts or ends with `/`. Empty string represents the vault root.
 *
 * @example "career/me/me.md"
 * @example "knowledge/软件/前端/react.md"
 */
export type VaultPath = string

/** A regular file in the vault. */
export interface VaultFile {
  readonly path: VaultPath
  readonly name: string
  /** Lowercase extension including the leading dot, or `""` if none. */
  readonly extension: string
  readonly size: number
  readonly modifiedAt: Date
  readonly isDirectory: false
}

/** A directory in the vault. */
export interface VaultDirectory {
  readonly path: VaultPath
  readonly name: string
  readonly isDirectory: true
}

/** Either a file or a directory. */
export type VaultEntry = VaultFile | VaultDirectory

/**
 * Persistable metadata for a registered vault.
 *
 * Stored in IndexedDB so we can list vaults and recover after a reload.
 */
export interface VaultMeta {
  readonly id: VaultId
  /** Human-readable name (defaults to the folder's display name). */
  readonly name: string
  readonly registeredAt: Date
  readonly lastOpenedAt: Date
  /** Optional, computed lazily. */
  readonly fileCount?: number
}

/**
 * Read-only filesystem abstraction over a vault.
 *
 * Every adapter (FSAPI, in-memory sample, future Tauri) implements this.
 * The UI layer never sees adapter details — only this interface.
 */
export interface VaultFileSystem {
  /** Stable identifier; safe to use as a key in IndexedDB or URL paths. */
  readonly id: VaultId

  /** Display name (typically the folder name the user picked). */
  readonly name: string

  /**
   * List entries in a directory (non-recursive).
   * Pass `""` to list the vault root.
   *
   * @throws {VaultFileNotFoundError} If the directory does not exist.
   * @throws {VaultPermissionDeniedError} If permission has been revoked.
   */
  list(path: VaultPath): Promise<VaultEntry[]>

  /**
   * Recursively walk every file in the vault. Yields lazily so very large
   * vaults stream rather than materialize a full list in memory.
   *
   * Directories are NOT yielded. Use {@link list} for directory introspection.
   */
  walk(): AsyncIterable<VaultFile>

  /**
   * Get metadata for a single entry without reading its contents.
   *
   * @throws {VaultFileNotFoundError} If the path does not exist.
   */
  stat(path: VaultPath): Promise<VaultEntry>

  /**
   * Read a file as UTF-8 text.
   *
   * @throws {VaultFileNotFoundError} If the file does not exist.
   * @throws {VaultReadError} If the read fails for any other reason.
   */
  readText(path: VaultPath): Promise<string>

  /**
   * Read a file as raw bytes. Use for images, fonts, etc.
   *
   * @throws {VaultFileNotFoundError} If the file does not exist.
   * @throws {VaultReadError} If the read fails for any other reason.
   */
  readBinary(path: VaultPath): Promise<Uint8Array>

  /**
   * Get a stable `blob:` URL for a file. Suitable for `<img src=...>` in
   * rendered markdown.
   *
   * Implementations should cache and reuse URLs per path; callers should not
   * revoke them (the adapter manages lifecycle).
   *
   * @throws {VaultFileNotFoundError} If the file does not exist.
   */
  getBlobURL(path: VaultPath): Promise<string>

  /**
   * Whether the underlying filesystem currently grants read permission.
   *
   * For FSAPI this checks the persisted handle; for in-memory adapters this
   * always returns `true`.
   */
  hasPermission(): Promise<boolean>

  /**
   * Request read permission interactively if needed. Returns `true` if
   * permission was granted (either already-granted or newly granted).
   *
   * Must be called from a user gesture in browsers that require it.
   */
  requestPermission(): Promise<boolean>
}

/* ─────────────────────────────────────────────────────────────────────────
   Errors. Adapters throw these so callers can branch on type, not message.
   ───────────────────────────────────────────────────────────────────────── */

/** Base class for all vault-layer errors. */
export class VaultError extends Error {
  override name = 'VaultError'
}

/** Permission to read the vault has been denied or revoked. */
export class VaultPermissionDeniedError extends VaultError {
  override name = 'VaultPermissionDeniedError'
  constructor(message = 'Permission denied for vault access') {
    super(message)
  }
}

/** A path was requested that does not exist in the vault. */
export class VaultFileNotFoundError extends VaultError {
  override name = 'VaultFileNotFoundError'
  constructor(public readonly path: VaultPath) {
    super(`File not found in vault: ${path}`)
  }
}

/** A read operation failed for a reason other than not-found / permission. */
export class VaultReadError extends VaultError {
  override name = 'VaultReadError'
  constructor(
    public readonly path: VaultPath,
    options?: { cause?: unknown },
  ) {
    super(`Failed to read vault file: ${path}`, options)
  }
}
