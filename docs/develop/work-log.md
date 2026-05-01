# SwilRead — Work Log

> Reverse chronological log of implementation work. Most recent entries first.

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
