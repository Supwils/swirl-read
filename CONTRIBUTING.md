# Contributing to SwilRead

Thanks for considering a contribution. SwilRead is a small, opinionated
project — most of the value comes from the things we say "no" to. Read
this once before opening a PR.

## Product principles (non-negotiable)

These are the bedrock. PRs that violate any of them get closed regardless
of code quality:

- **Local-first.** Vault content never auto-uploads to anything.
- **Read-first.** The reading surface is the product. Editing, when it
  arrives, is a quick repair inside a reading session — not a writing
  workspace.
- **No AI in MVP.** Phase 1 ships zero AI features.
- **Reading is sacred.** Every UI decision must serve the reader. If it
  doesn't, cut it.
- **No hidden telemetry.** Ever.

If your idea is great but conflicts with the above, open a discussion
issue first — it might still land in a different shape, or it might be
better as a fork.

## Setup

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # run the suite once
pnpm check        # typecheck + lint + format:check + test
```

`pnpm check` is the gate every PR must pass.

## Picking something to work on

- The execution truth source is
  [`docs/develop/README.md`](docs/develop/README.md). The "Pick next"
  line at the bottom lists candidate milestones in priority order.
- Open issues labelled `good first issue` are scoped to ~1 day of work.
- Anything labelled `polish` is non-blocking — don't worry about racing
  someone for those.
- For larger ideas, open a discussion before writing code.

## Engineering style

These conventions are not preferences — they're the difference between a
codebase that stays calm and one that doesn't. See
[`docs/develop/engineering-principles.md`](docs/develop/engineering-principles.md)
for the full version. The short list:

- **TypeScript strict.** No `any` without justification. Discriminated
  unions over optional fields.
- **Pure helpers** in `core/`. **Components** in `ui/`. Stores depend on
  `core/`, never the other way around.
- **Per-vault state is keyed by `vaultId`.** Recents, scroll memory,
  backlinks, tag index, walked-files cache, etc. — every cache must
  invalidate on `removeVault`.
- **Lazy chunks** for anything heavy. Heavy = "more than 5 KB gz" or
  "ships a runtime the user might never use." See `MermaidDiagram` →
  `MermaidRenderer` for the canonical pattern.
- **Hotkey hooks** must guard editable targets (`<input>`, `<textarea>`,
  `<select>`, `contenteditable`) and reject modifier-bearing combos that
  browsers reserve.
- **Comments only when the WHY is non-obvious.** Default to none. Don't
  describe what the code does — name things well instead.
- **No utility-class soup.** Tailwind v4 is configured with semantic
  theme tokens; reach for `var(--color-text)`, not 17 nested `text-…`
  utilities.

## Commit messages

We don't enforce conventional-commits. Aim for:

- A short imperative subject ("Add JSON tree renderer", not "added json
  tree" / "feat: add json tree (M7.4)").
- Body explaining **why** the change exists, not what it does (the diff
  shows what).
- A milestone reference where relevant (`M7.4`, `RX5`, `M9.1`) — those
  thread back to `docs/develop/work-log.md`.

## Tests

- Unit tests next to the file they cover (`Component.test.tsx`).
- Use `vitest` + `@testing-library/react` + `@testing-library/user-event`.
- Match real DOM queries (`getByRole`, `findByText`, `getByTestId`) over
  shallow rendering.
- For pipeline work, integration tests that go through `renderMarkdown`
  beat unit tests of individual remark plugins. The pipeline is what we
  ship.
- Don't snapshot HTML. Snapshot tests on rendered output rot fast and
  hide regressions.

## Running against the real vault

The canonical fixture is the maintainer's own vault. If you don't have
access to that, point the dev server at any folder of `.md` files. The
sample vault on the landing page works for most cases.

## Pull request flow

1. Fork, branch, code.
2. Run `pnpm check` until it's clean.
3. Update `docs/develop/work-log.md` with a reverse-chronological entry
   (look at the existing entries for shape).
4. Update `docs/develop/README.md`'s status line.
5. Open the PR.

PRs that don't update the work log will be asked to before review — the
work log is the project's institutional memory.

## Code of conduct

See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Short version: be kind,
assume good faith, don't be a jerk.
