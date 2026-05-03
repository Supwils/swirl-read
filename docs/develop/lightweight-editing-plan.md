# SwirlRead — Lightweight Editing Implementation Plan

> Status: Phase 2A + 2B + 2C + 2D all landed — feature-complete · Last updated: 2026-05-03

This document defines how SwirlRead should add a **reader-first editing mode** without drifting into a full authoring workspace.

The target is narrow:

- edit the **current document only**
- edit the **raw Markdown source text**
- support **quick repairs and small revisions**
- save, re-render, and return to reading

This is deliberately not a rich-text editor, block editor, or note-taking environment.

---

## Product Boundary

### In scope

- Fix typos
- Rewrite sentences or short passages
- Find / replace within the current file
- Edit links, tags, and frontmatter values
- Save back to the same Markdown file

### Out of scope

- File creation / deletion
- Rename / move from the editor surface
- Multi-file editing
- WYSIWYG / block editing
- Drag/drop media authoring
- Slash commands / formatting toolbar
- Structural page builder behavior

The implementation must preserve the existing product center: **reading first, editing second**.

---

## UX Model

### Mode model

Each Markdown document has two modes:

1. `read`
2. `edit`

The default is always `read`.

Entering edit mode should come from an explicit `Edit` action in the reading shell toolbar. Exiting edit mode should return the user to the rendered document, not leave them in a general editor workspace.

### Expected flow

1. User opens a Markdown file in reading mode
2. User clicks `Edit`
3. App loads the current file contents into a source editor
4. User edits text
5. User chooses:
   - `Save` -> write file -> re-render -> return to reading mode
   - `Cancel` -> discard draft -> return to reading mode
6. If the draft is dirty and the user tries to leave, app prompts for confirmation

### Keyboard behavior

- `Cmd/Ctrl + S` -> save
- `Cmd/Ctrl + F` -> find
- `Esc` -> close transient UI first; if clean, exit edit mode

If the draft is dirty, `Esc` should not silently discard it.

---

## Architecture Decision

Use a **source-text editor** rather than editing the rendered DOM.

### Why

- Markdown files remain the source of truth
- The current render pipeline already turns source -> React tree cleanly
- Editing rendered HTML would require lossy reverse mapping
- Source editing avoids AST patching and WYSIWYG drift
- The implementation stays compatible with future non-web adapters

This means the save loop is:

`readText -> edit draft -> writeText -> readText/renderMarkdown -> read mode`

Not:

`rendered DOM -> patch DOM -> reconstruct Markdown`

---

## Filesystem Interface Changes

The current `VaultFileSystem` interface is read-oriented. To support lightweight editing, add a minimal write surface.

### Required additions

In [`src/core/vault/types.ts`](/Users/supwils/supwilsoft/swil/swirl-read/src/core/vault/types.ts:58):

```ts
export interface VaultFileSystem {
  // existing methods...
  writeText(path: VaultPath, content: string): Promise<void>
  hasWritePermission?(): Promise<boolean>
  requestWritePermission?(): Promise<boolean>
}
```

### Notes

- `writeText` is the only required Phase 2 write method
- `hasWritePermission` and `requestWritePermission` can be optional convenience methods if the existing permission methods are widened carefully
- Do not add `createFile`, `delete`, `rename`, or directory mutations yet

### Error model

Writing should reuse the existing vault error pattern:

- `VaultPermissionDeniedError`
- `VaultFileNotFoundError`
- `VaultReadError`

Add `VaultWriteError` if needed rather than overloading `VaultReadError` for save failures.

---

## FSAPI Adapter Changes

In [`src/core/vault/fsapi-adapter.ts`](/Users/supwils/supwilsoft/swil/swirl-read/src/core/vault/fsapi-adapter.ts:1):

### Required behavior

1. Implement `writeText(path, content)`
2. Resolve the `FileSystemFileHandle`
3. Call `createWritable()`
4. `write(content)`
5. `close()`

### Permission strategy

Do **not** switch the whole app to `readwrite` up front.

Preferred behavior:

- initial vault pick remains optimized for reading
- first save attempt requests write permission
- if granted, proceed and cache that capability through the existing handle lifecycle

This keeps the FTUE aligned with a reading tool rather than a file editor.

### Browser API shape

Likely FSAPI path:

```ts
const handle = await dir.getFileHandle(name)
const writable = await handle.createWritable()
await writable.write(content)
await writable.close()
```

### Blob URL invalidation

If a saved file is an edited Markdown file that contains embeds or image references, normal re-render is enough.

If future editing expands to binary/media, cached blob URL invalidation will matter. For current Markdown text saves, no special blob cache handling is required beyond normal page reload / re-render behavior.

---

## State Design

Do not overload the current `useReaderStore` with document drafting state.

### Recommendation

Create a dedicated store for editing state:

- `src/stores/editor-store.ts`

### Proposed shape

```ts
interface EditorSession {
  vaultId: VaultId
  path: VaultPath
  original: string
  draft: string
  openedAt: number
  dirty: boolean
  saving: boolean
  error: string | null
  conflict: 'clean' | 'stale-on-disk'
}

interface EditorStoreState {
  active: EditorSession | null
}

interface EditorStoreActions {
  enter: (vaultId: VaultId, path: VaultPath, source: string) => void
  updateDraft: (value: string) => void
  save: () => Promise<void>
  cancel: () => void
  clearError: () => void
}
```

### Why separate store

- reader state and editor draft state have different lifecycles
- keeps read-mode logic simple
- avoids polluting recent-files / scroll-memory concerns with draft mechanics
- prepares for future dirty-route guards cleanly

---

## Component Structure

### Current structure

[`DocumentPage.tsx`](/Users/supwils/supwilsoft/swil/swirl-read/src/ui/reading-shell/DocumentPage.tsx:1) currently owns:

- file load
- file/directory branching
- markdown render
- backlinks indexing
- TOC publishing
- scroll memory restore

### Proposed structure

Keep `DocumentPage` as the route-level orchestrator, but split the content modes:

- `DocumentPage`
  - loads file
  - decides `read` vs `edit`
  - passes current source to the chosen surface

- `DocumentReadSurface`
  - today's rendered article view
  - frontmatter / backlinks / TOC integration stays here

- `DocumentEditSurface`
  - source editor
  - save / cancel actions
  - find / replace
  - dirty-state UI

### Why split

- keeps read-mode complexity from mixing with editor event handling
- makes it easier to preserve the reading surface as the product center
- avoids a single 500-line route component accumulating mode-specific logic

---

## Editor Technology Choice

### Recommendation: CodeMirror 6

Use CodeMirror 6 for the Phase 2 editor surface.

### Why CodeMirror

- lighter and calmer than Monaco for this use case
- excellent plain-text and Markdown editing
- built-in extension model for:
  - history
  - search
  - replace
  - keymaps
  - line wrapping
  - minimal syntax highlighting
- easier to theme into SwirlRead's reading aesthetic

### Why not Monaco

- too IDE-flavored for a quick-repair editor
- heavier bundle
- visually pulls the product toward a code workspace

### Why not TipTap / ProseMirror

- wrong abstraction for source-first Markdown edits
- pushes the product toward authoring semantics we explicitly do not want

---

## Save Pipeline

### Happy path

1. User enters edit mode
2. App stores `original`
3. User edits `draft`
4. User saves
5. App re-reads the current file from disk
6. If disk contents still match `original`, write `draft`
7. Re-load current file
8. Re-render markdown
9. Exit edit mode

### Conflict detection

Because the vault is live, another app may have changed the file while SwirlRead was editing.

Minimum viable conflict rule:

- when saving, re-read file contents
- if current disk text !== `original`, mark conflict and stop

Phase 2 does not need a merge tool. A simple blocking conflict message is enough:

- "This file changed outside SwirlRead while you were editing. Review before saving."

Optional follow-up actions:

- `Reload from disk`
- `Copy my draft`
- `Overwrite anyway` (only if explicitly confirmed)

---

## Routing and Navigation Guards

Editing introduces dirty-state navigation problems.

### Required guards

- switching to another file while dirty
- switching vault while dirty
- browser back/forward while dirty
- page refresh / tab close while dirty

### Recommendation

Add one route-level guard in `DocumentPage` driven by `editor-store`:

- if no active dirty edit session, navigation proceeds
- if dirty, prompt before leaving

Do not distribute ad hoc dirty checks across unrelated UI components.

---

## Read/Write Permission Strategy

### Phase 2 web behavior

The app should treat write permission as an escalation, not a default.

Recommended sequence:

1. user opens vault with read access
2. user reads normally
3. user clicks `Edit`
4. editing UI may open immediately from already-loaded source
5. first `Save` requests write permission if needed
6. if denied:
   - keep draft in memory
   - show explicit error
   - remain in edit mode

This makes the product feel like a reader that can occasionally save changes, not a general local IDE demanding broad permissions on first launch.

---

## Persistence Rules

### Draft persistence

Do **not** persist unsaved drafts to IndexedDB in the first implementation.

Rationale:

- keeps privacy and data-model complexity down
- avoids stale draft restore behavior across external edits
- unsaved recovery can be added later if users genuinely need it

### Persisted state that is acceptable

- last edit mode preference: no
- find/replace UI open state: no
- editor presentation preferences like wrap lines: maybe later in `useUIStore`

Phase 2 should keep the draft lifecycle session-local and explicit.

---

## Testing Plan

### Unit tests

- `editor-store` state transitions
- `writeText()` success / permission denied / missing file
- conflict detection on save
- mode switching reducer / orchestration behavior

### Component tests

- `DocumentEditSurface` renders loaded source
- save button disabled while saving
- cancel returns to read mode
- dirty prompt appears on navigation
- `Cmd/Ctrl + S` triggers save

### Integration tests

- read -> edit -> save -> read loop on a real markdown file
- denied write permission leaves draft intact
- external file change blocks save

### Manual verification

Use the real vault fixture to validate:

- mixed Chinese/English text edits
- frontmatter edits
- wikilink edits
- long document save and re-render

---

## Suggested Implementation Order

### Phase 2A — Foundation ✅ Done (commit `ad1b82b`)

1. ✅ Extend `VaultFileSystem` with `writeText` + optional `hasWritePermission` / `requestWritePermission`
2. ✅ Implement `FSAPIVaultAdapter.writeText` (passes `create: false`, revokes cached blob URL on success, maps `NotAllowedError` → `VaultPermissionDeniedError`)
3. ✅ Add write-path tests + `SampleVaultAdapter` rejection with `VaultWriteError`

### Phase 2B — Session state ✅ Done 2026-05-03

4. ✅ `src/stores/editor-store.ts` — `EditorSession` + `enter` / `updateDraft` / `save` / `overwrite` / `reloadFromDisk` / `cancel` / `clearError` / `forgetVault`. Save loop performs stale-on-disk pre-check and lazy write-permission escalation. Errors normalised into a small `EditorError` discriminated union.
5. 🟡 Route-level edit mode switching — **deferred to Phase 2C**. Without a render surface there's nothing to switch to; the wiring lands together with `DocumentReadSurface` / `DocumentEditSurface`.
6. ✅ Dirty guard — `useDirtyNavigationGuard()` mounts a `beforeunload` listener at the AppShell while `useEditorStore.active?.dirty === true`; `confirmLeaveIfDirty()` is the sync gate for in-app nav. React Router 7 `useBlocker` integration deferred to 2C alongside a Radix-styled confirm dialog.

### Phase 2C — UI surface ✅ Done 2026-05-03

7. ✅ `DocumentEditSurface` lives alongside the read surface inside `DocumentBodyView`. When `useEditorStore.active` targets the current `(vaultId, path)`, the rendered article body (`FrontmatterPanel` + prose + `BacklinksPanel`) is replaced by the EditSurface; the document header still owns the title.
8. ✅ CodeMirror 6 integration assembled from per-package primitives (`@codemirror/state`, `view`, `commands`, `language`, `lang-markdown`, `search`) — no umbrella. All CodeMirror modules behind a single `React.lazy` chunk: **181.65 KB gz**. Main bundle increase from the lazy wrapper alone: **+0.29 KB gz**.
9. ✅ Save / Cancel / `⌘S` / `Esc` wired. `⌘F` opens CodeMirror's built-in search panel via the searchKeymap. Save = save + exit per spec. Cancel goes through a dirty-confirm prompt. React Router `useBlocker` is **deferred to 2D** alongside a Radix-styled confirm dialog (currently `window.confirm`).

### Phase 2D — Safety and polish ✅ Done 2026-05-03

10. ✅ Conflict detection (Phase 2B) + stale-on-disk UI (Phase 2C: Reload from disk + Overwrite anyway).
11. ✅ Discriminated `EditorError` banners (permission-denied, file-missing, read-only-vault, write-failed, unknown) with Dismiss action.
12. ✅ Find / replace via CodeMirror's built-in `@codemirror/search` panel (toolbar Find button + ⌘F keymap).
13. ✅ Sync `isReadOnly: boolean` on `VaultFileSystem` — SampleVault is hard-locked and never shows the Edit button. FSAPI returns `false` (write capability potential exists; runtime permission elevation handles the rest).
14. ✅ Radix-styled confirm dialog via the new `dialog-store` + `ConfirmDialog` (lazy mount). `confirmLeaveIfDirty()` is now async; `DocumentEditSurface.handleCancel()` is now async; both go through the same Radix flow.
15. ✅ React Router 7 `useBlocker` integration (`useRouterDirtyBlocker`) — in-app pathname changes prompt before discarding a dirty session.
16. ✅ Editor preferences in `useUIStore`: `editorLineNumbers` / `editorLineWrap` / `editorFontSize`. Persisted via Dexie. Live-applied to CodeMirror via Compartments (no state rebuild → undo history preserved). Settings Panel gains an "Editing" group.

**The lightweight-editing arc (2A → 2D) is feature-complete per the spec at the top of this file.** The original Non-Goals Checklist (file management, WYSIWYG, multi-file, etc.) was honored.

Stop here for the first editing release. Do not expand into file management or rich authoring in the same milestone.

---

## Non-Goals Checklist

If a proposed change requires any of the following, it is probably outside the intended scope:

- turning Markdown into an internal block model
- serializing rich-text state instead of plain files
- editing multiple files at once
- adding document creation workflows from the editor
- embedding media upload flows
- adding sidebar-heavy authoring chrome
- treating SwirlRead as a replacement for Obsidian, VS Code, or Typora

That is the line this plan is meant to protect.
