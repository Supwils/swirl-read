# SwirlRead — Browse Surface Handoff

> Pebble Garden + Workspace · light + dark · single + dual pane

This document is the bridge between the design canvas (`index.html`) and
the implementation. The visuals live in two React artboard files and a
shared token sheet; everything you need to bring this to production is
listed below.

---

## 1 · Scope

Two surfaces are being replaced:

| Surface              | Today                                | Replacement                                                                |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Vault root view      | File tree in a left rail             | **Pebble Garden** — folders as organic pastel tiles, files as mono pills.  |
| Reading shell        | Single-document column + side panels | **Workspace** — file shelf + reading area that flips between 1 & 2 panes. |

The single-document reading view (typography, callouts, wikilinks,
highlights) **stays exactly as the brand spec describes it** — Source
Serif 4, 720px max, 1.7 line-height. The Workspace artboard reproduces
this body verbatim; only the chrome and the multi-pane behaviour are new.

Themes shipped: **Sepia (light, default)** and **Dark**. OLED and Auto
can be added by re-mapping the same tokens; nothing in either artboard
hard-codes a colour.

---

## 2 · Design tokens

All tokens are CSS variables on `.cz.theme-light` / `.cz.theme-dark`
(see `shared/tokens.css`). Surface code only ever reads `var(--…)`;
swapping the class flips every pixel.

### 2.1 Theme tokens

| Token            | Light (Sepia) | Dark      | Use                                  |
| ---------------- | ------------- | --------- | ------------------------------------ |
| `--bg`           | `#f4ecd8`     | `#1c1916` | App background                       |
| `--bg-deep`      | `#ebe1c5`     | `#14110e` | Shelf / status bar background        |
| `--paper`        | `#fbf6e7`     | `#25211b` | Floating surfaces (menus, panels)    |
| `--text`         | `#3a2f24`     | `#e4dbc7` | Body                                 |
| `--text-muted`   | `#6b5942`     | `#a89881` | Secondary body, metadata             |
| `--text-faint`   | `#a8956f`     | `#695e4f` | Status text, hint text               |
| `--accent`       | `#8b6f47`     | `#d4a767` | Active document, links, highlights   |
| `--accent-soft`  | `#b9986a`     | `#b88c4f` | Dotted link underline                |
| `--border`       | `#d4c8a8`     | `#3a3229` | Card / pane separators               |
| `--border-soft`  | `#e3d9bd`     | `#2a2520` | Hair-line dividers                   |
| `--surface`      | `#ede2c5`     | `#221e19` | Callouts, code blocks, chip-strong   |
| `--highlight`    | `rgba(139,111,71,0.18)` | `rgba(212,167,103,0.22)` | `<mark>` background |
| `--shadow`       | `rgba(58,47,36,0.10)` | `rgba(0,0,0,0.35)` | Default drop shadow      |
| `--shadow-deep`  | `rgba(58,47,36,0.18)` | `rgba(0,0,0,0.55)` | Menu / focus shadow      |

### 2.2 Folder palette

Six top-level folders, each gets three tokens. **The folder ID is the
token suffix** — when adding a folder, add a token group, no map needed.

| Folder      | ID          | Light fill / deep / ink                          | Dark fill / deep / ink                           |
| ----------- | ----------- | ------------------------------------------------ | ------------------------------------------------ |
| knowledge   | `knowledge` | `#e6c4a4` / `#c89a72` / `#5e3618`                | `#3e2c1f` / `#6a4a30` / `#d6a576`                |
| career      | `career`    | `#c8d4ab` / `#9bb077` / `#2f4221`                | `#2f3826` / `#506240` / `#b6c992`                |
| reading     | `reading`   | `#b9cfde` / `#88aac4` / `#233e54`                | `#1f2d39` / `#36506a` / `#98bbd4`                |
| ai          | `ai`        | `#d5c1d6` / `#a98caa` / `#3e2540`                | `#2e2236` / `#4e3a5a` / `#cdadcf`                |
| tasks       | `tasks`     | `#ead8a8` / `#cab476` / `#5c441c`                | `#34291a` / `#5a4422` / `#d5b87a`                |
| journal     | `journal`   | `#e4c2b8` / `#c08c80` / `#4e221c`                | `#2d201d` / `#553733` / `#d6a99e`                |

Resolve with `window.CZ_COLOR(id)` or read tokens directly:
`var(--f-${id})`, `var(--f-${id}-deep)`, `var(--f-${id}-ink)`.

For user-created folders without a known ID, deterministically hash the
folder name into one of these six buckets — don't generate new colours
ad hoc.

### 2.3 Typography

| Role                | Family              | Size · weight                                      |
| ------------------- | ------------------- | -------------------------------------------------- |
| Body, reading       | Source Serif 4      | 17–18px · 400, line-height 1.75                    |
| Headings (in doc)   | Source Serif 4      | 38 / 26 / 20 · 500 / 600                           |
| Folder names        | Source Serif 4      | 24 / 30 / 36 · 600 (varies with pebble size)       |
| Folder summaries    | Source Serif 4 it.  | 13.5px · 400                                       |
| UI chrome, chips    | Inter               | 11–12.5px · 500 / 600                              |
| Filenames, paths    | JetBrains Mono      | 10.5–11.5px · 400 / 500                            |
| Code blocks         | JetBrains Mono      | 12.5px · 400, line-height 1.65                     |
| Labels (caps)       | Inter               | 10.5px · 600, letter-spacing 0.16em, UPPERCASE     |

No handwritten / display fonts. The wordmark is Source Serif 600.

---

## 3 · Components

### 3.1 `Pebble({ folder, size, focused, selectedFile })`

A single folder tile.

- Shape: organic rounded rect (pixel-radius, not percentages — keeps
  titles from being clipped by elliptical curves).
- Sizes: `lg` (≥10 files), `md` (4–9), `sm` (≤3). Selected via prop or
  via heuristic from `folder.childCount`.
- `selectedFile` highlights one `FilePill` with a deeper background;
  used to anchor the right-click context menu.
- `focused` underlines the "open" tag in the top-right.

### 3.2 `FilePill({ file, folderId, hovered, selected })`

A file rendered inside a pebble.

- Filename in JetBrains Mono (no `.ext` suffix here — extension lives in
  the adjacent `ExtChip`).
- `ExtChip` colour is the folder's bg + ink; `.html` chips swap to
  `--paper` so HTML reads as "rendered, not source".
- Selected = filled deep bg + 1px ink border + soft drop.

### 3.3 `FileShelf({ activeFileId, expandedFolderId })`

Left-rail navigator inside the Workspace. Three blocks:

1. **Vault summary** — vault name + path (mono).
2. **Recently opened** — top 4 with folder glyph + timestamp.
3. **Folders** — `FolderRow` per folder. One expanded shows files as a
   nested list with a 1px folder-deep left border.
4. **Jump strip** — six tiny pebble bumps, one per folder. Quick switch.

### 3.4 `DocPane({ folder, file, kind, active, theme, single })`

Renders one document.

- Pane head: folder glyph, breadcrumb (`folder/`), filename (mono),
  optional active pill, word-count, pane controls (`⤢` expand, `×` close).
- Top progress sliver (2px) inside the pane, tinted `--accent`.
- Body: `<article>` with `max-width: 720px` in single mode, `100%` in
  dual mode. All prose uses `var(--serif)` at 17/15.5px.
- Renders `<DocBody kind="…" />` — swap in the real Markdown pipeline.

### 3.5 `WorkspaceView({ theme, mode })`

The whole reading surface.

- `mode === "single"` → grid `230px 1fr` (shelf + single pane).
- `mode === "dual"`   → grid `230px 1fr 1fr` (shelf + 2 panes + splitter).
- Mode is the only thing the chrome's `<ModeToggle>` flips. Theme is
  the same idea on `<ThemeToggle>`.

### 3.6 `ContextMenu` (right-click menu)

Order, exactly:

1. Open here `↵`
2. Open in split pane `⌘↵`
3. Open beside `⇧⌘↵`
4. Open in new tab `⌥⌘↵`
5. — divider —
6. Peek preview `Space`
7. Reveal in folder `⌘R`
8. Copy path `⌘C`
9. Copy contents `⇧⌘C`

The first four are the entire reason this redesign exists; keep them
above the fold even if you reorder the rest.

### 3.7 Chrome (`SwirlChrome`)

Left → right:

`Logo · divider · status-dot path · folders · files | tabs… | ⌘K hint · ModeToggle · ThemeToggle`

`tabs` and `right` are slots so screens can vary without re-shipping
the chrome.

---

## 4 · Interactions

### 4.1 From Pebble Garden

| Action                         | Result                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| Click a file pill              | Open in active pane (current behaviour: `openFile`).          |
| `⌘` + click a file pill        | Open in split pane (creates pane if none, focuses it).        |
| Right-click a file pill        | `<ContextMenu>` opens at pointer; closes on outside-click.    |
| Click a pebble header          | Zoom that pebble — others fade out, this one fills the grid.  |
| Drag a pebble onto another     | Open both folders' first files side-by-side.                  |
| Drag a file pill onto a pane   | Replace that pane's content.                                  |
| Drag a file pill into space    | Spawn a new pane to the right.                                |

### 4.2 From Workspace

| Action                     | Result                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| Click a file in shelf      | Open in active pane.                                              |
| `⌘` + click a file in shelf | Open in the other pane (creates if needed → goes dual).           |
| Drag a file from shelf onto a pane | Replace that pane.                                        |
| Drag a file from shelf into the gap between panes | Spawn a new pane.                          |
| Click the splitter         | Active drag — resize panes (40/60 ↔ 60/40 ↔ 50/50 snaps OK).      |
| Click pane `×`             | Close pane. If only 1 left, switch to single mode.                |
| Click pane `⤢`             | Expand pane to single mode (closes others; preserves history).    |
| Toggle ModeToggle = single | Hide non-active pane; keep its document in tab history.           |
| Toggle ModeToggle = dual   | Re-open last secondary doc, or split current 50/50.               |
| Toggle ThemeToggle         | Persist `theme` in `ui-store`; class swap on root.                |

### 4.3 Keyboard shortcuts

| Shortcut             | Action                                |
| -------------------- | ------------------------------------- |
| `⌘K`                 | Command palette                       |
| `⌘\`                 | Split current pane                    |
| `⌘W`                 | Close active pane                     |
| `⌘1` / `⌘2`          | Focus pane 1 / pane 2                 |
| `F`                  | Zen mode (hide chrome + shelf)        |
| `Esc`                | Exit zen / close context menu / blur  |
| `↵` / `⌘↵` / `⇧⌘↵` / `⌥⌘↵` | Mirror context menu                |

Most are already wired; new shortcut work is for `⌘\`, `⌘W`, `⌘1/2`.

---

## 5 · Mapping onto the existing codebase

### 5.1 New / changed files

```
src/ui/landing/
  PebbleGarden.tsx         ← new — replaces FileTree as the vault root view
  Pebble.tsx                ← new — single folder tile
  FilePill.tsx              ← new — single file inside a pebble
  ContextMenu.tsx           ← new — right-click action menu

src/ui/reading-shell/
  Workspace.tsx             ← new — wraps the existing DocumentPage in shelf + panes
  FileShelf.tsx             ← new — replaces FileTree.tsx in the reading view
  DocPane.tsx               ← new — thin wrapper around DocumentPage that adds the
                                pane head + ⤢/× controls

src/styles/
  tokens.css                ← extend with folder palette (--f-<id>, ...-deep, ...-ink)
  themes.css                ← add the dark folder palette overrides

src/stores/
  ui-store.ts               ← add `viewMode: 'single' | 'dual'` and `panes: PaneState[]`
                              persist alongside theme.
```

`AppShell.tsx` switches its main slot:
- `/app/:vaultId` → `<PebbleGarden />` (formerly `<FileTree /> + …`)
- `/app/:vaultId/:filePath` → `<Workspace />`

### 5.2 Stores

```ts
// ui-store.ts
type ViewMode = 'single' | 'dual';
type Theme    = 'sepia' | 'dark' | 'oled' | 'auto';

interface UiState {
  viewMode: ViewMode;
  theme:    Theme;
  shelfVisible: boolean;
}

// new: pane state lives next to tabs
interface PaneState {
  id: string;         // 'pane-1' | 'pane-2'
  tabIds: string[];   // open files in this pane
  activeTabId: string | null;
}
```

Single mode is "the first pane is the only pane." Dual mode mounts two
side-by-side. The current `tabs-store` becomes pane-scoped.

### 5.3 Folder colour resolution

Add a deterministic hash:

```ts
const FOLDER_COLORS = ['knowledge','career','reading','ai','tasks','journal'] as const;
export function folderColorId(folderPath: string) {
  // First check a hard-coded map of known top-level paths…
  if (FOLDER_COLORS.includes(folderPath)) return folderPath;
  // …then fall back to a stable hash mod 6.
  let h = 0;
  for (const c of folderPath) h = (h * 31 + c.charCodeAt(0)) | 0;
  return FOLDER_COLORS[Math.abs(h) % FOLDER_COLORS.length];
}
```

This guarantees the same folder always renders in the same pebble colour
across screens — and never generates a new tint at runtime.

---

## 6 · Implementation order (recommended)

1. **Tokens.** Land `--f-*` tokens + folder color resolver. No UI change yet.
2. **Pebble + FilePill + Grid.** New route `/app/:vaultId/garden` rendering the new browse view in isolation.
3. **Context menu.** Wire to existing `openFile` / `openInSplit` actions. Behind a feature flag.
4. **FileShelf.** Replace `FileTree` in the reading view. Keep the old tree behind a setting for fallback.
5. **Workspace + DocPane + panes-store.** This is the big one — splits the existing tabs-store into pane-scoped tabs.
6. **ModeToggle.** Wire to `ui-store.viewMode`. Persist.
7. **ThemeToggle in chrome.** Promote from settings to a first-class chrome control.
8. **Dark folder palette pass.** Visual review across all six folders.
9. **Flip routes.** Garden becomes default; old `FileTree` removed.

Steps 1–4 are independent and shippable; 5+ is a single PR.

---

## 7 · Open questions

- **Right-click on touch.** Long-press? Or a tap-and-hold reveal? Pebbles
  on iPad need the same menu — pick one and own it.
- **What gets a pebble?** Top-level folder = pebble. Sub-folders are
  reached by zooming into a pebble. Confirm depth handling.
- **Where does ⌘K results land in single mode?** Active pane, presumably.
  In dual mode, the user might expect a quick picker for which pane to
  open into — worth a 1-second hover popover.
- **OLED + Auto themes.** OLED can re-use dark tokens with `--bg: #000`.
  Auto follows `prefers-color-scheme`. Both are token-only changes.
- **Folder hash collisions.** Six colours is fine for vaults with ≤ 12
  top-level folders; past that, plan a second-tier palette or pattern
  variant (dotted / striped pebbles).

---

## 8 · Files in this exploration

```
index.html                    Design canvas host
canvas-root.jsx               Mounts the five artboards
shared/tokens.css             All design tokens (light + dark, folder palette)
shared/data.js                Realistic vault data used across artboards
shared/ui.jsx                 Logo, Chrome, FolderGlyph, ExtChip, ThemeToggle, ModeToggle
artboards/pebble-garden.jsx   Pebble + FilePill + Grid + ContextMenu
artboards/two-up.jsx          Workspace + FileShelf + DocPane + DocBody
```

The artboards are intentionally written so each visual element maps
1:1 to a component above. Lift the JSX, retype it as TSX, and the
visual is preserved.

— end of handoff —
