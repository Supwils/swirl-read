# SwilRead — Phase 1 Implementation Plan

> Status: Ready to execute · Last updated: 2026-05-01

This document is the **ordered task list** for delivering SwilRead v0.1 (Phase 1 MVP). Each task is self-contained and designed to be executable by an AI coding agent in one session.

## How to Use This Plan

- Tasks are grouped into **milestones** (M0 through M9)
- Within a milestone, tasks are listed in dependency order
- Each task has: **ID**, **goal**, **deliverables**, **acceptance criteria**, **dependencies**
- Mark tasks complete as you go
- Test against the user's real vault at `/Users/supwils/supwilsoft/supwil/` whenever applicable

---

## Milestone 0: Project Bootstrap

Goal: A working dev environment with our chosen stack. Renders "Hello SwilRead" in the brand style.

### M0.1 — Initialize Vite + React + TypeScript project ✅ Done 2026-05-01

**Deliverables**:

- `package.json` with name `swil-read`, version `0.0.1`, license MIT
- `vite.config.ts` with `@/` path alias to `src/`
- `tsconfig.json` with strict mode, `noUncheckedIndexedAccess`, ESNext target
- Empty `src/main.tsx` and `src/App.tsx` rendering "SwilRead"
- `.gitignore`, `.editorconfig`, `.nvmrc` (Node 22+)

**Acceptance**:

- ✅ `pnpm install` succeeds (71 packages, 16.9s)
- ✅ `pnpm typecheck` passes with 0 errors
- ✅ `pnpm build` produces valid bundle (60.72 KB gzipped, 370ms)

**Dependencies**: none

**Notes**: Used project references (`tsconfig.app.json` + `tsconfig.node.json`) for clean type boundaries between app and build config. See `work-log.md` for details.

---

### M0.2 — Set up Tailwind CSS v4 with brand tokens ✅ Done 2026-05-01

**Deliverables**:

- ✅ Tailwind v4 (4.2.4) + `@tailwindcss/vite` plugin installed
- ✅ `src/styles/globals.css` with brand colors registered in `@theme` + semantic tokens for 4 themes (sepia/light/dark/oled) + auto theme via media query
- ✅ All 4 theme classes (`.theme-sepia`, `.theme-light`, `.theme-dark`, `.theme-oled`) functional
- ✅ `App.tsx` renders wordmark + tagline + sub-tagline in Sepia theme

**Acceptance**:

- ✅ Brand tokens accessible as Tailwind utilities (`text-brand-gold` etc) and semantic tokens via `var(--color-text)`
- ✅ Wordmark renders centered, font-serif, large, in brand sepia palette
- ✅ Dev server confirms theme class on body; CSS contains all 4 theme variable sets

**Dependencies**: M0.1

**Notes**: Two-layer token system — brand constants in `@theme`, semantic theme tokens in plain CSS overridden by `.theme-*` classes. See work log for architecture details.

---

### M0.3 — Install ESLint, Prettier, Vitest ✅ Done 2026-05-01

**Deliverables**:

- ✅ `eslint.config.js` (ESLint 9 flat config) with `typescript-eslint` type-checked rules, react-hooks, react-refresh
- ✅ `.prettierrc.json` + `.prettierignore`
- ✅ `vitest.config.ts` (separate from vite.config) with jsdom + Testing Library setup
- ✅ `src/setup-tests.ts` for `@testing-library/jest-dom` matchers
- ✅ `src/App.test.tsx` — initial smoke tests (3 tests, wordmark + taglines)
- ✅ Real `pnpm lint`, `pnpm format`, `pnpm test`, plus unified `pnpm check` pipeline

**Acceptance**:

- ✅ `pnpm typecheck` → 0 errors
- ✅ `pnpm lint` → 0 errors, 0 warnings (with `--max-warnings 0`)
- ✅ `pnpm test` → 3/3 tests passing
- ✅ `pnpm check` → all 4 stages pass

**Dependencies**: M0.1

**Notes**: Type-aware ESLint rules catch deeper issues (no-unsafe-assignment, no-floating-promises). `pnpm check` is the gate before any commit. See work log for tooling decisions.

---

### M0.4 — Set up routing (React Router v7)

**Deliverables**:

- Routes:
  - `/` → `LandingPage` placeholder
  - `/app` → `AppShell` placeholder
  - `/app/:vaultId` → `VaultHome` placeholder
  - `/app/:vaultId/*` → `DocumentPage` placeholder
- Each placeholder renders its name and the URL params
- `src/app/router.tsx` defines the route tree

**Acceptance**:

- All routes navigable; correct component renders for each

**Dependencies**: M0.1

---

### M0.5 — Install fonts (Source Serif 4, Inter, JetBrains Mono)

**Deliverables**:

- Self-hosted woff2 files in `public/fonts/`
- `@font-face` declarations in `globals.css`
- Font CSS variables: `--font-serif`, `--font-sans`, `--font-mono`
- Tailwind theme extends to use these

**Acceptance**:

- Page text renders in Source Serif 4 by default
- No FOUC (font swap is invisible due to preload)

**Dependencies**: M0.2

**Note**: For Chinese characters, fall back to system fonts in M0.5; ship 思源宋体 in a later task (M9.x).

---

## Milestone 1: First Real Render

Goal: Open a folder via FSAPI, list .md files, render one as styled HTML. The "we're really doing this" moment.

### M1.1 — Define `VaultFileSystem` interface

**File**: `src/core/vault/types.ts`

**Deliverables**:

- Types `VaultFile`, `VaultDirectory`, `VaultEntry`
- Interface `VaultFileSystem` exactly as specified in `architecture-overview.md`
- Type tests (compile-time only)

**Acceptance**: Interface compiles; ready for adapters to implement

**Dependencies**: M0.1

---

### M1.2 — Implement `FSAPIVaultAdapter`

**File**: `src/core/vault/fsapi-adapter.ts`

**Deliverables**:

- Class `FSAPIVaultAdapter` implementing `VaultFileSystem`
- Uses `window.showDirectoryPicker()` and `FileSystemDirectoryHandle`
- Persists handle to IndexedDB for re-opening
- `walk()` lazily yields files (don't materialize a full list)
- `readText()` and `readBinary()` work as specified
- `getBlobURL()` creates and caches blob URLs

**Acceptance**:

- Can pick `/Users/supwils/supwilsoft/supwil/` and walk it
- `readText('index.md')` returns the file contents

**Dependencies**: M1.1

---

### M1.3 — Build folder picker UI with consent panel

**File**: `src/ui/landing/FolderPicker.tsx`

**Deliverables**:

- Inline panel design as specified in `ftue-and-vault-model.md`
- Heading: "Open your vault"
- Body: "Choose any folder containing your Markdown files. SwilRead reads them directly from your device. Nothing is uploaded."
- "Choose folder" button triggers FSAPI dialog
- "Cancel" closes the panel

**Acceptance**:

- Visually matches brand (Sepia, serif, calm)
- Clicking "Choose folder" → user picks → vault registered

**Dependencies**: M1.2

---

### M1.4 — Set up `useVaultStore` (Zustand)

**File**: `src/stores/vault-store.ts`

**Deliverables**:

- Store with `registeredVaults`, `activeVaultId`, `activeVaultFs`
- `registerVault(fs)` adds to list, sets active
- `switchVault(id)` changes active vault
- Persistence via Dexie

**Acceptance**:

- Picking a folder registers a vault and routes to `/app/:vaultId`

**Dependencies**: M1.2, M1.3

---

### M1.5 — Build the markdown rendering pipeline (basic)

**File**: `src/core/render/pipeline.ts`

**Deliverables**:

- `renderMarkdown(source: string): React.ReactNode` function
- Uses unified pipeline: remark-parse → remark-gfm → remark-rehype → rehype-react
- Returns React tree, not HTML string

**Acceptance**:

- Parsing a simple `# Hello\n\nWorld` produces correct React elements
- Tables, task lists, strikethrough work (GFM)

**Dependencies**: M0.1

---

### M1.6 — Build `DocumentPage` to render a real file

**File**: `src/ui/reading-shell/DocumentPage.tsx`

**Deliverables**:

- Reads file path from URL params
- Calls `activeVaultFs.readText(path)`
- Pipes through `renderMarkdown`
- Renders inside a centered container (max-width 720px, centered, sepia background)

**Acceptance**:

- Navigate to `/app/:vaultId/knowledge/软件/前端/react.md` (or similar real file)
- See the rendered Markdown in Sepia theme
- Long content scrolls smoothly

**Dependencies**: M1.4, M1.5

**This is the "Milestone 1 done" check**: Wilson can see his own knowledge note rendered beautifully.

---

## Milestone 2: Reading Shell & Themes

Goal: The immersive single-column experience with all 5 themes.

### M2.1 — `ReadingShell` layout component

**File**: `src/ui/reading-shell/ReadingShell.tsx`

**Deliverables**:

- Centered content column (configurable width: 640/720/880)
- Generous vertical padding
- Top progress bar (2px, theme accent color, tracks scroll)
- Smooth scroll behavior
- Hover zones (left edge, right edge, top) — actual panels in later tasks

**Acceptance**:

- Document renders centered with proper margins
- Progress bar updates smoothly as user scrolls

**Dependencies**: M1.6

---

### M2.2 — Theme system (5 themes via CSS vars)

**Files**:

- `src/themes/sepia.css`
- `src/themes/light.css`
- `src/themes/dark.css`
- `src/themes/oled.css`
- `src/themes/index.ts`

**Deliverables**:

- Each theme defines: `--color-bg`, `--color-text`, `--color-accent`, `--color-muted`, `--color-code-bg`, `--color-callout-*`, etc.
- Theme applied via class on `<html>` (`theme-sepia`, etc.)
- Auto theme: `prefers-color-scheme` media query

**Acceptance**:

- All 5 themes look distinct and beautiful
- Switching themes is instant, no flash

**Dependencies**: M0.2

---

### M2.3 — `useUIStore` with theme/typography settings

**File**: `src/stores/ui-store.ts`

**Deliverables**:

- Store with theme, fontFamily, fontSize, lineHeight, contentWidth, zenMode
- Persists to IndexedDB
- Selectors for each field

**Acceptance**:

- Changing values in store reflects in UI immediately
- Settings persist across reloads

**Dependencies**: M2.2

---

### M2.4 — Settings panel UI

**File**: `src/ui/settings-panel/SettingsPanel.tsx`

**Deliverables**:

- Slide-in panel from right (Radix Dialog)
- Theme selector (5 options + Auto)
- Font family (Serif / Sans / System)
- Font size slider (14–22px)
- Line height slider (1.4–2.0)
- Content width (Narrow / Medium / Wide)
- "Reset to defaults" button

**Acceptance**:

- All controls work; changes are reflected immediately and persisted
- Panel is itself styled in current theme

**Dependencies**: M2.3

---

### M2.5 — Hover-summoned UI zones

**File**: `src/ui/reading-shell/HoverZones.tsx`

**Deliverables**:

- Three invisible 50px hover zones (left, right, top edges)
- On hover: slide in (file tree placeholder / TOC placeholder / toolbar placeholder)
- Auto-hide after 2s of no mouse movement in panel
- Esc to dismiss any open panel

**Acceptance**:

- Mouse enters left edge → file tree slides in (even if tree is empty)
- Mouse leaves panel → auto-hides after 2s
- Esc dismisses panel

**Dependencies**: M2.1

---

### M2.6 — F key zen mode

**File**: `src/ui/reading-shell/ZenMode.tsx` (or as part of `ReadingShell`)

**Deliverables**:

- Pressing `F` toggles `zenMode` in `useUIStore`
- In zen mode: progress bar fades, all UI chrome gone
- Press `F` or `Esc` to exit

**Acceptance**:

- F → everything except text disappears
- F again → returns to normal

**Dependencies**: M2.3

---

### M2.7 — Scroll position memory

**File**: `src/stores/reader-store.ts` (extend)

**Deliverables**:

- Per-file scroll position stored in `useReaderStore`
- Persists to IndexedDB on debounced scroll
- Restored when user opens the file again

**Acceptance**:

- Scroll halfway through a file, navigate away, come back → scroll position restored

**Dependencies**: M1.6

---

## Milestone 3: Markdown Completeness

Goal: Render every Markdown feature in the spec correctly.

### M3.1 — GFM extensions polish

**Deliverables**:

- Tables: scrollable inside container, alternating row tint
- Task lists: rendered with theme-tuned checkbox style
- Strikethrough: distinct visual style
- Footnotes: rendered with backref links

**Acceptance**: All GFM features render and look polished

**Dependencies**: M1.5

---

### M3.2 — Custom remark plugin: wikilinks

**File**: `src/core/render/plugins/remark-wikilink.ts`

**Deliverables**:

- Parses `[[page]]`, `[[page|alias]]`, `[[page#heading]]`, `[[page^block-id]]`
- Adds custom mdast node `wikilink` with `target`, `alias`, `heading`, `blockId`
- Compatible with `rehype-react` via custom node-to-element mapping

**Acceptance**:

- All four wikilink forms parse correctly
- Resolved into a `<WikilinkRef>` React component (M3.3)

**Dependencies**: M1.5

---

### M3.3 — Wikilink resolution and rendering

**Files**:

- `src/core/navigation/wikilink-resolver.ts`
- `src/ui/reading-shell/WikilinkRef.tsx`

**Deliverables**:

- Resolver: given a vault and a wikilink target, find the actual file path
- Component: renders as a styled link; clicks navigate to the resolved file
- Unresolved links: subtle "broken" indicator, still render the text

**Acceptance**:

- `[[career/me/me]]` in a file resolves to `career/me/me.md` and navigates correctly
- `[[nonexistent]]` shows broken indicator

**Dependencies**: M3.2

---

### M3.4 — Wikilink hover preview

**File**: `src/ui/reading-shell/WikilinkPreview.tsx`

**Deliverables**:

- 400ms-delayed popover (Floating UI) on wikilink hover
- Shows first 200 chars of target file
- Cancellable if mouse leaves before delay completes

**Acceptance**:

- Hovering shows preview after delay
- Preview is themed and readable

**Dependencies**: M3.3

---

### M3.5 — Custom remark plugin: callouts

**File**: `src/core/render/plugins/remark-callout.ts`

**Deliverables**:

- Parses `> [!note]`, `> [!warning]`, etc.
- All Obsidian callout types supported
- Custom mdast `callout` node with `type` and `title`

**Acceptance**: All callout types render with correct color and icon (per spec)

**Dependencies**: M1.5

---

### M3.6 — Callout rendering component

**File**: `src/ui/reading-shell/Callout.tsx`

**Deliverables**:

- Theme-tuned colored container
- Icon (Lucide) per callout type
- Title + content
- Custom callout types fall back to generic style

**Acceptance**: Visually distinct, matches spec

**Dependencies**: M3.5

---

### M3.7 — Custom remark plugin: embeds (`![[file]]`)

**File**: `src/core/render/plugins/remark-embed.ts`

**Deliverables**:

- Parses `![[file]]` and `![[image.png]]`
- Custom mdast `embed` node

**Acceptance**: Parsed correctly

**Dependencies**: M1.5

---

### M3.8 — Embed rendering

**File**: `src/ui/reading-shell/EmbedNode.tsx`

**Deliverables**:

- Markdown file embed: render the target file inline (recursive, with cycle detection)
- Image embed: native `<img>` with vault blob URL
- Video / audio embed: native players
- Other types: card with file metadata

**Acceptance**:

- `![[some-file.md]]` renders the content inline
- `![[image.png]]` displays the image
- Cycles (A embeds B embeds A) detected and stopped

**Dependencies**: M3.7

---

### M3.9 — Custom remark plugin: highlights (`==text==`)

**File**: `src/core/render/plugins/remark-highlight.ts`

**Deliverables**:

- Parses `==highlighted==` syntax
- Custom mdast `highlight` node

**Acceptance**: `==text==` renders with theme-tuned background highlight

**Dependencies**: M1.5

---

### M3.10 — Frontmatter handling

**Deliverables**:

- `remark-frontmatter` extracts YAML/TOML frontmatter
- Frontmatter rendered as a subtle metadata bar at top of document (or hidden by default; user setting)
- Title from frontmatter overrides H1 if present

**Acceptance**: Files with frontmatter render correctly without showing the YAML as text

**Dependencies**: M1.5

---

### M3.11 — Math rendering (KaTeX)

**Deliverables**:

- `remark-math` + `rehype-katex` integrated
- Inline math (`$x^2$`) and display math (`$$...$$`) both work
- KaTeX CSS lazy-loaded
- KaTeX font fallback works

**Acceptance**: Math renders in all themes

**Dependencies**: M1.5

---

### M3.12 — Code block highlighting (Shiki)

**File**: `src/core/render/shiki.ts`

**Deliverables**:

- Shiki integrated as a rehype plugin
- Theme-aware: light/dark variants matching SwilRead theme
- Filename annotation: ` ```ts filename="app.ts"` shown as chip
- Copy button (appears on hover, top-right)
- Line highlight syntax `{1,3-5}`
- Curated 14 languages bundled; lazy-load others

**Acceptance**:

- Code looks "professional" (VS Code-quality)
- Copy button works
- Filename chip displays correctly

**Dependencies**: M1.5

---

### M3.13 — Mermaid diagrams

**Deliverables**:

- Lazy-imported Mermaid renderer
- Renders inside a themed container
- Theme-aware (light/dark variants)
- Falls back to source code display if rendering fails

**Acceptance**: A `​```mermaid` block renders the diagram

**Dependencies**: M1.5

---

### M3.14 — Tags and clickable tag listings

**Deliverables**:

- `#tag/nested` syntax in body text rendered as clickable
- Click opens a "Files with tag #foo" panel

**Acceptance**: Tags clickable; filter panel works

**Dependencies**: M1.5

---

## Milestone 4: Navigation

Goal: User can move through the vault efficiently.

### M4.1 — Vault home detection

**File**: `src/core/navigation/section-detector.ts`

**Deliverables**:

- Function to find vault home: `index.md` → `README.md` → `home.md` → auto-generated
- Auto-generated: a basic file tree TOC component

**Acceptance**:

- Opening Wilson's `supwil/` vault routes to `index.md`
- Opening a vault without those files shows auto-generated home

**Dependencies**: M1.6

---

### M4.2 — Section detection

**File**: `src/core/navigation/section-detector.ts` (extend)

**Deliverables**:

- Identify top-level directories as sections
- Detect section homes (`*-map.md` or `index.md` or `README.md` per directory)
- Section metadata (name, icon if from frontmatter, home path)

**Acceptance**: Wilson's vault correctly identifies `career/`, `knowledge/`, `tasks/`, `ai/` as sections with their respective `*-map.md` homes

**Dependencies**: M4.1

---

### M4.3 — File tree component

**File**: `src/ui/file-tree/FileTree.tsx`

**Deliverables**:

- Hierarchical tree grouped by sections
- Lazy-loaded: only loads directory contents on expand
- Active file highlighted
- Click navigates
- Shows in left hover panel from M2.5
- Pin button (uses M2.3 `fileTreePinned`)

**Acceptance**: Tree shows accurate vault structure; navigation works

**Dependencies**: M4.2, M2.5

---

### M4.4 — Backlinks calculation

**File**: `src/core/navigation/backlinks.ts`

**Deliverables**:

- Async backlinks index: for each file, list files that link to it
- Built incrementally as files are read
- Stored in memory + cached to IndexedDB for next session

**Acceptance**: Given a file, return the list of files that contain `[[that file]]`

**Dependencies**: M3.3

---

### M4.5 — Backlinks panel UI

**File**: `src/ui/reading-shell/BacklinksPanel.tsx`

**Deliverables**:

- Shown at the bottom of each document (or as side panel toggle)
- Lists files that link to current file with surrounding context (~50 chars)
- Click to navigate

**Acceptance**: Open a file with known backlinks, see them at bottom; navigation works

**Dependencies**: M4.4

---

### M4.6 — Table of contents

**File**: `src/ui/reading-shell/TOC.tsx`

**Deliverables**:

- Right-side panel listing all H1-H4 in current document
- Active section highlights as user scrolls (Intersection Observer)
- Click to scroll to heading

**Acceptance**: TOC accurate; scroll-tracking works

**Dependencies**: M2.5

---

### M4.7 — Recent files list

**File**: `src/stores/reader-store.ts` (extend)

**Deliverables**:

- Track recently opened files (last 20 per vault)
- Persist to IndexedDB
- Exposed for command palette

**Acceptance**: Opening files updates recent list; persists across reloads

**Dependencies**: M1.6

---

## Milestone 5: ⌘K Command Palette

Goal: A unified command palette as the primary navigation surface.

### M5.1 — Command palette UI shell (cmdk)

**File**: `src/ui/command-palette/CommandPalette.tsx`

**Deliverables**:

- Triggered by `⌘K` / `Ctrl+K`
- Centered modal, semi-transparent backdrop
- Focus trapped; Esc closes
- Empty input shows recent files + bookmarks

**Acceptance**: ⌘K opens palette; arrow keys + Enter navigate

**Dependencies**: M4.7

---

### M5.2 — File name fuzzy search mode

**Deliverables**:

- Default mode: fuzzy match on file paths
- Uses `cmdk`'s built-in scoring or a custom scorer
- Shows file path and section name

**Acceptance**: Typing "react" shows `knowledge/软件/前端/react.md`

**Dependencies**: M5.1

---

### M5.3 — Set up search index Web Worker

**Files**:

- `src/workers/search-worker.ts`
- `src/core/search/search-client.ts`

**Deliverables**:

- Worker builds MiniSearch index from vault file contents
- Uses `Intl.Segmenter` for Chinese-aware tokenization
- Client API: `search(query)`, `rebuild()`
- Index built incrementally; cached to IndexedDB

**Acceptance**: Building index for Wilson's vault completes in < 5 seconds; querying returns results

**Dependencies**: M1.2

---

### M5.4 — Full-text search mode

**Deliverables**:

- `>` prefix triggers full-text search
- Results show snippet with match highlighted
- Click navigates to file (and ideally to the matching position)

**Acceptance**: `> 索引` returns relevant pages from Wilson's knowledge notes

**Dependencies**: M5.3

---

### M5.5 — Multi-mode prefix routing

**Deliverables**:

- `>` = full-text search
- `[[` = wikilink-style file picker (with previews)
- (Later: `?` for AI, but skip in Phase 1)
- Clear visual mode indicator

**Acceptance**: Prefix changes search mode; UI reflects mode

**Dependencies**: M5.2, M5.4

---

## Milestone 6: Multi-Vault & Returning User

Goal: Handle multiple vaults and returning users smoothly.

### M6.1 — Vault switcher UI

**File**: `src/ui/components/VaultSwitcher.tsx`

**Deliverables**:

- Top-left dropdown showing active vault
- Click expands list of all registered vaults
- "Open new vault" option triggers folder picker
- "Manage vaults" opens a settings panel

**Acceptance**: User can switch between registered vaults

**Dependencies**: M1.4

---

### M6.2 — Per-vault state isolation

**Deliverables**:

- `useReaderStore` keyed by vault ID (recent, scroll positions per-vault)
- `useUIStore` allows per-vault overrides (theme, content width)

**Acceptance**: Switching vaults preserves per-vault state

**Dependencies**: M6.1

---

### M6.3 — Returning user auto-restore

**File**: `src/app/auto-restore.ts`

**Deliverables**:

- On app load: check for registered vaults
- If FSAPI handle is still valid: restore permission silently
- If permission was revoked: prompt user to re-authorize
- Single vault: auto-load
- Multi vault: show vault picker

**Acceptance**: User reopens swilread.app → previous vault auto-loads, scroll position restored

**Dependencies**: M6.2

---

### M6.4 — Vault registration UI in landing page

**File**: `src/ui/landing/LandingPage.tsx` (extend)

**Deliverables**:

- If returning user has registered vaults: show recent vaults list + "Open new" button
- If new user: show "Try sample vault" + "Open my vault"

**Acceptance**: Landing page adapts to user state

**Dependencies**: M6.3

---

## Milestone 7: Beyond Markdown — Universal File Reader

Goal: Render non-MD files beautifully too.

### M7.1 — File type dispatcher

**File**: `src/core/render/dispatcher.ts`

**Deliverables**:

- Function `getRenderer(filePath): RendererType` based on extension
- Registry of renderer types

**Acceptance**: Returns correct type for `.md`, `.txt`, `.csv`, `.json`, `.png`, `.py`, etc.

**Dependencies**: M1.6

---

### M7.2 — Plain text renderer

**File**: `src/ui/reading-shell/renderers/PlainTextRenderer.tsx`

**Deliverables**: Monospace pre-formatted, preserves line breaks, theme-aware

**Acceptance**: `.txt` and `.log` render correctly

**Dependencies**: M7.1

---

### M7.3 — CSV/TSV table renderer

**File**: `src/ui/reading-shell/renderers/CsvRenderer.tsx`

**Deliverables**:

- Parse CSV with Papa Parse (or hand-rolled)
- Render as styled table
- Truncate at 1000 rows with "load more"

**Acceptance**: CSV file renders as readable table

**Dependencies**: M7.1

---

### M7.4 — JSON / YAML / TOML renderer

**File**: `src/ui/reading-shell/renderers/StructuredDataRenderer.tsx`

**Deliverables**:

- Syntax-highlighted via Shiki
- Optional collapsible tree view (toggle button)

**Acceptance**: JSON file shows highlighted; tree view works

**Dependencies**: M3.12, M7.1

---

### M7.5 — HTML sandboxed renderer

**File**: `src/ui/reading-shell/renderers/HtmlRenderer.tsx`

**Deliverables**:

- Sandboxed `<iframe>` with strict `sandbox` attribute
- Inject theme CSS variables
- Strip scripts via DOMPurify before iframe content

**Acceptance**: HTML files render safely

**Dependencies**: M7.1

---

### M7.6 — Image / video / audio viewer

**File**: `src/ui/reading-shell/renderers/MediaRenderer.tsx`

**Deliverables**:

- Image: centered, max-width content column, click to lightbox
- Video: native `<video>` with theme controls
- Audio: native `<audio>` with theme styling

**Acceptance**: Common media formats display correctly

**Dependencies**: M7.1

---

### M7.7 — Source code renderer

**File**: `src/ui/reading-shell/renderers/CodeFileRenderer.tsx`

**Deliverables**:

- Treats source code files like a single Shiki block
- Same UX as code blocks (filename, copy, theme)
- Reads file extension to pick language grammar

**Acceptance**: A `.py` file looks as polished as a Python code block

**Dependencies**: M3.12, M7.1

---

### M7.8 — Unsupported format card

**File**: `src/ui/reading-shell/renderers/UnsupportedRenderer.tsx`

**Deliverables**: Card showing file name, size, modified date, "Open in default app" button

**Acceptance**: Random binary file shows the card without errors

**Dependencies**: M7.1

---

## Milestone 8: Landing Page & Sample Vault

Goal: Beautiful landing experience and a curated sample vault.

### M8.1 — Sample vault content (write 10-15 markdown files)

**Files**: `public/sample-vault/*.md`

**Deliverables**:

- All files from the spec in `brand-and-positioning.md` ("Reading in the Age of AI" theme)
- Each file demonstrates specific features (callouts, math, code, wikilinks)
- High-quality writing (not lorem ipsum)

**Acceptance**: Reading the sample vault is itself enjoyable

**Dependencies**: none (content task)

---

### M8.2 — Sample vault adapter

**File**: `src/core/vault/sample-adapter.ts`

**Deliverables**:

- `SampleVaultAdapter` implements `VaultFileSystem`
- Backed by an in-memory map of file paths → contents
- Bundled or lazy-fetched

**Acceptance**: "Try sample vault" button loads it instantly

**Dependencies**: M1.1, M8.1

---

### M8.3 — Landing page hero

**File**: `src/ui/landing/Hero.tsx`

**Deliverables**:

- Wordmark "SwilRead"
- Tagline: "Read your knowledge. Beautifully."
- Sub: "A reading sanctuary for the AI era."
- Two CTAs: "Try with sample vault" / "Open my vault"
- Large product screenshot below

**Acceptance**: Visually matches spec; CTAs work

**Dependencies**: M8.2, M1.3

---

### M8.4 — Landing page features section

**File**: `src/ui/landing/Features.tsx`

**Deliverables**:

- Below the fold: short feature list
- Each feature: icon + 1-line title + 1-2 line description
- No marketing fluff

**Acceptance**: Clean, restrained design

**Dependencies**: M8.3

---

### M8.5 — Contextual hints system

**File**: `src/ui/components/HintTooltip.tsx`

**Deliverables**:

- Component that shows a one-shot tooltip
- Tracked in IndexedDB (`hintsSeen` table)
- Settings option to "Reset hints"

**Acceptance**: Hint appears once per user; doesn't reappear

**Dependencies**: M2.3

---

## Milestone 9: Polish & Ship

### M9.1 — Performance pass

**Deliverables**:

- Profile reading the largest file in Wilson's vault (e.g., `知识/算法/算法模板.md`)
- If render > 500ms: virtualize using `@tanstack/react-virtual`
- Web worker for search index rebuild

**Acceptance**: All files in vault render in < 500ms (initial render)

**Dependencies**: all rendering tasks

---

### M9.2 — Mobile responsive

**Deliverables**:

- Layout adapts to viewports < 768px
- File tree becomes bottom sheet
- TOC becomes floating button
- Settings becomes full-screen modal
- Touch gestures for navigation

**Acceptance**: SwilRead is usable on iPad and iPhone (Chrome/Safari)

**Dependencies**: all UI tasks

---

### M9.3 — Chinese font support (思源宋体)

**Deliverables**:

- Self-host 思源宋体 SC and TC subsets
- Add to font stack
- Verify mixed Chinese/English documents render beautifully

**Acceptance**: Wilson's Chinese knowledge notes render with proper Chinese typography

**Dependencies**: M0.5

---

### M9.4 — Keyboard shortcuts and hints

**Deliverables**:

- `?` shows keyboard shortcuts overlay
- All major actions have shortcuts (⌘K, F, ⌘B, Esc, ⌘[/], etc.)
- First-time hints for the most important shortcuts

**Acceptance**: Power users can navigate without mouse

**Dependencies**: M5.1, M2.6, M4.3

---

### M9.5 — Error boundaries and graceful degradation

**Deliverables**:

- React error boundary at app and document level
- Failed file render shows "Couldn't render this file" with raw text fallback
- FSAPI permission revoked → prompt to re-authorize, don't crash

**Acceptance**: App never shows a white screen

**Dependencies**: all UI tasks

---

### M9.6 — README, LICENSE, CONTRIBUTING

**Files**:

- `README.md` — project overview, screenshots, getting started
- `LICENSE` — MIT
- `CONTRIBUTING.md` — how to contribute
- `CODE_OF_CONDUCT.md` — standard CC

**Acceptance**: Repository looks like a serious open source project

**Dependencies**: project ready to ship

---

### M9.7 — CI / build pipeline

**Files**:

- `.github/workflows/ci.yml` — lint, type-check, test, build on PR
- `.github/workflows/deploy.yml` — deploy to Vercel on main push

**Acceptance**: CI green; main branch auto-deploys to swilread.app

**Dependencies**: project bootstrapped on GitHub

---

### M9.8 — Public launch

**Deliverables**:

- Domain live (`swilread.app`)
- HN Show HN post drafted
- Twitter/X announcement drafted
- Repo public

**Acceptance**: Real users can use it

**Dependencies**: everything above

---

## Cross-Cutting: Don't Forget

- **Type safety**: every PR must pass `tsc --noEmit`
- **Test the user's vault**: most tasks should be manually verified against `/Users/supwils/supwilsoft/supwil/`
- **Theme parity**: every visual element must look correct in Sepia, Light, Dark, OLED
- **Bundle size**: monitor with each PR; budget in `tech-stack.md`
- **No regressions**: `pnpm test` must pass before merging

---

## Summary of First Milestone (What "Done" Means for M1)

The user can:

1. Open `swilread.app`
2. Click "Open my vault"
3. Pick `/Users/supwils/supwilsoft/supwil/`
4. Navigate to a knowledge note like `knowledge/软件/前端/react.md`
5. See it rendered in beautiful Sepia theme with serif typography

When that works end-to-end, M1 is done. Then we have something to show, even if it's only basic.
