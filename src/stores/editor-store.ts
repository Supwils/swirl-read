/**
 * Editor store — Phase 2B session state for the lightweight editor.
 *
 * Scope (deliberately narrow, mirrors `docs/develop/lightweight-editing-plan.md`):
 *   - Exactly one editor session at a time, scoped to a single file.
 *   - Holds the original-on-disk snapshot, the current draft, and three
 *     transient flags (`saving`, `error`, `conflict`).
 *   - Save loop reads the file from disk again before writing so an
 *     external change cannot be silently overwritten.
 *
 * NOT in scope:
 *   - Persistence of unsaved drafts (intentionally session-local; see plan §"Persistence Rules").
 *   - Multi-file editing.
 *   - File creation / rename / delete (no API surface in `VaultFileSystem`).
 *
 * Adapter resolution is injected at action-call time via the optional
 * `adapterResolver` argument so tests can swap a mock without touching
 * `useVaultStore`. Production callers (DocumentEditSurface in Phase 2C)
 * pass the live `getAdapter` from `vault-store`.
 */

import { create } from 'zustand'
import {
  VaultFileNotFoundError,
  VaultPermissionDeniedError,
  VaultWriteError,
  type VaultFileSystem,
  type VaultId,
  type VaultPath,
} from '@/core/vault'
import { getAdapter } from '@/stores/vault-store'
import { registerVaultDeletionHook } from './vault-lifecycle'

export type EditorConflict = 'clean' | 'stale-on-disk'

export interface EditorSession {
  vaultId: VaultId
  path: VaultPath
  /** Snapshot of the file as it was when the user entered edit mode. */
  original: string
  /** Current in-memory draft (may differ from `original`). */
  draft: string
  /** ms since epoch when the session was opened. */
  openedAt: number
  /** True iff `draft !== original`. Recomputed on every `updateDraft`. */
  dirty: boolean
  /** True while a `save()` call is in flight. */
  saving: boolean
  /**
   * Last error from `save()` (or write-permission denial). Cleared by
   * `clearError`, `updateDraft`, or a successful save.
   */
  error: EditorError | null
  /**
   * `stale-on-disk` means the disk contents diverged from `original`
   * since edit mode began. Set by the save pre-check; user must
   * resolve before another save can write.
   */
  conflict: EditorConflict
}

export type EditorErrorKind =
  | 'permission-denied'
  | 'file-missing'
  | 'write-failed'
  | 'read-only-vault'
  | 'unknown'

export interface EditorError {
  kind: EditorErrorKind
  message: string
}

interface EditorStoreState {
  active: EditorSession | null
}

type AdapterResolver = (vaultId: VaultId) => VaultFileSystem | null

interface EditorStoreActions {
  /**
   * Begin an editing session. Replaces any previous session — callers
   * must run a dirty-confirm prompt before invoking if `active?.dirty`.
   */
  enter: (vaultId: VaultId, path: VaultPath, source: string) => void
  /** Replace the draft text and recompute `dirty` / clear stale errors. */
  updateDraft: (value: string) => void
  /**
   * Save the draft back to disk. Re-reads the file first; if it has
   * changed since `enter()`, marks `conflict='stale-on-disk'` and
   * returns without writing. On a clean save, refreshes `original` so
   * the session can continue or close cleanly.
   *
   * Returns the next conflict status so callers can branch without
   * re-reading the store.
   */
  save: (resolver?: AdapterResolver) => Promise<EditorConflict>
  /**
   * Force a save that ignores the on-disk conflict — user explicitly
   * chose "Overwrite anyway". Behaves like `save()` but skips the
   * pre-read check.
   */
  overwrite: (resolver?: AdapterResolver) => Promise<void>
  /**
   * Reload the on-disk contents into both `original` and `draft`,
   * discarding the user's draft. Resolves the conflict and clears any
   * error.
   */
  reloadFromDisk: (resolver?: AdapterResolver) => Promise<void>
  /** Drop the session entirely. Caller is responsible for the dirty prompt. */
  cancel: () => void
  /** Clear `error` only — leaves draft / conflict untouched. */
  clearError: () => void
  /** Drop the session iff it targets `vaultId`. Used by `removeVault`. */
  forgetVault: (vaultId: VaultId) => void
}

export type EditorStore = EditorStoreState & EditorStoreActions

interface WriteOutcome {
  next: EditorSession
  conflict: EditorConflict
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  active: null,

  enter(vaultId, path, source) {
    set({
      active: {
        vaultId,
        path,
        original: source,
        draft: source,
        openedAt: Date.now(),
        dirty: false,
        saving: false,
        error: null,
        conflict: 'clean',
      },
    })
  },

  updateDraft(value) {
    const session = get().active
    if (!session) return
    const dirty = value !== session.original
    // Editing after a stale-on-disk warning shouldn't silently drop the
    // warning — only `reloadFromDisk` / `overwrite` may clear it. But
    // typing should clear a transient `unknown` error from a previous
    // save so the surface stops shouting at the user mid-stroke.
    set({
      active: {
        ...session,
        draft: value,
        dirty,
        error: session.error?.kind === 'unknown' ? null : session.error,
      },
    })
  },

  async save(resolver) {
    const session = get().active
    if (!session) return 'clean'
    if (session.saving) return session.conflict
    const adapter = (resolver ?? getAdapter)(session.vaultId)
    if (!adapter) {
      set({
        active: {
          ...session,
          error: {
            kind: 'unknown',
            message: 'Vault adapter is no longer available',
          },
        },
      })
      return session.conflict
    }

    set({ active: { ...session, saving: true, error: null } })

    let onDisk: string
    try {
      onDisk = await adapter.readText(session.path)
    } catch (cause) {
      const failing = get().active
      if (failing) {
        set({
          active: {
            ...failing,
            saving: false,
            error: toEditorError(cause, session.path),
          },
        })
      }
      return failing?.conflict ?? 'clean'
    }
    if (onDisk !== session.original) {
      const stale = get().active
      if (stale) {
        set({
          active: {
            ...stale,
            saving: false,
            conflict: 'stale-on-disk',
          },
        })
      }
      return 'stale-on-disk'
    }

    const live = get().active
    if (!live) return 'clean'
    const outcome = await performWrite(live, adapter)
    set({ active: outcome.next })
    return outcome.conflict
  },

  async overwrite(resolver) {
    const session = get().active
    if (!session) return
    if (session.saving) return
    const adapter = (resolver ?? getAdapter)(session.vaultId)
    if (!adapter) {
      set({
        active: {
          ...session,
          error: {
            kind: 'unknown',
            message: 'Vault adapter is no longer available',
          },
        },
      })
      return
    }
    set({ active: { ...session, saving: true, error: null } })
    const live = get().active
    if (!live) return
    const outcome = await performWrite(live, adapter)
    set({ active: outcome.next })
  },

  async reloadFromDisk(resolver) {
    const session = get().active
    if (!session) return
    const adapter = (resolver ?? getAdapter)(session.vaultId)
    if (!adapter) return
    try {
      const onDisk = await adapter.readText(session.path)
      const live = get().active
      if (!live) return
      set({
        active: {
          ...live,
          original: onDisk,
          draft: onDisk,
          dirty: false,
          conflict: 'clean',
          error: null,
        },
      })
    } catch (cause) {
      const live = get().active
      if (!live) return
      set({
        active: {
          ...live,
          error: toEditorError(cause, session.path),
        },
      })
    }
  },

  cancel() {
    set({ active: null })
  },

  clearError() {
    const session = get().active
    if (!session) return
    set({ active: { ...session, error: null } })
  },

  forgetVault(vaultId) {
    const session = get().active
    if (!session) return
    if (session.vaultId === vaultId) {
      set({ active: null })
    }
  },
}))

// Register at module load — editor-store has no persisted state, just
// the live session. Hook only acts when the active session targeted
// the deleted vault.
registerVaultDeletionHook((vaultId) => {
  useEditorStore.getState().forgetVault(vaultId)
})

/**
 * Selector helpers for components that don't want to subscribe to the
 * whole store. Cheap because they're plain reads, not memoised.
 */
export function isEditing(): boolean {
  return useEditorStore.getState().active !== null
}

export function isDirty(): boolean {
  return useEditorStore.getState().active?.dirty === true
}

/* ─── internals ───────────────────────────────────────────────────────── */

async function performWrite(
  session: EditorSession,
  adapter: VaultFileSystem,
): Promise<WriteOutcome> {
  // Permission escalation happens lazily on first save. Read-only
  // adapters (sample vault) report `false` and surface a typed error
  // before we even attempt the write.
  if (adapter.hasWritePermission && adapter.requestWritePermission) {
    const already = await adapter.hasWritePermission()
    if (!already) {
      const granted = await adapter.requestWritePermission()
      if (!granted) {
        return {
          next: {
            ...session,
            saving: false,
            error: {
              kind: 'permission-denied',
              message: 'Write permission denied — your draft is preserved',
            },
          },
          conflict: session.conflict,
        }
      }
    }
  }

  try {
    await adapter.writeText(session.path, session.draft)
  } catch (cause) {
    return {
      next: {
        ...session,
        saving: false,
        error: toEditorError(cause, session.path),
      },
      conflict: session.conflict,
    }
  }

  // Successful write — promote the draft to the new baseline so the
  // session can keep editing without immediately re-flagging dirty.
  return {
    next: {
      ...session,
      original: session.draft,
      saving: false,
      dirty: false,
      conflict: 'clean',
      error: null,
    },
    conflict: 'clean',
  }
}

function toEditorError(cause: unknown, path: VaultPath): EditorError {
  if (cause instanceof VaultPermissionDeniedError) {
    return {
      kind: 'permission-denied',
      message: 'Write permission denied — your draft is preserved',
    }
  }
  if (cause instanceof VaultFileNotFoundError) {
    return {
      kind: 'file-missing',
      message: `File no longer exists at ${path}`,
    }
  }
  if (cause instanceof VaultWriteError) {
    const kind: EditorErrorKind = cause.message.includes('read-only')
      ? 'read-only-vault'
      : 'write-failed'
    return { kind, message: cause.message }
  }
  return {
    kind: 'unknown',
    message: cause instanceof Error ? cause.message : String(cause),
  }
}
