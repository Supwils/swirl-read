# AGENTS.md — Build Pebble Garden + Workspace

> Read this first. It's a checklist, not a spec.
> The full spec is in `HANDOFF.md`. Don't paraphrase it — open it.

You are implementing two new surfaces in the SwirlRead app:

1. **Pebble Garden** — replaces the file-tree vault root view.
2. **Workspace** — wraps the existing reading shell with a file shelf and
   a single/dual-pane reading area.

The design is locked. Don't re-explore directions, don't propose alternative
layouts, don't change typography or palette. Lift the JSX from the design
artboards, port to TSX, wire to the existing stores.

---

## Read these in order, then start

1. `HANDOFF.md` (this folder)             — full spec, tokens, component anatomy
2. `shared/tokens.css`                    — the exact CSS variables to copy
3. `artboards/pebble-garden.jsx`          — visual source for Pebble + FilePill + ContextMenu
4. `artboards/two-up.jsx`                 — visual source for Workspace + FileShelf + DocPane
5. `shared/ui.jsx`                        — Logo / Chrome / FolderGlyph / ExtChip / Toggles
6. `shared/data.js`                       — shape of the vault data (mock — do NOT ship this)
7. `src/CLAUDE.md` and `docs/develop/architecture-overview.md` — codebase orientation

After step 1, **stop and confirm with the human** that your understanding of
the deliverable matches before writing code. Specifically confirm: file
layout, scope of panes-store refactor, and whether the old `FileTree` stays
behind a setting fallback or is removed in this PR.

---

## Hard rules

- **Do not invent new colors.** Use `--f-<folder-id>` / `-deep` / `-ink` only.
  Unknown folders hash-mod-6 into the existing six. Code in HANDOFF §5.3.
- **Do not introduce new fonts.** Source Serif 4 / Inter / JetBrains Mono.
  No Caveat, Quicksand, Fraunces, Inter for body, etc.
- **Tokens go on `.cz.theme-light` / `.cz.theme-dark`.** Don't inline colors
  in components. A theme switch is one class swap on the app root.
- **Folder ID = color suffix.** Adding a folder = adding a token group.
- **Do not animate pebble shapes.** They're static — feel comes from the
  irregular border-radii, not motion.
- **Right-click menu order is the order in HANDOFF §3.6.** Don't reorder.
- **The single-document reading view (typography, callouts, highlights,
  wikilinks) is unchanged from the brand spec.** Only the chrome around
  it and the multi-pane behavior are new.

---

## Implementation steps

Each step is independently shippable. Open one PR per step unless noted.

### Step 1 — Tokens

- Extend `src/styles/themes.css` with `--f-*` folder tokens for **both**
  light and dark (full table in HANDOFF §2.2).
- Add `--paper`, `--highlight`, `--shadow`, `--shadow-deep` if missing.
- Add a `folderColorId(folderPath)` resolver in `src/core/vault/path.ts`
  or similar. Tested with the six canonical names + a hash fallback.

**Done when:** existing app renders unchanged; tokens resolve correctly.

### Step 2 — Pebble Garden (route: `/app/:vaultId`)

- New files in `src/ui/landing/`:
  - `PebbleGarden.tsx`        — page-level component, owns grid layout
  - `Pebble.tsx`               — single folder tile
  - `FilePill.tsx`             — single file pill
  - `pebble-shapes.ts`         — the six radii constants (copy from artboard)
- Read folders from `useVaultStore`. Resolve each folder's color via
  `folderColorId(folder.path)`.
- Pebble sizing heuristic: `childCount >= 10 → "lg"`, `>= 4 → "md"`, else `"sm"`.
- Grid uses `grid-template-areas` — match the artboard's 4-col × 3-row.
  For vaults with more than 6 top-level folders: paginate at 6, show a
  "More folders →" pebble in the last slot.
- Click a file pill: `openFile(folderPath, fileName)` in active pane.
- ⌘+click: `openInSplit(...)`.

**Done when:** the route renders the user's real vault as pebbles;
clicking a file opens it in the existing reading view.

### Step 3 — ContextMenu

- New file: `src/ui/landing/ContextMenu.tsx`.
- Triggered by `onContextMenu` on `FilePill` (also on file rows in the
  shelf — step 4). Floats at pointer; closes on outside click or Esc.
- Order in HANDOFF §3.6. Wire to:
  - Open here → existing `openFile`
  - Open in split pane → existing or new `openInSplit`
  - Open beside → like split but inserts adjacent to active pane
  - Open in new tab → tabs-store add to active pane
  - Peek preview → existing hover-preview popover, but pinned
  - Reveal in folder → FSAPI directory open
  - Copy path / Copy contents → clipboard

**Done when:** every action above works from both Pebble Garden and the
file shelf (step 4).

### Step 4 — FileShelf

- New file: `src/ui/reading-shell/FileShelf.tsx`.
- Replaces `FileTree.tsx` inside the reading view. Keep `FileTree.tsx`
  exported under a feature flag (`settings.useLegacyTree`) for one
  release, then delete.
- Four sections: vault summary, recents (from existing recent-files
  store), folders (collapsible — only one expanded at a time, persist
  in `ui-store`), and the "Jump" pebble strip (6 folder bumps).

**Done when:** opening any file shows the new shelf; toggling
`useLegacyTree` brings the old tree back.

### Step 5 — Workspace + panes-store

This is the big one. **Open the panes-store design as an RFC issue before
writing code.**

- New files:
  - `src/stores/panes-store.ts`     — see HANDOFF §5.2 for shape
  - `src/ui/reading-shell/Workspace.tsx`
  - `src/ui/reading-shell/DocPane.tsx`
- Migrate `tabs-store.ts` to be pane-scoped. The active tab in pane 1 is
  what's currently the only tab; pane 2 starts empty in single mode.
- Single mode: only pane 1 mounts. Dual mode: both mount with a
  draggable splitter. Splitter snaps to 40/50/60 with a 2% threshold.
- `⌘\` splits (single → dual, opens active doc's last-paired doc, or
  current doc duplicated if none).
- `⌘W` closes active pane (dual → single if only one left).
- `⌘1` / `⌘2` focus pane 1 / 2 (no-op in single mode for ⌘2).
- Scroll positions are per-pane-per-file (reuse existing
  scroll-memory logic, key by `${paneId}/${filePath}`).

**Done when:** opening two files concurrently in side-by-side panes
works; reload restores both panes and scroll positions; the legacy
single-document route still works.

### Step 6 — Mode + Theme toggles in chrome

- Promote theme switching from the settings panel into the chrome's
  segmented control (HANDOFF §3.7). Keep it in settings too.
- New `ModeToggle` in chrome → `ui-store.viewMode`.

### Step 7 — Dark folder palette pass

- Visual review with the design canvas open beside the live app.
- All six folders distinguishable on `--bg-deep`.
- `--accent` link color (`#d4a767`) contrasts on every folder fill.

### Step 8 — Cut over

- Pebble Garden becomes default at `/app/:vaultId`.
- Old FileTree removed if the flag from step 4 has shipped a release.
- Update `docs/design/reading-experience.md` with the new browse surface.

---

## Where each artboard component lands

| Artboard JSX (`shared/ui.jsx` and `artboards/*`) | Production path                            |
| ------------------------------------------------ | ------------------------------------------ |
| `SwirlLogo`                                      | reuse existing `src/ui/components/Logo.tsx` if equivalent |
| `SwirlChrome`                                    | new `src/ui/components/Chrome.tsx`          |
| `ThemeToggle` / `ModeToggle`                     | `src/ui/components/Toggle.tsx`              |
| `FolderGlyph`                                    | `src/ui/components/FolderGlyph.tsx`         |
| `ExtChip`                                        | `src/ui/components/ExtChip.tsx`             |
| `Pebble` + `FilePill` + `pebble-shapes`          | `src/ui/landing/Pebble*.tsx`                |
| `ContextMenu`                                    | `src/ui/landing/ContextMenu.tsx`            |
| `FileShelf` + `FolderRow`                        | `src/ui/reading-shell/FileShelf.tsx`        |
| `WorkspaceView` + `DocPane`                      | `src/ui/reading-shell/Workspace.tsx` + `DocPane.tsx` |
| `DocBody` (mock)                                 | **do not port** — production uses the existing Markdown pipeline. |

---

## How to verify each step

- **Step 1**: `pnpm check` passes. CSS smoke: `var(--f-knowledge)` resolves
  to `#e6c4a4` in light, `#3e2c1f` in dark.
- **Step 2**: Visual diff against `index.html` → focus "C · Pebble Garden
  — Light". The two should be pixel-similar in structure (not exact —
  font metrics differ across browsers).
- **Step 3**: Right-click any file pill → menu opens at pointer; every
  action triggers the expected store mutation.
- **Step 4**: Open any document → shelf renders; active file highlights;
  recent files shown. `useLegacyTree=true` restores old tree.
- **Step 5**: Open two files via ⌘+click → dual mode auto-engages. ⌘W
  closes one → single mode. Refresh → both panes restore.
- **Step 6**: ThemeToggle in chrome flips light↔dark in <100ms. ModeToggle
  flips single↔dual.
- **Step 7**: All six folder pebbles distinguishable in dark mode; AA
  contrast for filename text on every folder fill.

---

## Open questions to resolve with the human

These are in HANDOFF §7 too — listed here so you don't miss them.

1. **Touch right-click.** Long-press? Two-finger tap? Pick one and own it.
2. **Sub-folder navigation.** Pebbles are top-level only. How does the
   user reach `knowledge/frontend/react`? Zoom-into-pebble? Breadcrumb?
3. **⌘K in dual mode.** Results land in active pane. Need a "split"
   modifier in the palette to open into the other pane?
4. **OLED + Auto themes.** Token-only changes from the existing themes,
   but who owns rolling them out?

---

## Done criteria for the whole project

- [ ] `/app/:vaultId` renders Pebble Garden with the user's real vault
- [ ] Right-click menu works from Pebble Garden and from the file shelf
- [ ] Workspace supports both single and dual panes, toggleable
- [ ] Theme is one CSS class swap; both light and dark look correct
- [ ] No new fonts, colors, or layout primitives beyond what's in tokens.css
- [ ] `pnpm check` clean. All existing tests pass. New tests cover:
      - panes-store transitions
      - folderColorId hash stability
      - ContextMenu actions
- [ ] `docs/design/reading-experience.md` updated to describe Pebble
      Garden + Workspace instead of file-tree-based browse.

— end of AGENTS.md —
