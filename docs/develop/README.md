# SwilRead — Develop Docs Index

> Status: Ready for implementation · Last updated: 2026-05-01

The product is fully designed. These documents tell you HOW to build it.

## Read in This Order

| #   | File                                                               | What it gives you                                                                        |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | [architecture-overview.md](./architecture-overview.md)             | Module map, layer boundaries, the `VaultFileSystem` interface, render pipeline structure |
| 2   | [tech-stack.md](./tech-stack.md)                                   | Concrete library choices with versions and bundle budget                                 |
| 3   | [engineering-principles.md](./engineering-principles.md)           | Code style, naming, architecture rules, testing philosophy, definition of done           |
| 4   | [phase-1-implementation-plan.md](./phase-1-implementation-plan.md) | **The ordered task list.** Execute these tasks in milestone order.                       |
| 5   | [work-log.md](./work-log.md)                                       | Reverse-chronological implementation log. Update on every task completion.               |

## Current Status

- ✅ **M0.1** — Project bootstrap (Vite + React 19 + TS strict)
- ✅ **M0.2** — Tailwind v4 + brand tokens + 4-theme architecture
- ✅ **M0.3** — ESLint 9 + Prettier + Vitest + RTL; unified `pnpm check` pipeline
- ✅ **M0.4** — React Router v7 scaffold; 4 placeholder routes; 8 tests passing
- ✅ **M0.5** — Self-hosted fonts (Source Serif 4, Inter, JetBrains Mono) via @fontsource
- ✅ **Milestone 0 complete** — project bootstrap done
- ✅ **M1.1** — `VaultFileSystem` interface + path utilities (34 unit tests)
- ✅ **M1.2** — `FSAPIVaultAdapter` (32 unit tests with FSAPI mock)
- ✅ **M1.3** — Folder picker UI + session vault registry; pick→register→navigate flow works end-to-end
- ✅ **M1.4** — Zustand `useVaultStore` + Dexie persistence; registry shim deleted
- ✅ **M1.5** — Markdown rendering pipeline (CommonMark + GFM + frontmatter + sanitization)
- ✅ **M1.6** — DocumentPage renders real Markdown end-to-end (126 tests passing)
- ✅ **Milestone 1 complete** — first real render from a real vault works
- ✅ **M3.2 + M3.3** — Wikilinks: parse, resolve, click-to-navigate
- ✅ **M3.5 + M3.6** — Callouts: 14 canonical types + 12 aliases, themed colors, Lucide icons
- ✅ **M3.12** — Shiki code highlighting (dual-theme, 27 langs bundled, async pipeline) (168 tests passing)
- 🔜 Pick next: M2.3 theme store + switcher (lets dual-theme actually show), M3.7+M3.8 embeds, or M3.9 highlights

## Before Coding

Read the design docs in `docs/design/` first. The product is fully designed — your job is implementation, not redesign.

## Phase 1 Milestones at a Glance

| Milestone | Goal                                                                     |
| --------- | ------------------------------------------------------------------------ |
| **M0**    | Project bootstrap (Vite, Tailwind, fonts, routing)                       |
| **M1**    | First real render: open vault, see one note in Sepia ⭐ key milestone    |
| **M2**    | Reading shell + 5 themes + zen mode                                      |
| **M3**    | Markdown completeness (wikilinks, callouts, embeds, math, code, mermaid) |
| **M4**    | Navigation (file tree, backlinks, TOC, recent files)                     |
| **M5**    | ⌘K command palette with multiple modes                                   |
| **M6**    | Multi-vault support and returning user flow                              |
| **M7**    | Universal file reader (txt, csv, json, html, code, media)                |
| **M8**    | Landing page + sample vault                                              |
| **M9**    | Polish, perf, mobile, ship                                               |

**M1 is the proof-of-concept moment.** Once a real knowledge note from Wilson's vault renders beautifully, the project is real.
