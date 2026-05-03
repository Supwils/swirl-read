/**
 * Core vault types and abstractions.
 *
 * A "vault" is any folder of files that SwirlRead can read. Concrete adapters
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
   * Write UTF-8 text back to an existing file (Phase 2 lightweight editing).
   *
   * Phase 2 deliberately does not create new files, rename, delete, or
   * mutate directories — `writeText` is the single mutation surface and
   * must target an existing path.
   *
   * On FSAPI adapters the first call from a session may surface the
   * read-write permission prompt; callers must invoke this from a user
   * gesture in browsers that require it.
   *
   * Read-only adapters (e.g. `SampleVaultAdapter`) reject with
   * `VaultWriteError` so the editor surface fails loudly rather than
   * silently swallowing the user's edit.
   *
   * @throws {VaultFileNotFoundError} If the path does not exist.
   * @throws {VaultPermissionDeniedError} If the user denies the
   *   read-write permission prompt.
   * @throws {VaultWriteError} For any other failure (quota, locked file,
   *   read-only adapter, …).
   */
  writeText(path: VaultPath, content: string): Promise<void>

  /**
   * Synchronous capability flag — `true` if this adapter cannot ever
   * accept a `writeText` call (e.g. the bundled sample vault). The
   * editor surface uses this to pre-flight-gate the Edit affordance so
   * the user never enters edit mode just to bounce off a read-only
   * error on first save.
   *
   * Distinct from {@link hasWritePermission}: `isReadOnly` is a static
   * property of the adapter (sample is always read-only); permission
   * is a per-handle runtime check that can be elevated by user action.
   * An FSAPI adapter is `isReadOnly === false` even before the user
   * has granted readwrite — the elevation flow handles that on first
   * save.
   */
  readonly isReadOnly: boolean

  /**
   * Whether the adapter is allowed to call `writeText`. Read-only
   * adapters return `false` and never throw; FSAPI adapters check the
   * persisted handle's `'readwrite'` mode.
   *
   * Optional — adapters that omit this are treated as read-only by the
   * editor surface.
   */
  hasWritePermission?(): Promise<boolean>

  /**
   * Request read-write permission from the user. Must be called from a
   * user gesture. Resolves to `true` if the adapter can subsequently
   * call `writeText` without re-prompting.
   *
   * Optional for the same reason as `hasWritePermission`.
   */
  requestWritePermission?(): Promise<boolean>

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

  /**
   * Optional. Release any per-adapter resources held since construction
   * (typically the cached `blob:` URLs handed out by `getBlobURL`).
   *
   * Called by the orchestration layer (`useVaultStore.removeVault`) when
   * the adapter is being evicted. Safe no-op for adapters that don't
   * cache anything (`SampleVaultAdapter`, future Tauri).
   */
  dispose?(): void
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

/**
 * A write operation failed for a reason other than not-found / permission.
 *
 * Examples: read-only adapter rejecting `writeText`, the FSAPI handle's
 * underlying disk going read-only, quota exhausted, file locked by another
 * process. Permission-denied (FSAPI prompt rejected) and missing-file are
 * surfaced as their own typed errors so callers can branch cleanly.
 */
export class VaultWriteError extends VaultError {
  override name = 'VaultWriteError'
  constructor(
    public readonly path: VaultPath,
    options?: { cause?: unknown; reason?: string },
  ) {
    super(
      options?.reason
        ? `Failed to write vault file ${path}: ${options.reason}`
        : `Failed to write vault file: ${path}`,
      options?.cause === undefined ? undefined : { cause: options.cause },
    )
  }
}
