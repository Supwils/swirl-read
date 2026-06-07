# CLAUDE.md — SwirlRead

This file is the entry point for AI agents working on this codebase. Read this first.

## What This Project Is

**SwirlRead** — a local-first, web-based, read-optimized interface for Markdown knowledge vaults.

Tagline: **Read your knowledge. Beautifully.**
Sub-tagline: **A reading sanctuary for the AI era.**

## Project State

- **Phase**: Phase 1 complete · Phase 2 lightweight editing feature-complete (2A → 2D, 2026-05-03) · Phase 3 first cut shipped 2026-05-07; rich AI answer card + Xiaomi MiMo provider + multi-provider default + AI review cards shipped 2026-05-09 · **Browse + Workspace refresh (Pebble Garden, FileShelf, dual-pane Workspace, panes-store) shipped 2026-05-13**. Pebble Garden replaces the vault-root file tree (`/app/:vaultId` index route); FileShelf replaces the reading-view sidebar by default (legacy tree behind `settings.useLegacyTree`); Workspace wraps DocumentPage with single|dual pane support, ⌘\ / ⌘W / ⌘1 / ⌘2 hotkeys, per-pane scroll memory. Chrome bar exposes Light/Dark + Single/Dual segmented toggles. **Reading-experience wave + PWA shipped 2026-06-06/07**: full-window knowledge graph (`__graph__` route, force-directed SVG, pan/zoom/two-pointer pinch) + an inline document-foot local-graph panel reusing the same engine; container-query responsive reading column + shell density/touch/wide-rails; HTML files render their relative local assets (rewritten to vault `blob:` URLs) themed to the app theme; highlights & annotations (W3C quote anchoring over rendered text + a conservative Dice-bigram fuzzy fallback, Dexie v11, orphan-safe) with a "Make review cards" entry that distils highlights into the existing card generator; legacy sidebar GraphView retired (the `__graph__` route + inline panel are the only graph surfaces now); PWA via `vite-plugin-pwa` (installable + offline shell, shell-only precache, fonts/chunks runtime-cached, SW can't touch vault content since reads go through the FSAPI handle). See `docs/design/reading-experience.md` (2026-05-13 update) and `docs/new-design/`.
- **Tests**: 1087 passing (947 at the 2026-05-13 browse refresh; the 2026-06 reading-experience wave + PWA added the knowledge-graph, responsive-shell, HTML-asset-rewrite, inline-local-graph, highlights + fuzzy-anchoring, and review-from-highlights suites). Bundle: **main 272.12 KB gz**, CSS **32.36 KB gz** (the highlights anchor/decorate logic and the `core/graph` engine stay in the MAIN bundle — they must run synchronously to avoid a flash of un-highlighted / un-rendered content). `vite-plugin-pwa` emits `sw.js` + `manifest.webmanifest` to the dist root (outside the `assets/` ceilings) and precaches the shell only (~1.07 MB; fonts + lazy chunks runtime-cached). Lazy chunks now also include `GraphPage-*.js`, `LocalGraphPanel-*.js`, and `HighlightPopover-*.js`, plus the earlier `DocumentEditSurface-*.js` **179.23 KB gz** (CodeMirror; loads on first Edit click), `CommandPalette-*.js` **9.48 KB gz** (cmdk + ⌘K + `?` ask + review action), `PaletteAskAnswer-*.js` **0.46 KB gz** (rich AI answer renderer), `ReviewPage-*.js` **2.97 KB gz** (review surface), `GenerateCardsDialog-*.js` **3.66 KB gz** (card generation modal), `SettingsPanel-*.js` **3.86 KB gz**, `ConfirmDialog-*.js` **0.56 KB gz**. Heavy renderers (Mermaid, KaTeX, Floating UI, all six M7 file renderers, command palette, AI answer surface, review surface, tag panel, TOC, shortcuts help, CodeMirror runtime, app-wide confirm dialog) live in lazy chunks — keep new heavy modules on the same pattern. **Bundle ceilings enforced by `pnpm bundle:check`** which reads `bundle-size.json`; raising a limit requires a justification in the commit.
- **Per-vault cleanup goes through `src/stores/vault-lifecycle.ts`.** Any new per-vault state owner (store or core module) MUST register a `vault-lifecycle` deletion hook at module load instead of asking `vault-store.removeVault` to remember about it. The hook owns both the in-memory drop and any Dexie row delete for the vault — keep those two halves together so a single forgetVault never leaves orphans.
- **Every lazy mount and every renderer that may throw must be wrapped in `<ChunkBoundary>`** (`src/ui/components/ChunkBoundary.tsx`). It combines Suspense + ErrorBoundary so a single misbehaving chunk shows a "this part crashed" card instead of bringing down the whole surface. Use `inline` for prose-embedded renderers (Mermaid, KaTeX) so the failure shows as a chip rather than a card.
- **Stack**: Vite 7 + React 19 + TypeScript 5.9 strict + Tailwind v4 + React Router 7
- **Platform**: Web App via File System Access API (desktop browsers; iOS Safari known-broken). Tauri desktop deferred.
- **Truth source order is strict.** When the docs disagree, `docs/develop/README.md` wins, then `docs/develop/phase-1-implementation-plan.md`, then `docs/develop/work-log.md`. Never trust this file's high-level summary over those three.

### Truth source for "what's done / what's next"

Two files are the **execution truth source**. If they disagree with anything else (this file included), they win:

1. [`docs/develop/README.md`](docs/develop/README.md) — current milestone status
2. [`docs/develop/phase-1-implementation-plan.md`](docs/develop/phase-1-implementation-plan.md) — ordered task list with completion markers
3. [`docs/develop/work-log.md`](docs/develop/work-log.md) — chronological details, decisions, issues per task

Update these two-plus-one whenever a task moves. The rest of the docs follow.

## Required Reading Before Coding

The product is fully designed. Read these before writing any code:

1. `docs/design/vision.md` — Why this product exists; the AI-era reading philosophy
2. `docs/design/brand-and-positioning.md` — Tagline, voice, visual identity
3. `docs/design/reading-experience.md` — Layout, typography, themes, interactions
4. `docs/design/rendering-spec.md` — Markdown completeness contract + file format support
5. `docs/design/ftue-and-vault-model.md` — First-time UX, single-vault structure, multi-vault
6. `docs/develop/architecture-overview.md` — How the code is organized
7. `docs/develop/tech-stack.md` — What libraries to use
8. `docs/develop/engineering-principles.md` — Code conventions
9. `docs/develop/phase-1-implementation-plan.md` — Ordered task list to execute

## Critical Constraints

These are non-negotiable. Violating them invalidates the product:

- **Local-first**: vault content NEVER auto-uploads to any server
- **Read-first MVP**: no editing UI in Phase 1. If editing lands later, keep it limited to lightweight current-document text edits rather than a full authoring workspace
- **No AI in MVP**: Phase 1 ships zero AI features
- **Vault-aware, not generic**: support `*-map.md`, wikilinks, callouts, embeds — Wilson's vault is the test fixture
- **Reading is sacred**: every UI decision must serve the reader; if it doesn't, cut it
- **Open source from day one**: MIT license; no hidden telemetry

## Test Vault

The canonical test vault is the user's own knowledge OS at `/Users/supwils/supwilsoft/supwil/`. Use it for end-to-end testing whenever possible — it covers every Markdown feature we claim to support.

## Style

- Match the brand voice: literate, confident, warm, slow. No "supercharged" copy.
- Comments: only when the WHY is non-obvious. Default to none.
- Variable names should be descriptive enough that comments aren't needed.
- TypeScript strict mode; no `any` without justification.

## Communication Language

- **Default chat language is Simplified Chinese (中文).** All assistant-facing prose — answers, status updates, plan summaries, end-of-turn recaps — must be in Chinese unless the user explicitly asks (in this session) for a different language. Do not switch back to English on your own initiative.
- **Code, identifiers, comments, commit messages, log strings, and docs stay in English** (this is the existing convention — do not translate them).
- This rule persists across turns and conversations until the user explicitly overrides it in chat.

## Working Conventions Learned On The Job

- **Never commit or push without explicit user instruction.** Do not run `git commit` or `git push` (or any variant) unless the user explicitly asks. Finish all code changes first; wait for the user to say "commit" or "push".
- **One approval = one operation.** A "commit this" / "push" instruction authorizes that single act on the changes that exist when the instruction is given. It does NOT carry over to subsequent independent changes — every new diff requires its own explicit approval. When in doubt, finish the work, summarize what's pending, and wait.
- **Never add `Co-Authored-By` to commit messages.** Commits should show only the user as author — no Claude attribution line.
- **CI is local — never on GitHub.** There is no GitHub Actions workflow gating PRs. Before every `git commit` (and definitely before every `git push`), run **`pnpm check:full`** — it chains typecheck → lint → format:check → test → build → bundle:check and is the single source of truth for "is this change shippable". Treat it like a pre-commit hook you run by hand. Don't push if any step fails. Don't add a GitHub workflow back without an explicit ask — the local pipeline is faster, costs no minutes, and gives you the same signal.
- **Gate every change** with `pnpm check:full` (or, when iterating, the cheaper `pnpm check`). Lint runs at `--max-warnings 0` — even react-refresh advisories fail the build, so split helpers out of component files when needed (see `src/ui/reading-shell/file-renderer-utils.ts` for the pattern).
- **Renderer chunks must stay lazy.** Mermaid, KaTeX, Shiki extra grammars, the command palette, the tags panel, the TOC, and the ShortcutsHelp overlay all sit in their own dynamic-import chunks. New heavy renderers must follow the same pattern (`MermaidDiagram` → `MermaidRenderer` is the canonical reference).
- **Per-vault state is keyed by `vaultId`.** Recents, scroll memory, backlinks, tag index, walked files, file-tree listings, and full-text index all separate per vault and must invalidate on `removeVault` (`forgetVault()` / `invalidate*` helpers). Don't add a new per-vault cache without wiring its invalidator into the same fan-out.
- **Hotkeys must guard editable targets.** Every global hook (`use-zen-mode-hotkey`, `use-command-palette-hotkey`, `use-shortcuts-help-hotkey`) refuses to fire when the active element is `<input>` / `<textarea>` / `<select>` / `contenteditable`, and rejects modifier-bearing combos that browsers reserve. Match that pattern for any new global key.
- **Test against the live vault when in doubt.** `/Users/supwils/supwilsoft/supwil/` is the canonical fixture; CJK paths, mixed Chinese/English content, callouts, and `*-map.md` sections are all there.
