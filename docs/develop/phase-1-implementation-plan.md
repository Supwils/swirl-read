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

### M0.4 — Set up routing (React Router v7) ✅ Done 2026-05-01

**Deliverables**:

- ✅ React Router 7.14.2 installed
- ✅ Routes:
  - `/` → `LandingPage` placeholder
  - `/app` → `AppShell` (with `NoVaultSelected` index)
  - `/app/:vaultId` → `VaultHome` placeholder
  - `/app/:vaultId/*` → `DocumentPage` placeholder (splat captures file path)
- ✅ `src/app/router.tsx` defines the route tree using `createBrowserRouter`
- ✅ Per-component tests + full route-tree test (8/8 passing)

**Acceptance**:

- ✅ All routes navigable; correct component renders for each
- ✅ Test coverage for landing + each route in tree

**Dependencies**: M0.1

**Notes**: Vitest upgraded to v3 to resolve vite 5/7 type conflict. `NoVaultSelected` extracted to its own file for fast-refresh compliance. See work log for details.

---

### M0.5 — Install fonts (Source Serif 4, Inter, JetBrains Mono) ✅ Done 2026-05-01

**Deliverables**:

- ✅ `@fontsource` packages installed (used over manual `public/fonts/` for npm-managed self-hosting)
- ✅ `@font-face` declarations imported via @fontsource CSS
- ✅ Font CSS variables `--font-serif`, `--font-sans`, `--font-mono` registered in `@theme` (M0.2)
- ✅ Latin subsets only; CJK uses system fallback

**Acceptance**:

- ✅ Page text renders in Source Serif 4 by default (fallback Georgia briefly visible during font load)
- ⚠️ Brief FOUT acceptable; preload optimization deferred to M9 if needed
- ✅ Dev server serves woff2 files with HTTP 200
- ✅ `pnpm build` bundles 6 woff2 (~131 KB total, loaded async)

**Dependencies**: M0.2

**Note**: 思源宋体 (Chinese serif) deferred to M9.3 per plan; UI chrome is English-only, vault content uses system Chinese fonts as fallback.

---

## Milestone 1: First Real Render

Goal: Open a folder via FSAPI, list .md files, render one as styled HTML. The "we're really doing this" moment.

### M1.1 — Define `VaultFileSystem` interface ✅ Done 2026-05-01

**Files**: `src/core/vault/types.ts`, `src/core/vault/path.ts`, `src/core/vault/index.ts`

**Deliverables**:

- ✅ Types `VaultId`, `VaultPath`, `VaultFile`, `VaultDirectory`, `VaultEntry`, `VaultMeta`
- ✅ Interface `VaultFileSystem` with `id`, `name`, `list`, `walk`, `stat`, `readText`, `readBinary`, `getBlobURL`, `hasPermission`, `requestPermission`
- ✅ Typed error hierarchy: `VaultError`, `VaultPermissionDeniedError`, `VaultFileNotFoundError`, `VaultReadError`
- ✅ Path utilities `path.ts`: `normalizePath`, `joinPath`, `dirname`, `basename`, `extname`, `splitPath`, `isMarkdown`, `isImage`, `isWithin`
- ✅ 34 unit tests for path utilities (every edge case)
- ✅ Barrel export `index.ts`

**Acceptance**:

- ✅ Interface compiles; ready for adapters to implement
- ✅ Path utilities have full test coverage (42/42 tests passing)

**Dependencies**: M0.1

**Notes**: Added beyond original spec — `stat()` method, typed error classes, path utilities, and `VaultMeta` for persistence. These are all foundational and would have been added in subsequent tasks anyway. Better to land them together so M1.2 can use them.

---

### M1.2 — Implement `FSAPIVaultAdapter` ✅ Done 2026-05-01

**Files**:

- `src/core/vault/fsapi-adapter.ts` — main adapter
- `src/core/vault/fsapi-types.ts` — type augmentation for `showDirectoryPicker` / permission API
- `src/core/vault/id.ts` — vault ID generator (slugify + base36 suffix)
- `src/core/vault/handle-storage.ts` — idb-keyval-backed handle persistence
- `src/core/vault/__test-helpers__/mock-fs.ts` — in-memory FSAPI mock for tests
- `src/core/vault/{id,fsapi-adapter}.test.ts` — 32 new tests

**Deliverables**:

- ✅ `FSAPIVaultAdapter` class implementing `VaultFileSystem`
- ✅ `static pick()` for interactive picker; `static fromHandle()` for restore
- ✅ `walk()` lazily yields files via async generator (no full-list materialization)
- ✅ `readText` / `readBinary` / `stat` / `list` / `getBlobURL` / permission API
- ✅ Persistence via idb-keyval (`saveHandle` / `loadHandle` / `deleteHandle` / `listHandleIds`) — separate from adapter so the orchestration store (M1.4) owns the lifecycle
- ✅ Typed error mapping (FSAPI `DOMException` → `VaultFileNotFoundError` etc)

**Acceptance**:

- ✅ Unit-tested with 21 adapter tests + 11 id tests against an in-memory mock that implements the FSAPI surface
- ⏸️ Real-browser E2E pending UI in M1.3 (`/Users/supwils/supwilsoft/supwil/` walkthrough is the manual check)

**Dependencies**: M1.1

**Notes**: TypeScript narrowing on `handle.kind` doesn't work because lib.dom doesn't redeclare `kind` on subtype interfaces; worked around with an explicit cast in `walkRecursive`. `DOM.AsyncIterable` added to tsconfig.app.json `lib`.

---

### M1.3 — Build folder picker UI with consent panel ✅ Done 2026-05-01

**Files**:

- `src/ui/landing/FolderPicker.tsx` — accessible consent panel
- `src/ui/landing/FolderPicker.test.tsx` — 8 tests
- `src/core/vault/registry.ts` — session-only adapter registry (M1.4 will replace with Zustand)
- `src/core/vault/registry.test.ts` — 6 tests
- Updated `LandingPage.tsx` (CTA structure) and `VaultHome.tsx` (real vault preview)

**Deliverables**:

- ✅ Inline consent panel with brand styling (Sepia surface, serif typography, soft shadow)
- ✅ Privacy-first messaging: "SwilRead reads them directly from your device. Nothing is uploaded."
- ✅ "Choose folder" → `FSAPIVaultAdapter.pick()` → register → persist handle → navigate
- ✅ "Cancel" + Esc both dismiss; AbortError silently returns to idle; other errors surface inline
- ✅ FSAPI feature detection (button disabled with friendly message on unsupported browsers)
- ✅ VaultHome renders real top-level directory listing from the picked vault

**Acceptance**:

- ✅ Visually matches brand (Sepia, serif, calm)
- ✅ Clicking "Choose folder" → user picks → adapter registered, route changes to `/app/:vaultId`
- ✅ Manual browser E2E checklist documented in work-log (against `supwil/` fixture)

**Dependencies**: M1.2

**Notes**: Registry is intentionally a session-only stop-gap. M1.4 replaces it with a Zustand store + Dexie persistence — same surface so call sites don't churn.

---

### M1.4 — Set up `useVaultStore` (Zustand) ✅ Done 2026-05-01

**Files**:

- `src/stores/vault-store.ts` — Zustand store with `init`, `registerVault`, `switchVault`, `removeVault`, `attachAdapter`
- `src/stores/vault-store.test.ts` — 11 tests
- `src/core/persistence/db.ts` — Dexie schema (`vaults`, `preferences`); `StoredVault`↔`VaultMeta` conversion
- `src/main.tsx` — fires `init()` on boot
- `src/setup-tests.ts` — `fake-indexeddb/auto` for tests

**Files deleted**: `src/core/vault/registry.ts` and its test (replaced by store)

**Deliverables**:

- ✅ Store with `registeredVaults: VaultMeta[]`, `activeVaultId: VaultId | null`, `ready: boolean`
- ✅ `registerVault(fs)` persists meta, caches adapter in module-level Map, sets active
- ✅ `switchVault(id)` changes active and bumps `lastOpenedAt`
- ✅ `removeVault(id)` removes from Dexie + adapters Map; clears active if needed
- ✅ Persistence via Dexie (vaults table + preferences for active id)
- ✅ Test parity uses real production store (no shadow store) + fake-indexeddb for real IDB semantics

**Acceptance**:

- ✅ Picking a folder registers a vault and routes to `/app/:vaultId`
- ✅ Page reload preserves the registered vault list (verified in test by clearing in-memory state and re-`init()`)
- ⏸️ Adapter restoration on returning users requires permission re-grant — deferred to M6.3 (foundation laid via `attachAdapter()`)

**Dependencies**: M1.2, M1.3

**Notes**: Adapters live in a module-level Map outside Zustand (large non-serializable objects). `__resetDbForTests` clears tables rather than re-creating the Dexie instance. Bundle grew +34 KB gzipped (Dexie + Zustand) — buys persistence + multi-vault foundation.

---

### M1.5 — Build the markdown rendering pipeline (basic) ✅ Done 2026-05-01

**Files**: `src/core/render/pipeline.ts`, `src/core/render/pipeline.test.tsx`

**Deliverables**:

- ✅ `renderMarkdown(source, components?) → ReactNode` — synchronous pipeline producing a React tree
- ✅ `createMarkdownProcessor()` for tests / future composition
- ✅ Pipeline: remark-parse → remark-frontmatter → remark-gfm → remark-rehype → rehype-sanitize → hast-util-to-jsx-runtime
- ✅ Sanitization with extended schema (heading `id` allowed for future TOC anchoring)

**Acceptance**:

- ✅ CommonMark fully covered (headings, paragraphs, emphasis, lists, code, blockquotes, links, hr, Unicode)
- ✅ GFM (tables, task lists with interactive checkboxes, strikethrough, autolinks)
- ✅ Frontmatter (YAML and TOML) stripped from output, no leakage as text
- ✅ XSS sanitization (raw `<script>` removed)
- ✅ 22 tests passing

**Dependencies**: M0.1

**Notes**: Used `hast-util-to-jsx-runtime` directly (smaller than `rehype-react`). Ships a `components` parameter for callers to override specific HTML tags later.

---

### M1.6 — Build `DocumentPage` to render a real file ✅ Done 2026-05-01

**Files**: `src/ui/reading-shell/DocumentPage.tsx`, `src/ui/reading-shell/DocumentPage.test.tsx`, prose styles in `src/styles/globals.css`

**Deliverables**:

- ✅ Reads file path from URL params (vaultId + splat)
- ✅ Calls `vault.readText(path)` via `getAdapter(vaultId)` from store
- ✅ Pipes Markdown through `renderMarkdown`; non-MD falls through to a styled `<pre>`
- ✅ Renders inside a centered 720 px column with `.swilread-prose` typography
- ✅ Six explicit render states: idle / loading / rendered / missing-vault / missing-file / error
- ✅ Complete prose styles (headings, lists, blockquotes, code blocks, tables, links, hr, images, task list checkboxes) — all theme-aware via CSS variables

**Acceptance**:

- ✅ `/app/:vaultId/knowledge/软件/前端/react.md` renders the Markdown in Sepia theme
- ✅ Long content scrolls (browser-native; no virtualization yet — M9.1)
- ✅ Six tests covering all render states

**Dependencies**: M1.4, M1.5

**This was the "Milestone 1 done" check** — Wilson can pick his vault and see his own knowledge notes rendered beautifully. Confirmed via dev-server HMR cycle and integration tests.

**Note**: No clickable navigation between files yet — that's M3.3 (wikilink resolution) + M4.3 (file tree).

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

### M2.3 — `useUIStore` with theme/typography settings ✅ Done 2026-05-01

**Files**: `src/stores/ui-store.ts` + `.test.ts`, `src/app/use-apply-ui-prefs.ts`, `src/ui/components/ThemeSwitcher.tsx`

**Deliverables**:

- ✅ Store with `theme`, `fontFamily`, `fontSize`, `lineHeight`, `contentWidth`, `zenMode`, `ready`
- ✅ Persists to Dexie `preferences` table (zenMode session-scoped by design)
- ✅ Defensive pref reads with type-guards + numeric clamping at both load and write
- ✅ `useApplyUIPrefs` hook — syncs body class + CSS vars on `<html>`
- ✅ `<ThemeSwitcher />` mounted in AppShell header
- ✅ `resetToDefaults` action
- ✅ 13 tests including invalid-value fallback and clamping behavior

**Acceptance**:

- ✅ Changing theme in dropdown reflects instantly across body bg, prose, code, callouts
- ✅ Settings persist across reloads
- ✅ Typography CSS vars on `<html>` consumed by `.swilread-prose` and DocumentPage container

**Dependencies**: M2.2

**Notes**: Auto theme renders correctly via `@media (prefers-color-scheme)` at first paint; live OS-level switch listening can be added in M9.x. Settings panel UI (sliders for font size etc.) is M2.4.

---

### M2.4 — Settings panel UI ✅ Done 2026-05-01

**File**: `src/ui/settings-panel/SettingsPanel.tsx`

**Deliverables**:

- ✅ Slide-in panel from right using Radix Dialog (`@radix-ui/react-dialog`)
- ✅ Header settings trigger with Lucide icon in `AppShell`
- ✅ Theme selector (Sepia / Light / Dark / OLED / Auto)
- ✅ Font family segmented control (Serif / Sans / System)
- ✅ Font size slider (14–22px)
- ✅ Line height slider (1.4–2.0)
- ✅ Content width segmented control (Narrow / Medium / Wide)
- ✅ File tree visibility toggle included because M4.3 made it a persisted shell preference
- ✅ "Reset to defaults" button

**Acceptance**:

- ✅ All controls update `useUIStore` immediately and reuse the existing persisted setters
- ✅ `useApplyUIPrefs()` reflects theme and typography changes into DOM classes / CSS variables
- ✅ Panel is styled entirely from current semantic theme tokens
- ✅ Tests cover open/close, theme persistence, typography CSS vars, content width, file tree toggle, reset

**Dependencies**: M2.3

**Notes**: The old minimal header `ThemeSwitcher` remains in the codebase for now but is no longer mounted by `AppShell`; settings is now the primary preference surface.

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

### M2.6 — F key zen mode ✅ Done 2026-05-01

**File**: `src/app/use-zen-mode-hotkey.ts` + `src/styles/globals.css` (zen rules) + body-class effect already in `use-apply-ui-prefs.ts`

**Deliverables**:

- ✅ Global F-key binding via `useZenModeHotkey()` mounted in `AppShell`. Refuses to fire when modifier keys are held (so `⌘F` / `Ctrl+F` browser-find still works) and inside text-entry surfaces (input/textarea/select/contenteditable)
- ✅ Esc exits zen mode (only when zen is active — otherwise lets other Esc handlers receive the event)
- ✅ Body class `zen-mode` applied via the existing `useApplyUIPrefs` effect (already wired in M2.3); the F-key hook just flips `useUIStore.zenMode`
- ✅ Chrome-hiding CSS targets dedicated classes (`swilread-shell__header`, `swilread-vault-layout__sidebar`, `swilread-vault-layout__toc`) instead of fragile DOM-position selectors — survives layout refactors
- ✅ Reading content stays centered because the layout's `__content` flex grows to fill the freed space; the article's `max-width: var(--reader-content-width)` keeps the column measure intact
- ✅ Callout headers and frontmatter titles stay visible — they're reading content, not chrome
- ✅ `zenMode` remains session-scoped (not persisted) so a stuck zen state never survives a reload — same shape as M5.1's `commandPaletteOpen`

**Acceptance**:

- ✅ F → header + file tree + TOC vanish; only the article remains
- ✅ F again → everything returns
- ✅ Esc exits when zen
- ✅ Cmd+F / Ctrl+F NOT hijacked (preserves browser find-in-page)
- ✅ 8 hotkey tests cover toggle, Esc-exit (only-when-zen), modifier-immunity, editable-target guard, contenteditable, unmount cleanup

**Dependencies**: M2.3 (✅ — store hooks + body-class effect were already in place)

---

### M2.7 — Scroll position memory ✅ Done 2026-05-01

**File**: `src/stores/reader-store.ts` (extended) + `src/ui/reading-shell/use-scroll-memory.ts` (new)

**Deliverables**:

- ✅ Per-file `scrollY` stored on `useReaderStore` (`scrollByVault[vaultId][path]`) and persisted in a new Dexie `scrollPositions` table (schema v4)
- ✅ Save on `window.scroll` debounced to 250 ms; navigation to another doc cancels any pending write
- ✅ Restore via two stacked `requestAnimationFrame` calls once the document transitions to `rendered` (waits for layout / Shiki paint)
- ✅ Force scroll to top on every navigation so the previous doc's offset never flashes during loading
- ✅ Capped at 500 positions per vault, oldest pruned (keeps IDB bounded)
- ✅ Returning to scrollY 0 deletes the row — no row that says "remember 0"
- ✅ Negative / non-finite values clamped to 0 defensively

**Acceptance**:

- ✅ Scroll halfway, navigate away, come back → restored
- ✅ Switch between vaults — positions stay isolated
- ✅ 8 unit tests cover persistence, prune, dedupe-to-zero, vault isolation, clamping, normalization

**Dependencies**: M1.6

---

## Milestone 3: Markdown Completeness

Goal: Render every Markdown feature in the spec correctly.

### M3.1 — GFM extensions polish ✅ Done 2026-05-01

**File**: `src/styles/globals.css` (GFM rules) + `src/core/render/pipeline.test.tsx` (integration tests)

**Deliverables**:

- ✅ Tables: `display:block` + `overflow-x:auto` so wide tables scroll inside the prose column without breaking the measure; alternating-row tint via `tr:nth-child(even)`; alignment-aware via inline `style="text-align"` (the modern HTML-spec form remark-rehype emits)
- ✅ Task lists: drop the bullet on `.contains-task-list`, flex-align the checkbox baseline with the body text, accent-colored checkbox via `accent-color: var(--color-accent)`
- ✅ Strikethrough: muted color + thin underline so scanning catches it without competing with live content
- ✅ Footnotes: `section.footnotes` styled as a smaller-typed end-of-doc block with top border; the GFM `<h2 class="sr-only">` heading is preserved as screen-reader-only via the canonical sr-only clip pattern; footnote items get `:target` highlight when navigated to via `#user-content-fn-X`; backref `↩` links styled as muted dashed-underline that hover-pops to the link color

**Acceptance**:

- ✅ All GFM features render and look polished
- ✅ +3 integration tests confirm the pipeline emits `section.footnotes` w/ `data-footnote-backref`, `ul.contains-task-list`, and inline-style alignment

---

### M3.2 — Custom remark plugin: wikilinks ✅ Done 2026-05-01

**File**: `src/core/render/plugins/remark-wikilink.ts` + `.test.ts`

**Deliverables**:

- ✅ Parses all six forms: `[[page]]`, `[[page|alias]]`, `[[page#heading]]`, `[[page#heading|alias]]`, `[[page^block]]`, `[[page^block|alias]]`
- ✅ Custom mdast node `wikilink` with `target`, `alias`, `heading`, `blockId`
- ✅ `data.hName` + `data.hProperties` + `data.hChildren` so hast emits a `<wikilink>` element with `data-*` attributes
- ✅ Pipeline integration: extended sanitize schema allows the new tag and attrs

**Acceptance**:

- ✅ All six wikilink forms parse correctly (16 tests)
- ✅ Resolved into a `Wikilink` React component via `components` map (M3.3)

**Dependencies**: M1.5

**Notes**: Visit-based implementation rather than full micromark extension. Documented limitation: wikilinks nested inside emphasis may not split. ~95% coverage at a fraction of implementation cost.

---

### M3.3 — Wikilink resolution and rendering ✅ Done 2026-05-01

**Files**:

- `src/core/navigation/wikilink-resolver.ts` + `.test.ts`
- `src/ui/reading-shell/Wikilink.tsx`
- `src/ui/reading-shell/wikilink-context.ts`
- DocumentPage integration

**Deliverables**:

- ✅ `buildWikilinkIndex(vault) → WikilinkIndex` (basename → paths map; built once per vault load)
- ✅ `resolveWikilink(target, index, currentPath?) → VaultPath | null` (exact path / target.md / basename / stem)
- ✅ `Wikilink` component with three states: resolved (React Router `<Link>`), pending (during index build), broken (unresolved target)
- ✅ Heading + block-id flow into URL hash (M4.6 will scroll-anchor)

**Acceptance**:

- ✅ `[[career/me/me]]` resolves and navigates correctly
- ✅ `[[nonexistent]]` shows broken state with tooltip
- ✅ Three visual states styled in `.swilread-prose` for all four themes
- ✅ End-to-end: clicking wikilinks in Wilson's vault navigates between notes

**Dependencies**: M3.2

**Notes**: Index lives in component state (rebuilds on vault switch). Cross-vault index caching is M3.x polish. Heading/block-id scroll behavior depends on M4.6 TOC anchors.

---

### M3.4 — Wikilink hover preview ✅ Done 2026-05-01

**Files**:

- `src/ui/reading-shell/WikilinkPreview.tsx` — popover trigger + body
- `src/core/render/preview-snippet.ts` + `.test.ts` — pure plain-text snippetizer (frontmatter/heading/code-fence stripping, wikilink/embed flattening, word-boundary truncation)
- `src/ui/reading-shell/Wikilink.tsx` — resolved branch now delegates to `WikilinkPreview`
- `src/styles/globals.css` — `.swilread-wikilink-preview*` rules using semantic tokens (themed for all four palettes)

**Deliverables**:

- ✅ Floating UI: `useFloating` + `useHover({ delay: 400, handleClose: safePolygon() })` + `useDismiss` + `useRole('tooltip')`; `flip()` + `shift()` middleware so the popover never falls off-screen
- ✅ `<FloatingPortal>` mount so the popover escapes any `overflow:hidden` ancestor (callouts, embed cards)
- ✅ Cancel-safe fetch: file content is requested only when the popover decides to open; an in-flight read is dropped if the popover closes before it resolves
- ✅ Snippet shaping: strips YAML/TOML frontmatter, drops fenced code + HTML comments + leading H1 (usually the title), collapses `[[wikilinks]]`/`![[embeds]]`/markdown links to their visible text, removes emphasis markers, collapses whitespace, truncates at ~220 chars on a word boundary with an ellipsis
- ✅ 15 unit tests for the snippetizer (frontmatter, code, headings, wikilinks/embeds, emphasis, links, truncation, Unicode, empty-document, frontmatter-only)

**Acceptance**:

- ✅ Hovering a resolved wikilink shows the preview after 400 ms; moving away within the delay cancels (no flicker, no fetch)
- ✅ Preview reads cleanly in Sepia / Light / Dark / OLED via existing semantic tokens
- ✅ Cursor can travel from the link to the popover without it closing (safePolygon grace)
- ✅ Broken/pending wikilinks remain unwrapped (no popover) — only resolved links get the preview

**Dependencies**: M3.3

**Notes**: Bundle grew to **242 KB gzipped** (+17 KB for `@floating-ui/react`). Still inside the 250 KB budget, but the next dependency add will hit it; M9.1 perf pass should consider lazy-importing `WikilinkPreview` so the popover machinery only ships once the user actually hovers.

---

### M3.5 — Custom remark plugin: callouts ✅ Done 2026-05-01

**File**: `src/core/render/plugins/remark-callout.ts` + `.test.ts`

**Deliverables**:

- ✅ Parses `> [!note]`, `> [!warning]`, etc. (14 canonical types + 12 aliases)
- ✅ Optional inline title (`> [!warning] Heads up`) supported
- ✅ Custom mdast `callout` node with `calloutType`, `title`, body children
- ✅ Foldable markers (`+`/`-`) parsed but not yet rendered as collapsible (polish)
- ✅ Pipeline integration: extended sanitize schema allows `<callout>` + data attrs
- ✅ 14 tests covering all types, aliases, body extraction, hast hints, edge cases

**Acceptance**:

- ✅ All standard Obsidian types parse correctly
- ✅ Render with correct color and icon (M3.6)

**Dependencies**: M1.5

---

### M3.6 — Callout rendering component ✅ Done 2026-05-01

**File**: `src/ui/reading-shell/Callout.tsx`

**Deliverables**:

- ✅ Theme-tuned colored container with left accent rule + tinted background via `color-mix()`
- ✅ Lucide icon per callout type (14 icons, individually imported for tree-shaking)
- ✅ Title (default per type, override via inline title)
- ✅ 26 type/alias mappings; unknown types fall back to `note` style
- ✅ Type-specific accent colors via `--callout-color` CSS variable

**Acceptance**:

- ✅ Visually distinct across all 14 canonical types
- ✅ Adapts to all four themes via CSS variables
- ✅ Renders body content (lists, code blocks, wikilinks) correctly nested

**Dependencies**: M3.5

**Notes**: Lucide adds ~10 KB pre-gzip, mostly recovered after tree-shaking. The renamed `customComponents` map in DocumentPage now carries both `wikilink` and `callout` mappings; future custom mdast types add to the same map.

---

### M3.7 — Custom remark plugin: embeds (`![[file]]`) ✅ Done 2026-05-01

**File**: `src/core/render/plugins/remark-embed.ts` + `.test.ts`

**Deliverables**:

- ✅ Parses all forms: `![[file]]`, `![[file|display]]`, `![[file|400x300]]`, `![[note.md#heading]]`, `![[note^block]]`
- ✅ Custom mdast `embed` node with `target`, `display`, `heading`, `blockId`, `kind`
- ✅ Pre-classifies kind from extension: `image` / `video` / `audio` / `markdown` / `pdf` / `other`
- ✅ Hast hint emits `<vault-embed>` (custom element name; avoids HTML5 `<embed>` conflict)
- ✅ Pass-2 lift: a paragraph whose only child is an embed is promoted to a top-level block — keeps `<aside>` markdown-embeds out of `<p>` wrappers
- ✅ Sanitize schema extended for `<vault-embed>` + its data attrs
- ✅ 21 tests covering classification, parser, plugin, lift pass, and the embed↔wikilink ordering invariant

**Acceptance**:

- ✅ All target forms parse correctly; classification matches expectations
- ✅ Solitary embeds become block-level; inline embeds stay inline
- ✅ Runs before `remark-wikilink` so `![[x]]` is consumed before wikilink can match the inner `[[x]]`

**Dependencies**: M1.5

---

### M3.8 — Embed rendering ✅ Done 2026-05-01

**Files**:

- `src/ui/reading-shell/EmbedNode.tsx` — kind-dispatched renderer
- `src/ui/reading-shell/embed-context.ts` — depth stack + components map for nested renders
- DocumentPage integration (custom components map + EmbedContext provider)
- Embed CSS under `.swilread-embed*` (theme-aware)
- Test-only `URL.createObjectURL` shim in `setup-tests.ts` (jsdom limitation)

**Deliverables**:

- ✅ Image embed → `<img>` from `vault.getBlobURL()`, `loading="lazy"`, with optional `width`/`height` from `400` or `400x300` syntax (alt text otherwise)
- ✅ Video embed → native `<video controls>` from blob URL
- ✅ Audio embed → native `<audio controls>` from blob URL
- ✅ Markdown embed → recursive `renderMarkdown` of the target file inside an `<aside>` panel, with the same custom-components map (so embedded files render wikilinks/callouts/embeds in turn)
- ✅ Cycle detection via `EmbedContext.stack` — when a deeper embed encounters a path already in the stack, it short-circuits to a "circular embed prevented" notice
- ✅ Hard depth cap (`MAX_EMBED_DEPTH = 3`) protects against pathological vaults
- ✅ Broken/pending/unsupported states styled per theme; PDF + other extensions render a metadata card
- ✅ Inner `WikilinkContext.currentPath` rebound to the embedded path so wikilinks inside an embed resolve relative to that file

**Acceptance**:

- ✅ `![[logo.png]]` renders an `<img>` with a `blob:` src (covered by integration test)
- ✅ `![[snippet.md]]` renders the embedded markdown inline (verified by test on a host/snippet pair)
- ✅ Self-embedding loop (`loop.md` containing `![[loop.md]]`) renders the cycle notice instead of recursing (verified)
- ✅ Unresolved targets show a "couldn't find" notice without crashing the page

**Dependencies**: M3.7

---

### M3.9 — Custom remark plugin: highlights (`==text==`) ✅ Done 2026-05-01

**Files**: `src/core/render/plugins/remark-highlight.ts` + `.test.ts`

**Deliverables**:

- ✅ Visit-based plugin splits text nodes on `==…==` lazily; multiple highlights in a paragraph stay separate
- ✅ Custom mdast `highlight` node carries the inner text and emits a real `<mark>` element via hast hint
- ✅ Sanitize schema extended for `<mark>` (not in the GitHub default allow list)
- ✅ `\S(...)\S` content anchor rejects `x == 5`-style comparisons (whitespace at either end)
- ✅ Theme-tuned `.swilread-prose mark` styling: amber tint on light themes, deeper amber on Dark/OLED, with `box-decoration-break: clone` for clean wraps
- ✅ 11 plugin tests (basic, multiple, lazy, surrounding text, hast hints, Unicode, no-newline, empty, comparison guard, head/tail of paragraph) + 3 pipeline integration tests

**Acceptance**: ✅ `==text==` renders with a theme-tuned highlight in all four themes; survives the sanitize pass.

**Dependencies**: M1.5

---

### M3.10 — Frontmatter handling ✅ Done 2026-05-01

**Files**:

- `src/core/render/frontmatter.ts` — extractor + minimal YAML/TOML parser + `selectMetadata()` curator
- `src/core/render/frontmatter.test.ts` — 25 tests
- `src/ui/reading-shell/Frontmatter.tsx` — metadata / raw / hidden display modes
- `src/ui/reading-shell/Frontmatter.test.tsx` — 5 tests
- `src/stores/ui-store.ts` — `frontmatterDisplay` pref ('metadata' | 'raw' | 'hidden') with persistence + defensive validation
- `src/ui/reading-shell/DocumentPage.tsx` — extracts frontmatter once per file load, renders the panel above the prose
- `src/ui/settings-panel/SettingsPanel.tsx` — segmented "Frontmatter" control
- `src/styles/globals.css` — `.swilread-frontmatter*` styles for the metadata bar and the raw definition list

**Deliverables**:

- ✅ Pipeline already strips YAML/TOML frontmatter via `remark-frontmatter` (no rendered text leakage). M3.10 added a separate, sync extractor for the UI surface.
- ✅ Frontmatter rendered as a subtle metadata bar above the prose body (default `metadata` mode). Title (large), description (subtitle), date · author · tags muted line.
- ✅ User-controlled display: `metadata` (curated bar, default) · `raw` (every key/value as a `<dl>`) · `hidden` (no panel). Persists to Dexie, restores on reload.
- ✅ Tiny purpose-built YAML parser (~2 KB to bundle) handles top-level scalars, quoted strings, booleans, null, numbers, inline arrays, block arrays, comments. TOML support handles flat top-level keys and inline arrays.
- ✅ Falls back to leaving values as plain strings for anything unparseable (e.g. multi-line scalars) — those still appear in the raw view.

**Acceptance**:

- ✅ Files with YAML/TOML frontmatter render the metadata bar and never leak raw key/value text
- ✅ Frontmatter title surfaces as a prominent serif heading; body H1 is left untouched (additive, not replacement — matches Obsidian behavior)
- ✅ `hidden` mode suppresses the entire panel without affecting body rendering
- ✅ `raw` mode lists every parsed key/value, including ones the metadata view omits

**Dependencies**: M1.5

**Notes**:

- We deliberately did NOT ship `js-yaml` or `gray-matter` (~28 KB gzip combined) because the bundle is at the 250 KB ceiling. The hand-rolled parser covers ~95% of vault frontmatter; complex documents (nested objects, multi-line scalars) still display in raw view as flat strings, which is acceptable for a reader.
- Bundle grew to 249.51 KB gzip (up from 247.37 KB). This effectively saturates the budget; M3.13 Mermaid must be fully lazy-loaded, with zero impact on the main bundle.
- Title-overrides-H1 was implemented as additive: the frontmatter title becomes a prominent header above the prose, while the body H1 is preserved as the user's content. This avoids modifying the rendered HAST and matches Obsidian/typical-reader behavior.

---

### M3.11 — Math rendering (KaTeX) ✅ Done 2026-05-01

**Files**:

- `src/core/render/plugins/remark-math-shim.ts` + `.test.ts` — converts `remark-math` mdast nodes into custom `<math-inline>` / `<math-block>` hast hints
- `src/ui/reading-shell/katex-loader.ts` — module-level cached dynamic import of `katex` w/ test injection seam
- `src/ui/reading-shell/MathRenderer.tsx` — actual KaTeX render; injects `dangerouslySetInnerHTML` (KaTeX output is intentionally bypassed by our sanitize pass for performance)
- `src/ui/reading-shell/MathBlock.tsx` + `.test.tsx` — thin lazy wrappers (Mermaid pattern) that dynamic-import `MathRenderer` so KaTeX runtime ships in its own chunk

**Deliverables**:

- ✅ `$inline$` and `$$block$$` math syntax via `remark-math` integrated into the pipeline before `remark-rehype`
- ✅ Custom hast elements (`<math-inline data-source>` / `<math-block data-source>`) sanitize-permitted; KaTeX runtime never loads on pages without math
- ✅ Lazy chunk split: `MathRenderer-*.js` (~0.7 KB gz) + `katex-*.js` (~77 KB gz) — both pulled only on first math node mount
- ✅ KaTeX glyph CSS imported eagerly (~8 KB gz) to avoid flash-of-unstyled-math when the runtime resolves
- ✅ Loading placeholder while runtime resolves; safe `<code>` fallback to raw source on parse error or loader failure (never lose content)
- ✅ Test injection seam (`__setKatexLoaderForTests`) so jsdom doesn't pull in the real KaTeX runtime
- ✅ +5 plugin tests + +5 wrapper tests + +3 pipeline integration tests

**Why a shim instead of `rehype-katex`**: bundles KaTeX eagerly into the main pipeline chunk (~280 KB minified — 12× our remaining budget). The Mermaid pattern keeps the runtime in its own chunk and out of the eager bundle.

**Dependencies**: M1.5 (✅)

_(Detailed deliverables moved to the M3.11 entry above — this stub left to preserve milestone numbering.)_

---

### M3.12 — Code block highlighting (Shiki) ✅ Core done 2026-05-01

**Files**: `src/core/render/pipeline.ts` (extended), `src/styles/globals.css`, test updates

**Deliverables**:

- ✅ `@shikijs/rehype` integrated; `renderMarkdown` is now async
- ✅ Dual-theme via CSS variables (light: github-light, dark: vitesse-dark)
- ✅ Theme-aware via active `.theme-*` class — instant switch, no re-highlight
- ✅ Curated 27-language bundle (TS/JS/Py/Rust/Go/Java/C++/etc.); other languages code-split and lazy-loaded
- ✅ Graceful fallback for unknown languages (plain pre, no error)
- ✅ Sanitize schema extended for Shiki inline styles + classes
- ⏸️ Filename annotation chip — deferred polish
- ⏸️ Copy button — deferred polish
- ⏸️ Line highlight `{1,3-5}` — deferred polish

**Acceptance**:

- ✅ Code looks "professional" (VS Code-quality grammars)
- ✅ All themes render readably
- ⏸️ Copy button + filename chip + line highlights are M3.x polish tasks

**Dependencies**: M1.5

**Notes**: Pipeline became async — predicted by architecture doc. Bundle grew to 223 KB gzipped (within 250 KB budget); M9.1 perf pass will revisit. DocumentPage's `useEffect` refactored with an inner async function for cleaner cancellation across two awaits.

---

### M3.13 — Mermaid diagrams ✅ Done 2026-05-01

**Files**:

- `src/core/render/plugins/remark-mermaid.ts` — diverts ` ```mermaid ` code blocks into a custom mdast `mermaid` node so Shiki never sees them
- `src/core/render/plugins/remark-mermaid.test.ts` — 6 unit tests
- `src/ui/reading-shell/mermaid-loader.ts` — module-level lazy loader for the Mermaid runtime; `__setMermaidLoaderForTests()` injects a stub for tests
- `src/ui/reading-shell/MermaidRenderer.tsx` — actual render component (theme map, error fallback, SVG output)
- `src/ui/reading-shell/MermaidRenderer.test.tsx` — 5 component tests
- `src/ui/reading-shell/MermaidDiagram.tsx` — thin lazy wrapper sitting in the main bundle; dynamic-imports `MermaidRenderer` only when a diagram appears
- `src/ui/reading-shell/MermaidDiagram.test.tsx` — 2 wrapper tests
- `src/core/render/pipeline.ts` + `pipeline.test.tsx` — plug-in registration, sanitize schema entry for `<mermaid-diagram data-source>`, 3 integration tests
- `src/styles/globals.css` — `.swilread-mermaid*` styles for the loaded SVG, the loading shimmer, and the source-fallback figure

**Deliverables**:

- ✅ Custom remark plugin transforms ` ```mermaid ` fenced blocks into `<mermaid-diagram data-source="…">` HAST nodes before Shiki can highlight them.
- ✅ `MermaidDiagram` (in main bundle) is a tiny wrapper (~0.9 KB gzip) that does `import('./MermaidRenderer')` on mount. The renderer file plus the Mermaid runtime live in separate chunks (`MermaidRenderer-*.js` ~0.9 KB, `mermaid.core-*.js` ~145 KB, plus per-diagram-type chunks) — pages with no diagrams pay zero of that.
- ✅ Theme-aware. `useUIStore.theme` is mapped to a Mermaid built-in theme (`sepia → neutral`, `light → default`, `dark/oled → dark`, `auto → default`). Theme changes re-render the diagram.
- ✅ Failure fallback. Bad syntax, network errors, or any exception falls through to a `<figure>` showing the diagram source verbatim — content is never lost.
- ✅ Per-diagram unique element id (Mermaid requires it).

**Acceptance**:

- ✅ A `​```mermaid` block renders the diagram (verified through tests with a stubbed Mermaid runtime; real Mermaid rendering verified in dev server against sample diagrams)
- ✅ Theme switching produces a re-render with the matching Mermaid theme
- ✅ Invalid diagrams display their source instead of crashing the page
- ✅ Pages without diagrams trigger no Mermaid network requests (chunk only requested on mount)

**Dependencies**: M1.5

**Notes**:

- Bundle: main bundle 249.88 KB gzip (under the 250 KB budget). Mermaid + KaTeX + cytoscape + per-diagram chunks total ~600 KB gzip but are all lazy.
- The wrapper/renderer split was forced by the bundle budget. A static import of the full renderer pushed main to 250.22 KB. The lazy wrapper restores the headroom.
- We deliberately did NOT use `React.lazy` for the wrapper because the consumer (`hast-util-to-jsx-runtime`'s components map) is not wrapped in `<Suspense>`. A manual `useState`+`useEffect` dynamic-import achieves the same effect without coupling the component map to Suspense.
- Tests mock the Mermaid runtime via `__setMermaidLoaderForTests` so jsdom doesn't have to grow an SVG implementation.

---

### M3.14 — Tags and clickable tag listings ✅ Done 2026-05-01

**Files**:

- `src/core/render/plugins/remark-tag.ts` + `.test.ts` — body-tag parser
- `src/core/navigation/tag-index.ts` + `.test.ts` — vault-wide indexer
- `src/stores/tag-store.ts` — transient selected-tag
- `src/ui/reading-shell/Tag.tsx` + `.test.tsx` — clickable inline pill
- `src/ui/reading-shell/TagsPanel.tsx` + `.test.tsx` — listing dialog
- `src/ui/reading-shell/tag-index-cache.ts` — per-vault promise cache

**Deliverables**:

- ✅ `#tag` / `#nested/tag` syntax in body text rendered as a clickable pill. Unicode-aware lookbehind regex (`(?<![\w/#])`) so URLs, fragments, paths, and `##doubled` ATX leftovers don't tag-ify
- ✅ `remark-tag` skips text nodes inside `link`, `linkReference`, `image`, `imageReference` parents (tags inside link labels stay as plain text)
- ✅ `inlineCode` / fenced code never tag-ifies (mdast structure naturally excludes; the indexer also pre-strips for body scanning)
- ✅ Tag values are normalized: ASCII lowercased, trailing `/` `-` `_` stripped, CJK preserved verbatim
- ✅ `buildTagIndex(vault)` walks every `.md`/`.mdx` file once, parallelized via `Promise.all`. Combines body matches + frontmatter `tags:` (via existing `selectMetadata`). Per-file read failures swallowed
- ✅ Tag click opens a Radix Dialog overlay listing every file with that tag (alphabetical, click-to-navigate, Esc/X to close)
- ✅ Tag index cached per vault; built lazily on first panel open; failed builds evicted for retry
- ✅ Sanitize schema accepts `<tag>` with `data-tag` attribute
- ✅ Lazy chunk: `TagsPanel` + tag index + cache in their own `~1.7 KB gz` chunk

**Acceptance**:

- ✅ Tags clickable; filter panel works
- ✅ CJK tags from both body and frontmatter (`#中文`, `tags: [前端]`) round-trip correctly
- ✅ 18 plugin tests + 13 indexer tests + 5 panel tests + 3 component tests cover regex edge cases (URLs, code, doubled `#`, link labels), CJK preservation, frontmatter combination, navigation, empty/error/no-vault states

**Dependencies**: M1.5

---

## Milestone 4: Navigation

Goal: User can move through the vault efficiently.

### M4.1 — Vault home detection ✅ Done 2026-05-01

**Files**:

- `src/core/navigation/section-detector.ts` — `findVaultHome` + `pickHomeFromEntries`
- `src/core/navigation/section-detector.test.ts` — 10 tests
- `src/ui/reading-shell/DirectoryListing.tsx` — navigable listing component (also serves the M4.3 sub-directory case)
- `src/ui/reading-shell/VaultHome.tsx` — detect → `<Navigate>` to home, else render listing
- `src/ui/reading-shell/DocumentPage.tsx` — `vault.stat()` first; directory paths render the listing
- `src/ui/reading-shell/VaultHome.test.tsx` — 4 integration tests covering auto-redirect (index/README), no-home fallback, and directory navigation

**Deliverables**:

- ✅ Priority-ordered home probe: `index.md` → `home.md` → `README.md` → `.mdx` variants; case-insensitive name match
- ✅ Auto-redirect via React Router `<Navigate replace>` when a home file is found
- ✅ When no home file exists, render a navigable list of root entries with breadcrumbs back to vault root
- ✅ Directory paths anywhere in the URL tree (`/app/:vaultId/career`) now render the listing instead of a "couldn't open this file" error — `vault.stat()` branches the read path
- ✅ Lucide folder/file icons; alphabetical sort with directories first; file size badge for files
- ✅ Theme-aware styles via existing semantic tokens

**Acceptance**:

- ✅ Wilson's vault (`supwil`) auto-routes to `index.md` on first visit
- ✅ A vault without index/README/home shows the auto-generated listing
- ✅ Clicking a folder navigates into it; breadcrumb hops back to root
- ✅ Clicking a file opens DocumentPage with the rendered Markdown

**Dependencies**: M1.6

**Notes**: This delivers M4.1 in full and a usable slice of M4.3 (navigable listing). The proper M4.3 sidebar (hover-summoned, persistent across documents, lazy-expand, active-highlight, pin button) is still pending.

---

### M4.2 — Section detection ✅ Done 2026-05-01

**File**: `src/core/navigation/section-detector.ts` (extended) + `src/ui/file-tree/FileTree.tsx` (section row variant)

**Deliverables**:

- ✅ `pickSectionHomeFromEntries(entries, dirName)` — pure helper picking the section home in priority order: `<dirname>-map.md` → `<dirname>.md` → `index.md` → `home.md` → `README.md` (`.mdx` variants accepted at every slot, all matched case-insensitively)
- ✅ `findSectionHome(vault, dirPath)` — async wrapper that lists the directory and applies the helper
- ✅ `detectSections(vault)` — returns `VaultSection[]` for every top-level directory with its resolved home (parallel listing fetches)
- ✅ FileTree renders top-level directories with detected homes as a **section row**: a chevron-only expand button + a `Library`-icon Link to the section home
- ✅ Section row marks `aria-current="page"` and `is-active` when the user is reading the section home
- ✅ Top-level dirs without a detected home keep the original button-only rendering (no regression for vaults without `-map.md` conventions)
- ✅ Section detection is non-blocking — a failed listing is silently swallowed, dir still renders normally
- ✅ Listings are pulled through `getListing` so a click-to-expand reuses the same cached promise (no extra round trip)

**Acceptance**:

- ✅ Wilson's `career/career-map.md`, `knowledge/knowledge-map.md`, `tasks/tasks-map.md` are auto-detected as section homes
- ✅ A directory with only `index.md` (e.g. `ai/index.md`) still becomes a section
- ✅ A directory with no candidate (e.g. `orphan/misc.md`) remains a plain folder
- ✅ Loose top-level files are NOT promoted to sections
- ✅ 23 unit tests + 3 FileTree integration tests cover all priority slots, case-insensitivity, error handling, active state

**Dependencies**: M4.1 (✅)

---

### M4.3 — File tree component ✅ Done 2026-05-01 (persistent sidebar variant)

**Files**:

- `src/ui/file-tree/FileTree.tsx` — recursive tree + node component
- `src/ui/file-tree/file-tree-cache.ts` — module-level listing cache (kept separate so the component file only exports React components, satisfying Vite's fast-refresh boundary)
- `src/ui/file-tree/FileTree.test.tsx` — 9 integration tests
- `src/ui/reading-shell/VaultLayout.tsx` — flex container providing sidebar + outlet for every vault-scoped route
- `src/app/router.tsx` — restructured: `:vaultId` is now a layout route with `<index>` (VaultHome) + `*` (DocumentPage) children
- `src/app/AppShell.tsx` — sticky header with file-tree toggle button (`PanelLeftOpen` / `PanelLeftClose` Lucide icons)
- `src/stores/ui-store.ts` — added `fileTreeOpen` (bool, persisted, default true) + `setFileTreeOpen` / `toggleFileTree`

**Deliverables**:

- ✅ Hierarchical tree of the active vault, sorted directories-first then locale-aware alphabetical
- ✅ Lazy load: a directory's children are fetched on first expansion only; the cache (keyed by `vaultId::path`) makes re-expansion instant
- ✅ Active-file highlight via `aria-current="page"` and `is-active` class
- ✅ Ancestor auto-expansion: navigating to `/app/v/career/me/me.md` opens `career` and `me` automatically; manual user expansions are sticky
- ✅ Persistent sidebar (replacing the M2.5 hover-panel approach for now); toggle button in AppShell header flips `fileTreeOpen` and persists to Dexie
- ✅ Theme-aware via existing semantic tokens; sticky positioning so the tree stays in view as the document scrolls
- ✅ ARIA tree semantics: `role="tree"`, `role="treeitem"`, `aria-expanded` on directory items
- ✅ 9 integration tests covering mount, lazy expand, expand-on-click, active highlight, ancestor auto-expansion, toggle visibility, AppShell button → store flag

**Acceptance**:

- ✅ Tree reflects accurate vault structure; navigation works
- ✅ Sidebar visibility persists across reloads
- ✅ Switching vaults remounts the tree (cleared expansion state) via `key={vaultId}`

**Dependencies**: M4.1 (✅); **NOT** dependent on M4.2 (section-home detection — orthogonal) or M2.5 (hover zones — explicitly skipped for this version).

**Notes**:

- The original spec called for a "left hover panel from M2.5" plus a `fileTreePinned` flag. We shipped a simpler always-on (toggle-able) sidebar instead — same UX value, half the moving parts. M2.5 / `fileTreePinned` can land later as an _opt-in_ hover mode without rewriting this work.
- Section grouping (M4.2) and per-section `*-map.md` homes are still pending; the tree currently shows the raw filesystem.
- Bundle: +1.3 KB gzipped (component + 4 new Lucide icons).

---

### M4.4 — Backlinks calculation ✅ Done 2026-05-01

**File**: `src/core/navigation/backlinks.ts`

**Deliverables**:

- ✅ Async backlinks index: for each resolved target file, list source files that link to it
- ✅ Built incrementally as Markdown files are successfully read/rendered in `DocumentPage`
- ✅ Whole-vault builder available via `buildBacklinksIndex(vault)` for future eager indexing
- ✅ Stored in memory and cached to IndexedDB (`backlinks` table, Dexie schema v3)
- ✅ Re-indexing a source file replaces stale backlinks from that source
- ✅ Extractor ignores embeds, inline code, fenced code, and HTML comments
- ✅ Backlink rows include compact context text for M4.5 panel previews

**Acceptance**:

- ✅ Given a file, `getBacklinksForFile(vaultId, path)` returns known source files that contain resolved `[[that file]]` references
- ✅ Backlinks survive memory reset via IndexedDB hydration
- ✅ Tests cover extraction, target resolution, dedupe, stale replacement, persistence hydration, whole-vault indexing, and DocumentPage incremental indexing

**Dependencies**: M3.3

**Notes**: M4.4 is data-only. The visible backlinks panel remains M4.5.

---

### M4.5 — Backlinks panel UI ✅ Done 2026-05-01

**File**: `src/ui/reading-shell/BacklinksPanel.tsx`

**Deliverables**:

- ✅ Shown at the bottom of each rendered Markdown document
- ✅ Lists known source files that link to the current file
- ✅ Displays compact raw-Markdown context snippets from the backlinks index
- ✅ Click source rows to navigate to the referring file

**Acceptance**:

- ✅ Open a file with known backlinks, see them at the bottom
- ✅ Clicking a backlink navigates to the source file
- ✅ Empty and loading states are covered in tests
- ✅ Integrated through `DocumentPage` without changing the M4.4 index contract

**Dependencies**: M4.4

**Notes**: The panel renders known indexed backlinks only. It does not trigger a full-vault crawl; sources become visible after incremental indexing or a future eager build.

---

### M4.6 — Table of contents ✅ Done 2026-05-01

**File**: `src/ui/reading-shell/TableOfContents.tsx` + `src/core/navigation/headings.ts` + `src/stores/toc-store.ts`

**Deliverables**:

- ✅ Right-rail panel listing H1–H4 of the current document
- ✅ Active section highlight via `IntersectionObserver` (header-aware rootMargin) with a fallback for very short sections
- ✅ Click-to-scroll with smooth behavior, sticky-header offset, and URL hash update via `history.replaceState`
- ✅ Indent based on the shallowest level present (a doc starting at H3 doesn't waste two indent columns)
- ✅ DOM-based heading extraction with Unicode-safe slugify (CJK preserved); ids assigned in place, duplicates disambiguated
- ✅ Persisted `tocOpen` preference in `useUIStore`; toggle button in `AppShell` (left/right pair) + checkbox in settings panel
- ✅ Lazy-loaded chunk (`TableOfContents` + `headings.ts` ~1.5 KB gzipped combined) — main bundle stays lean
- ✅ Hidden below 1100 px viewport (responsive guard)

**Acceptance**:

- ✅ TOC reflects every H1–H4 in the document, in source order
- ✅ Scroll-tracking moves the active highlight to the heading currently below the chrome band
- ✅ Click jumps to heading + updates `#hash`
- ✅ Empty doc shows "No headings."
- ✅ 12 unit tests for the slugifier + extractor, 5 for the component

**Dependencies**: M2.5 (deferred — wired as a persistent right rail instead of a hover zone; M2.5 can later add a hover-summon affordance once tocOpen is false)

---

### M4.7 — Recent files list ✅ Done 2026-05-01

**File**: `src/stores/reader-store.ts` (extend)

**Deliverables**:

- ✅ `src/stores/reader-store.ts` tracks recently opened files, capped to the last 20 per vault
- ✅ `recentFiles` IndexedDB table added in Dexie schema v2 (`id`, `vaultId`, `path`, `openedAtMs`)
- ✅ `DocumentPage` records only successfully opened files; directories, missing paths, and failed reads are not recorded
- ✅ Recent files dedupe by `(vaultId, path)` and move a reopened file to the top
- ✅ Selector-friendly state shape (`recentByVault`) is exposed for the future command palette
- ✅ File-tree sidebar renders the first 5 recent files in a compact top section

**Acceptance**:

- ✅ Opening files updates the recent list
- ✅ Recent list persists across reloads (`reader-store.init()` hydrates from Dexie)
- ✅ Lists are isolated per vault and pruned to 20 rows in memory and IndexedDB
- ✅ Tests cover init, persistence, dedupe, pruning, per-vault isolation, path normalization, clear, DocumentPage recording, and sidebar rendering

**Dependencies**: M1.6

**Notes**: Implemented as a new reader store rather than extending vault/ui stores. Vault registration remains about vault metadata and live adapters; UI store remains global presentation preferences. Reading state now has a natural home for future scroll positions, history, and command-palette recents.

---

## Milestone 5: ⌘K Command Palette

Goal: A unified command palette as the primary navigation surface.

### M5.1 — Command palette UI shell (cmdk) ✅ Done 2026-05-01

**File**: `src/ui/command-palette/CommandPalette.tsx` + `src/app/use-command-palette-hotkey.ts`

**Deliverables**:

- ✅ ⌘K / Ctrl+K global binding (`useCommandPaletteHotkey`), mounted once in `AppShell`. Refuses to fire inside `<input>`, `<textarea>`, `<select>`, or `contenteditable` elements; rejects combos with shift/alt to leave room for future bindings
- ✅ Centered modal with backdrop blur (Radix Dialog) + cmdk's accessible `Command`/`Command.Input`/`Command.Item` semantics — focus trap, portal, and aria wiring come from Radix; arrow nav + scoring come from cmdk
- ✅ Default mode (and currently only mode): cross-vault recent files, sorted recency-first, decorated with vault name in the secondary line
- ✅ Empty input shows recents (or a friendly empty-state when none exist)
- ✅ Enter / click selects → `useNavigate` to `/app/<vaultId>/<path>` and closes the palette
- ✅ Esc closes (Radix); the in-shell ⌘K toggles open/closed
- ✅ Header gains a `Search` icon button as the visible affordance (also a hint that the keyboard shortcut exists)
- ✅ Lazy chunk: the palette + cmdk runtime ship in `CommandPalette-*.js` (~5.5 KB gz) — main bundle pays only for the hotkey hook + ui-store flag (~0.5 KB)
- ✅ Transient `commandPaletteOpen` in `useUIStore` (NOT persisted — same pattern as `zenMode`)
- ✅ jsdom test stubs added: `ResizeObserver` (cmdk needs it) and `Element.prototype.scrollIntoView` (cmdk auto-scrolls the active item)

**Acceptance**:

- ✅ ⌘K (mac) / Ctrl+K (win/linux) opens; Esc closes
- ✅ Arrow keys move selection; Enter navigates
- ✅ Recents show across all registered vaults
- ✅ 9 hotkey unit tests (modifier matrix, target-guard cases, unmount cleanup) + 6 component tests (open/close, recents render, navigate-and-close, Esc-close, empty state) + 3 ui-store tests

**Dependencies**: M4.7 (✅) — the recents store is the data source

**Notes**:

- M5.2 (fuzzy file-name search) extends this file by adding a second mode keyed off the input string with `shouldFilter` re-enabled.
- M5.3 (search worker) adds a third mode behind a `>` prefix.
- The `Search` button in the header doubles as discoverability for the keyboard shortcut on first-time users.

---

### M5.2 — File name fuzzy search mode ✅ Done 2026-05-01

**File**: `src/core/vault/walk-files.ts` + `src/ui/command-palette/walked-files-cache.ts` + `src/ui/command-palette/CommandPalette.tsx` (extended)

**Deliverables**:

- ✅ `walkAllFiles(vault, options)` — BFS recursive walker over the entire vault. BFS keeps top-level files before nested ones (matches the file-tree's visual order). Per-directory failures are non-fatal (a single permission blip doesn't blank the palette). `includeExtensions` filter + `maxFiles` cap (default 5_000)
- ✅ `getWalkedFiles(vault)` — per-vault promise cache keyed by vault id; failed walks evicted so retries can succeed; `invalidateWalkedFiles(vaultId)` ready for M9 watchers
- ✅ Default extension allowlist: every extension Phase 1 ships a renderer/embed for (`.md`, `.mdx`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`, `.csv`, `.tsv`, `.html`, image set, video/audio set)
- ✅ Palette adds a `Files in <vault>` group when input is non-empty; recents shown only when input is empty (no double-list during search)
- ✅ Current vault resolved from URL via `useLocation` so the search target matches the route the user is on (no dependency on `vaultStore.activeVaultId` which may not always be set)
- ✅ `shouldFilter` flips per-mode: false for recents (preserve recency order), true for Files (let cmdk score)
- ✅ cmdk's `value` field combines basename + path so a query can match either the leaf name or any parent folder name
- ✅ Walked-files request fires only when the palette opens AND a vault is in scope — zero cost for users who never hit ⌘K
- ✅ Friendly states: loading shimmer, error message, "no matches" when score returns nothing, "open a vault to search its files" when none in scope

**Acceptance**:

- ✅ Typing "react" finds `knowledge/软件/前端/react.md` — CJK path segments preserved verbatim through the walker
- ✅ Selecting a result navigates and closes the palette
- ✅ 6 walker tests (BFS order, extension filter, maxFiles cap, empty vault, CJK) + 5 palette Files-mode tests (placeholder, fuzzy match w/ CJK, navigate-and-close, no-matches, no-vault prompt)

**Dependencies**: M5.1 (✅), M1.2 (✅)

**Notes**:

- The walker lives in `core/vault/` so M5.3's worker-based full-text indexer can reuse it without taking a UI dependency.
- File-tree's `getListing` cache and the palette's `getWalkedFiles` cache are separate by design: per-directory listings are needed during expansion (one folder at a time); the flat walked list is needed during search (everything at once). Mixing them would either waste memory (storing a flat list when the tree only needs one folder) or waste I/O (re-walking on every keystroke).

---

### M5.3 — Set up search index Web Worker 🟡 Deferred (transparent perf optimization)

The index build is **in-thread** today (`core/search/full-text.ts` — see M5.4) and meets the spec: under one frame for Wilson-sized vaults, well under 5 seconds for any vault that fits the `walkAllFiles` 5_000-file cap. CJK-aware tokenization via `Intl.Segmenter` is already in place. Caching is in-memory per vault rather than IndexedDB-persisted — also acceptable for the working set size.

The worker swap is purely a perf optimization for vaults large enough that the main thread stalls during `buildFullTextIndex`. When that day comes, the lift is straightforward: `core/search/full-text.ts` already exposes a clean `buildFullTextIndex(vault)` + `searchIndex(index, query)` API; reproduce both inside `src/workers/search-worker.ts` with a postMessage envelope, swap `full-text-cache.ts` to call the worker. UI consumers (`CommandPalette`'s `useFullTextIndex`) stay unchanged.

**Dependencies**: M5.4 (✅) — landed first

---

### M5.4 — Full-text search mode ✅ Done 2026-05-01

**Files**:

- `src/core/search/full-text.ts` + `.test.ts` — `buildFullTextIndex(vault)` + `searchIndex(index, query)` over MiniSearch with CJK-aware `Intl.Segmenter` tokenizer
- `src/ui/command-palette/full-text-cache.ts` — per-vault promise cache (mirrors walked-files-cache pattern)
- `src/ui/command-palette/CommandPalette.tsx` — `>` prefix route + Search Results group

**Deliverables**:

- ✅ `>` prefix triggers full-text search across the active vault
- ✅ Results ranked by MiniSearch (name boost 2×, fuzzy 0.2, prefix); top 25 returned
- ✅ Snippet builder centres a 60-char window on the first matching term, with ellipses
- ✅ CJK content searchable: `Intl.Segmenter` segments Chinese / Japanese / Korean text into word-like tokens; pure-ASCII text uses MiniSearch's faster default split
- ✅ Frontmatter stripped before indexing (titles indexed via the file-name field instead)
- ✅ Per-vault promise cache; failed builds evicted; `invalidateFullTextIndex` wired into `removeVault`
- ✅ Lazy chunk: MiniSearch + full-text core + cache ship in a separate ~6.9 KB gzipped chunk loaded only when the user enters `>` mode
- ✅ Defensive: per-file read errors swallowed; loader rejection surfaces as an inline error row, never blanks the palette

**Acceptance**: ✅ Typing `>useState` finds files whose body contains the term; `>` alone shows the help hint; results navigate on Enter / click

- Click navigates to file (and ideally to the matching position)

**Acceptance**: `> 索引` returns relevant pages from Wilson's knowledge notes

**Dependencies**: M5.3

---

### M5.5 — Multi-mode prefix routing ✅ Done 2026-05-01 (`>` slice)

**File**: `src/ui/command-palette/CommandPalette.tsx` (`classifyInput` + per-mode rendering)

**Deliverables (this slice)**:

- ✅ `classifyInput(raw)` returns one of three modes: `recents` (empty), `search` (`>` prefix consumed), `files` (anything else). Single seam for adding more prefixes later
- ✅ Placeholder text changes per mode (`Search content in <vault>…` for `>`; `Search files in <vault>…` for default)
- ✅ Footer carries a `>` hint + the existing arrow / Enter / Esc legend so the prefix is discoverable
- ✅ `shouldFilter` flips per-mode: `false` for recents (preserve order) and search (already MiniSearch-ranked); `true` for files (let cmdk score)
- ✅ 5 new palette tests cover `>` routing, placeholder swap, empty-prefix hint, navigate-and-close from search, no-matches state

**Future slices**:

- `[[` for wikilink-style file picker with previews — natural extension; the resolver + preview already exist (`Wikilink` / `WikilinkPreview`)
- `?` slot is currently used by the keyboard shortcuts overlay (M9.4) at the global key level — if a palette `?` mode lands later it should go to a different prefix to avoid confusion

**Acceptance**: ✅ `>foo` switches mode; UI reflects via placeholder + group heading + footer hint

**Dependencies**: M5.2 (✅), M5.4 (✅)

---

## Milestone 6: Multi-Vault & Returning User

Goal: Handle multiple vaults and returning users smoothly.

### M6.1 — Vault switcher UI ✅ Done 2026-05-01

**File**: `src/ui/reading-shell/VaultSwitcher.tsx` + `.test.tsx`

**Deliverables**:

- ✅ Header dropdown next to the SwilRead wordmark, only rendered when at least one vault is registered
- ✅ Click expands a list of every registered vault with the active one marked (`Check` icon + `is-active` class)
- ✅ "Open another vault…" CTA at the bottom triggers the existing `FolderPicker` and registers + persists the resulting handle (auto-restore wiring)
- ✅ Custom dropdown (~80 LoC) rather than a new Radix package — click-outside, Esc-close, focus-return all handled inline. Saves the bundle cost
- ✅ 5 tests cover trigger label, menu listing, active marker, navigation on switch, Esc-close

**Acceptance**: ✅ User can switch between registered vaults

**Dependencies**: M1.4 (✅)

---

### M6.2 — Per-vault state isolation 🟢 De-facto complete

All per-document state landed already keyed by `vaultId` over the course of M2.7 / M4.4 / M4.7 / M5.2 / M3.14:

- `useReaderStore` — `recentByVault[vaultId]`, `scrollByVault[vaultId]`
- `core/navigation/backlinks` — Dexie rows keyed by `(vaultId, sourcePath, targetPath)`
- `tag-index-cache` — keyed by `vault.id`
- `walked-files-cache` (palette) — keyed by `vault.id`
- `file-tree-cache` — keyed by `vault.id::dirPath`

`useUIStore` is intentionally global (theme, fonts, content width). Per-vault prefs are deferred — most readers prefer one consistent reading experience across vaults, and adding per-vault override knobs would add prefs UI complexity without clear demand. Easy to revisit.

**Dependencies**: M6.1 (✅)

---

### M6.3 — Returning user auto-restore ✅ Done 2026-05-01

**Files**: `src/app/auto-restore.ts` + `.test.ts` + `src/ui/reading-shell/ReauthorizeVault.tsx`

**Deliverables**:

- ✅ `autoRestoreVaults()` runs once at boot via `main.tsx`. Walks `listHandleIds()`, hydrates the vault store, and for each known vault: loads the handle, instantiates an adapter, calls `hasPermission()`. Granted → attaches the adapter via `useVaultStore.attachAdapter`. Lapsed → caches the adapter in a `pendingAdapters` map so a later user-gesture re-grant is one call away
- ✅ Crucially does NOT call `requestPermission()` automatically — the FSAPI requires a user gesture for the prompt; calling on boot fails with `SecurityError`. Re-authorize is on-demand
- ✅ `reauthorizeVault(id)` walks the prompt → attach pipeline. Returns `boolean`. Exposed for any UI surface that needs the gesture (today: `ReauthorizeVault` component)
- ✅ Orphan handles (vault meta deleted but handle stuck around) are skipped — restoring them would surprise the user
- ✅ `ReauthorizeVault` component shows three states (`checking` / `has-handle` / `no-handle`) with appropriate copy. The `has-handle` state offers a one-click "Re-authorize this vault" button that calls `reauthorizeVault` and re-runs the route effects on success
- ✅ Mounted from `DocumentPage` and `VaultHome` whenever the missing-vault state hits — replaces the previous "not registered in the current session" dead-end
- ✅ 9 tests cover: granted-attach, prompt-pending, orphan-skip, store hydration, no-vaults case, deny path, no-saved-handle path, grant-on-second-try

**Acceptance**: ✅ Returning user reopens app → previous vault auto-attaches if browser still trusts the grant; otherwise one-click re-authorize from any vault page

**Dependencies**: M1.4 (✅)

---

### M6.4 — Vault registration UI in landing page ✅ Done 2026-05-01

**File**: `src/ui/landing/LandingPage.tsx` (extended) + `.test.tsx`

**Deliverables**:

- ✅ Detect returning vs. fresh user via `useVaultStore.registeredVaults.length`
- ✅ Returning user: replaces the two-button CTA with a "Your vaults" recents list (capped at 5, recency-ordered, relative-date stamps) + a smaller "Open another vault" dashed-border CTA
- ✅ Fresh user: original "Try sample vault" + "Open my vault" CTAs
- ✅ 3 new tests cover both branches + the 5-cap

**Acceptance**: ✅ Landing page adapts to user state

**Dependencies**: M6.3 (✅)

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

### M9.2 — Responsive layout (desktop + tablet only in v1)

**Scope**: Reconciled with `docs/design/gaps-and-open-questions.md#PG-03` — **iOS phones/tablets are NOT a v1 target** because File System Access API has no iOS support for picking local folders. Mobile is a Phase 3 concern.

**Deliverables**:

- Layout adapts to viewports between 768px and 1280px (small laptop / iPad-class screens running desktop browsers)
- File tree gracefully collapses to a slide-out panel below 1024px
- TOC becomes a corner button below 1024px
- Settings panel becomes full-width below 768px
- No phone-specific UI in v1 — viewports < 640px get the desktop layout with horizontal scroll where unavoidable

**Acceptance**:

- SwilRead is usable in Chrome/Edge/Safari on a 13" laptop and on an Android tablet running desktop Chrome
- Sample vault renders correctly when window resized between 768px and 1920px
- iPhone/iPad-Safari path is documented as known-broken and tracked as a Phase 3 task (not blocking v1 ship)

**Dependencies**: all UI tasks

**Note**: Full mobile (touch gestures, bottom sheets, native iOS) lands in Phase 3 once we either ship Tauri, build a companion bridge daemon, or accept iCloud-mediated read-only mode. See `docs/design/gaps-and-open-questions.md#PG-03` for the full analysis.

---

### M9.3 — Chinese font support (思源宋体)

**Deliverables**:

- Self-host 思源宋体 SC and TC subsets
- Add to font stack
- Verify mixed Chinese/English documents render beautifully

**Acceptance**: Wilson's Chinese knowledge notes render with proper Chinese typography

**Dependencies**: M0.5

---

### M9.4 — Keyboard shortcuts and hints ✅ Done 2026-05-01

**Files**: `src/app/use-shortcuts-help-hotkey.ts` + `.test.ts` + `src/ui/help/ShortcutsHelp.tsx` + `.test.tsx`

**Deliverables**:

- ✅ Global `?` binding via `useShortcutsHelpHotkey()` mounted in `AppShell`. Same editable-target + modifier-immunity pattern as the ⌘K and F hooks
- ✅ `ShortcutsHelp` component — Radix Dialog overlay with three groups (Navigation, Reading, Help), each rendering `<kbd>` blocks for keys + a description column. The shortcut list is a single in-file `SHORTCUT_GROUPS` constant — every new hotkey adds one line here
- ✅ Lazy chunk: ~0.98 KB gzipped. Pulled in only on first `?` press
- ✅ 5 hotkey tests + 4 component tests (open/list/Esc/close-button) + 3 ui-store tests for the new transient `shortcutsHelpOpen`

**Acceptance**: ✅ `?` opens; arrow / Esc dismiss; every binding from the audit (⌘K, F, Esc, ?) listed

**Dependencies**: M5.1 (✅), M2.6 (✅)

**Notes**: First-time hints (toast on first vault open) deferred to M9.6 polish.

---

### M9.5 — Error boundaries and graceful degradation ✅ Done 2026-05-01 (route-level slice)

**File**: `src/app/ErrorFallback.tsx` + `.test.tsx` + `src/app/router.tsx` (errorElement wiring)

**Deliverables (this slice)**:

- ✅ React Router 7 `errorElement` wired at three levels: root (`/`), app shell (`/app`), and the per-vault layout (`/app/:vaultId`). The shell stays mounted when a child route crashes — chrome doesn't tear down with the failing element
- ✅ `ErrorFallback` reads the routing error context, normalizes `RouteError` / native `Error` / unknown values into `{title, message, details}`, and presents a theme-aware card with: location path, "Back to start" + "Reload" actions, and a collapsible technical-details disclosure for stack traces
- ✅ +5 tests cover throw-detection, path display, navigation affordance, native-error stack rendering, and the "parent layout chrome stays mounted on child crash" guarantee (the core M9.5 invariant)

**Still future-work for M9.5 (full milestone)**:

- DocumentPage-level inline fallback ("Couldn't render this file") — partially handled today by the existing per-state `error` branch
- FSAPI permission-revoked re-authorize prompt (M6.3 territory)

**Dependencies**: M0.4 routing (✅)

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
