# CLAUDE.md — SwirlRead

This file is the entry point for AI agents working on this codebase. Read this first.

## What This Project Is

**SwirlRead** — a local-first, web-based, read-optimized interface for Markdown knowledge vaults.

Tagline: **Read your knowledge. Beautifully.**
Sub-tagline: **A reading sanctuary for the AI era.**

## Project State

- **Phase**: Phase 1 complete — **M0–M7** shipped; **reader-experience craft pass** complete (RX1 / RX2 / RX3 / RX4 / RX5 / RX6 / RX7-DocumentPage); **M8 sample vault** end-to-end; **M9.1 / M9.2 / M9.3 / M9.4 / M9.5 / M9.6 / M9.7** all done; **M2.5 hover zones** done; **M7 polish complete**; **M9.8 launch surface** ready to deploy. **Phase 2 lightweight editing is feature-complete** as of 2026-05-03 — all four slices landed: 2A (`writeText` + FSAPI write + permissions), 2B (editor-store + dirty nav guard), 2C (DocumentEditSurface + CodeMirror 6 lazy chunk + read↔edit swap), 2D (`isReadOnly` capability gate + Radix confirm + useBlocker + editor prefs). See `docs/develop/lightweight-editing-plan.md` for the original spec; out-of-scope items (file create/rename/delete, multi-file editing, WYSIWYG, draft persistence) intentionally not addressed.
- **Tests**: 747 passing. Bundle: **main 257.75 KB gz**, CSS ~25.1 KB gz, plus a lazy `DocumentEditSurface-*.js` chunk **183.85 KB gz** (CodeMirror runtime; only loads on first Edit click) and a lazy `ConfirmDialog-*.js` chunk **0.56 KB gz** (Radix runtime is shared with SettingsPanel/ShortcutsHelp). Heavy renderers (Mermaid, KaTeX, Floating UI, all six M7 file renderers, command palette, tag panel, TOC, shortcuts help, **CodeMirror runtime**, **app-wide confirm dialog**) live in lazy chunks — keep new heavy modules on the same pattern.
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
- **Gate every change** with `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`. Lint runs at `--max-warnings 0` — even react-refresh advisories fail the build, so split helpers out of component files when needed (see `src/ui/reading-shell/file-renderer-utils.ts` for the pattern).
- **Renderer chunks must stay lazy.** Mermaid, KaTeX, Shiki extra grammars, the command palette, the tags panel, the TOC, and the ShortcutsHelp overlay all sit in their own dynamic-import chunks. New heavy renderers must follow the same pattern (`MermaidDiagram` → `MermaidRenderer` is the canonical reference).
- **Per-vault state is keyed by `vaultId`.** Recents, scroll memory, backlinks, tag index, walked files, file-tree listings, and full-text index all separate per vault and must invalidate on `removeVault` (`forgetVault()` / `invalidate*` helpers). Don't add a new per-vault cache without wiring its invalidator into the same fan-out.
- **Hotkeys must guard editable targets.** Every global hook (`use-zen-mode-hotkey`, `use-command-palette-hotkey`, `use-shortcuts-help-hotkey`) refuses to fire when the active element is `<input>` / `<textarea>` / `<select>` / `contenteditable`, and rejects modifier-bearing combos that browsers reserve. Match that pattern for any new global key.
- **Test against the live vault when in doubt.** `/Users/supwils/supwilsoft/supwil/` is the canonical fixture; CJK paths, mixed Chinese/English content, callouts, and `*-map.md` sections are all there.
