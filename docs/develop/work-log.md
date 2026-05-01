# SwilRead — Work Log

> Reverse chronological log of implementation work. Most recent entries first.

---

## 2026-05-01 · M1.2 · FSAPIVaultAdapter

**Status**: ✅ Done (unit-tested; manual browser E2E pending in M1.3)

### What was built

The first concrete `VaultFileSystem` adapter — wraps a real File System Access API directory handle.

**Files created**:

- `src/core/vault/id.ts` — `slugify()` and `generateVaultId()` (Unicode-aware, URL-safe slugs + 4-char base36 suffix)
- `src/core/vault/id.test.ts` — 11 tests (unicode, length cap, fallback, randomness)
- `src/core/vault/fsapi-types.ts` — type augmentation for `Window.showDirectoryPicker` and `FileSystemHandle.{queryPermission,requestPermission}` (not in default lib.dom)
- `src/core/vault/fsapi-adapter.ts` — `FSAPIVaultAdapter` class (~250 LOC)
- `src/core/vault/fsapi-adapter.test.ts` — 21 tests covering identity, list, walk, readText, readBinary, stat, permissions
- `src/core/vault/handle-storage.ts` — idb-keyval-backed persistence for directory handles (4 functions: save/load/delete/list)
- `src/core/vault/__test-helpers__/mock-fs.ts` — pure in-memory FSAPI mock (used by adapter tests; also useful for sample vault later)

**Files modified**:

- `src/core/vault/index.ts` — barrel export updated with new public surface
- `tsconfig.app.json` — added `DOM.AsyncIterable` to lib for `for await...of` on `dir.values()`
- `eslint.config.js` — added `__test-helpers__` override to disable `require-await` (mocks must be `async` for shape but bodies are sync)

### Adapter design highlights

- **Two construction paths**: `FSAPIVaultAdapter.pick()` (interactive picker, fresh ID) vs `FSAPIVaultAdapter.fromHandle(handle, opts?)` (restore with explicit ID).
- **No internal persistence**. The adapter does NOT call `saveHandle`. The Zustand store (M1.4) orchestrates handle ↔ ID ↔ persistence.
- **Lazy walk**. `walk()` is `async function*` and recurses depth-first via `dir.values()`. Large vaults stream; we never materialize a full list.
- **Blob URL caching**. `getBlobURL(path)` caches per-path. `dispose()` revokes all URLs (call when unloading a vault).
- **Typed errors**. Adapter catches `DOMException` from FSAPI and rethrows as `VaultFileNotFoundError` / `VaultPermissionDeniedError` / `VaultReadError`. Callers branch on `instanceof`, not message.
- **Sort order in `list()`**: directories first, then files; both case-insensitive `localeCompare` (so `index.md` precedes `README.md`, matching most users' mental model).

### Persistence helper (`handle-storage.ts`)

- Uses `idb-keyval` (already in tech-stack) — single key/value store keyed by `VaultId`.
- Directory handles ARE structured-cloneable in modern browsers; IndexedDB stores them across reloads.
- The browser still revokes the permission grant per session — `requestPermission()` must be re-called from a user gesture on first read after page load. This is unavoidable per WHATWG; documented in the JSDoc.
- Separate from the future Dexie store (M1.4 / M6.1) because the schema here is trivial and the lifecycle differs (handles vs metadata).

### Test strategy

Real FSAPI is browser-only and complex; we built a complete in-memory mock (`mock-fs.ts`) that:

- Implements only the surface the adapter actually calls (kind, name, values, getDirectoryHandle, getFileHandle, getFile().text/arrayBuffer/size/lastModified, queryPermission, requestPermission)
- Throws `DOMException` with `name: 'NotFoundError'` for missing children — matches real FSAPI error shape so the adapter's error mapping is exercised
- Builds from a nested object literal → tests stay readable

This lets us cover walk-recursion, Unicode paths, error mapping, sorting, and permission flow — all without a browser.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **77 passing** (was 45; +32 from id.test.ts and fsapi-adapter.test.ts)
- `pnpm build` → 546 ms; bundle 91 KB gzipped JS (idb-keyval is ~1 KB, negligible)

### What's NOT covered yet

- **Real-browser end-to-end test** — requires a UI to trigger `showDirectoryPicker()`. Will be exercised in M1.3 (folder picker UI) and M1.6 (render a real file).
- **`getBlobURL` in jsdom** — `URL.createObjectURL` works in jsdom but isn't a real blob; intentionally not tested in unit tests.
- **Handle serialization through IndexedDB** — jsdom's IDB shim doesn't accept `FileSystemDirectoryHandle` (it's a host object). Will be exercised live in M1.3.

### Issues / Notes

- TypeScript's `lib.dom.d.ts` declares `kind: 'file' | 'directory'` on the base `FileSystemHandle` and doesn't override on subtypes, so `if (handle.kind === 'directory')` does NOT narrow to `FileSystemDirectoryHandle`. Worked around with a single explicit cast in `walkRecursive`. Documented inline.
- `showDirectoryPicker` and the permission API methods are not in stock `lib.dom.d.ts` — augmented in `fsapi-types.ts`. Imported (side-effect) at top of adapter file so the global types load whenever the adapter is referenced.

### Next step

**M1.3 — Folder picker UI with consent panel**

`src/ui/landing/FolderPicker.tsx`:

- Inline panel slide-up before the FSAPI dialog (privacy-first messaging)
- Calls `FSAPIVaultAdapter.pick()` on user gesture
- Routes to `/app/:vaultId` on success
- Handles `AbortError` (user cancels) gracefully
- Manual browser test against `/Users/supwils/supwilsoft/supwil/`

This is the first task that proves M1.2 works in a real browser.

---

## 2026-05-01 · Audit Remediation Pass

**Status**: ✅ Done

External review caught 5 issues spanning truth-source drift, shadow tests, and version mismatches. Fixed all five before resuming feature work.

### Issue 1 (HIGH) — `CLAUDE.md` stale state block

`CLAUDE.md` claimed "pre-implementation, codebase empty" while M0.1–M1.1 had shipped. Multi-agent risk: a fresh agent reads CLAUDE.md first and starts re-doing M0.

**Fix**:

- Updated state block to reflect actual progress
- Declared three files as the **execution truth source** (with explicit precedence over CLAUDE.md if they disagree):
  - `docs/develop/README.md`
  - `docs/develop/phase-1-implementation-plan.md`
  - `docs/develop/work-log.md`

### Issue 2 (MEDIUM) — Router test was a shadow implementation, AND it masked a production bug

`router.test.tsx` rebuilt a parallel `routes` array instead of importing from `router.tsx`. There was no test for the production assembly (`App.tsx` mounting `RouterProvider`).

**Fix**:

- Refactored `src/app/router.tsx` to export `routes` as a single source of truth; `router` is built from those routes.
- `router.test.tsx` now imports `routes` directly — any drift in the production tree is caught automatically.
- Added two structural assertions on the route tree shape (top-level paths, `/app` children).
- **New file**: `src/App.test.tsx` — smoke test that mounts production `<App />` and asserts the LandingPage renders. Boring on the surface; critical in practice.

### Real bug discovered during fix

The new `App.test.tsx` immediately failed with:

> Cannot destructure property 'basename' of 'React.useContext(...)' as it is null.

Root cause: `App.tsx` imported `RouterProvider` from `react-router/dom`, which is the **HydratedRouter / RSC** variant designed for server-rendered apps. For a `createBrowserRouter`-based SPA the correct import is `react-router` (main entry). The wrong import provided a context-less RouterProvider, so `<Link>` inside `LandingPage` crashed at render time.

Without the audit's prompt to fix the shadow test, this would have shipped to production. Type-check, lint, and the original test suite all stayed green while the actual app was broken.

**Fix**: changed the import in `src/App.tsx` to `import { RouterProvider } from 'react-router'`. App.test.tsx now passes.

### Issue 3 (MEDIUM) — `tech-stack.md` lists vitest ^2 but we run 3.2.4

After M0.4 we upgraded to vitest 3 (and `@vitest/ui` 3) to resolve a Vite 7 type conflict (vitest 2 ships vite 5 types and breaks `tsc -b`). The doc never moved.

**Fix**:

- Updated Build & Dev table to **^3** with an explicit warning: "must be v3+ for Vite 7 compatibility (v2 ships vite 5 types and breaks `tsc -b`)"
- Updated Testing table with full pinned versions for vitest, @vitest/ui, RTL, jest-dom, user-event, jsdom
- Bumped pnpm version to ^10 (we use 10.27)

### Issue 4 (MEDIUM) — Phase 1 plan promised iPad/iPhone, gaps doc says iOS impossible in v1

`phase-1-implementation-plan.md` M9.2 acceptance was "usable on iPad and iPhone" while `gaps-and-open-questions.md#PG-03` explicitly says iOS Safari has no FSAPI for picking local folders and mobile is "not in v1." This guarantees a fake failure at milestone review.

**Fix**: rewrote M9.2 as **"Responsive layout (desktop + tablet only in v1)"**. Acceptance now targets 768–1280px viewports running desktop browsers (laptops + Android tablets in desktop Chrome). iPhone/iPad-Safari is documented as known-broken and tracked as a Phase 3 task. Cross-references `gaps-and-open-questions.md#PG-03`.

### Issue 5 (LOW-MED) — Design doc drift

- `vision.md` still tagged **Status: Brainstorming** while `design/README.md` declared design complete.
- `ftue-and-vault-model.md` still proposed **"The Art of Reading"** as the sample vault theme; `brand-and-positioning.md` had locked it as **"Reading in the Age of AI"**.

**Fix**:

- `vision.md` status → "Decided · Foundational · 2026-05-01"
- `ftue-and-vault-model.md` sample vault section now defers to `brand-and-positioning.md` as canonical, notes the supersession, and removes the now-stale file tree (the brand doc has the current one).

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → 45 tests passing (was 42; +3 from new structural tests + App smoke test)
- `pnpm build` → 567 ms; 91.28 KB gzipped JS

### Lessons learned (worth carrying forward)

- **Tests that don't import the production module are shadow tests.** They prove the test code works — nothing more. Always import the real artifact.
- **A 3-line wiring file (`App.tsx`) deserves at least one mounted-render test.** That's where layer-boundary bugs hide — type-check can't see them, unit tests bypass them.
- **Truth-source declarations in `CLAUDE.md` matter for multi-agent work.** Without them, every agent picks its own favorite doc.
- **Doc updates should be part of the same PR/commit as the change they describe.** When we upgraded vitest in M0.4, the work log captured it but tech-stack.md drifted. The fix: tech-stack.md is now part of the verification checklist for any dependency change.

### Next step

**Resume M1.2 — Implement `FSAPIVaultAdapter`**

Audit remediation has not consumed the M1.2 task itself. Next agent picks up where we left off: implement the real File System Access API adapter, persist the `FileSystemDirectoryHandle`, and manually verify against `/Users/supwils/supwilsoft/supwil/`.

---

## 2026-05-01 · M1.1 · VaultFileSystem Interface

**Status**: ✅ Done

### What was built

The foundational abstraction. Every adapter (FSAPI, Sample, future Tauri) implements `VaultFileSystem`; the rest of the app sees only this interface.

**Files created**:

- `src/core/vault/types.ts` — types, interface, error hierarchy (all type-only at runtime except errors)
- `src/core/vault/path.ts` — pure path utilities (normalize, join, dirname, basename, extname, split, isMarkdown, isImage, isWithin)
- `src/core/vault/path.test.ts` — 34 tests covering all path helpers and edge cases
- `src/core/vault/index.ts` — barrel export so callers `import from '@/core/vault'`

### Public API surface

```ts
// Types
type VaultId          // opaque persistent ID, e.g. "supwil-a3f7"
type VaultPath        // POSIX relative, e.g. "career/me/me.md"
type VaultFile        // path, name, extension, size, modifiedAt
type VaultDirectory
type VaultEntry       // VaultFile | VaultDirectory
type VaultMeta        // persistable: id, name, registeredAt, lastOpenedAt

// The contract
interface VaultFileSystem {
  readonly id: VaultId
  readonly name: string
  list(path): Promise<VaultEntry[]>
  walk(): AsyncIterable<VaultFile>
  stat(path): Promise<VaultEntry>
  readText(path): Promise<string>
  readBinary(path): Promise<Uint8Array>
  getBlobURL(path): Promise<string>
  hasPermission(): Promise<boolean>
  requestPermission(): Promise<boolean>
}

// Errors (so callers branch on type, not message)
class VaultError
class VaultPermissionDeniedError
class VaultFileNotFoundError
class VaultReadError      // accepts ES2022 Error.cause
```

### Architecture decisions

- **All async, even in-memory adapters** — keeps the interface uniform; `await` everywhere is fine
- **`AsyncIterable<VaultFile>` for `walk()`** — streams large vaults instead of materializing a list. Lazy by design.
- **`""` represents the vault root** — explicit, matches `dirname()` returning `""` for top-level files
- **POSIX paths only** — even on Windows browsers, FSAPI gives us names; we normalize backslash → slash
- **Lowercase extensions in `extname()`** — case-insensitive matching, idiomatic for the file-type dispatcher (M7.1)
- **Dotfiles return `""` from `extname()`** — `.gitignore` is a name, not an extension; `.env.local` correctly returns `.local`
- **Typed error hierarchy** — branch on `instanceof VaultFileNotFoundError` instead of inspecting messages
- **`isWithin()` checks segment boundaries** — `careers/me` is NOT within `career`; we only match on `${parent}/` prefix
- **No JSDoc on `path.ts` internals**, but full JSDoc on `VaultFileSystem` interface — it's the public API of `core/vault`
- **Barrel `index.ts`** — single import point: `import { VaultFile, joinPath } from '@/core/vault'`

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → 42/42 passing in 92 ms
  - `path.test.ts` — 34 tests (every utility, every edge case)
  - existing — 8 tests (LandingPage, router)

### Issues / Notes

- None. Pure types + pure functions; trivially testable.

### Next step

**M1.2 — Implement `FSAPIVaultAdapter`**

Real File System Access API adapter:

- Class implementing `VaultFileSystem`
- `window.showDirectoryPicker()` for initial folder selection
- Persists `FileSystemDirectoryHandle` to IndexedDB via Dexie (M1.4 will add the store)
- `walk()` lazily yields files via async iteration over directory handles
- `readText` / `readBinary` via `getFile()` → `text()` / `arrayBuffer()`
- `getBlobURL` caches `URL.createObjectURL` results per path
- Permission API: `queryPermission()` / `requestPermission()` on the handle
- Manual end-to-end test: pick `/Users/supwils/supwilsoft/supwil/`, walk it, read `index.md`

This is where types become real I/O.

---

## 2026-05-01 · M0.5 · Self-Hosted Fonts

**Status**: ✅ Done

### What was built

Three self-hosted typography families: Source Serif 4 (default reading), Inter (UI sans), JetBrains Mono (code). Latin subsets only — CJK falls back to system fonts (思源宋体 deferred to M9.3 per the implementation plan).

**Approach: `@fontsource` packages** (not manual woff2 download)

- `@fontsource/source-serif-4@5.2.9` — Adobe's open-source serif designed for long-form reading
- `@fontsource/inter@5.x` — modern UI sans with excellent screen rendering
- `@fontsource/jetbrains-mono@5.x` — distinctive monospace with strong glyphs

**CSS imports added to `src/styles/globals.css`** (before `@theme` so font-families resolve immediately):

```css
@import '@fontsource/source-serif-4/latin-400.css';
@import '@fontsource/source-serif-4/latin-400-italic.css';
@import '@fontsource/source-serif-4/latin-600.css';
@import '@fontsource/inter/latin-400.css';
@import '@fontsource/inter/latin-500.css';
@import '@fontsource/jetbrains-mono/latin-400.css';
```

### Architecture decisions

- **`@fontsource` over manual woff2 download** — npm-managed, version-controlled, predictable. Vite hashes filenames and bundles them; no manual `public/fonts/` dance. Supports tree-shaking unused weights.
- **Latin subsets only** — Cyrillic, Greek, Vietnamese, etc. unused in our UI chrome. Total font weight: ~130 KB woff2 (split across 6 files, loaded async). User's vault Chinese content rendered via system 思源宋体/PingFang fallback in stack.
- **Three weights × serif** — 400 (body), 400-italic (taglines, callouts), 600 (wordmark, headings). No 700 — 600 is strong enough; brand voice is "literary, not aggressive."
- **Two weights × Inter** — 400 (body UI), 500 (button labels). Skip 600+ to keep bundle lean.
- **One weight × JetBrains Mono** — 400 only. Code is monospace, not "weighted" expression.
- **`font-display: swap`** (default in @fontsource) — browser renders fallback (Georgia/system) immediately, swaps to web font when loaded. Brief FOUT acceptable; no FOIT (invisible-text flash).
- **No `<link rel="preload">` injected** — Vite hashes file paths at build time, breaking static preload tags. FOUT is brief enough to skip preload optimization in MVP. Revisit in M9 if perceived as a problem.
- **`.woff` legacy fallback files included** — @fontsource ships both woff2 and woff. Modern browsers (our targets) use woff2; .woff sits unused on CDN. Acceptable bundle waste.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → 8/8 passing
- `pnpm build` → 584 ms; bundle now includes 6 woff2 (~130 KB total) loaded async; main JS bundle unchanged (91 KB gzipped)
- Dev server smoke test: HTTP GET on `/source-serif-4-latin-400-normal.woff2` → 200, 20088 bytes (matches build output)

### Bundle impact

| Asset                           | Size        |
| ------------------------------- | ----------- |
| Source Serif 4 latin-400        | 20.09 KB    |
| Source Serif 4 latin-400-italic | 20.09 KB    |
| Source Serif 4 latin-600        | 21.53 KB    |
| Inter latin-400                 | 23.66 KB    |
| Inter latin-500                 | 24.27 KB    |
| JetBrains Mono latin-400        | 21.17 KB    |
| **Total woff2**                 | **~131 KB** |

These load asynchronously after the initial JS/CSS — no blocking impact on time-to-interactive.

### Issues / Notes

- None blocking. FOUT (brief Georgia → Source Serif swap) is the trade-off chosen. Looks fine in browser.

### Next step

**M1.1 — Define `VaultFileSystem` interface**

End of Milestone 0 (project bootstrap). Begin Milestone 1 (first real render).

`src/core/vault/types.ts`:

- Types: `VaultFile`, `VaultDirectory`, `VaultEntry`
- Interface: `VaultFileSystem` with `id`, `name`, `list`, `walk`, `readText`, `readBinary`, `getBlobURL`, `hasPermission`, `requestPermission`

This is the foundational abstraction. Every adapter (FSAPI, Sample, future Tauri) implements this interface. The rest of the app only sees the interface.

---

## 2026-05-01 · git init + M0.4 · Routing Scaffold

**Status**: ✅ Done

### What was built

#### git init

Repository initialized on `main` branch with hardened `.gitignore` (categorized: deps, build, caches, TS, tests, editors, OS, logs, secrets, local-only). First commit covers M0.1–M0.3 with milestone-tagged message.

#### M0.4 — React Router v7 routing scaffold

**Files created**:

- `src/app/router.tsx` — `createBrowserRouter` with route tree
- `src/app/AppShell.tsx` — layout component with header + `<Outlet />`
- `src/ui/landing/LandingPage.tsx` — wordmark + tagline + "Enter the app" link (moved from App.tsx)
- `src/ui/reading-shell/VaultHome.tsx` — placeholder reading vaultId from URL
- `src/ui/reading-shell/DocumentPage.tsx` — placeholder reading vaultId + splat path
- `src/ui/reading-shell/NoVaultSelected.tsx` — `/app` index placeholder

**Files modified**:

- `src/App.tsx` — reduced to thin `<RouterProvider>` wrapper
- `src/App.test.tsx` — removed (replaced by per-component tests)

**Tests added**:

- `src/ui/landing/LandingPage.test.tsx` — 4 tests (wordmark, both taglines, link href)
- `src/app/router.test.tsx` — 4 tests (each route renders correct placeholder; `createMemoryRouter` for testability)

### Route tree

```
/                        → LandingPage
/app                     → AppShell
  ├─ (index)             → NoVaultSelected
  ├─ :vaultId            → VaultHome
  └─ :vaultId/*          → DocumentPage
```

### Architecture decisions

- **`createBrowserRouter` + `RouterProvider`** — the data-router API. Supports loaders/actions later; cleaner than legacy `<BrowserRouter>`.
- **`AppShell` as parent route with `<Outlet />`** — header persists across vault pages; child routes mount in the outlet.
- **Splat (`*`) for file paths** — file paths within a vault contain `/`; React Router's splat captures arbitrary depth into `params['*']`.
- **`NoVaultSelected` extracted to its own file** — fast-refresh requires single-export-component files. Inline placeholder triggered ESLint warning; extracting it kept lint at zero warnings.
- **Per-component test files** — colocated with components; `MemoryRouter` wraps components that use Router hooks; `createMemoryRouter` used to test the full route tree.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all files conformant
- `pnpm test` → 8/8 tests passing in 89ms
- `pnpm build` → 527ms; 91.29 KB gzipped JS + 3.57 KB CSS

### Issues / Notes

- **Vite 5/7 type conflict surfaced during `pnpm build`**: vitest 2.x bundled vite 5 types, conflicting with our top-level vite 7. Fix: upgraded `vitest` and `@vitest/ui` to v3 (which bundles vite 7). Build clean afterward.
- **react-refresh ESLint warning** on first router.tsx draft (mixed component + non-component exports). Fix: extracted `NoVaultSelected` to its own file. Lint back to zero warnings.
- **Bundle growth**: 91 KB gzipped (vs 60 KB before). The +31 KB is React Router. Within budget (250 KB target for initial JS).

### Versions installed

| Package      | Version |
| ------------ | ------- |
| react-router | 7.14.2  |
| vitest       | 3.2.4   |
| @vitest/ui   | 3.2.4   |

### Next step

**M0.5 — Self-host fonts (Source Serif 4, Inter, JetBrains Mono)**

- Place woff2 files in `public/fonts/`
- Add `@font-face` declarations to `globals.css`
- `<link rel="preload">` for the most common weights to avoid FOUC
- Verify wordmark renders in actual Source Serif (not the fallback Georgia)
- Chinese fallback to system fonts (思源宋体 deferred to M9.3)

---

## 2026-05-01 · M0.3 · Lint + Format + Test Toolchain

**Status**: ✅ Done

### What was built

Industrial-grade dev tooling: ESLint 9 flat config with type-aware rules, Prettier with sensible defaults, Vitest with React Testing Library.

**Files created**:

- `eslint.config.js` — ESLint 9 flat config; type-checked rules (`recommendedTypeChecked` + `stylisticTypeChecked`); React hooks + react-refresh plugins; relaxed rules for tests + config files
- `.prettierrc.json` — single quotes, no semis, trailing commas, 80-char width; markdown override `proseWrap: preserve`
- `.prettierignore` — dist, node_modules, lockfile
- `vitest.config.ts` — separate from `vite.config.ts`; jsdom environment, globals enabled, v8 coverage
- `src/setup-tests.ts` — `@testing-library/jest-dom/vitest` matchers + `cleanup()` afterEach
- `src/App.test.tsx` — 3 tests verifying wordmark + both taglines render

**Files modified**:

- `package.json` — replaced placeholder scripts with real ones; added `lint:fix`, `test:watch`, `test:ui`, `test:coverage`, and a unified `check` pipeline
- `tsconfig.app.json` — added `vitest/globals` + `@testing-library/jest-dom` to `types`
- `tsconfig.node.json` — added `vitest.config.ts` and `eslint.config.js` to includes (so lint can typecheck them)

### Architecture decisions

- **Type-aware ESLint** (`recommendedTypeChecked`) — slower than syntactic rules but catches deeper issues (no-unsafe-assignment, no-floating-promises). Worth the cost.
- **Separate `vitest.config.ts`** — keeps build config and test config independent. They duplicate the alias declaration (~5 lines), small price for cleaner separation.
- **`eslint-config-prettier` last in extends chain** — disables ESLint stylistic rules that fight Prettier.
- **`react-refresh/only-export-components` rule** — Vite-specific; warns when a file exports both components and non-components (breaks fast refresh).
- **`@typescript-eslint/no-misused-promises` with `checksVoidReturn: false`** — allows `onClick={async () => ...}` which is the React idiomatic pattern.
- **`pnpm check` script** — single command runs typecheck → lint → format:check → test in sequence. Makes CI integration trivial later.
- **No husky / lint-staged in MVP** — pre-commit hooks add friction for solo dev; we'll add when we have collaborators.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings (with `--max-warnings 0`)
- `pnpm format` → 19 files auto-formatted on first run; subsequent `format:check` clean
- `pnpm test` → 3/3 tests passing in 38ms
- `pnpm check` → all 4 stages pass

### Versions installed

| Package                     | Version |
| --------------------------- | ------- |
| eslint                      | 9.39.4  |
| typescript-eslint           | 8.59.1  |
| eslint-plugin-react-hooks   | 5.2.0   |
| eslint-plugin-react-refresh | 0.4.26  |
| eslint-config-prettier      | 9.1.2   |
| prettier                    | 3.8.3   |
| vitest                      | 2.1.9   |
| @testing-library/react      | 16.3.2  |
| @testing-library/jest-dom   | 6.9.1   |
| @testing-library/user-event | 14.6.1  |
| jsdom                       | 25.0.1  |

### Issues / Notes

- Prettier auto-formatted 19 documentation files on first run (table column alignment, trailing whitespace). Markdown `proseWrap: preserve` ensured prose wrapping was untouched.
- Initial `lint` errored because `vitest.config.ts` wasn't in any tsconfig project; fixed by adding to `tsconfig.node.json` includes.

### Next step

**M0.4 — Routing scaffold (React Router v7)**

Install `react-router`, define route tree:

- `/` → `LandingPage` placeholder
- `/app` → `AppShell` placeholder
- `/app/:vaultId` → `VaultHome` placeholder
- `/app/:vaultId/*` → `DocumentPage` placeholder

Each placeholder renders its name and the URL params it received. Router defined in `src/app/router.tsx`.

---

## 2026-05-01 · M0.2 · Tailwind v4 + Brand Tokens

**Status**: ✅ Done

### What was built

Tailwind CSS v4 integrated; brand color system and theme architecture in place.

**Files created/modified**:

- `src/styles/globals.css` — full theme system with @theme + 4 theme classes + auto theme
- `vite.config.ts` — added `@tailwindcss/vite` plugin
- `src/main.tsx` — imports globals.css
- `src/App.tsx` — Sepia-styled wordmark layout with primary + supporting tagline
- `index.html` — `body` wrapped in `theme-sepia` class

### Architecture decisions

- **Two-layer token system**:
  1. **Brand constants** (`--color-brand-*`) registered in `@theme` → become Tailwind utilities (`bg-brand-cream`, `text-brand-gold`)
  2. **Semantic tokens** (`--color-bg`, `--color-text`, etc.) live in plain CSS, redefined by `.theme-*` classes
- **Components reference semantic tokens via `style={{ color: 'var(--color-text)' }}`** rather than Tailwind utility classes for theme-aware styles. This keeps theming in one place (CSS variables) and avoids generating multiple Tailwind variants per theme.
- **`.theme-sepia`** is also assigned to `:root` so it's the default — components don't break if theme class is missing.
- **`prefers-color-scheme`** drives `.theme-auto` (sepia in light, dark in dark).
- **`prefers-reduced-motion`** respected globally — disables animations.
- **Theme transitions**: 200ms ease for `background-color` and `color` on `body` — instant feel, but no flash on switch.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm build`: succeeded in 385ms
- Bundle: CSS 11.98 KB (3.26 KB gzipped) + JS 60.93 KB gzipped — total ~64 KB initial load
- Dev server smoke test: HTML serves with `theme-sepia` body class; CSS contains all 4 theme variable sets + base layer styles + Tailwind utilities

### Issues / Notes

- Port 5173 was occupied by another local project (swil-social). Vite auto-picked 5174. No action needed.
- `@theme` in Tailwind v4 only auto-generates utilities for tokens prefixed `--color-*`, `--font-*`, etc. Generic CSS variables for theming are kept outside `@theme` for cleaner separation.

### Next step

**M0.3 — ESLint + Prettier + Vitest**

Set up the dev tooling layer. Eslint with @typescript-eslint, react, react-hooks, import-order rules. Prettier with sensible defaults. Vitest config extending Vite. `pnpm lint`, `pnpm format`, `pnpm test` scripts that actually do something.

---

## 2026-05-01 · M0.1 · Project Bootstrap

**Status**: ✅ Done

### What was built

Initial Vite + React 19 + TypeScript project skeleton.

**Files created**:

- `package.json` — name, scripts, dep declarations
- `tsconfig.json` (project references), `tsconfig.app.json` (strict app config), `tsconfig.node.json` (vite config)
- `vite.config.ts` — `@/*` alias to `src/*`, ES2022 build target, sourcemaps on
- `index.html` — minimal shell with theme-color = brand cream
- `src/main.tsx` — entrypoint with React 19 `createRoot`, StrictMode, fail-loud root check
- `src/App.tsx` — placeholder rendering "SwilRead"
- `src/vite-env.d.ts` — Vite client types
- `.gitignore`, `.editorconfig`, `.nvmrc` (Node 22), `.npmrc`

### Decisions made

- **TypeScript strict + `noUncheckedIndexedAccess`** — enforced from day one to avoid retrofitting
- **`verbatimModuleSyntax: true`** — forces explicit `import type` for types; prevents accidental side-effect imports
- **Project references** (`tsconfig.app` + `tsconfig.node`) — separates app code from build config; cleaner type isolation
- **`engine-strict=true`** in `.npmrc` — enforces Node 22 minimum
- **No ESLint/Prettier yet** — deferred to M0.3 to keep M0.1 atomic

### Verification

- `pnpm install`: 71 packages, no errors
- `pnpm typecheck`: 0 errors
- `pnpm build`: succeeded in 370ms; bundle 60.72 KB gzipped (vs 250 KB budget for initial JS)

### Versions installed

| Package              | Version  |
| -------------------- | -------- |
| react                | 19.2.5   |
| react-dom            | 19.2.5   |
| vite                 | 7.3.2    |
| typescript           | 5.9.3    |
| @vitejs/plugin-react | 4.7.0    |
| @types/node          | 22.19.17 |
| @types/react         | 19.2.14  |
| @types/react-dom     | 19.2.3   |

### Issues / Notes

- None blocking
- `pnpm` warned about ignored build script for `esbuild`. This is expected — esbuild postinstall is a known no-op with pnpm strict mode and doesn't affect functionality.

### Next step

**M0.2 — Tailwind CSS v4 + brand color tokens**

Set up Tailwind, define brand CSS variables (`--brand-gold`, `--brand-cream`, etc.), apply Sepia background to `<App />`, render the wordmark in Source Serif (font task itself is M0.5 — for now use a placeholder serif fallback).
