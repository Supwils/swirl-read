# CLAUDE.md — SwilRead

This file is the entry point for AI agents working on this codebase. Read this first.

## What This Project Is

**SwilRead** — a local-first, web-based, read-optimized interface for Markdown knowledge vaults.

Tagline: **Read your knowledge. Beautifully.**
Sub-tagline: **A reading sanctuary for the AI era.**

## Project State

- **Phase**: Pre-implementation (design complete, ready to build Phase 1)
- **Codebase**: Empty — `docs/` is the only populated directory
- **Stack target**: Vite + React 19 + TypeScript + Tailwind CSS v4
- **Platform**: Web App via File System Access API (Tauri desktop deferred)

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
- **Read-only in MVP**: no editing UI in Phase 1, period
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
