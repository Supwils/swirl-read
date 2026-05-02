# SwilRead — Tech Stack

> Status: Decided 2026-05-01

Concrete library choices with versions and rationale. Add a dependency only if it's listed here or has explicit justification.

---

## Build & Dev

| Tool           | Version | Why                                                                                               |
| -------------- | ------- | ------------------------------------------------------------------------------------------------- |
| **Vite**       | ^7.0    | Fast dev server, native ESM, mature plugin ecosystem                                              |
| **TypeScript** | ^5.6    | Strict mode required                                                                              |
| **pnpm**       | ^10     | Faster, less disk than npm; required for monorepo-friendliness later                              |
| **Vitest**     | ^3      | Test runner; **must be v3+ for Vite 7 compatibility** (v2 ships vite 5 types and breaks `tsc -b`) |
| **Playwright** | ^1.48   | E2E tests against the dev server                                                                  |

---

## Framework

| Library          | Version | Why                                            |
| ---------------- | ------- | ---------------------------------------------- |
| **React**        | ^19     | Latest stable; `use()` hook, async transitions |
| **React Router** | ^7      | URL-driven state, matches our routing model    |

---

## Styling

| Library            | Version | Why                                                    |
| ------------------ | ------- | ------------------------------------------------------ |
| **Tailwind CSS**   | ^4      | Utility-first; aligns with brand color tokens          |
| **CSS Variables**  | native  | Theme switching via CSS vars, not Tailwind class swaps |
| **clsx**           | ^2      | Class composition                                      |
| **tailwind-merge** | ^2      | Merge Tailwind classes safely                          |

We do NOT use:

- styled-components / emotion (runtime CSS-in-JS — bundle and runtime cost)
- CSS modules (preferring Tailwind everywhere for consistency)
- Sass / Less (Tailwind covers our needs)

---

## State Management

| Library     | Version              | Why                                         |
| ----------- | -------------------- | ------------------------------------------- |
| **Zustand** | ^5                   | Minimal, no provider wrapping, easy to test |
| **Immer**   | bundled with Zustand | Immutable updates without ceremony          |

We do NOT use:

- Redux (too heavy for this app's scope)
- Jotai (atoms are overkill here)
- React context for app state (only for theme/i18n)

---

## Persistence

| Library        | Version | Why                                           |
| -------------- | ------- | --------------------------------------------- |
| **Dexie**      | ^4      | Cleaner IndexedDB API; built-in migrations    |
| **idb-keyval** | ^6      | (Optional) For one-off simple key/value cases |

---

## Markdown Pipeline (`unified` ecosystem)

| Library                      | Version | Why                                                       |
| ---------------------------- | ------- | --------------------------------------------------------- |
| **unified**                  | ^11     | Pipeline core                                             |
| **remark-parse**             | ^11     | CommonMark parser                                         |
| **remark-gfm**               | ^4      | GitHub Flavored Markdown                                  |
| **remark-frontmatter**       | ^5      | YAML/TOML frontmatter                                     |
| **remark-math**              | ^6      | Math syntax → mdast                                       |
| **remark-rehype**            | ^11     | mdast → hast                                              |
| **rehype-katex**             | ^7      | Math rendering                                            |
| **rehype-sanitize**          | ^6      | XSS protection (with allowlist for our custom node types) |
| **rehype-react**             | ^8      | hast → React tree                                         |
| **hast-util-to-jsx-runtime** | ^2      | (alternative to rehype-react if needed)                   |

Custom plugins (we write these in `src/core/render/plugins/`):

- `remark-wikilink`
- `remark-callout`
- `remark-embed`
- `remark-highlight`

---

## Syntax Highlighting

| Library   | Version | Why                                                               |
| --------- | ------- | ----------------------------------------------------------------- |
| **shiki** | ^1.24   | VS Code-quality grammars; supports multiple themes; tree-shakable |

Bundle strategy: ship a curated set of common languages (TypeScript, JavaScript, Python, Rust, Go, Java, C++, Bash, JSON, YAML, SQL, CSS, HTML, Markdown). Lazy-load others on first use.

---

## Diagrams & Math

| Library     | Version | Why                                       |
| ----------- | ------- | ----------------------------------------- |
| **KaTeX**   | ^0.16   | Fast math rendering, smaller than MathJax |
| **mermaid** | ^11     | Diagram support                           |

Both lazy-loaded (only fetched when first encountered in content).

---

## Search

| Library        | Version | Why                                                  |
| -------------- | ------- | ---------------------------------------------------- |
| **MiniSearch** | ^7      | Lightweight, in-memory, supports custom tokenization |

For Chinese text: use `Intl.Segmenter` (browser native, no dependency) as the tokenizer.

---

## UI Primitives

| Library          | Version         | Why                                                                             |
| ---------------- | --------------- | ------------------------------------------------------------------------------- |
| **Radix UI**     | (per-component) | Accessible, unstyled primitives (dialog, dropdown, popover, scroll-area, toast) |
| **Floating UI**  | ^0.27           | For wikilink hover previews; precise positioning                                |
| **Lucide React** | ^0.468          | Icons; clean, consistent style; tree-shakable                                   |
| **cmdk**         | ^1              | Command palette base (the ⌘K UI)                                                |

We do NOT use:

- Material UI / Chakra / Mantine (too opinionated, fights our design language)
- Headless UI (Radix is more complete)

---

## Markdown Editing Surface (Phase 2 — not in MVP)

For future lightweight current-document source editing:

- **CodeMirror 6** — preferred choice for a calm, text-first Markdown editor with search, replace, history, and keyboard shortcuts
- Keep the editing surface single-document and source-based; no ProseMirror / TipTap authoring stack unless the product boundary changes substantially
- Not installed in Phase 1

---

## Utility

| Library         | Version | Why                                                      |
| --------------- | ------- | -------------------------------------------------------- |
| **date-fns**    | ^4      | Date formatting; tree-shakable                           |
| **DOMPurify**   | ^3      | HTML sanitization for inline HTML in markdown            |
| **gray-matter** | ^4      | (Alternative to remark-frontmatter for non-pipeline use) |

---

## Testing

| Library                         | Version | Why                                                                     |
| ------------------------------- | ------- | ----------------------------------------------------------------------- |
| **Vitest**                      | ^3      | Unit tests; v3 required for Vite 7 type compatibility (see Build & Dev) |
| **@vitest/ui**                  | ^3      | Browser-based test UI; pinned to vitest major                           |
| **@testing-library/react**      | ^16     | Component tests                                                         |
| **@testing-library/jest-dom**   | ^6      | DOM matchers (`toBeInTheDocument`, etc.)                                |
| **@testing-library/user-event** | ^14     | Realistic user interaction simulation                                   |
| **jsdom**                       | ^25     | DOM environment for unit tests                                          |
| **Playwright**                  | ^1.48   | E2E (deferred to M9.x)                                                  |
| **MSW**                         | ^2      | (If we ever need to mock network — unlikely in MVP)                     |

---

## Linting & Formatting

| Tool                                                                                     | Why                   |
| ---------------------------------------------------------------------------------------- | --------------------- |
| **ESLint** with `@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks` |                       |
| **Prettier**                                                                             | Code formatting       |
| **typescript-eslint --strict**                                                           | Catches common issues |

---

## Deployment (Phase 1)

- **Vercel** or **Netlify** — static hosting + edge config
- **GitHub Actions** for CI (lint, type-check, test, build)
- **Custom domain**: `swilread.app` (or whatever's available)

---

## Bundle Size Budget

| Asset                      | Budget              | Notes                                           |
| -------------------------- | ------------------- | ----------------------------------------------- |
| Initial JS (gzip)          | ≤ 250 KB            | Critical path: app shell + reading core         |
| Sample vault               | ≤ 200 KB compressed | Bundled or lazy-fetched                         |
| Shiki core                 | ≤ 100 KB            | Loaded on first code block                      |
| Mermaid                    | ≤ 200 KB            | Lazy, only when first mermaid block encountered |
| KaTeX                      | ≤ 150 KB            | Lazy, only when first math encountered          |
| Total first-page-with-math | ≤ 600 KB            | Acceptable for a content app                    |

Use `vite-bundle-visualizer` to monitor.

---

## Forbidden Dependencies (Without Explicit Approval)

These are tempting but break our principles:

- ❌ Any analytics SDK (PostHog, Mixpanel, etc.) without explicit opt-in design
- ❌ Any auth provider (Clerk, Auth0) — we have no accounts in MVP
- ❌ Any cloud storage SDK (Firebase, Supabase) — local-first
- ❌ Heavy date libraries (Moment, Luxon — we use date-fns)
- ❌ Lodash (use modern JS / individual `lodash-es` imports if absolutely needed)
- ❌ jQuery (no)
