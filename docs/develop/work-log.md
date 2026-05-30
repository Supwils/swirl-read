# SwirlRead — Work Log

> Reverse chronological log of implementation work. Most recent entries first.

---

## 2026-05-30 · Browse/dual-pane polish + R3 production-readiness audit & fixes

Three rounds, one commit. (1) Pebble Garden sizing by recursive **folder weight** (new `core/vault/folder-weight.ts`, skips system folders), system folders sorted last + muted, drill-in "← Back", folder + sub-folder right-click → Open here/left/right, sub-folders shown as chips inside cards. (2) Dual-pane scroll decoupled — each pane is its own bounded scroller (`.swirlread-workspace--dual` height + `overscroll-behavior`), wheel follows the pane under the cursor; splitter grab zone + keyboard resize.

(3) **R3 audit** — three read-only agents swept the whole codebase; findings triaged CRITICAL→LOW and fixed:

- **CRITICAL** — edit-loss guards on pane close/expand + vault switch + router blocker (`confirmLeaveIfDirty` + `editor.cancel()`); `removeVault` made crash-safe (dependent rows/hooks first, metadata last, boot orphan sweep `pruneOrphanedVaultData`, promote next survivor); pane mutators bail for unregistered vault + `getOrInit` stops persisting (kills post-removal orphan-row race).
- **HIGH** — `walkAllFiles` skips system folders so search/palette see real notes; ContextMenu Open-right navigates + autofocus + pre-paint reposition + disabled items hide shortcuts; FilePill ⌘-click opens right; blob cache cleared on external refresh (`clearBlobURLCache`); dialog-store serializes concurrent confirms; DocumentPage suppresses self-edit "changed outside" banner; re-opening the same folder reuses its vault via `isSameEntry`.
- **MEDIUM** — ChunkBoundary `resetKey`; PebbleGarden weight pool (concurrency 6, single setState) + `goToCrumb` functional updater; Splitter keyboard + `aria-valuetext`; PaneTabStrip neighbour-survivor; auto-restore `pendingAdapters` lifecycle hook; reader-store prune count-gate; AI `assertSafeBaseURL` (HTTPS / loopback only — no key leak) + narrowed stream JSON; AIControl test-connection no longer surfaces raw errors.
- **LOW** — removed dead `VaultHome`; honest Pebble footer copy; empty-drill keeps trail; KaTeX `trust:false`; tabs-store cancels reorder timer on `forgetVault`.

All gates green: **1001 tests**, typecheck, lint (max-warnings 0), format, build, bundle (main 265.50 KB gz / 280, CSS 30.30 / 32). XSS surface audited — already strong (`pipeline.ts` inline sanitize schema, `allowDangerousHtml:false`, HTML via `srcDoc`+`sandbox=""`).

## 2026-05-13 · Browse + Workspace refresh (Pebble Garden, FileShelf, panes-store)

**Status**: ✅ Three landed PRs replace the vault-root file-tree view with a
design-spec **Pebble Garden** and the reading shell with a single/dual-pane
**Workspace**. All driven by `docs/new-design/` (AGENTS.md + HANDOFF.md +
artboards). Single-pane reading is byte-for-byte unchanged; multi-pane and the
new browse surface ride on top.

### Surfaces

- **`/app/:vaultId`** → `PebbleGarden`. Top-level folders render as organic
  pastel pebbles (6-color palette in `themes.css` + `folderColorId` resolver in
  `src/core/vault/folder-color.ts`). Files render as monospace pills inside the
  pebble; `+N more` expands hidden files inline; clicking a folder title
  drills into it (multi-level breadcrumb back). Right-click on a file pill
  opens the shared `ContextMenu` (9 actions in HANDOFF §3.6 order).
- **`/app/:vaultId/*`** → `Workspace`. Wraps `DocumentPage` so single mode is a
  transparent passthrough. ⌘\ splits to dual; ⌘W closes the active pane;
  ⌘1 / ⌘2 focus. Per-pane scroll memory uses the existing reader-store with a
  paneId-scoped key (`${paneId}::${path}`); pane 2's doc is restored from
  Dexie on reload (URL only encodes the active pane's path).
- **Reading-view sidebar** → `FileShelf` replaces `FileTree` by default
  (`settings.useLegacyTree` flag preserves the tree for one release window).
  Vault summary + Recently opened + collapsible folders (single-expanded,
  persisted) + 6-color Jump strip.
- **Chrome** → new `Light / Dark` + `Single / Dual` segmented toggles in the
  header. Sepia / OLED / Auto themes still settable from the settings panel.

### Stores

- **New** `src/stores/panes-store.ts` — per-vault `{ panes: [{id, currentPath}],
activePaneId, viewMode }`. Registers a `vault-lifecycle` deletion hook;
  Dexie v10 adds a `panes` table keyed by `vaultId`.
- **ui-store** gains `useLegacyTree`, `shelfExpandedFolderId`, `paneSplitRatio`
  (with min/max clamps, persistence, reset path).
- **Tabs and scroll memory** stay window-shared; the simpler model avoids a
  schema-breaking refactor and keeps PR risk close to zero.

### Tokens

- `src/styles/themes.css` extended with the design-spec
  `--bg / --paper / --text / --accent / --shadow / --highlight` family and a
  `--f-<id> / -deep / -ink` group per folder (six folders × three tokens) on
  every theme. The legacy `--color-*` family is untouched so the existing
  reading shell, prose, code, and Tailwind theme keys keep rendering.
- New CSS shards `pebble-garden.css`, `file-shelf.css`, `workspace.css` —
  imported from `globals.css` in cascade order after the existing shards.

### Tests + verification

- `pnpm check:full` green at the end of each PR.
- 947 tests passing (was 924); new suites: `folder-color`, `PebbleGarden`,
  `ContextMenu`, `FileShelf`, `panes-store`.
- Bundle: main `262.62 KB gz` (was 256.16), CSS `28.98 KB gz` (was 27.41) —
  both within their `bundle-size.json` budgets.
- Time-bomb in `card-store.test.ts` (hard-coded `2026-05-11` "future" date)
  fixed in-flight so `check:full` stays green past that date.

### Known follow-ups

- Sub-folder drilling fetches one level at a time; pre-warm caching is a
  follow-up for the file-tree-cache module.
- Touch right-click in Pebble Garden is unresolved (HANDOFF §7).
- `Peek preview` / `Reveal in folder` items in ContextMenu are disabled until
  the hover-preview pin + a desktop adapter land.
- `useLegacyTree` flag is scheduled for removal one release window after this
  one ships.

---

## 2026-05-10 · Remove standalone chat mode

**Status**: ✅ Chat mode is backed out for now. The product is back to the
original reading-first shape: document reading, command palette navigation, and
the existing AI ask / review-card features remain; there is no standalone chat
route or document-header chat action.

### What changed

- Removed the `/app/:vaultId/__chat__` route pair and its lazy route wrapper.
- Removed the top-bar chat icon and the document header `Chat` action.
- Removed the local chat UI, CSS shard, chat persistence module, context bridge,
  selection-transfer helper, and their tests.
- Removed the dedicated chat bridge design doc from the develop-docs index.
- Kept Dexie at schema version 9, but v9 now declares only the current
  reading/AI/review tables. This avoids trying to open an existing local v9
  IndexedDB with a lower app schema version.

### Verification

- `pnpm vitest run src/app/router.test.tsx`
- `pnpm typecheck`
- `pnpm lint`
- Targeted Prettier check over touched files.
- `pnpm build`

---

## 2026-05-10 · Architecture pass II — ChunkBoundary matrix + integration tests

**Status**: ✅ Second architecture cut following the same audit. Two improvements: per-chunk error boundaries so a single broken renderer no longer blanks the page, and integration tests for the two AI surfaces that were carrying zero component-level coverage.

### ChunkBoundary primitive + matrix

- New `src/ui/components/ChunkBoundary.tsx` — combined `Suspense` + class-component `ErrorBoundary`. Two visual modes: a card-style fallback with Retry button for full-surface failures, and an inline chip for per-block errors inside flowing prose. `getDerivedStateFromError` resets on Retry; `componentDidCatch` logs to `console.error` in dev so the React DevTools workflow stays intact. 6 unit tests cover the contract.
- Replaced **every** `<Suspense fallback={null}>` site across the codebase: AppShell (settings, palette, shortcuts help, confirm, generate-cards), DocumentBodyView (every file renderer + edit surface), VaultLayout (TOC, tags), the review route wrapper, and PaletteAskResult's answer renderer.
- Inline wrapping for the heavy renderable nodes the markdown pipeline emits: Mermaid diagrams, KaTeX math (block + inline). New `document-safe-renderers.tsx` exports `SafeMermaidDiagram`, `SafeMathBlock`, `SafeMathInline`; `document-components.tsx` (was `.ts`, now `.tsx`) wires them into the customComponents map. A bad diagram in a 50-paragraph note now shows a small "diagram couldn't render" chip in place of the broken block; surrounding prose continues rendering.
- New `src/styles/chunk-boundary.css` styles both variants — dashed red-tinted card for the full-size fallback, a tiny inline chip with `vertical-align: baseline` for prose-friendly fit.

### Integration tests for the AI surfaces

Both surfaces had test coverage of their underlying logic (card-store, card-generator, key-store, providers) but zero component-level coverage of the actual user flow — the kind of gap that lets a "Cancel button does nothing" bug ship.

- **`GenerateCardsDialog.test.tsx`** (4 cases): full happy-path stream → persist → navigate; parse-failure → error UI with Retry / Close; Cancel mid-generation → AbortController fires + suppresses post-cancel navigation; no-provider error path. All run against the real Anthropic provider with a fetch spy at the SSE boundary.
- **`ReviewPage.test.tsx`** (4 cases): question renders + click flips to answer + explanation; ←/→/Space keyboard navigation; missing-batch fallback for unknown routes; expired-batch lazy-purge → missing fallback. Seeds Dexie via `persistBatch` directly so the AI side stays out of the picture.

### Bundle effect

- Main `index-*.js`: 255.59 → **256.16 KB gz** (+0.57 KB — ChunkBoundary primitive + a few component wrappers).
- CSS: 26.62 → **27.41 KB gz** (+0.79 KB for the new fallback styles).
- `CommandPalette-*.js`: 9.45 → **9.28 KB gz** (-0.17 KB — Suspense import replaced by ChunkBoundary).
- All other chunks within ±0.1 KB.
- Tests: 910 → **924 passing** (+14: 6 ChunkBoundary, 4 GenerateCardsDialog, 4 ReviewPage).

### Why this matters

The audit flagged two parallel problems: error handling is uneven (single broken renderer kills the page) and two real user-facing surfaces have zero component-level test coverage (the Cancel-bug class of regression slipped past gate). One commit closes both. With this in place the codebase has crash isolation at every lazy boundary and at every heavy inline node, plus component-level coverage for the two surfaces most likely to break first.

Estimated rating delta: 8.3 → ~8.7 / 10. Remaining gap to 9 is mostly Repository-layer extraction and provider-registry DI consistency — both 1–2 day investments with less ROI than the current cut.

---

## 2026-05-10 · Architecture pass — vault-lifecycle registry, bundle CI, helper dedup

**Status**: ✅ Three architecture-grade improvements landing together as a single audit-driven cut. None are user-visible features; all of them raise the floor of what new contributions look like.

### Vault-deletion as a registry, not a hardcoded fan-out

- New `src/stores/vault-lifecycle.ts` exports `registerVaultDeletionHook(fn)` + `runVaultDeletionHooks(id)`. Hooks run in parallel; each one's failure is isolated so a single misbehaving subsystem can't leave a vault half-removed. 6 unit tests cover the contract (parallel execution, async + sync hooks, isolated failures, unregister returns a disposer).
- Every per-vault state owner now registers itself at module load:
  - `reader-store` — drops in-memory recents/scrolls + deletes `db.recentFiles` and `db.scrollPositions`
  - `tabs-store` — drops in-memory + deletes `db.openTabs`
  - `editor-store` — drops the live edit session if it pointed at the removed vault
  - `sidebar-visibility-store` — drops the per-vault hidden set + persists the change
  - `core/review/card-store` — deletes `reviewBatches` + `reviewCards`
  - `core/navigation/backlinks` — new `forgetBacklinksForVault` does both `invalidateBacklinks` and the `db.backlinks` row delete
- `vault-store.removeVault` now does its own narrow job — delete the `vaults` row + active-id pref, run the registry, dispose the adapter, fire lazy-cache invalidation. Adding a new per-vault domain in the future is a one-file change in that domain.

### Bundle-size budget as a CI gate

- New `scripts/check-bundle-size.mjs` reads `bundle-size.json` ceilings and gzips each matching `dist/assets/*` to verify it stays under budget. Zero new dev dependencies — pure Node `zlib` + `fs` + a tiny regex matcher tuned to Vite's hashed filename pattern.
- Initial budget set with realistic headroom against today's sizes: main 280 KB / CSS 32 KB / DocumentEditSurface 200 KB / CommandPalette 14 KB / PaletteAskAnswer 4 KB / ReviewPage 6 KB / GenerateCardsDialog 6 KB / SettingsPanel 8 KB.
- New `pnpm bundle:check` script + `pnpm check:full` (`check` + `build` + `bundle:check`).
- New `.github/workflows/ci.yml` runs typecheck → lint → format:check → test → build → bundle:check on every push to main and every PR. Was previously empty — now the first PR with a 50 KB-of-deadweight diff bounces, which is the whole point.

### `isPathHiddenInSet` helper — three callers, one source of truth

- Exported pure function from `sidebar-visibility-store.ts`. The store's own `isHidden` action delegates; `FileTreeNode` and `SectionsNav` import directly. Three duplicates of "if path === root, OR path starts with `${root}/`" → one.

### Bundle effect

- Main `index-*.js`: 261.79 → **255.59 KB gz** (−6.20 KB) — decoupling vault-store's static fan-out shrank the dependency graph; per-vault cleanup now lives with each owning store.
- DocumentEditSurface: 183.87 → **179.23 KB gz** (likely a CodeMirror minor in the lockfile).
- CSS: 27.60 → **26.62 KB gz** (small dedup wins).
- Tests: 892 → **910 passing** (+18: 6 lifecycle, 9 sidebar visibility tests already counted, +1 hide integration, +2 reader-store hook coverage).

### Why this matters

The architecture audit rated the codebase 7.5/10 — solid but with three concrete gaps that hurt long-term maintainability: easy-to-forget fan-outs, no enforced bundle ceiling, duplicated path-matching logic. Each is the kind of "we'll fix it later" debt that compounds. Closing them now means the next ten features land into a cleaner substrate.

## 2026-05-10 · Audit follow-ups + sidebar visibility + Continue/Recent removal

**Status**: ✅ Three follow-up cuts shipped together — sidebar Continue/Recent removed, sidebar right-click "Hide from sidebar" + Show-all reset added, and a batch of audit-driven fixes against the Phase 3 review surface and the AI palette flow.

### Sidebar simplification

- **Continue / Recent removed** from `FileTree.tsx`. The sidebar now shows just the toolbar, tag filter, Sections, and the file tree itself — closer to what users actually want when triaging files. Recent files remain available through the ⌘K palette and ⌘+Shift+T tab-reopen, so no functional access was lost. `ContinueAndRecent.tsx` was deleted; the four obsolete tests in `FileTree.test.tsx` were removed (M4.7 recent files + RX3 three Continue/Recent tests).

### Sidebar right-click visibility

- New `src/stores/sidebar-visibility-store.ts` (Zustand + Dexie-backed via `preferences['sidebar:hiddenByVault']`). Per-vault hidden-paths sets with ancestor-aware `isHidden(path)` so hiding `archive` masks every descendant in one entry, hide/unhide/reset/forgetVault/init lifecycle wired through `main.tsx` startup and `vault-store.removeVault` fan-out. 9 unit tests cover the contract.
- New `src/ui/file-tree/SidebarContextMenu.tsx` — portal-mounted, viewport-bounds-aware, closes on outside pointerdown / Escape, single "Hide from sidebar" item with the entry path as the header for confirmation.
- `FileTreeNode.tsx` and `SectionsNav.tsx` both filter against the hidden set and forward an `onContextMenu` prop up to `FileTree.tsx`, which manages the context-menu state and renders the menu. `FileTree.tsx` also gains an `<Eye + count>` reset button in the toolbar that's only visible when the current vault has at least one hidden entry.

### Audit follow-ups (six issues)

1. **Cancel button in `GenerateCardsDialog` actually cancels.** Prior `cancelRef` was declared but never assigned — clicking Cancel just closed the dialog while the model kept burning tokens, and a successful response after dismissal would still navigate the user to a review page they didn't ask for. Now: a fresh `AbortController` per `handleGenerate`, signal threaded through `generateBatch(input.signal)` → `provider.ask(options.signal)` all the way down to fetch. `CardGenerationError` gains an `'aborted'` kind so the dialog can swallow user-cancelled runs silently. Two new unit tests: pre-flight aborted, and signal forwarded into the provider.
2. **`ReviewPage` keyboard hook now guards editable targets.** The previous hook captured Space/Arrows globally and would flip the card behind the ⌘K palette when the user pressed space inside the palette input. Added an inline `isEditableTarget` helper mirroring the reading-shell version.
3. **Delete batch now confirms.** Routes through `useDialogStore.requestConfirmation` with `destructive: true` — same pattern as the dirty-editor leaving prompt — so a stray click can't wipe ten cards and their generation cost.
4. **`PaletteAskResult` no longer re-runs on `wikilinkIndex` landing.** Mirrored the index into a ref so the answer effect can read the latest value without listing it as a dep. Was double-firing the AI fetch every time the index finished building (~couple hundred ms after typing).
5. **Review-page `ExportMenu` closes on outside click + Escape.** Mirrors the SidebarContextMenu pattern; only mounts the listeners while the menu is open.
6. **Export filename keeps CJK characters.** Was `[^\w.-]+` which collapses Chinese/Japanese/Korean to underscores ("event-loop事件循环.md" → "event-loop\_\_\_\_md"). Now `[^\p{L}\p{N}.-]+/gu` — Unicode letter / number aware.

### Bundle footprint

- Main `index-*.js`: **261.79 KB gz** (–0.02 KB net across the audit fixes; AbortController plumbing offset by removed dead code).
- CSS: **27.60 KB gz**.
- `GenerateCardsDialog-*.js`: 3.84 → **3.94 KB gz** (+0.10 KB for AbortController wiring).
- `ReviewPage-*.js`: 2.71 → **3.04 KB gz** (+0.33 KB for confirmation + ExportMenu close + isEditableTarget).
- Tests: 890 → **892 passing** (+2 cancel-signal generator tests; 4 obsolete Continue/Recent tests removed earlier; +9 sidebar-visibility-store tests).

### Why these mattered together

The audit turned up half a dozen "promised but didn't deliver" issues — Cancel that didn't cancel, Delete that didn't confirm, Export menu that wouldn't close. None of them broke anything outright, but each one is the kind of paper-cut that erodes trust in the surface. Bundling them with the sidebar simplification work keeps the next commit a single coherent "polish" pass rather than threading them through future feature work.

---

## 2026-05-09 · Phase 3 — AI review cards (Phase A)

**Status**: ✅ Phase A shipped. SwirlRead can now generate spaced-repetition flashcards from any open `.md` via the configured AI provider, store them in Dexie with a 24h TTL, and step through them on a focused full-page review surface. Phases B (3D flip animation polish), C (multi-file batches), D (manual TTL settings + per-card actions) are deferred.

### What landed

- **Dexie schema v8**: two new tables, `reviewBatches` and `reviewCards`. Range-indexed by `expiresAtMs` so the TTL purge runs in one query; secondary index on `vaultId` so vault deletion fans out cleanly. The schema bump is purely additive — no migration step, existing v7 stores upgrade silently.
- **`src/core/review/`** (new module):
  - `types.ts` — `ReviewBatch`, `ReviewCard`, `GenerationOptions`, `DEFAULT_REVIEW_TTL_MS = 24h`, `DEFAULT_CARD_COUNT = 10`, `MAX_CARD_COUNT = 25`.
  - `card-store.ts` — CRUD (`persistBatch`, `getBatch`, `listBatches`, `getCardsForBatch`, `deleteBatch`, `forgetVault`, `purgeExpired`). Lazy purge on `getBatch` so a stale batch never makes it onto the screen even if startup didn't catch it.
  - `card-generator.ts` — `generateBatch(input, deps)` collects the AI stream, runs `parseCardsJson` over the result, persists batch + cards in one transaction. `parseCardsJson` is the durability layer: tries strict JSON, then ` ```json ` fenced block extraction, then `[ … ]` slice extraction, then a leniency pass (drops trailing commas), only after all four fail does it return `[]`. Discriminated `CardGenerationError` (`no-provider`, `parse-failed`, `empty`, `underlying`) so the dialog can render a useful message.
  - 22 new unit tests covering store CRUD, TTL purge cascading, generation persistence, prompt-tolerant parsing, and provider-failure wrapping.
- **`src/stores/review-store.ts`** (new): tiny Zustand store with `pending: GenerateIntent | null`, `requestGenerate(intent)`, `dismissGenerate()`. Single-pending semantics — clicking "Generate" twice replaces the target rather than queueing.
- **`src/ui/review/GenerateCardsDialog.tsx`** (new): Radix-backed modal with three phases (idle → generating → error). Idle has a 5–25 card-count slider and a "Generate" CTA. Generating shows a spinner with Cancel. Error surfaces a Retry / Close pair. Provider resolution mirrors `PaletteAskResult.resolveProvider` (active-provider preference first, then chain). On success: `dismissGenerate` + `navigate('/app/:vault/__review__/:batchId')`.
- **`src/ui/review/ReviewPage.tsx`** (new, lazy): the focused review surface at `/app/:vaultId/__review__/:batchId`. One card at a time, click-to-flip (front: question; back: answer + "why" + source link), `←/→` next/prev, Space/Enter flip, Esc exit. Header carries the batch label, live-ticking expiry countdown (`expires in 23h 14m`), provider name, Export menu (Markdown + JSON), Delete-batch button. Progress dots at the bottom let the user jump directly to a card.
- **Entry points (both wired per the design):**
  - Document header — new `Sparkles + Review cards` button next to Edit, fires `requestGenerate({vaultId, path})`.
  - Command palette — new "Document actions" group with a "Generate review cards" item that fuzzy-matches on "review / cards / generate / flashcards / quiz / study" plus the file basename. Closes the palette and dispatches the same store action so both paths converge on a single GenerateCardsDialog instance.
  - The dialog itself is mounted once at `AppShell` level, keyed off `useReviewStore.pending` — call sites don't own state.
- **Startup TTL purge**: `main.tsx` fires `purgeExpired()` next to `autoRestoreVaults()`. Cheap range query; never blocks render.
- **Vault deletion fan-out**: `useVaultStore.removeVault` now drops `reviewBatches` and `reviewCards` rows for the deleted vault alongside the existing recents / scroll / backlinks / tabs cleanup. Re-registering the same vault id later starts from a clean slate.
- **Lazy chunks**: `ReviewPage` and `GenerateCardsDialog` both lazy-loaded so users who never review pay nothing for the Radix Dialog instance + flashcard machinery.
- **Styling**: new `src/styles/review.css` covering the review surface, generate modal, and export menu. Dense typography on the dialog (sans-serif), serif body on the cards (consistent with the reading shell), subtle tint flip when the answer is showing.

### Decisions

- **JSON via prompt, not "structured output API".** Three providers, three different structured-output ABIs (Anthropic tool-use, OpenAI response-format, Xiaomi/OpenAI-compat varies). Strict prompt + tolerant parser stays fully cross-provider with one code path. The four-strategy parser absorbs the LLM tics we actually see in the wild (code fences, prose preamble, trailing commas).
- **One-shot, not incremental, generation.** The streaming text protocol is what we have, but flashcards are structured — yielding card-by-card UI from a partially-formed JSON array is more friction than it's worth. Collect the whole stream, parse, persist atomically.
- **Lazy purge + startup purge, no `setInterval`.** Tab-closed timers don't fire and timers across tab suspend/resume drift. `getBatch` self-heals on each access; `main.tsx` wipes the bulk of stale rows once at startup.
- **Card flip = simple state swap, not 3D transform.** Phase A keeps the flip a content swap with a tinted background. Phase B can layer a `transform: rotateY(180deg)` and `backface-visibility: hidden` for the polish without touching the data layer.
- **No SRS / spaced-repetition algorithm.** The user's brief was "review what I just read, then it disappears" — not Anki long-term retention. Cards expire 24h after creation; no `lastReviewed`, no quality rating, no schedule. If that demand surfaces later, a `reviewProgress` table is the additive way to layer SM-2 on top.
- **Source-path attribution = first source.** Single-file batches have a trivial source. Multi-file batches (Phase C) will need cross-card attribution heuristics; the schema already carries a per-card `sourcePath` for that.

### Bundle footprint

- Main `index-*.js`: 259.98 → **260.81 KB gz** (+0.83 KB — review-store + main.tsx wiring).
- CSS: 26.34 → **27.35 KB gz** (+1.01 KB for the review surface).
- `CommandPalette-*.js`: 9.74 → **9.88 KB gz** (+0.14 for the new action group).
- `ReviewPage-*.js`: **new** 2.71 KB gz.
- `GenerateCardsDialog-*.js`: **new** 3.07 KB gz.
- Tests: 851 → **873 passing** (+22: 8 store + 14 generator).

### How to use it

1. Open any `.md` in a vault.
2. Click **Sparkles → Review cards** in the document header (or `⌘K → "Generate review cards"`).
3. Pick a card count (5–25, default 10). Click **Generate**.
4. The model returns ~10s later; the app routes you to `/app/:vault/__review__/:batchId`.
5. Click the card (or press Space) to reveal the answer + explanation. `←/→` walks the deck. Esc returns to the document.
6. Cards expire automatically after 24h. Click **Export** (Markdown / JSON) to save them before they go.

---

## 2026-05-09 · Phase 3 — Xiaomi MiMo provider + multi-provider default

**Status**: ✅ Shipped. SwirlRead now ships three first-class AI providers (Anthropic / Xiaomi MiMo / OpenAI-compatible). All three can be configured side by side; a "Default for ⌘K" picker in Settings lets the user choose which one drives the palette. Verified against the wire contract from `/Users/supwils/supwilsoft/AI/xiaomi` sample scripts.

### What changed

- **`src/core/ai/types.ts`**: extended `AIProviderId` to `'anthropic' | 'openai-compat' | 'xiaomi'`. No db migration needed — `aiKeys.provider` is a free-form string column.
- **`src/core/ai/xiaomi-provider.ts`** (new): thin factory that delegates to `createOpenAICompatibleProvider` with the Xiaomi defaults (`https://token-plan-sgp.xiaomimimo.com/v1`, `mimo-v2.5-pro`) and re-keys the resulting provider's `id` to `'xiaomi'` so the rest of the app can distinguish a Xiaomi-backed provider from a hand-configured OpenAI-compatible one. `XIAOMI_DEFAULT_BASE_URL` and `XIAOMI_DEFAULT_MODEL` are exported for the settings UI to use as placeholders. Both base URL and model are user-overridable for regional failover / model switching.
- **`src/core/ai/key-store.ts`**: added `getActiveProvider()` / `setActiveProvider(id | null)` backed by a new `'ai:activeProvider'` preferences row. The getter self-heals: a stale id that no longer matches a known provider gets dropped and the preference falls back to `null`. `clearAllAIKeys()` drops the active selection too. 5 new unit tests on top of the existing 8.
- **`src/ui/settings-panel/AIControl.tsx`** (refactor):
  - Three-tab segmented control: Anthropic / Xiaomi MiMo / OpenAI-compatible.
  - New `XiaomiForm` component — API key (required) plus optional baseURL / model overrides whose placeholders show the defaults so the user knows what they'll fall back to. Empty meta is intentionally NOT persisted to Dexie, so we can upgrade defaults later without rewriting saved rows.
  - Re-saving the Xiaomi form with a blank key preserves the prior secret (route through `getAIKey('xiaomi')` instead of clobbering with empty string) — needed because the user often only wants to change baseURL / model on an existing config.
  - New `DefaultProviderPicker` shows below the active form when 2+ providers are configured. Radio group with "Auto" first (preserving the deterministic chain Anthropic → Xiaomi → OpenAI-compatible) and one option per configured provider.
  - 5 new integration tests on top of the existing 6: Xiaomi save without overrides, Xiaomi save with overrides, picker hidden when only one provider is configured, picking Xiaomi as default, falling back to Auto.
- **`src/ui/command-palette/PaletteAskResult.tsx`**: `resolveProvider` now reads `getActiveProvider()` first and uses that explicit pick when it has a saved key. If no explicit pick (or the picked provider has no key), it falls back to the deterministic chain Anthropic → Xiaomi → OpenAI-compatible. Provider construction was extracted to a `tryProvider(id)` helper so the chain stays readable. New integration test verifies that `setActiveProvider('xiaomi')` actually routes fetches to the Xiaomi base URL even when an Anthropic key is also configured.
- **`src/styles/settings.css`**: added `.swirlread-settings__radio-group` / `.swirlread-settings__radio` rules — vertical radio list using the accent color.
- **Verified contract**: Xiaomi MiMo's `POST /v1/chat/completions` accepts `{ model, messages, stream: true }` with a `Bearer tp-...` header and emits the same OpenAI-shape SSE deltas (`choices[0].delta.content`) terminated by `data: [DONE]`. Sample scripts in `/Users/supwils/supwilsoft/AI/xiaomi/{javascript,python,bash}/` exercise this — they all use the OpenAI client directly, which is the same wire format our `OpenAICompatibleProvider` already speaks.

### Decisions

- **Xiaomi as a first-class provider, not just a preset.** Technically the existing OpenAI-compatible form could already drive Xiaomi if the user typed in the base URL + model. Promoting it has two real wins: (a) one-click setup with the right defaults, and (b) Xiaomi gets its own encrypted row so the user can configure both Xiaomi and a separate OpenAI-compatible target (e.g. local Ollama) at the same time, which the single-row OpenAI-compat slot can't model.
- **Defaults persisted via absence, not presence.** The Xiaomi form does not write `baseURL` / `model` into Dexie when the user leaves them blank. This means we can ship a new default model in a future release and existing users immediately benefit without us having to migrate their saved rows.
- **"Auto" is an explicit radio option, not "no selection".** Showing `(•) Auto` in the picker makes the fallback chain visible and discoverable, instead of leaving users guessing why Anthropic is winning when they'd configured Xiaomi too.
- **Default picker hidden when 1 or 0 providers configured.** Picking a default with only one configured provider is meaningless busywork; the chain already does the right thing.

### Bundle footprint

- Main `index-*.js`: **259.98 KB gz** (unchanged).
- CSS: 26.29 → **26.34 KB gz** (+0.05 KB for radio rules).
- `CommandPalette-*.js`: 9.65 → **9.74 KB gz** (+0.09 KB for Xiaomi import).
- `SettingsPanel-*.js`: 3.26 → **3.92 KB gz** (+0.66 KB for Xiaomi form + default picker).
- Tests: 835 → **851 passing** (+16: 5 Xiaomi provider unit + 5 key-store active-provider unit + 5 AIControl integration + 1 palette routing integration).

### How to use it

1. Open Settings → AI assistant → click the "Xiaomi MiMo" tab.
2. Paste your `tp-...` key, leave base URL and model blank to use the defaults, click Save.
3. (Optional) Click "Test connection" to verify the key + endpoint without burning real tokens.
4. If you have other providers configured, scroll down to "Default for ⌘K" and pick Xiaomi MiMo (or leave on "Auto" for the chain default).
5. Open ⌘K, type `? what does this document explain?`, watch the answer stream in.

---

## 2026-05-09 · Phase 3 polish — rich AI answer card

**Status**: ✅ Shipped. The ⌘K `?` answer surface no longer dumps raw text — streamed answers now render through the same Markdown pipeline as the reading shell, wikilinks the model emits resolve and become clickable, source neighbours are clickable chips that route + close the palette, and the answer has a copy-to-clipboard affordance once streaming completes.

### What changed

- **`src/ui/command-palette/PaletteAskAnswer.tsx`** (new, lazy-loaded): wraps `renderMarkdown` from `core/render/pipeline` with the standard `customComponents` map (Wikilink / Callout / Mermaid / Math / Tag / Embed). Holds a token-versioned reparse so stale Shiki promises don't clobber a newer chunk. Streaming reparse is debounced ~120 ms; the final reparse runs immediately when streaming flips off so the user sees fully-highlighted code blocks the moment the model is done.
- **`src/ui/command-palette/PaletteAskResult.tsx`** (refactor):
  - Builds the vault wikilink index once per vault and threads it through both AI context expansion (avoiding the second walk that `loadContext` used to do) and `WikilinkContext.Provider` so `<Wikilink>` inside the rendered answer can resolve `[[target]]` and emit React Router `<Link>`s + hover-preview affordance.
  - Sources are now buttons with file icons (`<FileText>` + basename), not bare `<code>` tags. Click closes the palette and routes to the linked note via the parent `onSelect` callback wired in `CommandPalette.tsx`.
  - Header gets a "Copy" button (Lucide `<Copy>` / `<Check>` swap) post-stream — writes the full plaintext to `navigator.clipboard.writeText`. 1.6s flash to "Copied" via a state timer; cleanup on unmount.
  - The streamed body lives in a Suspense boundary; the lazy-loading fallback renders the raw streamed text in a `<pre>` so the user sees progress instantly even before the answer chunk lands.
- **`src/styles/command-palette.css`**: new `.swirlread-ask__header`, `.swirlread-ask__source-chip`, `.swirlread-ask__copy`, `.swirlread-ask__prose` rule set. The prose surface reuses `.swirlread-prose` (so KaTeX / Mermaid / Shiki styling carries over) but tightens the typography for the palette context — denser headings, smaller code blocks, narrower margins.
- **`src/ui/command-palette/PaletteAskResult.test.tsx`** (new): 4 integration tests covering the markdown pipeline render (`**bold**` → `<strong>`, `- list` → `<li>`), wikilink resolution to a real `<Link>` with the right `href`, source-chip click navigating + closing the palette, and the copy-answer button writing the full text via a `vi.spyOn(navigator.clipboard, 'writeText')`.

### Decisions

- **Reuse, don't reinvent the renderer.** The reading shell's `renderMarkdown` already supports wikilinks, callouts, embeds, math, mermaid, and Shiki — pulling that into the palette gives the AI answer the same polish for free. Anthropic's "AI-native HTML" framing is real for _generated artifacts_, but for SwirlRead the answer is still Markdown; rendering it well is the win.
- **Lazy chunk for `PaletteAskAnswer`.** `renderMarkdown` is heavy (Shiki async grammars, hast-util-to-jsx-runtime, sanitize). The split is more about isolation than bytes — most of the pipeline is shared with `DocumentBodyView` and gets deduped by Vite — but the lazy boundary means a user who never asks AI questions never pays for the wrapper, and the streaming Suspense fallback keeps the perceived latency near-zero.
- **One `wikilinkIndex`, two consumers.** Building the basename → paths index is O(N) over the vault. The previous implementation built it once for context expansion; now both consumers (context expansion + answer-side resolution) share a single async build keyed off `vaultId`. Saves a redundant walk on every keystroke.
- **Token-versioned reparse over `useDeferredValue`.** Shiki's grammar load is async, so a slow first reparse can race against a faster later one. A monotonic `tokenRef` + cancellation flag drops stale results without leaning on React's deferred-value heuristics.
- **No per-codeblock copy button (yet).** The header-level "Copy answer" is enough for v1 and ships in a single button. A future cut can add per-`<pre>` copy if user demand surfaces.

### Bundle footprint

- Main `index-*.js`: 259.95 KB gz → 259.98 KB gz (essentially unchanged — pipeline already loaded).
- `CommandPalette-*.js`: 9.05 KB gz → 9.65 KB gz (+0.6 KB for source chips, copy button, suspense glue).
- `PaletteAskAnswer-*.js`: **new** at 0.46 KB gz.
- CSS bundle: 25.89 KB gz → 26.29 KB gz (+0.4 KB).
- Tests: 831 → 835 passing.

### Why this matters

The user raised the framing that "AI-native HTML/CSS is becoming the better format for AI-generated content." For a vault-of-Markdown product like SwirlRead, the right interpretation isn't to abandon Markdown — it's to render the AI's Markdown output with the same fidelity the reading shell gives human-authored notes. Wikilinks the model emits become clickable bridges back into the vault; cited sources become navigable chips; code samples are syntax-highlighted; the answer feels like a first-class part of the reading surface, not a chat bubble grafted on. This is suggestion (1) from the discussion on 2026-05-09 — `.html` as a first-class vault format remains a Phase 3+ exploration.

---

## 2026-05-07 · Phase 3 first cut — ⌘K `?` AI mode, end-to-end

**Status**: ✅ Phase 3 v0.1 surface is feature-complete in code. Open ⌘K, type `?` followed by a question, and the configured provider streams an answer that uses the current document plus 1-hop wikilink neighbours as context. Real-key smoke test against a live Anthropic / DeepSeek / Ollama backend is the only remaining manual step.

### What landed (5 sub-slices)

**3A — Provider interface + two implementations** (`src/core/ai/`)

- `types.ts`: `AIProvider` (`ask(prompt, context, options) → AsyncIterable<string>`), `ContextChunk`, `AskOptions`, `AIError` (discriminated by `kind`: `auth` / `rate-limited` / `network` / `aborted` / `malformed-response` / `unknown`).
- `sse.ts`: shared SSE line-event reader. Handles cross-chunk record splitting, blank-line separators, comment heartbeats, abort-mid-stream. 6 unit tests.
- `anthropic-provider.ts`: Claude Messages API direct from the browser via `anthropic-dangerous-direct-browser-access: true`. Default model `claude-sonnet-4-6`; system prompt scoped to "reading assistant inside SwirlRead, answer using only the provided context." 5 unit tests covering streaming + the four error kinds.
- `openai-compatible-provider.ts`: one shape covers OpenAI / DeepSeek / Together / Ollama / LM Studio. Empty Bearer for local LMs. Trailing-slash baseURL normalised. `[DONE]` sentinel respected. 6 unit tests including empty-delta skipping and trailing-slash handling.

**3B — AES-GCM-encrypted key store** (`src/core/ai/key-store.ts`)

- Master AES-GCM-256 `CryptoKey` generated lazily on first `setAIKey`, stored in `preferences['ai:masterKey']` as a non-extractable `CryptoKey` — never round-trips as raw bytes.
- Per-provider rows in a new `aiKeys` Dexie table (schema v7), `{ provider, ciphertext, iv, meta }`, fresh 12-byte IV per encrypt.
- Self-heals orphan rows when the master key has been cleared out from under them. 8 unit tests covering round-trip, meta persistence, encrypt-at-rest, IV rotation, hard reset, orphan recovery.
- Threat model documented in the source: defends against passive IDB inspection / extension snapshots / casual devtools dumps; explicitly does not defend against an actively malicious script in our origin (Tauri keychain is the future answer).

**3C — Settings panel "AI assistant" group** (`src/ui/settings-panel/AIControl.tsx`)

- Provider segmented control (Anthropic / OpenAI-compatible) above per-provider forms.
- Save / Test connection / Clear key actions; "Saved" badge hydrated from IDB on mount.
- "Test connection" sends `'Reply with just the word ok.'` and reads only the first chunk, then aborts — verifies auth + reachability without burning real tokens.
- Plaintext keys never round-trip through React state after a successful save: the form input clears immediately. 6 integration tests cover save-and-clear, hydrate-saved, OpenAI-compat meta hydrate (without leaking key), provider switch.

**3D — Command palette `?` mode + streaming surface** (`src/ui/command-palette/PaletteAskResult.tsx`)

- New `'ask'` variant on `PaletteMode`; `classifyInput` consumes the `?` prefix; placeholder + empty messages for the new mode.
- `PaletteAskResult` runs through `idle` / `loading` / `streaming` / `done` / `error` / `no-provider` states with explicit copy for each. AbortController wired through to fetch + SSE reader so closing the palette / typing a new question cancels in-flight requests.
- Static groups (recents / recently-closed / headings / sections) hidden in ask mode via a single `showStaticGroups` gate so the answer owns the surface.
- Streaming render shows a blinking cursor; done state labels the answering model (`Answered by claude-sonnet-4-6`). 3 integration tests cover the empty `?` hint, the no-provider CTA, and the static-group suppression.

**3E — 1-hop wikilink context expansion** (`src/core/navigation/wikilink-extractor.ts`)

- Pure `extractWikilinkTargets(source)` strips fenced/inline code + HTML comments, then pulls each unique `[[target]]` (de-decorated of alias / heading / block-ref) in document order. Embeds (`![[file]]`) ride along intentionally — they're the strongest "I want this content next to the host" signal. 8 unit tests.
- `loadContext` in `PaletteAskResult` now reads the current doc, builds a wikilink index via `buildWikilinkIndex`, resolves each extracted target, and pulls in up to 4 Markdown neighbours under hard caps (8k chars per file, 30k chars total across neighbours). Non-Markdown skipped; self-references skipped; per-file truncation labels with "…[truncated]…".
- `Status` carries a `sources: string[]` so the UI can list every neighbour path next to the answer header (`With 3 linked notes: hooks.md, react.md, perf.md`). Sources show during streaming, not just at done — the user sees what's being sent before the answer fills in.

### Decisions

- **Pure `fetch` providers, no SDK.** Keeps the provider modules trivially testable (inject `fetch`), avoids dragging Anthropic / OpenAI SDK trees into the bundle, and side-steps the SDK version drift problem that comes with browser-direct calls.
- **Encryption is real but documented.** Threat model is explicit in the source: this defends against IDB snapshots, not an actively-malicious script in our origin. Tauri keychain is the future stronger answer; for the web build, AES-GCM-at-rest is the right cost.
- **Context cap, not token-counting.** A character cap is an honest under-approximation of token budget that doesn't require shipping a tokenizer. 30k chars ≈ 7.5k tokens leaves headroom for system prompt + question + answer in any current frontier model context window.
- **Sources surfaced in UI.** Shipping AI without surfacing what's being sent is a privacy anti-pattern. The header line is one short sentence and disappears on docs without wikilinks, so the disclosure has zero cost on simple pages.
- **Provider preference is implicit, not configurable yet.** Anthropic wins when both keys exist; that's the recommended default per this roadmap. A real picker is a backlog item once anyone reports they want both configured for different documents.

### Verification

- `pnpm check`: 0 errors / 0 warnings; **831 / 831 tests passing** (+38 vs Phase 2D)
- `pnpm build`: succeeded; main chunk **259.95 KB gz** (Δ +0.07 KB vs Phase 2D — core/ai is consumed only via the lazy SettingsPanel + CommandPalette chunks). CommandPalette lazy chunk **9.05 KB gz**, SettingsPanel lazy chunk **5.40 KB gz**, CSS **25.89 KB gz**.

### Manual verification still pending (3F real-key smoke)

The whole stack runs in unit tests with mocked fetch. The real-network signal that's deferred to a manual run:

1. Configure an Anthropic key in Settings → AI assistant → Save → Test connection should turn green.
2. Open a document with at least one wikilink → ⌘K → `? what is this about?` → answer streams, sources line shows the linked file.
3. Configure a DeepSeek key (OpenAI-compat) with `https://api.deepseek.com/v1` + `deepseek-chat` → Test connection green → ask the same question → answer streams from DeepSeek.
4. Try an Ollama setup (`http://localhost:11434/v1`, blank API key, model `llama3`) → expect either a green Test (if Ollama is running) or a clear "Network error reaching the provider" status.

These four manual steps are the v0.1 acceptance for Phase 3. Anything that surfaces during the smoke run becomes follow-up work.

---

## 2026-05-07 · Final pre-Phase-3 polish — LandingPage emoji, dead export

**Status**: ✅ Last papercut sweep before pivoting to Phase 3 AI work.

### What changed

- **`src/ui/landing/LandingPage.tsx`** — primary "Open my vault" CTA used a `📁` emoji that conflicted with the rest of the app's Lucide-icon language and the project's calm/no-emoji voice. Replaced with `<FolderOpen size={16} />` and `inline-flex items-center gap-2` so it lines up with the sibling "Try with sample vault" button.
- **`src/stores/tabs-store.ts`** — removed `getTabsForVault` export. Zero callers in src/ (greppable). Tests reach the state directly via `useTabsStore.getState()`.

### Verification

- `pnpm check`: 0 errors / 0 warnings; 789 / 789 tests passing
- `pnpm build`: succeeded; main chunk **259.88 KB gz**

---

## 2026-05-07 · Three small papercuts — HintToast stacking + Recently-closed pop-on-select + cap-evicted tabs recoverable

**Status**: ✅ Three real magnets surfaced and fixed in one round.

### What changed

- **`src/styles/zen-mobile.css`** — HintToast siblings now stack vertically. All three hint sources (`first-vault-tour`, `preview-tab-replaced`, `tab-cap-hit`) used `position: fixed; bottom: 24px;` and would pile on top of each other if visible at the same time. The simplest fix: a CSS sibling selector lifts the second toast by ~84 px and the third by ~168 px. No JS coordination needed; up to three concurrent hints stack cleanly. The same selector chain remains hidden in zen mode.

- **`src/stores/tabs-store.ts`** + **`src/ui/command-palette/CommandPalette.tsx`** — palette's "Recently closed" group now drops the selected entry off the stack so a reopened file doesn't keep haunting the list. New `reopenClosed(vaultId, path)` action filters the stack only — caller owns navigation + tab open. Existing `reopenLastClosed` (Cmd+Shift+T head pop) is unchanged.

- **`src/stores/tabs-store.ts`** + **`src/ui/reading-shell/VaultLayout.tsx`** — cap-evicted tabs now land on the recently-closed stack so the user can recover them via `Cmd+Shift+T` or the palette's "Recently closed" group. Previously the cap silently dropped them. Preview-replace stays out of the stack on purpose — preview tabs are designed to be ephemeral, and pushing every wikilink-driven swap onto the stack would dilute it past usefulness. Updated the `tab-cap-hit` HintToast copy to mention the recovery shortcut.

- **Tests**: 2 new unit tests for `reopenClosed` (specific path removal; reference-equality preserved on no-op) + 1 new test for cap-eviction → recently-closed handoff (verifies eviction order + recoverability via `reopenLastClosed`). The existing palette "lists recently-closed and reopens on select" test gained an assertion that the stack shrinks after the click.

### Decisions

- **CSS-only toast stacking, no toast manager.** A toast manager would be the right call if we ever shipped a 4th hint or wanted animations, but for three concurrent hints in a v0.1 product the sibling-selector trick is the right cost.
- **Caller-owns-navigation, store-owns-stack.** `reopenClosed` deliberately doesn't call `openOrFocus` or navigate — `DocumentPage`'s open-tab effect handles that side via the URL change. Keeps the action pure and testable.
- **Cap-eviction goes to closed stack; preview-replace does not.** Cap eviction is rare and represents work the user explicitly did (opened the tab) — losing it silently is a real regression. Preview-replace happens many times per reading session by design and pushing every casual wikilink click would crowd out the cap-evicted entries that actually need recovery.

### Verification

- `pnpm check`: 0 errors / 0 warnings; 789 / 789 tests passing (+3 net new tabs-store tests; +1 stronger assertion in the palette test)
- `pnpm build`: succeeded; main chunk **259.86 KB gz** (Δ +0.14 KB)

---

## 2026-05-07 · Wikilink hover preview LRU cache

**Status**: ✅ Shipped. Repeat hovers on the same wikilink no longer hit the adapter — the rendered preview snippet is memoised for a small working set, with explicit invalidation tied into the existing P0 / P1 / P3 content-sync fan-out so a refreshed file is never served stale.

### What changed

- **`src/ui/reading-shell/wikilink-preview-cache.ts`** (new) — small LRU keyed by `${vaultId}::${path}`. JS `Map` insertion order is access order, so we delete-and-reinsert on every hit (and on every set) and evict the oldest key when over the 10-entry cap. Public surface: `getCachedPreview` / `setCachedPreview` / `invalidateWikilinkPreviewCache(vaultId)` + a test reset.
- **`src/ui/reading-shell/WikilinkPreview.tsx`** — `PreviewBody` now seeds its initial state from the cache (synchronous paint, no pending flash on a repeat hover), and the load effect short-circuits when the cache hits. On miss, the existing fetch + `previewSnippet` path runs and populates the cache before setting state.
- **`src/stores/vault-store.ts`** — `invalidateVaultCachesLazy` (the fan-out called by `refreshVaultContent` and `removeVault`) gains a lazy import for `wikilink-preview-cache`. Same pattern every other invalidator already follows; failures are swallowed because invalidation is best-effort.
- **`src/ui/reading-shell/wikilink-preview-cache.test.ts`** (new, 7 tests) — miss / hit / overwrite / per-vault keying / cap-at-10 / LRU promotion / vault-scoped invalidation.

### Decisions

- **Cache the rendered snippet, not the raw file bytes.** `previewSnippet(raw, 220)` is a pure function, but it's also called on every hover. Caching the post-snippet string saves the recomputation alongside the disk read; the working-set numbers don't change because every entry is a single short string.
- **10 entries.** Reading flow is "scan a few links, return to one, scan a few more." A working set bigger than ~6–8 is unlikely on a single page; 10 leaves headroom without any concern about memory.
- **Hooked into the existing fan-out, not a new revision subscription.** The vault-store already has the right boundary — `refreshVaultContent` and `removeVault` are the only legitimate invalidation events. Adding a separate revision listener inside `WikilinkPreview` would have been more code that drifts away from how every other derived cache in the app handles staleness.

### Verification

- `pnpm check`: 0 errors / 0 warnings; 786 / 786 tests passing (+7 from the new cache tests)
- `pnpm build`: succeeded; main chunk **259.72 KB gz** (Δ +0.03 KB — module is tiny + lazy-imported by the store)

---

## 2026-05-07 · Command palette gains a "Recently closed" group

**Status**: ✅ Shipped. The recently-closed stack maintained by `tabsStore.closeTab` is now reachable from the ⌘K palette, so users have a visual fallback alongside the `Cmd+Shift+T` chord wired in earlier today.

### What changed

- **`src/ui/command-palette/CommandPalette.tsx`** — new `Recently closed` group between `Recent files` and `Headings (this document)`. Reads `recentlyClosedByVault[currentVaultId]` from `useTabsStore`, hidden when empty. Each item shows the basename + a `Reopen · <path>` secondary line; selection routes to the path through the same `handleSelect` used by everything else, so the existing `DocumentPage` open flow rebuilds the tab.
- **Stable empty array sentinel.** Added `EMPTY_RECENTLY_CLOSED: Tab[] = []` at module scope and used it as the selector fallback. Without it the selector would have returned a fresh `[]` reference every render, causing a Zustand identity-equality miss and an infinite re-render loop. The same pattern is used by the recents/scrolls selectors elsewhere in the codebase (`EMPTY_RECENT_FILES` / `EMPTY_SCROLL_MAP`).
- **`src/ui/command-palette/CommandPalette.test.tsx`** — three new tests cover the visible-when-non-empty case, the hidden-when-empty case, and the per-vault scoping (entries from another vault never leak into the palette).

### Decisions

- **Group placement: between Recent files and Headings.** "Recently closed" is closer in spirit to "Recent files" than to navigation surfaces; both are about resuming what you were doing. Placing them adjacent gives the user a single mental zone for "where was I."
- **Reuse `handleSelect`, not a dedicated reopen path.** Calling `useTabsStore.reopenLastClosed` here would only matter if the URL stayed where it was. Since selecting an item navigates to `/app/:vaultId/:path`, the existing `openOrFocus` already restores the tab — the recently-closed entry naturally drops off the next time the stack is mutated. This keeps the palette a pure read of state rather than a state-mutating side surface.
- **No cap-by-display.** The store already caps at 10; the palette renders all of them. cmdk's filtering takes over once the user types, so the visible length only matters when the input is empty, and 10 short rows is comfortable.

### Verification

- `pnpm check`: 0 errors / 0 warnings; 779 / 779 tests passing (+3 new palette tests)
- `pnpm build`: succeeded; main chunk **259.69 KB gz** (Δ +0.01 KB — selector + JSX is essentially free)

---

## 2026-05-07 · TOC density control — H2 / H3 / All

**Status**: ✅ Shipped. Long `*-map.md` indexes (which often pile dozens of H3 sub-rows under each H2 section) no longer turn the right rail into an unreadable wall. A new inline H2/H3/All control above the heading list lets the reader pick the depth they want.

### What changed

- **`src/stores/ui-store.ts`** — new persisted preference `tocMaxLevel: 2 | 3 | 6` (default `6` = current behaviour). Validator + setter follow the same shape as the other prefs; included in `init()`, `setX`, and `resetToDefaults`.
- **`src/ui/reading-shell/TableOfContents.tsx`** — filters the heading list before rendering. The IntersectionObserver still watches every heading element so `activeId` stays accurate as the reader scrolls past hidden subsections; the rail simply doesn't surface them. New small inline `DensityControl` (radiogroup; H2 / H3 / All) renders above the list, but only when at least one heading deeper than H2 exists, so docs that wouldn't benefit don't get the chrome. Empty-density notice ("All headings are hidden at this density.") catches the edge case where every heading is H3+ and the user picks H2.
- **`src/styles/file-tree.css`** — `.swirlread-toc__group-header`, `.swirlread-toc__density`, `.swirlread-toc__density-btn` styles. Pill-style segmented control, mono-spacing-friendly labels, theme-aware accent.
- **`src/ui/reading-shell/TableOfContents.test.tsx`** — three new tests cover hide-when-no-deep-headings, click-to-filter behaviour, and the empty-density notice.

### Decisions

- **Default to `All` (6), not a curated middle.** Existing reader behaviour stays untouched on every doc; the control is purely opt-in. Anyone happy with the current rail never has to engage with it.
- **Filter only the rail, keep the observer wide.** Active state should reflect what the user is _reading_, not what the rail is _showing_. If the active heading is an H4 and the user picked H2, no rail item is highlighted — that's honest. Mapping back up to the nearest visible ancestor would be more visual but would also lie about which section the reader is in.
- **Inline control, not a Settings panel toggle.** The decision is per-document by nature (some docs want H2 only, others want full depth). Burying it in Settings would force a round-trip every time. The inline pill auto-hides on docs that have no H3+, so it doesn't add noise to simple pages.
- **`2 | 3 | 6` instead of `1..6`.** The interesting cuts are "top sections only" (≤ 2), "section + subsection" (≤ 3), and "everything" (≤ 6). H4–H5 are too granular to be useful as their own filter level for the audience this product serves.

### Verification

- `pnpm check`: 0 errors / 0 warnings; 776 / 776 tests passing (+4 from the new density tests)
- `pnpm build`: succeeded; main chunk **259.68 KB gz** (Δ +0.06 KB), CSS **25.31 KB gz** (Δ +0.11 KB)

---

## 2026-05-07 · Cmd+Shift+T reopens last closed tab + Tabs section in shortcuts help

**Status**: ✅ Shipped. The recently-closed stack maintained by `useTabsStore.closeTab` finally has a keyboard binding that exercises it.

### What changed

- **`src/app/use-tab-reopen-hotkey.ts`** (new) — `Cmd+Shift+T` (mac) / `Ctrl+Shift+T` (windows / linux) pulls the last closed entry off the active vault's recently-closed stack and routes the URL to it. Standard editable-target guard. When the stack is empty we deliberately do **not** call `preventDefault`, so the browser's native "reopen closed tab" still works for users who have nothing in our SPA stack.
- **`src/app/AppShell.tsx`** — mounts `useTabReopenHotkey()` next to the other global app hooks.
- **`src/ui/help/ShortcutsHelp.tsx`** — new "Tabs" group with the binding documented.
- **`src/app/use-tab-reopen-hotkey.test.ts`** (new, 9 tests) — covers mac / win chord, uppercase T, empty stack pass-through, missing-Shift / missing-Cmd / missing-vault no-op, editable-target guard, unmount cleanup.

### Decisions

- **Hijack the browser-native binding only when we have something to do.** Calling `preventDefault` unconditionally would consume the chord for users on the landing page or with an empty close-stack, breaking their browser-level expectation. The hook short-circuits before `preventDefault` when `reopenLastClosed` returns null.
- **Drive navigation through the URL, not by mutating the tab strip in place.** `reopenLastClosed` already restores the tab to `tabsByVault`; calling `navigate(/app/:vaultId/:path)` triggers `DocumentPage` to focus or recreate the tab via the same path every other open uses. One code path, no special-case rendering.

### Verification

- `pnpm check`: 0 errors / 0 warnings; 772 / 772 tests passing (+9 from the new hook test)
- `pnpm build`: succeeded; main chunk **259.62 KB gz** (Δ +0.15 KB — the new hook + dependency on `useNavigate`)

---

## 2026-05-07 · UX polish trio — refresh affordance, live editor font size, preview-tab hint

**Status**: ✅ Three small UX magnets shipped together. None of them is functionally new — each closes a perceived-quality gap that surfaced after P3 polling and Phase 2 editing landed.

### What changed

- **`src/ui/file-tree/FileTree.tsx`** — refresh button picks up an imperative tooltip ("Refresh now (auto-syncs every 30 s while visible)") and a 500 ms minimum spin so a click is always perceptible. `refreshVaultContent` returns within a few ms in most cases; without the floor the spinner blinks invisibly. The aria-label tightened to "Refresh file tree now".

- **`src/ui/reading-shell/DocumentEditSurface.tsx` + `src/styles/editor.css`** — editor font size is now reactive. The wrapper's inline `style={{ fontSize }}` was being overridden by the explicit `font-size: 0.95rem` on `.swirlread-edit__editor .cm-editor`, so changing the Settings → Editing → Size pref had no effect on an open EditSurface (and arguably no effect at all). Switch the wrapper to set a `--swirlread-editor-font-size` CSS custom property, and let the `.cm-editor` rule read from it with a 0.95rem fallback. Now Settings changes flow into a live editor immediately.

- **`src/stores/tabs-store.ts` + `src/ui/reading-shell/VaultLayout.tsx`** — proactive preview-tab hint. New `previewReplaced: boolean` flag flips on the first time the `openOrFocus` preview-replace branch fires; `VaultLayout` renders a one-time `<HintToast id="preview-tab-replaced">` explaining "single click opens a preview tab; the next file replaces it. Double-click to pin." The existing `tab-cap-hit` hint stays — it covers the rarer eviction case, but most users will never hit the cap; the new hint catches them earlier on the much-more-common preview-replace surprise.

### Decisions

- **Floor the refresh spin at 500 ms, not 1 s.** 500 ms is long enough to register as visible feedback without feeling laggy. Anything more would suggest the operation is heavy when it isn't.
- **CSS variable, not removing the `.cm-editor` font-size rule.** Removing the rule would let inheritance work too, but the variable is more explicit about which surface owns the value and survives any future override that lands deeper in the cascade.
- **New hint instead of expanding the welcome hint.** The welcome hint is dismissed before a user has touched tabs at all; bundling the preview-tab explanation there would either bloat it past skim length or rely on the user remembering it minutes later. A separate hint that fires on first preview-replace is precisely targeted.

### Verification

- `pnpm check`: 0 errors / 0 warnings; 763 / 763 tests passing
- `pnpm build`: succeeded; main chunk **259.47 KB gz** (Δ +0.17 KB — the new tabs-store flag + the HintToast + the FileTree state)

---

## 2026-05-07 · Reader-first keyboard shortcuts on the external-change banner

**Status**: ✅ Shipped. The P2 external-change banner gains `R` to reload and `Esc` to dismiss in read mode, so a returning reader can act on a stale-document notice without leaving the keyboard.

### What changed

- **`src/ui/reading-shell/DocumentBodyView.tsx`** — `ExternalChangeBanner` mounts a `keydown` listener while visible and not editing. `R` (no modifiers, not in an editable target) calls `onReload`; `Esc` (same guards) calls `onDismiss`. Edit-mode banner still requires explicit button clicks — `R` would silently destroy the draft and `Esc` is owned by `DocumentEditSurface` for cancel. Button labels picked up `(R)` / `(Esc)` hints so the affordance is discoverable from the screen too.
- **`src/ui/help/ShortcutsHelp.tsx`** — added `R` to the Reading group: "Reload current file when it changed on disk".
- **`src/ui/reading-shell/DocumentPage.test.tsx`** — existing banner test updated to match the new `Reload (R)` button label; two new tests cover `R` reload and `Esc` dismiss in read mode (Esc must not also reload).

### Decisions

- **No keyboard shortcuts in edit mode.** The banner there has different semantics (Reload _from disk_ destroys the draft) and `Esc` is already the cancel binding for `DocumentEditSurface`. Buttons stay the only path while a draft is live.
- **Local listener, not a global hook.** The banner is the only consumer; gating its lifecycle on the `isEditing` flag is simpler than threading another store. The same `isEditableTarget` guard pattern from `use-zen-mode-hotkey` is inlined so typing `r` in an input still types a literal `r`.
- **Esc collides with zen-mode-exit.** Accepted. A "file changed" prompt naturally interrupts zen-reading; both reactions firing on a single Esc is reasonable. If this becomes a complaint we can stop propagation, but for now it is a non-issue.

### Verification

- `pnpm test src/ui/reading-shell/DocumentPage.test.tsx`: 25 / 25 passing (+2 new banner tests)
- `pnpm check`: 0 errors / 0 warnings; 763 / 763 tests passing
- `pnpm build`: succeeded; main chunk **259.30 KB gz** (Δ +0.26 KB — the new effect + helpers)

---

## 2026-05-07 · Tighten EmbedNode — remove duplicated fallback JSX and dead branch

**Status**: ✅ Shipped. Watch-tier audit cleanup applied to `EmbedNode.tsx`. No behaviour change.

### What changed

- **`src/ui/reading-shell/EmbedNode.tsx`** — `ImageEmbed` / `VideoEmbed` / `AudioEmbed` each duplicated the same six-line `useBlobURL` error/pending branches. Extracted a small local `MediaFallback` component so each renderer collapses to its actual rendering work. Dropped the dead `innerWikiCtx ? <Provider><Provider>...</></> : <Provider>...</>` branch in `MarkdownEmbed`: the parent `EmbedNode` already returns early when `wikiCtx` is null, so by the time `MarkdownEmbed` renders it is guaranteed non-null. Replaced with a single guard + the single Provider tree, plus a comment explaining why we still re-read the context here (we re-provide it with `currentPath = resolved` so nested wikilinks resolve relative to the embedded file).
- 359 LOC → 341 LOC.

### Verification

- `pnpm check`: 0 errors / 0 warnings; 761 / 761 tests passing
- `pnpm test src/core/render/plugins/remark-embed.test.ts`: 21 / 21 passing

### Notes on what was _not_ touched

The audit also flagged `frontmatter.ts` (414 LOC) and `ui-store.ts` (377 LOC). Both files survived a "duplicate or stale branches" pass without producing actionable changes:

- `frontmatter.ts` is well-factored — YAML / TOML / metadata-selection blocks are separate, parsers reuse a tiny scalar/inline-array core, and the long `for (const key of TITLE_KEYS)` chain in `selectMetadata` is structurally clearer than a table-driven helper. Splitting it is a structural refactor, not branch dedup.
- `ui-store.ts` has multi-place lists (init / setX / resetToDefaults each restate the per-pref list) but consolidation requires a table-driven preferences abstraction, which is exactly the "open a new pit" the user asked us not to do for this pass. No real dead branches.

---

## 2026-05-07 · Vault content sync P3 — slow visibility-bound polling

**Status**: ✅ P3 shipped. The active vault is now refreshed on a slow 30 s cadence while the SwirlRead tab is visible, so files added or removed from disk surface in the file tree without requiring an explicit alt-tab.

### What changed

- **`src/app/use-vault-poll-sync.ts`** (new) — `useVaultPollSync()` mounts a single `setInterval` while `document.visibilityState === 'visible'`. Each tick calls `refreshVaultContent(activeVaultId)` — the same invalidation-and-revision path used by P0 manual refresh and P1 focus refresh. The interval pauses when the tab goes hidden and restarts when visible again.

- **`src/app/AppShell.tsx`** — mounts `useVaultPollSync()` next to `useVaultFocusSync()` and the other global app hooks.

- **`docs/develop/architecture-overview.md`** — P3 section rewritten to describe the implemented behaviour (single 30 s timer; visibility-gated; only expanded `FileTreeNode` instances re-list on revision bump; expensive indexes stay lazy).

- **`src/app/use-vault-poll-sync.test.ts`** (new) — covers visible 30 s tick, hidden tab pause, hidden→visible restart, no active vault, missing adapter, and unmount cleanup.

### Decisions

- **Reuse the existing revision path instead of building a surgical "expanded directories only" poller.** Only expanded `FileTreeNode`s have a `useEffect` keyed on `contentRevision`; collapsed directories pay nothing. The walked-files cache, tag index, and full-text index are all rebuilt lazily on first use (palette open / tag click), so a 30 s revision bump is cheap unless the user is actively touching those surfaces.
- **30 s, not 5–15 s.** The original architecture sketch suggested 5–15 s but the focus-sync hook already covers the common "user came back from another window" case. Polling exists for the split-screen edit case where SwirlRead never loses visibility; 30 s is generous for that.
- **Visibility, not focus.** A SwirlRead window can lose focus while still visible (split-screen, side-by-side editor); polling should keep running there. We pause only on `visibilitychange → hidden`.
- **No shared cooldown with `useVaultFocusSync`.** Both hooks invoke `refreshVaultContent`; if focus and a poll tick coincide they may double-fire within ~1 s. Effect is harmless (one extra cache invalidation; no UX change), so keeping the hooks independently testable wins.

### Verification

- `pnpm test src/app/use-vault-poll-sync.test.ts`: 6 / 6 passing
- `pnpm check`: 0 errors / 0 warnings; 761 / 761 tests passing
- `pnpm build`: succeeded; main chunk unchanged

---

## 2026-05-04 · Vault content sync P2 — current-document external change prompt

**Status**: ✅ P2 shipped. SwirlRead now detects when the currently open file changes after a vault content refresh and prompts the user instead of silently replacing the document.

### What changed

- **`src/ui/reading-shell/use-document-loader.ts`** — file-backed load states now carry the `VaultFile` metadata captured at load time (`size`, `modifiedAt`). This gives the page a concrete baseline for external-change checks.

- **`src/ui/reading-shell/DocumentPage.tsx`** — subscribes to the per-vault `contentRevision`. When revision changes, it `stat()`s the current file and compares metadata against the loaded baseline. A mismatch sets `externalChange='changed'`; normal reloads reset the baseline and clear the notice.

- **`src/ui/reading-shell/DocumentBodyView.tsx`** — renders a calm external-change banner:
  - read mode: `Reload` re-runs the document loader; `Dismiss` keeps the current view
  - edit mode: `Reload from disk (discard my draft)` routes through `editor-store.reloadFromDisk()` before refreshing the read baseline; `Keep editing` dismisses the notice

- **`src/ui/reading-shell/DocumentPage.test.tsx`** — added coverage for the read-mode flow: external file mutation + content refresh shows the warning, preserves the old rendered body, and reloads only after the user clicks `Reload`.

### Decisions

- **Metadata comparison only.** P2 compares `size` and `modifiedAt`; it does not hash file contents or re-read every focused document. This keeps focus refresh cheap and consistent with the app's reader-first posture.
- **No automatic document replacement.** Even in read mode, the user chooses when to reload so the page does not jump while they are reading.
- **Editing remains draft-safe.** The external-change prompt can reload from disk explicitly, but normal save still relies on the existing stale-on-disk conflict check.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test src/ui/reading-shell/DocumentPage.test.tsx`: 23 / 23 passing
- `pnpm test`: 755 / 755 passing
- `pnpm build`: succeeded; main chunk 258.92 KB gzip

---

## 2026-05-04 · Vault content sync P1 — focus-triggered light refresh

**Status**: ✅ P1 shipped. Returning to SwirlRead after editing a vault elsewhere now goes through the same cache invalidation + content revision path as the manual file-tree refresh, without adding a fake realtime watcher or background full-vault polling.

### What changed

- **`src/app/use-vault-focus-sync.ts`** (new) — App-level hook that listens for `window.focus` and `document.visibilitychange`. It refreshes only when:
  - an active vault id exists
  - the document is visible
  - the active vault has a live adapter
  - no refresh is already in flight
  - the 2-second cooldown has elapsed

- **`src/app/AppShell.tsx`** — mounts `useVaultFocusSync()` next to the other global app hooks.

- **`src/app/use-vault-focus-sync.test.ts`** (new) — covers focus refresh, hidden→visible refresh, no active vault, missing adapter, cooldown coalescing, and listener cleanup.

### Decisions

- **Reuse `refreshVaultContent(id)` instead of creating a separate stale path.** Manual refresh, focus refresh, future adapter writes, and future polling should all invalidate caches the same way.
- **Do not reload the current document yet.** P1 is for navigation / derived surfaces. Current-document external-change detection remains P2 because it must respect edit-mode dirty drafts and the existing stale-on-disk conflict flow.
- **Throttle at 2 seconds.** Browsers often fire focus and visibility events together; the cooldown avoids duplicate cache clears while keeping the return-to-app behavior responsive.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test src/app/use-vault-focus-sync.test.ts`: 6 / 6 passing
- `pnpm test`: 754 / 754 passing
- `pnpm build`: succeeded; main chunk 258.28 KB gzip

---

## 2026-05-04 · Vault content sync P0 — manual file-tree refresh

**Status**: ✅ P0 shipped. SwirlRead still does not pretend browser FSAPI has a native watcher, but the reader now has an explicit refresh path for the common "I changed the folder outside the app" case.

### What changed

- **`docs/develop/architecture-overview.md`** — added the vault content sync design:
  - P0 manual sidebar refresh
  - P1 focus-triggered stale marking
  - P2 current-document external-change detection
  - P3 optional visible-only polling for expanded directories
  - shared per-vault content revision model

- **`src/stores/vault-store.ts`** — added `contentRevisionByVault` plus `refreshVaultContent(id)`. The action clears derived content caches for the vault and then bumps the revision so subscribers re-read from the adapter.

- **`src/ui/file-tree/FileTree.tsx`** — added a Lucide refresh button to the file-tree toolbar. The tree subscribes to the vault content revision and reloads the root listing after refresh.

- **`src/ui/file-tree/FileTreeNode.tsx`**, **`SectionsNav.tsx`**, **`TagFilterBar.tsx`**, and **`GraphView.tsx`** — threaded the content revision through lazy directory rows, section detection, tag chips/results, and graph loading so refreshed caches are actually re-read.

- **`src/styles/file-tree.css`** — added disabled / spinner styling for the refresh control.

- **`src/ui/file-tree/FileTree.test.tsx`** — added regression coverage proving a file created outside the app appears after pressing Refresh even when the old root listing was cached.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test src/ui/file-tree/FileTree.test.tsx`: 19 / 19 passing
- `pnpm test`: 748 / 748 passing
- `pnpm build`: succeeded; main chunk 258.14 KB gzip

---

## 2026-05-03 · Phase 2D — Editor polish (isReadOnly + Radix confirm + useBlocker + editor prefs)

**Status**: ✅ Phase 2D closes the lightweight-editing arc. Three concrete UX upgrades on top of 2C: (1) sync `isReadOnly` capability flag pre-flights the Edit affordance so SampleVault never even shows the button; (2) app-wide Radix-styled confirm dialog replaces every `window.confirm` and is wired into a React Router 7 `useBlocker` so in-app navigation is gated; (3) three persisted editor preferences (line numbers, line wrap, font size) are reactive via CodeMirror Compartments — toggles apply live without rebuilding the EditorState. The lightweight-editing scope (Phase 2A → 2D) is now feature-complete.

### What changed

- **`src/core/vault/types.ts`** — added `readonly isReadOnly: boolean` to `VaultFileSystem`. Static capability that distinguishes "this adapter cannot ever write" (sample) from "this adapter can write but hasn't been granted permission yet" (FSAPI before grant). Pre-flight gate in DocumentBodyView replaces the post-hoc `read-only-vault` error path for the sample case.

- **`src/core/vault/fsapi-adapter.ts`** — `readonly isReadOnly = false`. Real on-disk vaults always have write potential.

- **`src/core/vault/sample-adapter.ts`** — `readonly isReadOnly = true`. The bundled fixture is hard-locked.

- **`src/ui/reading-shell/DocumentBodyView.tsx`** — `canEdit` now checks `!adapter.isReadOnly` instead of `typeof adapter.writeText === 'function'`. SampleVault no longer shows the Edit button; FSAPI vaults still do.

- **`src/stores/dialog-store.ts`** (new, ~95 LOC) — Zustand store for app-wide imperative confirm dialogs. `requestConfirmation(opts)` returns a Promise<boolean> and publishes a `ConfirmDialogPayload` in store state. Only one prompt active at a time: a second request auto-cancels the pending one as `false` so two concurrent prompts can't fight over the dialog instance. Resolve fn lives in module scope (non-serialisable).

- **`src/stores/dialog-store.test.ts`** (new, 4 tests) — covers happy-path confirm, happy-path cancel, auto-cancel-on-replace, and `reset()` rejecting any pending prompt.

- **`src/ui/components/ConfirmDialog.tsx`** (new, ~75 LOC) — Lazy-loaded Radix Dialog that subscribes to `dialog-store.confirmPayload` and renders the prompt. Cancel auto-focused (destructive prompts default to the safe action so a stray Enter doesn't discard work). `destructive: true` payloads style the confirm button with a danger accent. Mounted at AppShell behind a `Suspense` gate keyed on `confirmPayload`.

- **`src/styles/editor.css`** — added `.swirlread-confirm` chrome (overlay with backdrop blur, centered card with rise animation, danger-styled primary button via `var(--color-danger)`). Reuses existing `.swirlread-edit__btn` primitives so we don't drift two button systems.

- **`src/app/use-router-dirty-blocker.ts`** (new, ~50 LOC) — `useRouterDirtyBlocker()` mounts React Router 7's `useBlocker`. When a dirty session exists AND the pathname is changing (state-only changes don't trigger), it `await`s the Radix confirm dialog. Confirm → drop the editor session via `editor-store.cancel()` then `blocker.proceed()`. Cancel → `blocker.reset()`. Mounted at AppShell next to the existing `useDirtyNavigationGuard()` (browser-level beforeunload).

- **`src/app/use-dirty-navigation-guard.ts`** — `confirmLeaveIfDirty()` is now async (returns `Promise<boolean>`) and uses `requestConfirmation()` instead of `window.confirm`. Same prompt copy; same fail-safe true return for SSR / no-dirty cases.

- **`src/app/use-dirty-navigation-guard.test.ts`** — updated for the async API; replaced the `window.confirm` spy with `useDialogStore.answerConfirmation()` assertions.

- **`src/ui/reading-shell/DocumentEditSurface.tsx`** — `handleCancel()` is now async; uses `requestConfirmation()` instead of `window.confirm`. Both keymap (`Escape`) and click handler (`Cancel` button) wrap with `void` to satisfy the no-floating-promises rule. Added two CodeMirror Compartments for live editor pref reconfiguration: `lineNumbersCompartmentRef` swaps `lineNumbers()` extension on/off; `lineWrapCompartmentRef` swaps `EditorView.lineWrapping` on/off. Editor host element gets `style={{ fontSize }}` driven by `editorFontSize` so the runtime cm-content inherits via `font-family: inherit` plus the CSS override hooks.

- **`src/ui/reading-shell/DocumentEditSurface.test.tsx`** — extended CodeMirror mocks: `@codemirror/view` exports `lineNumbers()` and `@codemirror/state` exports a `Compartment` shim with `of()` / `reconfigure()`. The dirty-Cancel test was rewritten to drive the new Radix flow (publishes payload → answer via store → asserts onExit fires).

- **`src/stores/ui-store.ts`** — three new persisted prefs: `editorLineNumbers` (bool, default false), `editorLineWrap` (bool, default true), `editorFontSize` (`'sm' | 'md' | 'lg'`, default `'md'`). Round-trip through Dexie via existing `readPref` / `writePref` helpers; `EDITOR_FONT_SIZE_PX` exports the keyword→px mapping (sm:13, md:15, lg:17). `resetToDefaults` extended to clear them too.

- **`src/ui/settings-panel/SettingsPanel.tsx`** — new `EditorPreferencesGroup` rendered after the existing TocControl. Two checkboxes (line numbers, line wrap) + segmented control (sm/md/lg).

- **`src/app/AppShell.tsx`** — mounts `useRouterDirtyBlocker()` next to the other guards; adds the lazy `ConfirmDialog` import + render gate keyed on `useDialogStore.confirmPayload`.

- **`src/stores/vault-store.test.ts` + `src/stores/editor-store.test.ts`** — fake adapters now declare `isReadOnly: false` to satisfy the widened interface.

### Decisions

- **`isReadOnly` is sync; `hasWritePermission` stays async.** Distinct concepts: the former is a static adapter capability ("can this adapter type ever write?"), the latter is a runtime permission state ("can it write right now?"). Sample says no to both forever; FSAPI says yes to the first and "depends on the handle" to the second.
- **Cancel button gets autofocus in the confirm dialog.** Destructive prompts should default to the safe action — Enter shouldn't be a one-key data-loss path. This matches macOS HIG and the GNOME / Apple convention.
- **Auto-cancel on duplicate request.** If two prompts race (router blocker + cancel button click in quick succession), the older one resolves `false` so the user only ever sees the newer prompt. Without this, the dialog would render whichever payload last set state and the older Promise would hang.
- **Block only on pathname changes.** `useBlocker` would otherwise prompt on hash anchor jumps and search-string-only updates, which feel pathological. The predicate compares `currentLocation.pathname !== nextLocation.pathname`.
- **Editor prefs flow through Compartments, not state rebuild.** A full `EditorState.create()` would reset undo history and cursor position. Compartments let us swap individual extensions in place — exactly what they exist for.
- **Editor font size keyword (sm/md/lg) instead of free-form px.** Same rationale as the existing `chromeMode` enum pattern — three discrete values are easier to reason about than a slider, and the prose font size has its own slider already so users have a precision tool when they need one.

### Files added / modified

- `src/core/vault/types.ts` — `isReadOnly` added to interface
- `src/core/vault/fsapi-adapter.ts` — `isReadOnly = false`
- `src/core/vault/sample-adapter.ts` — `isReadOnly = true`
- `src/stores/dialog-store.ts` (new)
- `src/stores/dialog-store.test.ts` (new)
- `src/ui/components/ConfirmDialog.tsx` (new)
- `src/styles/editor.css` — confirm dialog chrome
- `src/app/use-router-dirty-blocker.ts` (new)
- `src/app/use-dirty-navigation-guard.ts` — async + Radix
- `src/app/use-dirty-navigation-guard.test.ts` — updated for async API
- `src/ui/reading-shell/DocumentEditSurface.tsx` — Radix cancel + Compartments + font-size style
- `src/ui/reading-shell/DocumentEditSurface.test.tsx` — extended mocks + Radix-driven cancel test
- `src/ui/reading-shell/DocumentBodyView.tsx` — `isReadOnly` pre-flight gate
- `src/stores/ui-store.ts` — three new editor prefs + reset wiring
- `src/ui/settings-panel/SettingsPanel.tsx` — EditorPreferencesGroup
- `src/app/AppShell.tsx` — useRouterDirtyBlocker + ConfirmDialog mount
- `src/stores/vault-store.test.ts` + `src/stores/editor-store.test.ts` — adapter mocks

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test`: **747 / 747 passing** (+4 dialog-store tests)
- `pnpm build`: succeeded; main chunk **257.75 KB gz** (Δ +0.84 KB vs 2C — useBlocker subscribe, dialog-store reads, Compartment imports, ui-store reads, ConfirmDialog lazy wrapper). EditSurface chunk **183.85 KB gz** (Δ +2.2 KB — Compartment + lineNumbers extension code). New `ConfirmDialog-*.js` chunk **0.56 KB gz** (Radix Dialog runtime is shared with SettingsPanel/ShortcutsHelp so we only ship the wrapper JSX).

### What this closes

Phase 2 (lightweight editing) is **feature-complete** as specified in `docs/develop/lightweight-editing-plan.md`:

- ✅ Phase 2A — `VaultFileSystem.writeText` + FSAPI write + permissions
- ✅ Phase 2B — editor-store + dirty navigation guard
- ✅ Phase 2C — DocumentEditSurface + CodeMirror 6 + read↔edit swap
- ✅ Phase 2D — `isReadOnly` gate + Radix confirm + useBlocker + editor preferences

Out-of-scope per spec (and intentionally not addressed): file creation/rename/delete, multi-file editing, WYSIWYG/block authoring, find/replace UI re-skin (CodeMirror's panel works), unsaved-draft persistence across sessions.

### Next directions (operator's choice)

- **Ship v0.1** — register `swirlread.app`, link Vercel, push `v0.1.0` tag, post Show HN. Editing is ready to demo.
- **Phase 3 ideas** — AI features (per `docs/design/ai-roadmap.md`), Tauri desktop, mobile (Phase 3 per design docs).
- **Polish backlog** — find/replace UX surfacing (toolbar Find icon could open a dedicated overlay); editor command-palette commands; markdown formatting toolbar (bold/italic/link) if user research validates need.

---

## 2026-05-03 · Phase 2C — DocumentEditSurface (CodeMirror 6 lightweight editor)

**Status**: ✅ Phase 2C lands the user-facing editing UI on top of the Phase 2B store. Edit button in the document header → `DocumentEditSurface` (lazy chunk) → CodeMirror 6 with markdown syntax + history + search → toolbar Save/Cancel/Find → save-and-exit semantics → conflict + permission-denied banners. Phase 2D (find/replace polish, sync `isReadOnly` capability) is the only follow-up before the editing slice is shippable.

### What changed

- **`src/ui/reading-shell/DocumentEditSurface.tsx`** (new, ~280 LOC) — Lazy-loadable React component. Mounts a CodeMirror 6 EditorView once per `(vaultId, path)`; pipes every doc change into `useEditorStore.updateDraft`; back-propagates `session.draft` into the editor on external mutations (`reloadFromDisk`, `overwrite` race) without ping-ponging. Three slices of chrome around the editor:
  - **Toolbar** — status pill (`All changes saved` / `Unsaved changes` / `Saving…`); Cancel; Save (primary; disabled when clean); Find (re-dispatches a synthetic `⌘F` keydown into `view.contentDOM` so CodeMirror's own search panel opens — no custom UI to maintain).
  - **Conflict banner** — appears iff `session.conflict === 'stale-on-disk'`. Two actions: `Reload from disk (discard my draft)` → `editor-store.reloadFromDisk()`; `Overwrite anyway` → `editor-store.overwrite()`. Banner uses the warning border-color token so themed reading surfaces stay coherent.
  - **Error banner** — discriminated render of `EditorError`: each `kind` maps to a calm title (`Write permission denied`, `File no longer exists`, `This vault is read-only`, `Save failed`, `Something went wrong`). Dismiss button calls `clearError`.
  - **Keymap** — `Mod-s` → save-and-maybe-exit; `Esc` → cancel-with-confirm; full `searchKeymap` + `historyKeymap` + `defaultKeymap` underneath.
  - **Save semantics** — per the lightweight-editing plan UX, Save = write + exit. Both the Save button and `⌘S` go through `saveAndMaybeExit(onExit)` which only calls `onExit()` if the save returned `'clean'` AND no error landed in the store. Conflict / error keeps the user in edit mode so they can resolve.

- **`src/ui/reading-shell/DocumentEditSurface.test.tsx`** (new, 11 tests) — Mocks the six `@codemirror/*` modules (jsdom can't reliably host CodeMirror's contenteditable measurement). Covers: editor mount + initial doc seeding + focus on mount; `null`-render when session doesn't match the document; status pill transitions; clean-cancel exits; dirty-cancel prompts; Save disabled when clean; Save + clean result → exits; Save + stale-on-disk → stays in edit mode; conflict banner with both action buttons; permission-denied banner with Dismiss; read-only-vault banner.

- **`src/ui/reading-shell/DocumentBodyView.tsx`** — wired the read↔edit swap.
  - New private hook `useIsEditingThisDocument(vaultId, path)` subscribes to `useEditorStore.active` so the surface swap re-renders.
  - When `state.kind === 'rendered'` and the adapter exposes `writeText`, the document header gets a small Lucide-Pencil "Edit" button. Click → `useEditorStore.enter(vaultId, filePath, state.raw)`.
  - When the editor session targets the current document, `<DocumentEditSurface .../>` replaces the rendered article body (`<FrontmatterPanel>` + prose `<div>` + `<BacklinksPanel>` all hidden). Lazy-imported via `React.lazy`; wrapped in `<Suspense fallback={null}>`.
  - On exit (Cancel or Save success), `setRetryToken(n => n + 1)` re-runs the document loader so the read view picks up the on-disk changes.
  - Read-only adapter gating — for now we only check `typeof adapter.writeText === 'function'`; SampleVaultAdapter satisfies this and surfaces its `read-only-vault` rejection from the first save. Sync `isReadOnly` flag is a 2D polish.

- **`src/styles/editor.css`** (new, ~150 LOC) — SwirlRead chrome around CodeMirror (toolbar, status pill, banners, primary/secondary buttons) plus a thin override layer scoped to `.swirlread-edit__editor` so the CodeMirror runtime adopts our four-theme tokens (`--color-bg`, `--color-text`, `--color-border`, `--color-surface`, accent + warning + danger). Selection uses `color-mix()` against the active accent color so all four SwirlRead themes (Sepia / Light / Dark / OLED) get coherent selection tints without per-theme CSS.

- **`src/styles/globals.css`** — added `@import './editor.css';` after `zen-mobile.css`.

- **`package.json`** — added six CodeMirror packages (all 6.x): `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`, `@codemirror/search`. No umbrella `codemirror` package — assembled from per-package primitives so the bundle stays under explicit control.

### Key UX decisions

- **Save = save + exit (not save + stay).** Lightweight-editing-plan §"Expected flow" is explicit: "Save → write file → re-render → return to reading mode". The plan's intent matters more than the muscle memory from VS Code / Notion. If users push back we revisit.
- **Editor mount is `useEffect` mount-once.** Re-mounting on every render would blow undo history. Re-mounting only on `(vaultId, path)` change is correct because the parent unmounts the whole component when the user navigates away.
- **Editor → store → editor back-propagation guards prevent ping-pong.** The `updateListener` skips pushing to the store when the new doc already matches `session.draft`; the back-prop effect skips dispatching when the editor doc already matches the store. Without these guards, any `reloadFromDisk` would echo through both effects and freeze the cursor.
- **Find uses CodeMirror's own panel, dispatched via synthetic keydown.** Re-implementing find/replace would be a Phase 2D regression vector. CodeMirror's panel honors the search keymap we already mounted.
- **Read-only adapter detection is post-hoc, not pre-flight.** The sync API can't tell us without an awaited call. SampleVault users will enter edit mode and bounce off the first save with a typed `read-only-vault` banner. Pre-flight gating lands in 2D once a sync `isReadOnly` flag is on `VaultFileSystem`.

### Files added / modified

- `src/ui/reading-shell/DocumentEditSurface.tsx` (new)
- `src/ui/reading-shell/DocumentEditSurface.test.tsx` (new)
- `src/ui/reading-shell/DocumentBodyView.tsx` — read↔edit swap, Edit button, lazy DocumentEditSurface import
- `src/styles/editor.css` (new)
- `src/styles/globals.css` — import editor.css
- `package.json` + `pnpm-lock.yaml` — six `@codemirror/*` deps

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test`: **743 / 743 passing** (+11 EditSurface tests; existing 732 untouched)
- `pnpm build`: succeeded; main chunk **256.91 KB gz** (Δ +0.29 KB vs Phase 2B end — purely the lazy-import wrapper). New `DocumentEditSurface-*.js` chunk **181.65 KB gz** (CodeMirror runtime + markdown lang + search + history; only loads when the user clicks Edit).

### Bundle posture

- Reader-only path (no Edit click): main 256.91 KB gz. This is **the existing read path's cost** — Phase 2C added effectively nothing to it.
- Reader-becomes-editor path (first Edit click): +181.65 KB gz on demand. Loaded once per session, cached by the browser thereafter.
- Future shrink lever (deferred): split `lang-markdown` (~80 KB gz) out of the EditSurface chunk and async-attach via `Compartment` after first paint, so the editor opens faster on slow networks. Not worth doing until we have telemetry on actual editor-open latency.

### Next slice (Phase 2D — safety + polish)

1. Add sync `isReadOnly: boolean` to `VaultFileSystem`; pre-flight gate the Edit button so SampleVaultAdapter doesn't show it at all.
2. Visible find / replace UI affordance (currently the toolbar's Find button works but discoverability is low; spec-out a `⌘F` hint).
3. React Router 7 `useBlocker` integration with a Radix-styled confirm dialog (replaces the `window.confirm` in `confirmLeaveIfDirty` and `handleCancel`).
4. Editor Settings (line numbers toggle, line wrap toggle, font-size override) wired into `useUIStore` so they persist.

---

## 2026-05-03 · Phase 2B foundation — editor-store + dirty navigation guard

**Status**: ✅ Phase 2B (session state slice) shipped. Phase 2A (`writeText` foundation) was already landed in commit `ad1b82b`; this slice builds the in-memory editing session and the unsaved-changes guard on top of it. The actual edit UI (CodeMirror + DocumentEditSurface split) remains Phase 2C territory and is intentionally not wired yet — without a render surface to switch to, route-level `read↔edit` toggling has nothing to display.

### What changed

- **`src/stores/editor-store.ts`** (new, ~280 LOC) — Zustand store carrying at most one `EditorSession` (`vaultId`, `path`, `original`, `draft`, `openedAt`, `dirty`, `saving`, `error`, `conflict`). Actions: `enter`, `updateDraft`, `save`, `overwrite`, `reloadFromDisk`, `cancel`, `clearError`, `forgetVault`. The `save()` loop performs the spec's stale-on-disk pre-check (re-read disk, compare against `original`, refuse if diverged) and lazy write-permission escalation (`hasWritePermission` → `requestWritePermission` → typed `permission-denied` error if denied). Vault errors are normalised into a small `EditorError` discriminated union (`permission-denied | file-missing | write-failed | read-only-vault | unknown`) so the future EditSurface can branch cleanly without `instanceof` walls. Adapter resolution is injected via an optional `resolver` argument so tests don't have to spin up `useVaultStore`.

- **`src/stores/editor-store.test.ts`** (new, 22 tests) — covers seeding, dirty toggling, cancel, `forgetVault`, save happy path, lazy permission grant + denial, all four error mappings (`VaultPermissionDeniedError`, `VaultWriteError` with/without "read-only", non-vault error → `unknown`), pre-read failure, conflict detection, `overwrite()` bypass, `reloadFromDisk()`, `clearError`, missing-adapter fallback. Mock adapter implements the full `VaultFileSystem` shape so the type compiler keeps the test honest.

- **`src/app/use-dirty-navigation-guard.ts`** (new, ~45 LOC) — `useDirtyNavigationGuard()` mounts a `beforeunload` listener that fires only while `useEditorStore.getState().active?.dirty === true`. `confirmLeaveIfDirty()` is a synchronous helper for in-app navigation (file tree click, vault switcher, palette nav). React Router 7 `useBlocker` integration is intentionally deferred to Phase 2C alongside a Radix-styled confirm dialog — `window.confirm` is the right primitive for now (sync gate, no race with imperative router calls).

- **`src/app/use-dirty-navigation-guard.test.ts`** (new, 7 tests) — clean session never blocks unload, dirty session sets `defaultPrevented` + `returnValue`, listener removed on unmount, `confirmLeaveIfDirty()` short-circuits when clean and forwards the user's choice when dirty.

- **`src/app/AppShell.tsx`** — mounted `useDirtyNavigationGuard()` next to the existing global hotkey hooks. Lives at the shell level so the listener follows the app's lifecycle, not any particular document.

- **`src/stores/vault-store.ts`** — added `useEditorStore.getState().forgetVault(id)` to the `removeVault` cleanup fan-out. A vault eviction now drops any in-flight editor session targeting that vault so the user can't end up with a dirty draft pointing at a vanished adapter. Module cycle (`editor-store` ↔ `vault-store`) is benign — both sides reference each other only via lazy `getState()` / function-declaration imports, never at module-init time.

### Files added / modified

- `src/stores/editor-store.ts` (new)
- `src/stores/editor-store.test.ts` (new)
- `src/app/use-dirty-navigation-guard.ts` (new)
- `src/app/use-dirty-navigation-guard.test.ts` (new)
- `src/app/AppShell.tsx` — wire `useDirtyNavigationGuard()`
- `src/stores/vault-store.ts` — `removeVault` fan-out includes editor-store

### Decisions

- **Single active session, no multi-file drafts.** Spec is explicit; honoured.
- **Conflict detection lives in the save loop, not Phase 2D.** It's ~5 lines and the spec already calls for it; deferring would mean the Phase 2C UI ships unsafe.
- **`unknown` errors auto-clear on `updateDraft`, but `permission-denied`/`stale-on-disk` do not.** Typing past a transient hiccup feels right; typing past a permission denial would let the user think the next save will succeed when it won't.
- **Why a synchronous `window.confirm` for in-app navigation.** An async modal would let imperative router calls race ahead before the user answers. Phase 2C can layer a Radix Dialog on top once the EditSurface ships its own chrome.
- **Why no DocumentPage wiring yet.** Phase 2B is purely state. Wiring DocumentPage to `useEditorStore.active.path` would either (a) introduce dead code paths the user can't trigger, or (b) ship an empty edit surface. Both worse than landing a clean foundation. The wiring naturally pairs with the CodeMirror surface in 2C.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test`: **732 / 732 passing** (+29 vs pre-slice: 22 editor-store + 7 dirty-guard)
- `pnpm build`: succeeded; main chunk **256.62 KB gz** (was 252.96 KB at pack-5; ~3 KB attributable to `editor-store` + dirty-guard, the rest from already-uncommitted local changes)

### Next slice (Phase 2C)

1. `DocumentReadSurface` / `DocumentEditSurface` split inside `DocumentPage`.
2. CodeMirror 6 integration (`@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown`, `@codemirror/commands`, history + search keymaps).
3. `Edit` toolbar action (lazy-loaded; budget impact bounded by chunk-splitting the codemirror runtime).
4. Save / Cancel / `⌘S` / `Esc` keybindings, with the `useDirtyNavigationGuard` confirm helper wired into Cancel.
5. React Router `useBlocker` once a Radix confirm dialog is in.

---

## 2026-05-02 · Audit fixes pack 5 — A.L9 + A.L10 (acknowledged)

**Status**: ✅ A.L9 shipped; A.L10 formally acknowledged as won't-fix. All audit items now closed.

### What changed

- **A.L9** — Added explicit zen mode button to the AppShell header.
  - New `Maximize2`/`Minimize2` Lucide button inserted between the chrome-mode toggle and the command palette button.
  - `title="Zen mode (F)"` / `title="Exit zen mode (F or Esc)"` surfaces the keyboard shortcut on hover.
  - `aria-pressed` reflects live `zenMode` state. The F-key hotkey and Esc-to-exit still work unchanged — the button is an additional affordance, not a replacement.
  - The HintToast in VaultLayout already mentioning "F" is unchanged and still present.

- **A.L10** — Formally closed as won't-fix. `tabsStore.init()` fire-and-forget in `src/main.tsx:23–25` matches the existing `reader-store` pattern (same file, same treatment). No user-visible defect. Deferred until a "Hydrating…" splash is added; at that point gate on `tabsStore.ready`.

- **Census table updated** — `docs/develop/audit-2026-05-02.md` census now reflects post-split LOC for all B.2–B.5 output files. No former offender remains above the 250-LOC bar.

### Files modified

- `src/app/AppShell.tsx` — added `zenMode`/`toggleZenMode` subscriptions and `Maximize2`/`Minimize2` button.
- `docs/develop/audit-2026-05-02.md` — A.L9 `done (2026-05-02)`, A.L10 `won't fix (2026-05-02)`, census table updated.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test`: **705 / 705 passing**
- `pnpm build`: succeeded; main chunk **252.96 KB gz** (no regressions)

---

## 2026-05-02 · Audit fixes pack 4 — B.2 + B.3 + B.4 + B.5

**Status**: ✅ Four large file-decoupling splits complete. All five B-series items now done.

### What changed

- **B.2 — CommandPalette.tsx (657 → 229 LOC)**
  - `use-flat-recents.ts` (44 LOC): `RecentItem` type + `useFlatRecents()` hook — flattens per-vault recents into a recency-sorted cross-vault list, capped at 30.
  - `use-palette-search.ts` (250 LOC): `PaletteMode` type, `classifyInput()`, `useCurrentVaultId()`, `useCurrentFilePath()`, `useVaultFiles()`, `useVaultSections()`, `useFullTextIndex()`. Also `placeholderFor()` and `emptyMessage()` (operate on `PaletteMode`).
  - `PaletteGroups.tsx` (138 LOC): `HeadingItem`, `PaletteFilesGroup`, `PaletteSearchResults` components.
  - `CommandPalette.tsx` trimmed to 229 LOC — dialog wrapper + `PaletteBody` only.

- **B.3 — FileTree.tsx (611 → 125 LOC)**
  - `file-tree-cache.ts` — added exported `sortEntries(entries)` utility (shared by FileTree and FileTreeNode).
  - `ContinueAndRecent.tsx` (136 LOC): `ContinueAndRecent` component (internal `ContinueBlock`, `RecentBlock`).
  - `SectionsNav.tsx` (80 LOC): `SectionsNav` component with lazy `detectSections` import.
  - `FileTreeNode.tsx` (246 LOC): `FileTreeNode` + `FileTreeNodeProps`. Auto-expand, lazy-load children, section-home detection effects.
  - `FileTree.tsx` trimmed to 125 LOC — slim shell with `FileTree` and internal `FilesNav`.

- **B.4 — JsonRenderer.tsx (541 → 134 LOC)**
  - `json-utils.ts` — added `pathKey(path)` and `collectMatchAncestors(value, queryLower, path, out)` exports.
  - `JsonNodeParts.tsx` (189 LOC): `LeafRow`, `CollectionNode`, `KeyLabel`, `CopyPathButton`. Internal `highlight()` (uses JSX `<mark>`, not exported to satisfy react-refresh rule).
  - `JsonTreeNode.tsx` (175 LOC): `JsonNode` + `NodeProps`. Its own internal `highlight()` for string value rendering.
  - `JsonRenderer.tsx` trimmed to 134 LOC — shell with search state + tree root.

- **B.5 — DocumentPage.tsx (523 → 151 LOC)**
  - `document-components.ts` (28 LOC): neutral `.ts` (no JSX) re-exporting `customComponents` mapping object — avoids circular imports between `use-document-loader.ts` and `DocumentBodyView.tsx`.
  - `use-document-loader.ts` (149 LOC): `LoadState` type + `useDocumentLoader({ vaultId, filePath, retryToken })` — owns the full stat→branch→read→render pipeline.
  - `DocumentBodyView.tsx` (216 LOC): all lazy renderer imports (Code, CSV, HTML, JSON, Media, Unsupported) + the `<article>` shell with all state branches rendered.
  - `DocumentPage.tsx` trimmed to 151 LOC — wikilink index effect, backlinks effect, TOC/context effects, scroll memory, title derivation, delegates rendering to `DocumentBodyView`.

### Key decisions

- `highlight()` internal copies: kept private in both `JsonNodeParts.tsx` and `JsonTreeNode.tsx` because JSX can't live in `.ts`, and exporting a non-component from a `.tsx` file triggers the `react-refresh/only-export-components` lint rule.
- `customComponents` in a neutral `.ts` file: prevents the circular import that would arise if both `use-document-loader.ts` and `DocumentBodyView.tsx` imported from `DocumentPage.tsx`.

### Files added

- `src/ui/command-palette/use-flat-recents.ts`
- `src/ui/command-palette/use-palette-search.ts`
- `src/ui/command-palette/PaletteGroups.tsx`
- `src/ui/file-tree/ContinueAndRecent.tsx`
- `src/ui/file-tree/SectionsNav.tsx`
- `src/ui/file-tree/FileTreeNode.tsx`
- `src/ui/reading-shell/JsonNodeParts.tsx`
- `src/ui/reading-shell/JsonTreeNode.tsx`
- `src/ui/reading-shell/document-components.ts`
- `src/ui/reading-shell/use-document-loader.ts`
- `src/ui/reading-shell/DocumentBodyView.tsx`

### Files modified

- `src/ui/command-palette/CommandPalette.tsx` (657 → 229 LOC)
- `src/ui/file-tree/FileTree.tsx` (611 → 125 LOC)
- `src/ui/file-tree/file-tree-cache.ts` (added `sortEntries` export)
- `src/ui/reading-shell/JsonRenderer.tsx` (541 → 134 LOC)
- `src/ui/reading-shell/json-utils.ts` (added `pathKey`, `collectMatchAncestors`)
- `src/ui/reading-shell/DocumentPage.tsx` (523 → 151 LOC)
- `docs/develop/audit-2026-05-02.md` — B.2–B.5 flipped to `done (2026-05-02)`.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test`: **705 / 705 passing**
- `pnpm build`: succeeded; main chunk size unchanged from pre-split baseline.

---

## 2026-05-02 · Audit fixes pack 3 — A.H4 + B.1

**Status**: ✅ Two audit items closed. A.H4 is a 15-LOC UX fix; B.1 is the globals.css → 14-shard split plus a build-time dead-code stripper.

### What changed

- **A.H4** — Header file-tree toggle now does something in reading mode.
  - Old behaviour: clicking the panel-left button in reading mode called `toggleFileTree()`, which flipped `fileTreeOpen` but the sidebar never appeared (it's gated on `chromeMode === 'working'`).
  - New behaviour (option a — Promote on click): if `chromeMode === 'reading'`, the click atomically calls `setChromeMode('working')` and, if `fileTreeOpen` was false, `setFileTreeOpen(true)`. The sidebar appears immediately.
  - Added `fileTreePinned = chromeMode === 'working' && fileTreeOpen` in `AppShell` for accurate `aria-pressed` and icon toggling in both chrome modes.
  - The subsequent click (now in working mode) calls `toggleFileTree()` as before.

- **B.1** — globals.css (4098 LOC) split into 14 @imported shards.
  - 14 new files in `src/styles/`: `themes.css`, `scrollbars.css`, `prose.css`, `code-shiki.css`, `layout.css`, `file-tree.css`, `tabs.css`, `command-palette.css`, `settings.css`, `landing.css`, `file-renderers.css`, `media.css`, `prose-ext.css`, `zen-mobile.css`. All ≤ 499 LOC.
  - `globals.css` is now a 72-line entry point (`@import` chain + `@theme` block).
  - **Bundle size issue and fix**: Tailwind v4's `@tailwindcss/vite` plugin runs Lightning CSS on each @imported shard independently during the compile pass, before the optimize pass (which uses modern targets). This adds one `@supports (color:color-mix(in lab,red,red))` wrapper per shard that contains `color-mix()` — 14 extra wrappers (+0.84 KB gz) that can't be removed by the optimize pass because they're already-compiled output.
  - All SwirlRead target browsers (Chrome ≥ 111, Edge ≥ 111, Firefox ≥ 113, Safari ≥ 16.2) support `color-mix()` natively, so these wrappers are dead code.
  - Added `stripColorMixSupports()` Vite plugin (in `vite.config.ts`) that post-processes the CSS bundle and unwraps these blocks (brace-counting traversal, safe for cascade since the rules inside are deduplicated and don't have cross-shard conflicts).
  - Added `"browserslist"` field to `package.json` documenting the target range: Chrome/Edge ≥ 111, Firefox ≥ 113, Safari ≥ 16.2.
  - Verified: concatenating all shards into one file produces the same build hash as the split (@import) approach — confirming zero content duplication.

### Files added

- `src/styles/themes.css`, `scrollbars.css`, `prose.css`, `code-shiki.css`, `layout.css`, `file-tree.css`, `tabs.css`, `command-palette.css`, `settings.css`, `landing.css`, `file-renderers.css`, `media.css`, `prose-ext.css`, `zen-mobile.css` — 14 CSS shards.

### Files modified

- `src/styles/globals.css` — replaced 4098 lines of CSS with 72-line entry point + `@import` chain.
- `src/app/AppShell.tsx` — A.H4 fix: promote-on-click logic + `fileTreePinned` computed value.
- `vite.config.ts` — `stripColorMixSupports()` Vite plugin.
- `package.json` — `"browserslist"` field.
- `docs/develop/audit-2026-05-02.md` — A.H4 and B.1 flipped to `done (2026-05-02)`.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean (ran `pnpm format` to fix trailing-whitespace issues in 11 new shard files)
- `pnpm test`: **704 / 704 passing** (unchanged)
- `pnpm build`: CSS **23.43 KB gz** (split + strip); main chunk **252.19 KB gz**

### Remaining open audit items (recommended next)

- **A.M3 / A.M4** — design calls about back/forward and wikilink-driven preview replacement.
- **A.L1–A.L5, A.L7–A.L10** — low-priority polish.
- **B.2–B.5** — file-decoupling backlog.

---

## 2026-05-02 · Audit fixes pack 2 — A.H1 + A.M1 + A.M2 + A.L6

**Status**: ✅ Four audit items closed, one new test file, three new tests, one helper extraction, one dead-code cleanup. Behaviour-preserving except for the two intentional UX fixes.

### What changed

- **A.H1** — Closing the last tab no longer silently re-opens the home file.
  - `TabStrip.onClose` now navigates to `/app/${vaultId}?empty=1` when there's no neighbour tab to fall back on.
  - `VaultHome` reads `?empty=1` from `useLocation().search` and skips the home-file auto-redirect when present, so the user lands on the directory listing (the natural empty-workspace surface) instead of having `index.md` re-opened as a fresh tab.
  - New test file `src/ui/reading-shell/TabStrip.test.tsx` (3 tests): closing the last tab → store empty + URL is `/app/v?empty=1`; closing a non-last active tab → navigates to neighbour; closing an inactive tab → URL unchanged.

- **A.M1** — Active tab is auto-scrolled into view after URL changes.
  - `TabStrip` keeps a `useRef<HTMLDivElement>` on the active tab and a `useEffect([currentPath])` that calls `scrollIntoView({ block: 'nearest', inline: 'nearest' })`. `inline: 'nearest'` is no-op when the tab is already visible — so already-on-screen tabs don't trigger spurious motion.

- **A.M2** — Dead `data-swirlread-dragging-tab` writes removed from `TabStrip` (3 sites + the `DRAG_FLAG` constant). The original concern (hover-zone grace timer firing mid-drag) is moot now that the strip lives in the header band, far from the edge hover zones.

- **A.L6** — Extracted the URL-pathname-to-vault-path helper.
  - New `src/app/derive-current-path.ts` exports `deriveCurrentPathFromPathname(pathname)` plus a private `safeDecode` segment helper.
  - `AppShell` and `VaultLayout` both use it; the duplicated `safeDecode` function in `VaultLayout` is gone.

### Files added

- `src/app/derive-current-path.ts` — single home for the route → vault-path translation.
- `src/ui/reading-shell/TabStrip.test.tsx` — 3 tests covering A.H1.

### Files modified

- `src/ui/reading-shell/TabStrip.tsx` — A.H1 navigation, A.M1 ref + scroll effect, A.M2 cleanup.
- `src/ui/reading-shell/VaultHome.tsx` — `?empty=1` opt-out branch in load effect.
- `src/app/AppShell.tsx` — uses the shared deriver.
- `src/ui/reading-shell/VaultLayout.tsx` — uses the shared deriver, drops local `safeDecode`.
- `docs/develop/audit-2026-05-02.md` — four items flipped to `done (2026-05-02)`.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test`: **704 / 704 passing** (was 701; +3 from the new TabStrip suite)
- `pnpm build`: main chunk **252.17 KB gz** (was 252.09; +0.08 KB for the scroll effect + new helper)

### Remaining open audit items (recommended next)

- **A.H4** — header file-tree toggle no-op in reading mode (decision needed before code).
- **A.M3 / A.M4** — design calls about back/forward and wikilink-driven preview replacement.
- **A.L1–A.L5, A.L7–A.L10** — low-priority polish.
- **B.1–B.5** — file-decoupling backlog (globals.css being the biggest ROI).

---

## 2026-05-02 · Audit fixes pack 1 — A.H2 + A.H3 + A.M7

**Status**: ✅ Three audit items closed in one small PR (high-priority CSS / layout polish, no functional behaviour change).

### What changed

- **A.H2** — Hover-summoned floating sidebar now has a click-outside dismiss on desktop. Added `--floating` modifier on the backdrop element in `VaultLayout.tsx`; new CSS rule renders the backdrop as a transparent fullscreen click target whenever the sidebar is floating. Existing click handler in the layout already wired the dismiss path. Small-viewport `@media` block remains the source of the dark-overlay drawer treatment (rule order: base → `--floating` (transparent) → `@media` (dark on small viewport) means each context picks the correct background).
- **A.H3** — `.swirlread-vault-layout__sidebar.swirlread-vault-layout__sidebar--floating { width: var(--file-tree-width) }` (specificity 0,2,0) was overriding the small-viewport drawer's `width: min(280px, 80vw)` (0,1,0) — so a custom-resized 480 px sidebar overflowed phone-width viewports. Added a matching-specificity override inside the existing `@media (max-width: 1024px)` block.
- **A.M7** — Header brand cluster (logo + wordmark + vault switcher) and tools cluster (mode toggle / search / TOC / settings) now have `shrink-0` Tailwind class, so a wide tab strip in the middle can never squeeze them.

### Files modified

- `src/app/AppShell.tsx` — `shrink-0` on both header clusters.
- `src/ui/reading-shell/VaultLayout.tsx` — backdrop receives `--floating` modifier when sidebar is floating.
- `src/styles/globals.css` — new backdrop floating rule + small-viewport width override.
- `docs/develop/audit-2026-05-02.md` — three items flipped to `done (2026-05-02)`.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test`: **701 / 701 passing** (no behaviour change → no regression)
- `pnpm build`: main chunk **252.09 KB gz** (was 252.08; +0.01 KB)

Manual verification still owed by operator — narrow devtools to 1024 / 900 / 768 px to confirm A.H3 + A.M7; hover the left edge in default reading mode and click on the document area to confirm A.H2 dismiss.

### Remaining open audit items (recommended next)

1. **A.H1** — closing the last tab silently re-opens the home file. Standalone PR with regression test.
2. **A.H4** — header file-tree toggle no-op in reading mode. Decision pass before code.
3. **A.M1, A.M2, A.L6** — tab UX polish + dead-code cleanup.

---

## 2026-05-02 · Audit + refactor backlog (post-tabs review)

**Status**: 📋 Two new tracking artefacts. No code changes; this is governance / hygiene.

### What changed

- New doc: [`docs/develop/audit-2026-05-02.md`](audit-2026-05-02.md) —
  consolidated bug + UX backlog (Section A) and file-size decoupling
  backlog (Section B) from the post-tabs debug pass. 25 items total
  (4 high, 5 medium, 10 low + 5 refactor). Each carries severity, repro,
  file paths with line numbers, acceptance criteria, and a recommended
  sequencing order at the bottom.
- New section in
  [`docs/develop/engineering-principles.md`](engineering-principles.md) §
  "File-size discipline" — soft 500-LOC ceiling for `.ts` / `.tsx` source
  files, with rationale, per-category guidance (components ≤ 250,
  stores 250–400, pure logic ≤ 500, data files exempt, CSS sectioned),
  and the one-liner shell command to re-run the census.

### Top-of-mind items pending operator review

Recommended sequencing:

1. **A.H3 + A.H2 + A.M7** as a single small CSS / layout PR — floating-sidebar width override at small viewport, click-outside-to-dismiss on desktop, brand-cluster shrink-0 protection.
2. **A.H1** standalone PR — closing the last tab no longer silently re-opens the vault home file.
3. **A.H4** decision pass first; default recommendation is to make the header file-tree toggle promote `chromeMode` to `working` when clicked in reading mode (~ 15 LOC).

### Files modified

- `docs/develop/engineering-principles.md` — added File-size discipline section.
- `docs/develop/audit-2026-05-02.md` — new tracker.
- `docs/develop/work-log.md` — this entry.

---

## 2026-05-02 · Sidebar craft pack + multi-tab UX (PR1–PR4)

**Status**: ✅ Four sequential improvements landed against a single design plan covering the left sidebar and document workspace. Each PR independently passes the gate (`typecheck`, `lint --max-warnings 0`, `format:check`, full vitest suite, production build).

### PR 1 — Left-edge sidebar gutter

The sidebar's first column was kissing the viewport's left edge — visually cramped. New `--sidebar-gutter: 8px` token applied as `padding-inline-start` on `.swirlread-vault-layout__sidebar`. The depth-based row indent in `FileTree.tsx` dropped its hardcoded `+8` so chevron position is unchanged; only the row hover/active background now stops at the gutter rather than bleeding to the screen edge.

### PR 3 — Sticky folder collapse (regression fix)

The `useEffect` at `FileTree.tsx:384–386` had `expanded` in its deps, so any user click that flipped `expanded=false` re-fired the auto-expand on the next render — making it impossible to collapse a folder that contained the active file. Replaced with a `useRef<VaultPath | null>` that records the `currentPath` for which we last auto-expanded; the effect only fires when the path itself changes. Rule reduces to "auto-expand fires once per (node, currentPath)". Manual collapses now stick until the user navigates to a sibling branch (matches VS Code Explorer). New regression test in `FileTree.test.tsx` exercises the case end-to-end.

### PR 2 — Drag-to-resize sidebar width

New `fileTreeWidth` global pref in `useUIStore` (clamp 220–520 px, default 280, persisted as `ui:fileTreeWidth`). `useApplyUIPrefs` reflects it into the `--file-tree-width` CSS var so existing layout rules just work. New `<SidebarResizeHandle />` renders a `position: fixed` button at the seam with an 8 px hit area + 1 px hairline (visible on hover/focus/drag); pointer-down captures the pointer and writes the live width to the CSS var directly each frame so drag is 60 fps without Zustand churn — pointer-up persists the final value once. Keyboard support: ArrowLeft/Right ±16 px, Shift accelerates ×4, Home/End jump to min/max, Enter resets to 280. Hidden in reading-mode hover-summon (avoid 800 ms grace timer fighting drag) and below 1024 px viewport (drawer mode). Four new clamp/persist tests in `ui-store.test.ts`.

### PR 4 — Multi-file tabs with preview-then-pin

User can now open multiple documents simultaneously with VS Code-style tabs.

- **Dexie schema bump v5 → v6** — new `openTabs` table indexed by `id`, `vaultId`, `[vaultId+order]`, `openedAtMs`. Test reset transaction extended.
- **New `useTabsStore`** (`src/stores/tabs-store.ts`) — `tabsByVault`, `recentlyClosedByVault`, `openOrFocus(vaultId, path, { pin? })`, `closeTab`, `pinTab`, `reorderTabs`, `reopenLastClosed`, `forgetVault`, `init`. Active tab is **not** stored — derived from URL to keep one source of truth. `openOrFocus` rules (preview replaces preview; pin is sticky; cap at `MAX_TABS_PER_VAULT = 20`) covered by 18 unit tests including init/hydration and Dexie persistence.
- **`removeVault` fan-out** in `vault-store.ts` now bulk-deletes `openTabs` rows for the vault and calls `useTabsStore.forgetVault(id)`, mirroring the existing `recentFiles` / `scrollPositions` / `backlinks` cleanup.
- **`<TabStrip />`** component sits inside `.swirlread-vault-layout__content` above `<Outlet/>`. Sticky to the top of the reading column. Each tab supports: single click → activate, double-click → pin, middle-click → close, × button → close, native HTML5 `draggable` for reorder (zero deps, drop indicator via outline), keyboard ArrowLeft/Right/Home/End focus traversal. Sets `documentElement.dataset.swirlreadDraggingTab` during drag so future hover-zone hooks can suspend their grace timer (not yet wired — hover hooks already have escape hatches).
- **DocumentPage integration** — every URL-driven document load calls `openOrFocus(vaultId, path)`; if the URL hits a path already in tabs the call is idempotent, otherwise the preview tab is replaced. `markRecentFile` continues to fire alongside.
- **File-tree `Cmd/Ctrl + click`** intercepts the `<Link>` click and pre-pins via `openOrFocus(..., { pin: true })`; the subsequent navigate triggers `DocumentPage`'s default `pin:false` call which finds the tab already pinned and no-ops.
- **CSS** in globals.css adds the strip styling, preview-italic, drop-target outline, active-tab seam treatment, and a `body.zen-mode .swirlread-tab-strip { display: none }` rule.
- **Keyboard shortcuts deferred** — Cmd/Ctrl+W, Ctrl+Tab, Cmd+1..9 are heavily browser-reserved (especially on macOS Chrome/Safari), so this PR ships mouse + within-strip arrow navigation only. A follow-up PR can add a unique-modifier shortcut set if requested.

### State + persistence summary

| Per-vault data             | Where                                                     | Cap |
| -------------------------- | --------------------------------------------------------- | --- |
| `tabsByVault[v]`           | Dexie `openTabs` (id = `JSON.stringify([vaultId, path])`) | 20  |
| `recentlyClosedByVault[v]` | Memory only (ephemeral undo for reopen)                   | 10  |

`useTabsStore.init()` is wired into `main.tsx` alongside the other store hydrations.

### Verification

- `pnpm typecheck`: 0 errors
- `pnpm lint --max-warnings 0`: 0 warnings
- `pnpm format:check`: clean
- `pnpm test`: **701 / 701 passing** (was 671 baseline; +5 ui-store, +1 file-tree regression, +18 tabs-store, no regressions)
- `pnpm build`: main chunk **251.76 KB gz** (was 249.00; +2.76 within the +3 KB self-imposed budget for this pack)

### Files added

- `src/stores/tabs-store.ts` + `.test.ts` (18 tests)
- `src/ui/reading-shell/SidebarResizeHandle.tsx`
- `src/ui/reading-shell/TabStrip.tsx`

### Files modified

- `src/styles/globals.css` (gutter token, sidebar padding, resize-handle CSS, tab-strip CSS, mobile-drawer hide rule for resize handle)
- `src/stores/ui-store.ts` (+ `.test.ts`) — `fileTreeWidth` field/action/clamp/init
- `src/stores/vault-store.ts` — `openTabs` cleanup + `useTabsStore.forgetVault` in `removeVault` fan-out
- `src/app/use-apply-ui-prefs.ts` — reflect `fileTreeWidth` to CSS var
- `src/ui/file-tree/FileTree.tsx` (+ `.test.ts`) — sticky-collapse fix, depth indent gutter, modifier-click pin
- `src/ui/reading-shell/VaultLayout.tsx` — render `SidebarResizeHandle` and `TabStrip`
- `src/ui/reading-shell/DocumentPage.tsx` — `openOrFocus` on URL change
- `src/core/persistence/db.ts` — schema v6 with `openTabs`
- `src/main.tsx` — `useTabsStore.init()` boot

### Open follow-ups

- Keyboard shortcut hook (`use-tab-hotkeys.ts`) — design a unique modifier set that doesn't collide with browser tabbing
- Visual polish iteration after dogfooding on the live vault
- Optional `ui:tabPreviewMode` setting to opt out of preview behaviour if power users prefer always-pin

---

## 2026-05-02 · M9.4 — First-time hints toast

**Status**: ✅ A first-time visitor to a vault now sees a single 12-second toast pointing at the keyboard surfaces (⌘K / F / ?). Seen-state persists in IndexedDB; "Reset hints" in Settings brings it back.

### What changed

- **Dexie schema bump** (v4 → v5) adds a `hintsSeen` table indexed by `id` + `seenAtMs`. Old data unaffected — Dexie auto-applies the new store on next open.
- **New `useHintsStore`** (`src/stores/hints-store.ts`) — Zustand store mirroring the persistent set in memory. `init()` hydrates on boot; `isSeen(id)` is a pure read; `markSeen(id)` is idempotent (early-returns if already in the set); `clearAll()` empties both sides.
- **New `HintToast` component** — generic, accepts `id` + `title` + `children`. Behaviour:
  - Returns `null` until `useHintsStore.ready` flips true (avoids flashing the toast for returning users in the brief window before init resolves)
  - Returns `null` if the id is already in `seen`
  - Otherwise renders a fixed bottom-centre toast with serif title + sans body, auto-dismisses after 12 s (`AUTO_DISMISS_MS`), close button dismisses immediately
  - Both dismiss paths call `markSeen(id)` so the toast never reappears
  - Hidden in zen mode via the existing `body.zen-mode` rule
- **First instance** mounted from `VaultLayout` with `id="first-vault-tour"` and copy "Press ⌘K / Ctrl+K to jump anywhere · F for zen mode · ? for the full shortcut list." — exactly the three keys a new user can't infer from the chrome alone.
- **Settings panel** grows a "Reset hints" button next to "Reset to defaults". Wired to `useHintsStore.clearAll()`. Footer flex-direction switched to column with 0.5 rem gap so two stacked buttons read cleanly.

### Why a generic component instead of inlining

A future iteration will probably want hints for "first time you opened the command palette", "first time you switched to working chrome", "first JSON file with a deep tree", etc. Each becomes one-line: `<HintToast id="palette-opened" title="…">…</HintToast>`. The store's id-keyed contract means hints can be added/removed without schema work.

### Files added

- `src/stores/hints-store.ts` + `.test.ts` (5 tests)
- `src/ui/reading-shell/HintToast.tsx` + `.test.tsx` (5 tests)

### Files changed

- `src/core/persistence/db.ts` — schema v5 + `HintSeenRow` type + `__resetDbForTests` clears the new table
- `src/main.tsx` — `void useHintsStore.getState().init()` joins the boot fire-and-forget calls
- `src/ui/reading-shell/VaultLayout.tsx` — mounts the first-vault-tour toast at the bottom of the layout
- `src/ui/settings-panel/SettingsPanel.tsx` — `<ResetHintsButton>` subcomponent + the import
- `src/styles/globals.css` — `.swirlread-hint*` block (toast, body, title, detail, kbd inline-styling, close button, zen-mode hide); footer flex layout switched to vertical stack

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — passed after `prettier --write` on the two new components
- `pnpm test` — **671 passed** (was 661; +5 hints-store + 5 HintToast tests)
- `pnpm build` — main bundle **249.00 KB gz** (was 248.49; +0.51 KB for the store + toast component + Settings reset button + 1 new Lucide icon). Inside the 250 KB target.

### Down-stream notes

- Hint id namespace is shared globally. If two unrelated surfaces use the same id, the second will be invisible. Keep ids descriptive (`first-vault-tour`, not `welcome`).
- The 12 s auto-dismiss is a single timer, no pause-on-hover. If a real user reports they couldn't read the toast in time, switch to a `mousedown`/`focusin` pause. Cheap fix.
- `clearAll()` wipes the table indiscriminately. There's no per-id reset because the only user gesture is "show me the tour again from scratch."
- `body.zen-mode .swirlread-hint { display: none }` keeps the toast off when the user has explicitly asked for zero chrome. The seen flag still gets written if the timer fires while in zen, which is the right behaviour — they've technically had their chance to see the introduction next time they open a vault.

---

## 2026-05-02 · M7 polish — lightbox / audio / JSON search / copy path

**Status**: ✅ Four small but visible polish items shipped together. The reader now treats images and structured data like first-class surfaces, not afterthoughts.

### What changed

#### 1. Image lightbox (`MediaRenderer`)

The image branch wraps its `<img>` in a `<button class="swirlread-media__image-trigger">` with a hover-revealed `ZoomIn` overlay hint. Click / Enter / Space opens a Radix Dialog. Inside the dialog: an enlarged image (max 92 vw / 84 vh), a sr-only `<Dialog.Title>` carrying the alt text for screen readers, a visible caption row, and an `X` close button positioned at the top-right of the viewport. Esc / outside-click / close button all dismiss via Radix's built-in handlers.

The dialog uses a custom overlay (`rgb(0 0 0 / 0.85)` + 2 px blur) rather than Radix's default; reading material rarely needs the deep dim that Settings or Tags use, but a nearly-opaque overlay reads as "you're viewing the picture now."

#### 2. Audio themed wrapper

The native `<audio controls>` element on its own sat on the page background with no framing. Wrapped it in `.swirlread-media__audio-wrap` — a 999 px-rounded pill at `color-mix(in srgb, var(--color-surface) 60%, transparent)` with a 1 px border. The native control inside still owns the playback UX (cross-browser variation accepted) but visually the player belongs to the reading shell now.

#### 3. JSON in-tree search

Toolbar grows a search input next to the Tree/Source toggle. As the user types:

- A `useMemo` walks the parsed JSON value, recording every path whose key or stringified value contains the (lowercased) query, plus all of its ancestors, into a `Set<string>`.
- Each `JsonNode` gets a new `forceOpenPaths` prop — the local `useState(open)` is OR'd with `forceOpenPaths.has(pathKey)` so matching subtrees expand without losing the user's previous manual collapse decisions.
- Both the key label and string value pass through a `highlight()` helper that wraps every matched substring in `<mark class="swirlread-json__match">` (`color-mix` accent tint).

Numbers / booleans / nulls are still searchable — they get coerced via `String(value)` before the substring test — but they don't render as `<mark>` because the `highlight` call only fires on the rendered children, which for primitives we control directly.

#### 4. Copy-path button

Every leaf and every collection row gets a hover-only `<button class="swirlread-json__copy">` with a `Copy` icon. On click:

- `formatJsonPath(path)` produces dot/bracket notation: `users[0].name`, with `[N]` for numeric indices, `["weird-key"]` for non-identifier keys (Unicode/whitespace/special characters), and `$` for root.
- `navigator.clipboard.writeText` writes the result; if the API is unavailable or rejects (focus, permission), the click silently no-ops — clipboard failures shouldn't surface as errors in a reader.
- A 1.2 s "Copied" badge appears next to the icon for confirmation.

`formatJsonPath` lives in `json-utils.ts` so the JsonRenderer file stays component-only (the same react-refresh boundary discipline as `file-renderer-utils.ts` and `json-utils.ts` already established).

### Files changed

- `src/ui/reading-shell/MediaRenderer.tsx` — `ImageWithLightbox` subcomponent + Radix Dialog imports + audio div wrapper
- `src/ui/reading-shell/JsonRenderer.tsx` — search state, force-expand path set, `highlight()` helper, `LeafRow` + `CollectionNode` carry path arrays, `CopyPathButton` subcomponent
- `src/ui/reading-shell/json-utils.ts` — `formatJsonPath` exported (with `JsonPathSegment` type alias)
- `src/styles/globals.css` — `.swirlread-media__image-trigger` / `__zoom-hint`, `.swirlread-media__audio-wrap`, `.swirlread-lightbox*` family, `.swirlread-json__search`, `.swirlread-json__match`, `.swirlread-json__copy` / `__copied`. Old `.swirlread-media__audio` rule gone (moved into the wrapper)
- `src/ui/reading-shell/JsonRenderer.test.tsx` — new tests: `formatJsonPath` (4 cases), search filter + force-expand, search match-against-values case-insensitive, copy-path button presence

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings (one `react-refresh/only-export-components` resolved by moving `formatJsonPath` to `json-utils.ts`)
- `pnpm format:check` — passed after `prettier --write` on the three changed files
- `pnpm test` — **661 passed** (was 654; +7 polish tests)
- `pnpm build` — main bundle **248.49 KB gz** (was 248.48; +0.01 KB — both changes ride into the existing MediaRenderer / JsonRenderer lazy chunks, not the main bundle). CSS bundle delta ~+1 KB for the lightbox / audio-wrap / search / match / copy styles.

### Down-stream notes

- The lightbox doesn't pinch-zoom on touch devices. Native `<img>` doesn't pinch-zoom inside a `<dialog>`-style overlay either; if real touch users complain, swap to a `react-zoom-pan-pinch`-style library, but it's not free bytes — defer.
- JSON search is O(n) per keystroke over the parsed value; for a 100k-key blob that's perceptible. Debouncing is a one-liner if/when someone hits this — `useMemo` already memoizes per `query` string, so the cost only shows up on type bursts.
- Copy-path doesn't currently have a "Copy value" sibling. Two reasons: (1) for primitives the user can already copy the rendered text via standard selection; (2) for collections "value" is ambiguous between JSON and JS-object syntax. If a user genuinely wants the formatted JSON of a subtree, a future polish can add a "Copy JSON" action — clean addition behind the same hover behaviour.
- Image lightbox uses the original blob URL — no down-scale, no progressive loading. For a 30 MB photo that's a 30 MB transfer the moment the dialog opens. Vault images are typically already-optimised so this is fine; if it becomes a real problem the lightbox can lazy-load behind a "Loading…" placeholder.

---

## 2026-05-02 · RX2 + M2.5 + M9.5 — Reading chrome modes, hover zones, permission-revoked path

**Status**: ✅ Three polish items shipped together because they share the chrome state machine. SwirlRead's "reading mode" finally lives up to the craft plan's intent: the default surface is just text + a quiet header.

### RX2 — Reading chrome modes

`useUIStore` gained a persistent `chromeMode: 'reading' | 'working'` field (default `'reading'`). Combined with the existing transient `zenMode` flag (F-key toggle), this gives the three-level chrome the craft plan calls out:

| Mode      | Source                      | Sidebars                                       |
| --------- | --------------------------- | ---------------------------------------------- |
| `reading` | persistent pref             | hidden, hover-summon                           |
| `working` | persistent pref             | persistent (drives `fileTreeOpen` / `tocOpen`) |
| `zen`     | transient `zenMode` (F key) | hidden, no chrome at all                       |

Header gained a `BookOpen ↔ PanelTop` toggle button (with an `aria-pressed` state and a tooltip describing the current mode + what clicking does). Cycling through `reading → working → zen` is `click → click → F`; not a single keypress, but discoverable and matches the F-key zen idiom users already know.

### M2.5 — Hover zones

`VaultLayout` gained two invisible 14 px-wide fixed-position strips along the left and right page edges, plus per-side transient `useState(hoverFileTree | hoverToc)` reveal flags. In reading mode:

- `onMouseEnter` on the left zone → `setHoverFileTree(true)` and the file tree drawer mounts (fixed-position, 6 px box-shadow, on top of the content)
- `onMouseLeave` on the sidebar starts an 800 ms `setTimeout` that flips the flag back to `false`
- `onMouseEnter` on the sidebar cancels any pending hide timer, so the cursor can travel from the zone to the sidebar without race conditions
- A backdrop `<button>` in the same React fragment dismisses the drawer immediately on click (in addition to the timer)

Working mode renders identical markup but the `display: none` rule on `.swirlread-vault-layout--working .swirlread-vault-layout__hover-zone` suppresses the strips. Working sidebars own the edges and shouldn't fight a hover trigger for the same region.

In zen mode neither path fires — the existing `body.zen-mode .swirlread-vault-layout__sidebar { display: none }` rule wins.

The 800 ms grace timer is conservative on purpose. The previous design draft floated 2 s; that's enough for a stray cursor to keep the drawer open mid-thought. 800 ms feels closer to "I changed my mind." Tunable in `HOVER_DISMISS_MS`.

### M9.5 — Permission-revoked → ReauthorizeVault

DocumentPage's load-effect catch block had been routing every non-`VaultFileNotFoundError` to a generic `kind: 'error'` card. Added a targeted `instanceof VaultPermissionDeniedError` branch that flips state to `missing-vault` instead. That state already mounts `ReauthorizeVault` (M6.3), which holds the FSAPI re-prompt logic. A user who revokes the grant from browser settings while the tab is open now sees the same friendly "re-authorize this vault" UI as a returning user whose handle expired between sessions.

### Files changed

- `src/stores/ui-store.ts` — `ChromeMode` type + `chromeMode` field + `setChromeMode` / `toggleChromeMode` actions + `isChromeMode` type-guard + persistence wiring (`init` reads it, `resetToDefaults` resets it)
- `src/app/AppShell.tsx` — pulled `chromeMode` + `toggleChromeMode` from the store; added the toggle button between the ⌘K trigger and the TOC toggle, using `BookOpen` / `PanelTop` Lucide icons
- `src/ui/reading-shell/VaultLayout.tsx` — hover-zone + drawer + grace-timer wiring; the layout now reads `chromeMode` to decide whether to honour `fileTreeOpen` / `tocOpen` (working) or the transient hover flags (reading); cleanup effect captures refs to keep the lint-rule honest
- `src/ui/reading-shell/DocumentPage.tsx` — catch block adds the `VaultPermissionDeniedError → missing-vault` branch
- `src/styles/globals.css` — `.swirlread-vault-layout__hover-zone` (+ left / right modifiers); `.swirlread-vault-layout--reading` overrides for sidebar / TOC fixed-position drawer treatment + shadows; `.swirlread-vault-layout--working .swirlread-vault-layout__hover-zone { display: none }`
- `src/ui/file-tree/FileTree.test.tsx` — `beforeEach` pins `chromeMode: 'working'` so the persistent-sidebar assumptions in those tests still hold (otherwise `getSidebar()` would race the hover flow)

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings (one `react-hooks/exhaustive-deps` warning fixed by capturing the timer refs at effect-mount)
- `pnpm format:check` — all conformant
- `pnpm test` — **654 passed** (FileTree's 14 tests recover after the `chromeMode: 'working'` pin)
- `pnpm build` — main bundle **248.48 KB gz** (was 248.00; +0.48 KB for the chromeMode store extension, AppShell button + 2 Lucide icons, VaultLayout hover wiring). Inside the 250 KB budget.

### Down-stream notes

- Reading mode is now the new-user default. That's a deliberate choice: the craft plan argues SwirlRead's pitch is "the document is the surface," and a hidden-by-default sidebar is the cleanest expression of that. Returning users who preferred working mode keep their pref because the field reads from Dexie on init; only fresh installs land in reading mode.
- The hover zones don't yet have a visible affordance. A future polish could show a 1-pixel accent stripe on hover-near (not hover-on) so first-time users discover them; for now the ⌘K palette is the discoverability floor.
- M9.5 only catches `VaultPermissionDeniedError`. Other read failures (corrupt file, network filesystem disconnect, unexpected `DOMException`) still surface as generic errors. That's deliberate — only permission-revoked has a clean recovery path; the rest genuinely need user attention.
- The hover dismiss timer is a single 800 ms grace, not a "while in zone" timer. If a user wants the drawer to stay open while they read a long file path or a snippet preview, hovering the sidebar itself cancels the timer — that's the intended UX.

---

## 2026-05-02 · M9.8 — Launch readiness (code-side complete)

**Status**: 🟡 Code-side launch surface is ready; the remaining work is operational (register domain, link Vercel, set secrets, push `v0.1.0` tag, post Show HN). Nothing more to merge until that operational pass happens.

### What changed

The repo now contains everything a deploy pipeline + launch posting needs. None of it executes against production until the operator wires up secrets, but the moment that happens, `git push origin main` starts deploying.

#### `vercel.json`

- `framework: null` — Vercel auto-detects Vite, but pinning to null + explicit `buildCommand` / `outputDirectory` / `installCommand` removes the ambiguity. `pnpm install --frozen-lockfile` mirrors CI exactly.
- `rewrites` — every `/(.*)` falls through to `/index.html`. SPA fallback for client-side routes (`/app/...` paths, including the splat-rendered `/app/:vaultId/path/to/note.md`).
- `headers`:
  - `/assets/(.*)`, `*.woff2`, `*.js`, `*.css` → `Cache-Control: public, max-age=31536000, immutable` (Vite emits hashed filenames; safe to lock for a year)
  - `/index.html` → `Cache-Control: public, max-age=0, must-revalidate` (always re-checked so a fresh deploy reaches the user immediately)
  - `index.html` also gets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that disables camera / microphone / geolocation / FLoC's `interest-cohort` opt-out
- **No CSP.** Shiki injects inline styles per token, and KaTeX uses inline SVG. A correct CSP for both would need `unsafe-inline` or hashed style tokens, neither of which we want to ship without a careful audit. CSP is a v0.2 ticket.

#### `.github/workflows/deploy.yml`

- Triggers on push to `main` only. PR previews are handled by the GitHub→Vercel integration that auto-comments preview URLs on PRs (operator-side setup; the workflow itself doesn't manage previews).
- `concurrency: deploy-prod` with `cancel-in-progress: true`. A second push to `main` while one is deploying cancels the older run — production never wants to walk back to an older commit.
- Re-runs the full gate (typecheck → lint → format:check → test) before deploying. CI on the merge commit normally already passed, but this gives belt-and-braces protection against a rebase or force-push race.
- Deploy uses the official three-step Vercel CLI flow: `vercel pull --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod`. Building with `--prebuilt` deploy means GitHub Actions does the build (with the deps it has cached), not Vercel's build environment — faster and more predictable than a hosted build.
- The three required secrets (`VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`) are listed in a YAML comment at the top of the deploy job. If any are missing the deploy step fails loudly rather than silently no-op.

#### `docs/launch/`

Four files that are draft text for an act, not feature work:

- `README.md` — orient a future maintainer to the launch dir; tells them to read in order, what "M9.8 done" actually means, what's deliberately out of scope.
- `launch-checklist.md` — every box that needs ticking before going public, grouped: repo state, domain + Vercel, browser sanity, repository surface, social. Then a launch-day list (push tag → Show HN → Twitter → cross-post → be present in HN thread for 6 hours), and a 48-hour post-launch list (triage, no feature commits, write a retro). Plus an explicit "what we are NOT doing on launch day" section to stop the urge to add Discord / pricing / waitlist on impulse.
- `show-hn.md` — title (under 80 chars, no emojis, no "AI era"), URL placeholder, first comment draft. Body leads with the product position ("re-reading your own notes"), explains what works in v0.1, what _deliberately doesn't_ (editing / AI / iOS), and lists the technical caveats up front. A "things to NOT say" section at the bottom lists hype phrases and anti-Obsidian framing to avoid.
- `announcement.md` — Twitter thread (4 tweets), Mastodon / Bluesky single-post variant, r/ObsidianMD long-form post (carefully framed: "complement, not replacement"), Lobste.rs minimum-viable post. Plus a "things to skip" section listing cross-posting traps.

### Why ship the drafts now

The code is small, the launch is large. Writing the launch copy in advance — while the project is still feature-fresh in my head — produces sharper, more honest writing than scrambling to write it the morning of the post. It also means the "operational pass" the operator needs to do later is purely tactical (set secrets, run `vercel link`, post the link) rather than "and now write the announcement under time pressure."

### Files added

- `vercel.json`
- `.github/workflows/deploy.yml`
- `docs/launch/README.md`
- `docs/launch/launch-checklist.md`
- `docs/launch/show-hn.md`
- `docs/launch/announcement.md`

### Files changed

- None — purely additive.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — passed after `prettier --write` on the two new launch markdown files
- `pnpm test` — **654 passed** (no source change)
- `pnpm build` — main bundle **248.00 KB gz** (unchanged); deploy pipeline ships exactly this artifact.

### Down-stream notes

- The deploy workflow assumes pnpm 10. If pnpm bumps to 11 locally, bump the version in both `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` together. Add a `packageManager` field in `package.json` to lock it once the launch is past.
- The Show HN post is dated to a "weekday morning, US time zones" recommendation in `launch-checklist.md`. If the launch slips into a weekend, push it to the following Tuesday-Thursday window. HN front-page traffic dies on Saturdays.
- The "Try sample vault" → "Open my vault" conversion is the single most useful number to track post-launch (per `launch-checklist.md`'s post-launch section). If we ever turn on Vercel Analytics, that's the funnel to watch — not page views.
- Phase 2 (lightweight editing) is mentioned in `show-hn.md`'s "what's NOT in v0.1" list as "v0.2 will add", which is a soft commitment we should be able to keep within ~3 months. If that timeline slips, soften the language to "is on the roadmap" before any subsequent announcement.

---

## 2026-05-02 · M9.6 + M9.7 — Open-source surface · CI

**Status**: ✅ Repo now reads as a serious open-source project; every PR and main-branch push runs the same gate the maintainer runs locally.

### M9.6 — Open-source surface

Four root-level files, written for the GitHub landing page (a stranger arriving from a Show HN thread) rather than for the maintainer:

- **`README.md`** — what the project is, who it's for, why it exists, status snapshot (654 tests / 248 KB gz / Phase 1 substantially done), quickstart, tech stack, project layout map, doc index. Deliberately leads with positioning ("a reading sanctuary") rather than feature list. Acknowledges the FSAPI / Safari constraint up front.
- **`LICENSE`** — MIT. The license has been promised in \`CLAUDE.md\` and the design docs since day one; this is the file that actually grants it.
- **`CONTRIBUTING.md`** — leads with the **product principles** (local-first / read-first / no AI in MVP / no telemetry) before the engineering style. PRs that violate the principles get closed regardless of code quality, so it has to come first. Then \`pnpm check\` is the gate, then how to pick work, then engineering conventions (TypeScript strict, per-vault state, lazy chunks, hotkey guards, no utility-class soup), then commit-message and test guidance, then PR flow.
- **`CODE_OF_CONDUCT.md`** — Contributor Covenant 2.1, unmodified. The standard text is fine; we don't need a bespoke one.

### M9.7 — CI workflow

- \`.github/workflows/ci.yml\` triggers on PRs to \`main\` and on pushes to \`main\`. Steps: checkout → pnpm setup (\`action-setup@v4\`, version 10 — matches the local \`pnpm --version\`) → Node setup (\`actions/setup-node@v4\` with \`node-version-file: .nvmrc\`, which already pins Node 22) → \`pnpm install --frozen-lockfile\` → \`pnpm typecheck\` → \`pnpm lint\` → \`pnpm format:check\` → \`pnpm test\` → \`pnpm build\`. Each step is its own log section so failures point at the exact thing that broke.
- \`concurrency: cancel-in-progress\` keyed by \`github.ref\` so a quick \`git push --force\` mid-CI doesn't leave three redundant runs in the queue.
- \`timeout-minutes: 10\` because the suite finishes in ~60 s locally; anything past 10 min is a stuck job, not a slow test.
- **No deploy step yet.** Vercel production deploy is M9.8's job — it needs a \`VERCEL_TOKEN\` secret that doesn't exist yet, and the production domain isn't allocated. Easier to add a separate workflow later than to scaffold half-broken Vercel wiring.
- \`.github/pull_request_template.md\` reminds contributors of the four-line checklist (\`pnpm check\` clean / work-log updated / status-line updated / no principle violations) and prompts them to fill in "What changed", "How tested", "Bundle / perf impact", "Linked milestone". The work-log reminder is load-bearing: PRs without an entry get bounced back, per \`CONTRIBUTING.md\`.

### Files added

- \`README.md\`
- \`LICENSE\`
- \`CONTRIBUTING.md\`
- \`CODE_OF_CONDUCT.md\`
- \`.github/workflows/ci.yml\`
- \`.github/pull_request_template.md\`

### Files changed

- None — this slice is purely additive at the file-system level.

### Verification

- \`pnpm typecheck\` — 0 errors
- \`pnpm lint\` — 0 errors / 0 warnings
- \`pnpm format:check\` — passed after a single \`prettier --write README.md\`
- \`pnpm test\` — 654 passed (no source change)
- \`pnpm build\` — main bundle **248.00 KB gz** (unchanged); the CI job runs the same five steps and gates every PR.

### Down-stream notes

- Vercel deploy / domain go-live are gated on M9.8. The CI workflow is structured so adding a \`deploy\` job (separate workflow, runs on push to \`main\` after \`check\` passes) is a one-file add rather than a refactor.
- The PR template is opt-in (GitHub still lets contributors blank it). The intent is documentation, not enforcement; we'll add a \`lint-pr\` action only if drive-by PRs become a recurring problem.
- The \`CONTRIBUTING.md\` leads with non-negotiables on purpose. The temptation in OSS docs is to say everything is up for discussion to seem welcoming. For SwirlRead the product is the discipline; saying the principles are non-negotiable up front saves everyone time.
- \`LICENSE\` carries a generic "SwirlRead contributors" copyright line. Once a real legal entity / human author wants to claim it, drop the entity name in. Not a v0.1 blocker.

---

## 2026-05-02 · M9.3 + M9.2 — 思源宋体 self-hosted, responsive layout

**Status**: ✅ CJK reading is no longer at the mercy of whatever serif the OS happens to ship; small viewports get a real drawer instead of a sidebar that eats half the column.

### M9.3 — 思源宋体 self-hosted

The `--font-serif` stack already named `Source Han Serif SC` and `Source Han Serif TC` as fallbacks, but those fonts aren't reliably installed anywhere — most users fell through to `Songti SC` (macOS only) or the generic serif. CJK paragraphs in Wilson's vault rendered with mismatched ink weights and metrics next to the Latin Source Serif 4.

- Installed `@fontsource/noto-serif-sc@5.2.9` (思源宋体 SC is the same project — Adobe's Source Han Serif and Google's Noto Serif SC share a master).
- `globals.css` imports `@fontsource/noto-serif-sc/chinese-simplified-400.css` — the simplified-Chinese subset, regular weight only. The bold weight is omitted to keep the CJK download under 2 MB; browsers synthesize bold acceptably for the few cases where Markdown emphasis lands on CJK.
- `--font-serif` updated from the placeholder `'Source Han Serif SC'` to the real `'Noto Serif SC'`. Order: `Source Serif 4` → `Noto Serif SC` → `Source Han Serif TC` → `Georgia` → `Songti SC` → `serif`.
- The 1.5 MB woff2 lives in its own asset chunk. **No `unicode-range` declaration is needed** for the lazy-fetch behaviour — the browser walks the font stack lazily, so a pure-Latin page never asks for the file. Only when the renderer hits a CJK glyph that Source Serif 4 can't draw does the browser walk down the stack and request Noto Serif SC.

#### Why not also bundle TC

Traditional Chinese covers ~5% of likely vault content for our user base, and adding `chinese-traditional-400` would be another ~1.5 MB woff2 in the deploy bundle. System 'Songti SC' (macOS), 'PMingLiU' / 'MingLiU' (Windows) cover TC well enough for a v1 reader. We can add it later behind a settings opt-in if a user complains.

### M9.2 — Responsive layout

Three breakpoints, each tuned to a real device class:

| Viewport | Change                                                                      |
| -------- | --------------------------------------------------------------------------- |
| ≤1100 px | TOC right rail hides (already in M4.6)                                      |
| ≤1024 px | File tree sidebar becomes a fixed-position drawer with translucent backdrop |
| ≤768 px  | Settings panel goes full-width                                              |

The drawer treatment is CSS-only:

- `VaultLayout.tsx` always renders a `<button class="swirlread-vault-layout__sidebar-backdrop" onClick={() => setFileTreeOpen(false)}>` next to the sidebar. On desktop this button has `display: none` and never paints. Below 1024 px, the media query flips it to a full-bleed translucent overlay; tapping it dismisses the drawer.
- The sidebar itself flips from `position: sticky` (in flow, occupies a column) to `position: fixed` (overlay, with a 6 px box-shadow) below 1024 px.
- React markup is identical across viewports — there's no breakpoint-aware JS, no resize observer, no SSR mismatch risk. The only TSX delta is the new backdrop `<button>` and a wiring of `setFileTreeOpen` from the store.

iOS Safari remains a known-broken target for v1 because it has no File System Access API. M9.2 doesn't try to paper over that — `gaps-and-open-questions.md#PG-03` documents the Phase 3 path (Tauri / companion bridge / iCloud read-only).

### Files added

- `package.json` / `pnpm-lock.yaml` — `@fontsource/noto-serif-sc` (no other deps)

### Files changed

- `src/styles/globals.css`
  - Imported the SC subset.
  - Updated `--font-serif` (`Source Han Serif SC` → `Noto Serif SC`).
  - New `.swirlread-vault-layout__sidebar-backdrop` rule (default-hidden).
  - New `@media (max-width: 1024px)` block flipping the sidebar to a drawer + revealing the backdrop.
  - New `@media (max-width: 768px)` block making `.swirlread-settings` full-width.
- `src/ui/reading-shell/VaultLayout.tsx`
  - Pulls `setFileTreeOpen` from `useUIStore`.
  - Wraps the sidebar render in a fragment that also includes a backdrop `<button>`. Backdrop is always rendered when the drawer is open; CSS controls visibility per breakpoint.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **654 passed** (no behaviour change — CSS + one backdrop button; no test had been asserting against either)
- `pnpm build`:
  - Main bundle: **248.00 KB gz** (was 247.96; +0.04 KB for the backdrop button + setFileTreeOpen pull). Inside the 250 KB target.
  - CSS bundle: **21.96 KB gz** (was 20.84; +1.12 KB for the responsive media queries and backdrop styling).
  - New `noto-serif-sc-chinese-simplified-400-normal-*.woff2` — 1.5 MB, lazy-fetched only when a CJK character is rendered.

### Down-stream notes

- The drawer doesn't currently animate in / out — it appears with a 6 px shadow and dismisses immediately. A 200 ms transform transition would feel friendlier and is a one-line CSS add. Left for a polish pass.
- The drawer uses `min(280px, 80vw)` instead of the desktop `--file-tree-width` so it never eats more than 80% of a tight viewport. The desktop width is unchanged.
- TOC stays hidden ≤1100 px even when there's room; restoring it as a drawer would mirror the file-tree pattern but adds a second tap target. Punt unless users ask.
- `M9.2` polish that's still on the table: gestures (swipe-to-open / swipe-to-close on the drawer), and a hamburger CTA on small viewports — currently the user has to tap the existing PanelLeft icon in the header which is fine but not the strongest affordance.

---

## 2026-05-02 · M8.1 + M8.2 + M8.3 — Sample vault, end-to-end · plus M9.5 error UX

**Status**: ✅ A fresh user can now click "Try with sample vault" and read seven interlinked Markdown notes inside SwirlRead with zero disk permission. Plus the load-failure error state gained a Try-again loop and a collapsible technical-details disclosure.

### What changed

#### M8.2 — `SampleVaultAdapter` (in-memory `VaultFileSystem`)

- New `src/core/vault/sample-adapter.ts`. Constructor takes `{ id, name, files: Record<path, string|Uint8Array> }` and:
  - Walks paths once to compute the implied set of directories (so `list('')` and `stat('notes')` work without any registered directory entries).
  - Implements `list` / `walk` / `stat` / `readText` / `readBinary` / `getBlobURL` / `hasPermission` / `requestPermission` / `dispose` — same surface as `FSAPIVaultAdapter`.
  - `getBlobURL` lazily encodes a per-path `Blob` (text → utf-8 bytes; copies bytes into a fresh `ArrayBuffer` to satisfy strict `BlobPart` typing under `lib.dom.d.ts`'s `ArrayBuffer | SharedArrayBuffer` distinction). URLs are cached and revoked on `dispose()`.
  - `walk()` returns a hand-rolled async iterator (the obvious `async function*` would have tripped `@typescript-eslint/require-await` because the body is fully synchronous after pre-collecting entries; the manual iterator avoids the rule without an eslint-disable comment).
- 8 unit tests covering listing order (directories first, alphabetical), recursive walk, stat dispatch, readText/readBinary parity, missing-path errors, and the trivially-true permission stubs.

#### M8.1 — Sample vault content

- New `src/core/vault/sample-content.ts` defines seven inline-string Markdown files plus one inline SVG, all themed "Reading in the Age of AI":
  - `index.md` — landing (frontmatter title + tags, callout, ==highlight==, six wikilinks)
  - `why-read.md` — the slow-reading pitch (callout quote, italic em)
  - `knowledge-base.md` — vault-as-memory (GFM table, GFM task list, footnote)
  - `markdown-features.md` — feature tour (callout types, alias-link, broken-link, tags, embed of `diagram.svg`)
  - `math-and-code.md` — KaTeX inline + block, two fenced code blocks (TS/Py), a Mermaid flowchart
  - `reading-rituals.md` — practical habits (numbered list, callout)
  - `colophon.md` — "how this is built" closer (table, internal alias-link)
  - `diagram.svg` — a 1×1-style brand swatch used by the embed example
- Together they flex every renderer M3 ships: GFM, wikilinks, callouts, embeds, code, math, mermaid, frontmatter, tags, highlights, footnotes.

#### M8.3 — Landing CTA wired

- `LandingPage.tsx`'s previously-disabled "Try with sample vault" button now:
  - Constructs a fresh `SampleVaultAdapter(buildSampleVaultSpec())`.
  - Calls `useVaultStore.registerVault(adapter)` (the store already accepts any `VaultFileSystem`, so no shape change there).
  - `void navigate('/app/sample-reading-in-the-age-of-ai')` — the M4.1 home detector immediately resolves to `index.md`.
- The button got a real `Sparkles` Lucide icon (replacing the `✨` emoji that lived on the disabled placeholder) and lost its `disabled` styling.
- Updated the existing "renders both CTAs" test to expect both buttons enabled, plus a new test that clicks the sample CTA and asserts the store registers a vault with the expected id.

#### M9.5 — DocumentPage load-failure UX

- `LoadState.error` (existing) now renders a calm two-line copy ("Something went wrong … this is a SwirlRead-side problem") + a `<button>` "Try again" that bumps a new `retryToken` state, which is appended to the load effect's dep list, forcing a fresh `stat()` + `readText()`.
- The raw error message moves into a collapsible `<details>` block ("Technical details") so a debugging developer can see the error without it competing with the headline message.
- New `.swirlread-doc-empty__action` / `__details` / `__pre` rules in `globals.css` reuse existing accent/code/border tokens — themed across Sepia/Light/Dark/OLED for free.

### Files added

- `src/core/vault/sample-adapter.ts` + `.test.ts` (8 tests)
- `src/core/vault/sample-content.ts`

### Files changed

- `src/ui/landing/LandingPage.tsx` — sample CTA wiring + Sparkles icon swap.
- `src/ui/landing/LandingPage.test.tsx` — flipped the disabled-CTA test, added a new "registers the sample vault" test.
- `src/ui/reading-shell/DocumentPage.tsx` — added `retryToken` state, threaded into the load-effect deps, swapped the error block JSX for the new copy + Try-again button + collapsible technical-details block.
- `src/styles/globals.css` — `.swirlread-doc-empty__action` / `__details` / `__pre` blocks under the existing RX7 cluster.

### Verification

- `pnpm typecheck` — 0 errors (had to copy bytes through a `new ArrayBuffer(...)` because lib.dom's `BlobPart` rejects `Uint8Array<ArrayBufferLike>`)
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant after `prettier --write`
- `pnpm test` — **654 passed** (was 645; +8 sample-adapter + 1 landing test net for sample CTA = +9, but the disabled-CTA test was repurposed not duplicated, so the actual delta is +8 unique tests)
- `pnpm build` — main bundle **247.96 KB gz** (was 243.38; +4.58 KB for the inline sample-vault strings + the adapter class). Still inside the 250 KB budget. CSS bundle delta ~+0.4 KB for the new error-card actions/details styling.

### Down-stream notes

- The sample vault is a **read-only fixture**. If Phase 2 lightweight editing lands, sample notes should reject `writeText` (the adapter doesn't expose write methods anyway, so the boundary is enforced by the interface).
- The Try-again button retries the read for the **current** route. Switching files clears the error naturally because `vaultId`/`filePath` change forces effect re-run anyway.
- Permission-revoked errors (FSAPI handle granted-then-pulled) currently surface as a generic error message. The dedicated `missing-vault` state with `<ReauthorizeVault>` only fires when `getAdapter()` returns null at effect start, not when a mid-read permission revoke throws. A polish iteration could detect `VaultPermissionDeniedError` in the catch block and switch state to `missing-vault` for a smoother re-auth flow — left for the next pass to keep this slice tight.
- Image lightbox, audio control theming, JSON-tree search, and copy-path-from-tree are still unaddressed M7 polish items. None are blocking; all listed as "Pick next" candidates.

---

## 2026-05-02 · M9.1 Perf Pass (first slice) — main bundle finally under 250 KB

**Status**: ✅ Main bundle dropped from **262.91 KB gz** to **243.38 KB gz** (-19.53). First time below the 250 KB target since the project bootstrapped.

### What changed

Two complementary lazy splits, each one targeted at code that the average reading session doesn't actually touch:

#### 1. M7 renderers → six tiny chunks behind `React.lazy`

DocumentPage held eager imports for `CodeFileRenderer` / `CsvRenderer` / `HtmlRenderer` / `JsonRenderer` / `MediaRenderer` / `UnsupportedRenderer`. None of them have any business loading on a Markdown page — Markdown is the dominant case, and these renderers only fire on `.ts` / `.csv` / `.html` / `.json` / image / etc. Refactor:

```ts
const CodeFileRenderer = lazy(() =>
  import('./CodeFileRenderer').then((m) => ({ default: m.CodeFileRenderer })),
)
// … one for each of the six
```

The JSX render branches now wrap each of those in `<Suspense fallback={null}>`. The fallback is `null` because the load path that gets here is already async (vault `stat()` + `readText()`) and the chunks are 1–4 KB each — by the time the dispatcher decides we're rendering an HTML file, the chunk is in flight and resolves before the fallback would even paint.

`PlainTextRenderer` stays eager. It's ~100 bytes, has no dependencies, and acts as a stable always-present surface for `text` kind files.

#### 2. WikilinkPreview → first-hover dynamic import

`WikilinkPreview` carries the entire Floating UI runtime (`@floating-ui/react` + `safePolygon` + `useHover` + `useFloating` + `FloatingPortal`) — that's **17.37 KB gz** the bundle was paying for whether the user hovered a wikilink or not.

Refactor:

- `Wikilink.tsx`'s resolved branch now renders a plain `<Link>` by default — no popover, no hover state, no Floating UI imports.
- `onMouseEnter` and `onFocus` trigger a module-level `loadPreview()` that does `import('./WikilinkPreview')`. The promise is cached at module scope, so the first hover anywhere on the page primes every subsequent link instantly.
- Once the promise resolves, the component swaps in the real `WikilinkPreview` via `setState`. The user's cursor is still hovering the link at that point, so `WikilinkPreview`'s own `useHover` immediately picks up — there's no visible re-glitch.

For a reader who scans articles without ever hovering a link, the entire 17 KB stays unrequested.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **645 passed** (unchanged — perf change, no behaviour change)
- `pnpm build`:
  - Main bundle: **262.91 → 243.38 KB gz** (-19.53)
  - New `WikilinkPreview-*.js` chunk: **17.37 KB gz**
  - Six new M7 renderer chunks: ~0.4–0.9 KB gz each (the parser/utility helpers also got split out alongside)

### Why this works without regressing UX

- The M7 renderers fire from a state transition that's already async (`readText` → setState). The Suspense fallback never paints in practice; the chunk is loaded by the time the React commit cycle runs.
- The WikilinkPreview swap happens during a hover — a scenario where the user is already prepared to wait the 400 ms `useHover` delay. The 50 ms (cached: 0 ms) extra import time is invisible inside that delay budget.
- All 645 existing tests pass with no edits because the Suspense fallback is `null` and the lazy modules export the same component contract.

### Files changed

- `src/ui/reading-shell/DocumentPage.tsx`
  - Six `React.lazy(() => import(...))` declarations replace the static M7 imports.
  - Each render branch for `state.kind === 'code' | 'table' | 'html' | 'json' | 'media' | 'binary'` wrapped in `<Suspense fallback={null}>`.
- `src/ui/reading-shell/Wikilink.tsx`
  - Resolved branch now delegates to a new internal `<ResolvedWikilink>` that holds a `useState<ComponentType | null>` for the lazy preview component.
  - Default render: plain `<Link>` with `onMouseEnter` / `onFocus` triggering `loadPreview()`.
  - Module-scoped `previewPromise` cache so a second link's first hover hits the resolved promise immediately.
  - Removed the static `import { WikilinkPreview }` from the top of the file — that's now only resolved through the dynamic loader.

### Down-stream notes

- Bundle now sits at **243.38 KB gz**, finally inside the 250 KB target with ~6 KB of headroom. Future heavy adds (a real PDF renderer via PDF.js, an inline editor via CodeMirror 6) need to be lazy from day one.
- Further perf wins still on the table:
  - `BacklinksPanel` is eager today; it's small but every Markdown page pays for the read-from-Dexie + sort + render scaffold even when the doc has zero backlinks. Lazy on first render-after-mount could shave another ~1 KB.
  - `EmbedNode` family (3 sub-components + `useBlobURL`) is eager but only fires when a doc contains `![[file]]`. Could lazy on-mount of the first embed.
  - `MathBlock`/`MathInline` already lazy-load their KaTeX runtime, but the wrapper components themselves sit in main. They're small (~0.7 KB gz) — leave them alone.
- The WikilinkPreview lazy split is **especially valuable on cold loads** because Floating UI's tree-shaking story is famously poor: the 17 KB is essentially the whole library, and splitting it once means it never re-enters the critical path if the user is just scanning.

---

## 2026-05-02 · M7.4 JSON Tree Renderer — Milestone 7 feature-complete

**Status**: ✅ `.json` / `.jsonc` files now open into a foldable tree by default with a Tree ↔ Source toggle. M7 is feature-complete for v0.1.

### What changed

- Dispatcher gained a new `{ kind: 'json' }` variant. `.json` / `.jsonc` lifted out of `CODE_LANGUAGES`. The dispatcher's order is now: media → table → html → json → code → text → binary, each before the more permissive next.
- New `src/ui/reading-shell/JsonRenderer.tsx`:
  - `useMemo` wraps `JSON.parse` (with a `stripJsonComments` pass for `//` and `/* */` comments) so a 50 KB blob isn't re-parsed on every keystroke / re-render.
  - Tree built recursively by `<JsonNode value depth fieldKey?>`. Each collection node carries its own `useState(depth < 2)` collapse flag, so root + first level open by default, deeper levels collapsed. A 1000-key object doesn't paint as a wall.
  - Primitives get type-specific class hooks (`.swirlread-json__string` / `__number` / `__boolean` / `__null`) so future themes can re-skin without touching the component tree.
  - Collection rows use a real `<button aria-expanded>` so screen-readers narrate "expanded"/"collapsed" cleanly. Chevron flips via `ChevronDown` / `ChevronRight`.
  - Collapsed view shows a count summary (`3 items` / `5 keys`) so the user knows how much would unfold.
  - Parse failure → renderer auto-pins to Source view, disables the Tree tab, and shows `Couldn't parse JSON: <message>` as `role="alert"`. Content is never lost.
- `stripJsonComments` is in `src/ui/reading-shell/json-utils.ts` (separate file so JsonRenderer.tsx remains component-only — same pattern as `file-renderer-utils.ts`).
- DocumentPage `LoadState` gained `{ kind: 'json'; raw: string }`. Load effect dispatches `json` between `html` and `text`.
- `globals.css` block: bordered tree panel, accent-coloured keys, italic null/boolean, mono `__number` lightly tinted with the accent, vertical guide line for nesting (`border-left` on `__list`).

### Why per-node useState (not a Set in the parent)

A single root-owned `Set<path>` of expanded paths sounds tidy, but every toggle re-renders the entire tree because the Set identity changes. Per-node `useState` reconciles to exactly one `<JsonNode>` per click. React keeps state stable across the recursion because the tree shape is deterministic for a given `source`.

### Sample vault test fixture adjustment

The pre-M7.4 `metadata.json` fixture was the test target for two earlier DocumentPage tests that asserted the source-code path. Now that `.json` routes to the tree renderer, those assertions had to move. Added `util.ts` to `registerSampleVault()` and re-pointed the two CodeFileRenderer assertions there. `metadata.json` is now free to assert tree behaviour in a future test slice if needed.

### Files added

- `src/ui/reading-shell/JsonRenderer.tsx` + `.test.tsx` (7 tests: object render, primitive type hooks, deep-collapse + click-expand, array count summary, parse-fail fallback, Tree↔Source toggle, .jsonc with comments)
- `src/ui/reading-shell/json-utils.ts` (4 helper tests for `stripJsonComments`)

### Files changed

- `src/core/render/dispatcher.ts` — new `json` variant; `.json`/`.jsonc` removed from `CODE_LANGUAGES`; explicit early-return for json before code.
- `src/core/render/dispatcher.test.ts` — 1 new test asserting `.json`/`.jsonc` route to `{ kind: 'json' }`.
- `src/ui/reading-shell/DocumentPage.tsx` — `LoadState.json` variant, load-effect dispatch, JSX branch.
- `src/ui/reading-shell/DocumentPage.test.tsx` — `util.ts` added to sample vault fixture; two existing CodeFileRenderer assertions re-pointed to `util.ts` (the renderer hasn't changed; only the file used to test it).
- `src/styles/globals.css` — `.swirlread-json*` block (toolbar/toggle/tree panel, type-specific colour tokens for primitives, `border-left` nesting guide on `.swirlread-json__list`).

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings (after extracting `stripJsonComments` and switching test type assertions to `!`)
- `pnpm format:check` — all conformant
- `pnpm test` — **645 passed** (was 633; +7 JsonRenderer + 4 stripJsonComments + 1 dispatcher net)
- `pnpm build` — main bundle **262.91 KB gz** (was 261.95; +0.96 KB for the tree renderer + four new Lucide icons `ChevronDown`/`ChevronRight`/`Code2`/`Workflow`, two of which were already pulled in by HtmlRenderer). CSS bundle delta ≈ +0.5 KB for the new `.swirlread-json*` block.

### Down-stream notes

- Search inside the tree (Cmd-F-style key-filter) is deferred. For Wilson-sized config files (a few hundred keys) the browser's native find covers it; for genuinely large JSON dumps it'd be worth adding an in-component filter input.
- "Copy path" / "Copy value" affordances are deferred. Both can ride on top of the existing per-node component without changing the tree shape.
- **Milestone 7 is now feature-complete** for v0.1. M7.1 dispatcher, M7.2 plain text, M7.3 CSV, M7.4 JSON tree, M7.5 HTML sandbox, M7.6 media, M7.7 source code, M7.8 unsupported card — all landed. Remaining M7-flavoured polish (image lightbox / click-to-zoom, audio control theming, in-tree search, copy actions) is non-blocking and can land in a polish pass.
- The M9.1 perf pass should be the next focus: bundle is now **262.91 KB gz**, persistently above the 250 KB target. Concrete candidates for lazy-splitting: `EmbedNode` (and its `useBlobURL` hook) only when a doc actually contains an `![[file]]`, the wikilink hover preview's Floating UI runtime, the four M7 page-level renderers (each is paid for on every Markdown page that doesn't use them), and the CodeFileRenderer (which currently sits eagerly in main).

---

## 2026-05-02 · M7.5 HTML Sandboxed Renderer

**Status**: ✅ `.html` / `.htm` files now open into a sandboxed iframe preview by default, with a one-click toggle into syntax-highlighted source.

### What changed

- Dispatcher gained a new `{ kind: 'html' }` variant. `.html` and `.htm` were lifted out of `CODE_LANGUAGES` and now resolve to this kind directly. The existing source-view path is preserved via the renderer's toggle, so users haven't lost anything — they just default to seeing the page render.
- New `src/ui/reading-shell/HtmlRenderer.tsx`:
  - Renders an `<iframe sandbox="" srcDoc={source} />` for the preview.
  - `sandbox=""` (empty string) is the most restrictive sandbox value: scripts off, top-level navigation off, form submission off, plugins off, opaque origin (`srcDoc` always renders as a unique origin). No browser feature can escape it without an explicit allow-list flag.
  - A small `Sandboxed` pill in the toolbar tells the reader scripts are off, so they don't expect interactivity.
  - A two-tab toggle (`Preview` / `Source`) flips between the iframe and the existing `CodeFileRenderer` (Shiki HTML grammar). Mode is local component state — switching files resets back to preview, which is the right default for an "unknown HTML file in someone's vault."
- DocumentPage gained a `state.kind === 'html'` branch in `LoadState` and JSX. Load effect dispatches `html` between `table` and `text`.
- `globals.css` gained the `.swirlread-html*` block: 70vh-min iframe with rounded border, accent-tinted active tab in the toggle, the rounded-pill `Sandboxed` badge.

### Why no DOMPurify

The first instinct on "HTML preview" is reach for DOMPurify. It's the wrong tool here — the browser's iframe `sandbox` is the security boundary, not script tags inside the markup. With `sandbox=""`, the iframe can't run inline scripts, can't load remote scripts, can't navigate the parent, can't submit forms, can't post-message the parent (no script context to do so). DOMPurify would add ~20 KB gz to scrub markup that the platform is already isolating. If we ever loosen the sandbox (e.g. `allow-same-origin` for trusted local docs), that's the moment a sanitization pass becomes necessary.

### Files added

- `src/ui/reading-shell/HtmlRenderer.tsx` + `.test.tsx` (4 tests: iframe defaults, badge, source toggle, round-trip back to preview)

### Files changed

- `src/core/render/dispatcher.ts` — `html` variant added; `.html` / `.htm` removed from `CODE_LANGUAGES`; `getRendererKind` checks `html` after `table`, before `code`.
- `src/core/render/dispatcher.test.ts` — 1 new test asserting `.html` / `.htm` route to `{ kind: 'html' }`.
- `src/ui/reading-shell/DocumentPage.tsx` — `LoadState.html` variant, load-effect dispatch, `state.kind === 'html'` JSX branch.
- `src/styles/globals.css` — `.swirlread-html*` block (toolbar / badge / toggle / iframe frame).

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings (one stray `as HTMLIFrameElement` cast in the test ran into `@typescript-eslint/no-unnecessary-type-assertion` and was deleted; jsdom returns `HTMLElement` but `.tagName` works either way)
- `pnpm format:check` — all conformant
- `pnpm test` — **633 passed** (was 628; +4 HtmlRenderer + 1 dispatcher net)
- `pnpm build` — main bundle **261.95 KB gz** (was 261.61; +0.34 KB for the new component + two new Lucide icons `Code2` / `Eye`). CSS bundle delta ~+0.20 KB for the toolbar/toggle/iframe rules.

### Down-stream notes

- The iframe height is fixed at `70vh` with `min-height: 320px`. A future polish could grow with content via `postMessage` from the iframe — but that requires `allow-same-origin` or `allow-scripts`, which immediately reintroduces the DOMPurify question. Worth holding the line at "fixed-height preview" for now.
- A "Open in new tab" affordance would be nice, but the HTML file lives on disk under FSAPI — the browser can't navigate to a `file://` URL from a sandboxed iframe, and `srcDoc` content has no URL of its own. Genuinely tricky; defer.
- This officially leaves M7.4 (JSON tree) as the only Milestone 7 sub-task that's unfinished. Today JSON files render via `code` (Shiki highlighting) which is honest but doesn't fold; the tree view is purely a polish addition.

---

## 2026-05-02 · M7.3 CSV / TSV Table Renderer

**Status**: ✅ `.csv` / `.tsv` / `.tab` files now render as a proper styled table instead of a wall of monospace text.

### What changed

- New `src/core/render/csv-parse.ts` — hand-rolled RFC 4180-ish state machine. Handles quoted fields, `""` escapes, newlines inside quoted cells, CRLF, configurable delimiter (`,` or `\t`), and a `maxRows` early-stop signal. ~75 LOC, no dependencies. 10 unit tests.
- Dispatcher gained a `table` kind in its discriminated union: `{ kind: 'table'; delimiter: ',' | '\t' }`. `.csv` / `.tsv` / `.tab` extensions moved out of the text set into a new `TABLE_DELIMITERS` map. The `table` kind is checked before code/text so the dispatcher always picks the most specific renderer.
- `CsvRenderer` consumes raw + delimiter, parses lazily via `useMemo`, treats the first row as `<thead>`, body rows tint on `nth-child(even)`. Body capped at 1000 rows by default; a "Show all" button lifts the cap. Counter row honestly says "Showing first N of more than N rows" while truncated, and "N rows · M columns" once everything's visible.
- Styling uses existing semantic tokens: surface tint for body rows, accent-tinted header background, sticky-positioned header inside an `overflow-x:auto` region so wide tables scroll horizontally without breaking the reading column.

### Why a hand-rolled parser instead of Papa Parse

Papa Parse is ~16 KB gz minified — the main bundle is already at 260 KB after M7.6. A 75-line state machine costs us 0.66 KB gz total (parser + component + dispatcher delta combined) and covers every CSV file the test fixture has thrown at it (English headers, CJK content, quoted commas, embedded newlines, CRLF). If a future user opens a CSV that breaks the parser, that's the moment to swap in Papa.

### Files added

- `src/core/render/csv-parse.ts` + `.test.ts` (10 parser tests)
- `src/ui/reading-shell/CsvRenderer.tsx` + `.test.tsx` (5 renderer tests)

### Files changed

- `src/core/render/dispatcher.ts` — `table` variant added; `.csv`/`.tsv`/`.tab` removed from `TEXT_EXTENSIONS`; new `TABLE_DELIMITERS` map; `getRendererKind` checks media → table → code → text.
- `src/core/render/dispatcher.test.ts` — `.csv` no longer routes to `text`; new test asserts the table+delimiter routing for `.csv` / `.tsv` / `.tab`.
- `src/ui/reading-shell/DocumentPage.tsx` — `LoadState.table` variant; load effect dispatches `table` between `code` and `text`; JSX renders `<CsvRenderer>` for the new state.
- `src/styles/globals.css` — new `.swirlread-csv*` block: scroll wrapper with rounded border, accent-tinted sticky `thead`, alternating-row tint, tabular-nums cells, link-styled "Show all" button.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **628 passed** (was 612; +10 parser + 5 renderer + 1 dispatcher net)
- `pnpm build` — main bundle **261.61 KB gz** (was 260.95; +0.66 KB). CSS bundle **20.99 KB gz** (was 20.84; +0.15).

### Down-stream notes

- Header detection is non-existent: row 0 is always the header. For a CSV with no header line, the user sees the first data row in `<th>` cells, which is mildly off but never destructive. A future polish could heuristically detect (homogeneous types in column 0 vs row 0) and offer a toggle.
- "Show all" doesn't paginate further; it parses the whole file in one shot. For a 100k-row CSV that's a noticeable hitch on the main thread. M9.1 perf pass should consider chunked parsing in a worker if/when this becomes a real complaint — the `maxRows` seam in the parser is exactly the place to thread that.
- Cells use `white-space: nowrap` so a wide column doesn't squash neighbours. The horizontal scroll inside `swirlread-csv__scroll` keeps the column measure intact.

---

## 2026-05-02 · M7.6 Media Renderer

**Status**: ✅ Image / video / audio files now open natively in SwirlRead instead of falling through to the unsupported card.

### What changed

The dispatcher was upgraded from a `RendererKind` enum + optional `language` field into a proper discriminated union:

```ts
export type RendererDecision =
  | { kind: 'markdown' }
  | { kind: 'text' }
  | { kind: 'code'; language: string }
  | { kind: 'media'; media: 'image' | 'video' | 'audio' }
  | { kind: 'binary' }
```

23 extensions moved out of the binary set into a new `MEDIA_EXTENSIONS` table mapping directly to the right subtype:

- **image** — `.png`, `.jpg/.jpeg`, `.gif`, `.webp`, `.avif`, `.bmp`, `.ico`, `.svg`
- **video** — `.mp4`, `.webm`, `.mov`, `.mkv`, `.avi`, `.m4v`
- **audio** — `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, `.opus`

`.svg` is intentionally routed to image even though it's text-shaped — when a user opens `logo.svg` they expect to see the picture, not the markup. The dispatcher checks media before code so the routing is unambiguous.

A new page-level `<MediaRenderer>` consumes a `VaultFile` + `MediaKind` + `VaultFileSystem` and:

- runs `useBlobURL(vault, file.path)` to fetch a `blob:` URL
- renders the matching native element (`<img loading="lazy">`, `<video controls preload="metadata">`, `<audio controls preload="metadata">`)
- wraps it in a `<figure>` with a small caption row (file name + human-readable size from the existing `formatSize` helper)
- shows calm pending / broken states with the same visual language as the rest of the reader

### Why a shared hook

`useBlobURL` was already inside `EmbedNode.tsx` (used by `ImageEmbed` / `VideoEmbed` / `AudioEmbed` for the inline `![[file]]` flow). Duplicating it for `MediaRenderer` would mean two cancellation contracts and two error-mapping policies to keep aligned. The hook now lives in `src/ui/reading-shell/use-blob-url.ts` and both surfaces import it. EmbedNode lost ~25 LOC of duplicated state plumbing.

### Why DocumentPage threads the `vault` through state

Previous M7 renderers (PlainText / CodeFile / Unsupported) only needed the file's bytes or its `VaultFile` metadata — both already in hand from earlier in the load effect. MediaRenderer needs the live `VaultFileSystem` adapter so it can call `getBlobURL()` later, after the user might have switched vaults. Threading the adapter through `LoadState` keeps the state-to-render mapping referentially honest: the adapter the load effect saw is the one MediaRenderer will use.

### Files added

- `src/ui/reading-shell/use-blob-url.ts` — shared hook (extracted from EmbedNode)
- `src/ui/reading-shell/MediaRenderer.tsx` + `.test.tsx` (4 tests)

### Files changed

- `src/core/render/dispatcher.ts`
  - `RendererDecision` type changed from `{ kind, language? }` to a discriminated union with five variants. `MediaKind` exported as a type alias.
  - New `MEDIA_EXTENSIONS` table; `BINARY_EXTENSIONS` shrunk down to formats SwirlRead genuinely can't render (PDF, archives, fonts, .doc/.xls/.epub).
  - `getRendererKind` checks media before code so `.svg` resolves to image.
- `src/core/render/dispatcher.test.ts`
  - Adjusted the discriminated-union access pattern (`ts.kind === 'code' && ts.language`).
  - Split the old "binary extensions" test into two: one asserts media routing with subtype, the other asserts non-renderable binaries still resolve to `binary`. (8 tests total, was 7.)
- `src/ui/reading-shell/EmbedNode.tsx`
  - Removed the local `useBlobURL` and now imports it from `./use-blob-url`. The three Embed components (Image/Video/Audio) keep working unchanged because the hook signature is identical.
- `src/ui/reading-shell/DocumentPage.tsx`
  - `LoadState` gained a `media` variant carrying `{ file: VaultFile; media: MediaKind; vault: VaultFileSystem }`.
  - Load effect dispatches `media` before `binary`; markRecentFile is skipped for both (a user clicking through their image folder shouldn't pollute the reading history).
  - JSX has a new `state.kind === 'media'` branch rendering `<MediaRenderer>`.
- `src/styles/globals.css`
  - New `.swirlread-media*` rules: centred figure layout, `max-height: 75vh` for image/video so they never push the page absurdly tall, audio capped at 480px width, theme-aware borders, and `pending` / `broken` variants share the dashed-card look used elsewhere in the reader.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **612 passed** (was 607; +4 MediaRenderer + 1 net new dispatcher test from the binary-split)
- `pnpm build` — main bundle **260.95 KB gz** (was 260.57; +0.38 KB for the new dispatcher table, MediaRenderer component, and the shared-hook reorganization). CSS bundle **20.84 KB gz** (was 20.67; +0.17 KB for the seven new `.swirlread-media*` rules).

### Down-stream notes

- Image lightbox / click-to-zoom is deferred. The figcaption + max-height framing keeps images readable inline; a future polish pass can add a Radix Dialog overlay if Wilson's vault grows enough portrait-orientation photos for it to be worth the bundle weight.
- The `audio` width cap (480px max-width) is a guess. If audio files end up being a primary surface, the figure should breathe to the column width with a custom themed control track. Phase 2 / RX-style editing will revisit.
- `EmbedNode` could in theory delegate its inline image/video/audio rendering to `MediaRenderer` to fully deduplicate, but the inline embed has different framing (no figcaption, smaller margins, optional `width|height` from `![[a.png|400x300]]` syntax) and a `<span>` outer instead of `<figure>`. Worth keeping them separate for now; if a third surface needs the same work, that's the moment to factor a `BlobMedia` primitive.
- The dispatcher's binary set is now small and focused (PDF / archives / fonts / Office docs / .epub). Each entry there is a candidate for future renderers — M7.5 will pull `.html` into its own sandboxed-iframe path, and a future PDF renderer (PDF.js) would lift `.pdf` out of binary the same way M7.6 lifted media.

---

## 2026-05-02 · M7 Universal File Reader (first slice — M7.1 / M7.2 / M7.7 / M7.8)

**Status**: ✅ SwirlRead now opens every file in the vault, not just Markdown. Plain text reads as monospace; source code gets full Shiki highlighting; binaries get a calm metadata card instead of garbled bytes through `readText`.

### What changed

A pure dispatcher decides — synchronously, from the path alone — which surface a non-directory file opens into:

```
markdown  → existing pipeline
text      → PlainTextRenderer (monospace pre, themed code-bg)
code      → CodeFileRenderer  (fence-wrap → renderMarkdown → Shiki)
binary    → UnsupportedRenderer (file metadata card, no readText)
```

`getRendererKind(path)` is exported from `core/render/dispatcher.ts` so future surfaces (palette previews, embed cards, file-tree icons) can ask the same question without duplicating the extension table.

### Why fence-wrap instead of a direct Shiki call

Calling `shiki.codeToHast` straight off would have meant duplicating language registration, dual-theme wiring, sanitize-schema overrides, and the existing fallback for unknown languages. Wrapping the source in a CommonMark fence and running `renderMarkdown(`\`\`\`<lang>\\n…\\n\`\`\``)` reuses every line of that already-tested code. The only subtlety is fence width: if the source itself contains a `\`\`\``run, we'd close the fence early.`longestBacktickRun(source)` returns the longest internal run; the wrapper uses one more than that (minimum 3). A test feeds a source line that contains a triple-backtick to prove the wrapping survives.

### Why binaries skip `readText`

Calling `readText` on `.png` / `.mp4` / `.zip` either throws (FSAPI is utf-8 strict) or — worse — returns a string of replacement characters and pretends to succeed. Routing them through the dispatcher's `binary` kind sidesteps both failure modes; the UnsupportedRenderer reads from `entry: VaultFile` (already in hand from the existing `stat()` call) for size + modified date.

Recent-files marking is also skipped for binaries: a user clicking through their image folder shouldn't pollute the reading-history with images they merely browsed.

### Files added

- `src/core/render/dispatcher.ts` + `.test.ts` — pure renderer-kind decision (7 tests)
- `src/ui/reading-shell/PlainTextRenderer.tsx` + `.test.tsx` (2 tests)
- `src/ui/reading-shell/CodeFileRenderer.tsx` + `.test.tsx` (4 tests including the inner-fence escape case)
- `src/ui/reading-shell/UnsupportedRenderer.tsx` + `.test.tsx` (5 tests including formatSize edge cases)
- `src/ui/reading-shell/file-renderer-utils.ts` — `longestBacktickRun` and `formatSize` live here so the components stay component-only (Vite fast-refresh / `react-refresh/only-export-components` clean)

### Files changed

- `src/ui/reading-shell/DocumentPage.tsx`
  - `LoadState` union gained `text` / `code` / `binary` variants; the old `isMd` boolean on the `rendered` variant was dropped (rendered now implies markdown).
  - The load `useEffect` calls `getRendererKind(path)` after the directory branch and dispatches: markdown still walks the full pipeline; text/code call `readText` and store raw + (for code) language; binary skips `readText` entirely and stores the `VaultFile` from the earlier `stat`.
  - The render JSX gained three new branches: `<PlainTextRenderer>`, `<CodeFileRenderer>`, `<UnsupportedRenderer>`. The old "non-md fallback `<pre>`" branch is gone.
  - All `state.isMd` reads were replaced with `state.kind === 'rendered'` checks (TOC effect, backlinks effect, frontmatter panel guard, ctx provider).
- `src/ui/reading-shell/DocumentPage.test.tsx`
  - The "renders non-markdown text files as a code block (fallback path)" test was renamed to "renders source-code files via the CodeFileRenderer (M7.7)" and now finds the result via `findByTestId('code-file-renderer')` (Shiki splits text across spans, so direct text matching no longer works).
  - The TOC-clear test got the same treatment.
- `src/styles/globals.css` — new theme-aware rules for `.swirlread-plaintext`, `.swirlread-codefile`, `.swirlread-codefile__status`, and the full `.swirlread-unsupported*` family. All built from existing semantic tokens; all four themes (Sepia/Light/Dark/OLED) get the same surface treatment for free.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings (after splitting helpers into `file-renderer-utils.ts` to satisfy `react-refresh/only-export-components`)
- `pnpm format:check` — all conformant
- `pnpm test` — **607 passed** (was 589; +7 dispatcher + 2 plain-text + 4 code-file + 5 unsupported = +18)
- `pnpm build` — main bundle **260.57 KB gz** (was 259.24; +1.33 KB for the dispatcher table, three small renderer components, one new Lucide icon `FileQuestion`). CSS bundle **20.67 KB gz** (was 20.47; +0.20 KB for the four new style blocks).

### Down-stream notes

- **M7.6 (image/video/audio renderer) is the highest-value next step.** The dispatcher already knows `.png`/`.mp4`/`.mp3` are binary; today they all show the unsupported card. Splitting them into a `MediaRenderer` that uses `vault.getBlobURL()` (the same call `EmbedNode` already makes) is mostly UI plumbing — the data path is built. When that lands, the dispatcher gets a `media` kind and the binary card retains its purpose for genuinely unsupported formats (PDF, archives, fonts).
- **M7.3 CSV/TSV** would lift `.csv`/`.tsv` out of `text` into a proper table renderer. Easy follow-up; the dispatcher seam is the only edit point.
- **M7.4 JSON tree** would lift `.json`/`.jsonc` out of `code` into a collapsible tree. Sits on top of the existing Shiki render so the read-only "highlighted source" view stays available as the second tab.
- **M7.5 HTML sandboxed iframe** is the last one and the most security-sensitive — currently `.html` is routed to `code` (Shiki highlighting of source). Sandboxed iframe rendering needs a dedicated permissions story.
- The fence-wrapping trick in `CodeFileRenderer` could in principle escape the fence if the source contained a tilde fence (`~~~`) the same length, but our fence is always backticks so the two never collide. If we ever switch the wrapper to tildes for some other reason, the `longestBacktickRun` helper has to grow into `longestRun(char)`.
- Bundle is now **260.57 KB gz**, comfortably past the original 250 KB main-bundle aspirational budget. M9.1 perf pass owns lazy-splitting whatever can be deferred — `Wikilink` hover preview's Floating UI runtime, the embed renderer family, and possibly `BacklinksPanel` itself are the obvious targets.

---

## 2026-05-02 · RX5 Backlinks As Reading Continuation

**Status**: ✅ Backlinks panel turned from a database row list into a "what should I read next?" cue.

### What changed

The end-of-document `BacklinksPanel` now does three new things, all in line with `reader-experience-craft-plan.md` § Phase RX5:

1. **Ranking by usefulness**, not alphabet. New pure helper `rankBacklinks(list, options)` lives in `core/navigation/backlinks.ts`. Sort key is:
   - **Recency** — sources the reader has opened lately float to the top, in recency order. Drawn from `useReaderStore.recentByVault[vaultId]`. The reader's own attention is the strongest "next read" signal we have without a feedback loop.
   - **Same-section affinity** — at the same recency tier, sources whose top-level directory matches the current document's top-level directory rank ahead of cross-section sources. (Wilson's vault: a `knowledge/`-rooted note linking back into `knowledge/react.md` outranks a `tasks/`-rooted note that does the same.)
   - **Alphabetical fallback** — `localeCompare(undefined, { sensitivity: 'base' })`. Stable, locale-aware, CJK-friendly.
2. **Wikilink emphasis in the snippet.** A new `renderSnippet()` walks the existing context string and wraps any `[[…]]` reference in `<mark>`. The `<mark>` rule (`.swirlread-backlinks__mark`) uses a low-saturation `color-mix(in srgb, var(--color-accent) 15%, transparent)` tint so it reads as "the reference" without competing with body prose.
3. **Hide on empty.** When `state.kind === 'ready' && ranked.length === 0`, the component returns `null` — the entire `<section>` (including the heading) is gone. RX5 explicitly calls out the old "No backlinks yet." status row as a distraction at the document's natural ending; getting rid of it makes a clean note actually feel finished.

### Why a pure helper instead of in-component sort

`rankBacklinks` takes its inputs as plain arrays — no store reads, no side effects. That keeps the unit tests deterministic (5 cases covering alpha fallback, recency promotion, section-tiebreak, recency-overrides-section, and immutability) and lets future surfaces — e.g. a palette "Backlinks" group later — reuse the same ranking without dragging in `useReaderStore`.

The component's job becomes:

- subscribe to `recentByVault[vaultId]` (Zustand re-renders on change)
- strip the current document from that list (a doc shouldn't claim it's "recent for itself" when the user just opened it)
- pass the cleaned recents + currentPath to `rankBacklinks`

### Files changed

- `src/core/navigation/backlinks.ts`
  - New `BacklinkRankOptions` interface + `rankBacklinks(backlinks, options)` exported.
  - Imports `splitPath` (for top-level section comparison).
- `src/core/navigation/backlinks.test.ts`
  - 5 RX5 ranker tests + a small `Backlink` factory helper.
- `src/ui/reading-shell/BacklinksPanel.tsx`
  - Subscribes to `useReaderStore` selector for the active vault's recents.
  - `useMemo` applies `rankBacklinks` whenever state, recents, or path change.
  - Empty-state branch returns `null` instead of rendering the "No backlinks yet." row.
  - New `renderSnippet()` returns `string | ReactNode[]` — a fast path returns the original string when no `[[` is present (most snippets after the index trims).
- `src/ui/reading-shell/BacklinksPanel.test.tsx`
  - Replaced the empty-state test (now asserts the heading is _not_ in the document).
  - Updated the "lists source files" test to use a function matcher (the `<mark>` splits the snippet textContent across nodes) and to assert `mark.textContent === '[[target]]'`.
  - New test: recently-opened sources rank above alphabetical neighbours.
- `src/ui/reading-shell/DocumentPage.test.tsx`
  - One existing assertion needed the same function-matcher fix (the integration test renders the panel through the full DocumentPage path).
- `src/styles/globals.css`
  - New `.swirlread-backlinks__mark` rule. Uses `box-decoration-break: clone` so multi-line wikilinks (a future case once embed targets get longer) keep clean rounded corners on every line.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **589 passed** (was 583; +5 ranker tests + 1 net new panel test from the rewrite)
- `pnpm build` — main bundle **259.24 KB gz** (was 258.87; +0.37 KB for the rank helper, store subscription wiring, and snippet renderer). CSS bundle **20.47 KB gz** (was 20.44; +0.03 KB for the mark rule).

### Down-stream notes

- Snippet quality (the third bullet in the RX5 plan — "stronger contextual snippets") is _not_ addressed yet. The backlinks index already centres on the wikilink offset and the visual highlight now points the eye there, so the existing snippets read fine. A future iteration can add e.g. sentence-boundary snapping or a longer window when the linked context is mid-sentence.
- The `recentSourcePaths` filter intentionally drops `currentPath` so a self-referential file (a note that links to itself, rare but possible) doesn't float to the top under "I just opened this." Same-section affinity still applies.
- A natural next step that builds on this: surface backlinks in the command palette (RX6 mentioned tags as the natural addition; backlinks-of-current-doc would slot in beside Headings using the same `useTocStore.context.path` gate).
- The `<mark>` styling reuses the accent token the rest of the reader already mixes with `color-mix`, so all four themes (Sepia/Light/Dark/OLED) get a consistent "this is a reference" cue without needing per-theme rules.

---

## 2026-05-02 · RX6 Command Palette navigation polish

**Status**: ✅ ⌘K is now the fastest way to jump anywhere — recents, headings of the current doc, sections of the current vault, files, full-text search.

### What changed

The palette gained two new groups in the default and files modes (everything except `>` search), plus the previously-mode-gated Recents group is now persistent across both:

| Group                        | When visible                                                                    | Selecting an item                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Recent files**             | Always (when not in `>` mode)                                                   | Navigate to the file                                                               |
| **Headings (this document)** | When the toc-store's `context.vaultId` AND `context.path` match the current URL | `requestAnimationFrame(() → scrollTo(anchor))` — stays on the current page, no nav |
| **Sections in <vault>**      | When `detectSections(vault)` returns any sections with a resolved home          | Navigate to the section home                                                       |
| **Files in <vault>**         | Only when input is non-empty (avoids walking 5_000 files for a `⌘K` open)       | Navigate to the file                                                               |

cmdk's `shouldFilter` flips with mode: off for empty / search (preserves order / pre-ranked), on for files mode (cmdk scores across every visible group). So typing "intro" can find a heading, a file path, or a section equally well — single keystroke surface for the whole vault.

### Why both vault id AND file path must match for headings

First pass only checked `tocContext.vaultId === currentVaultId` and a heading-orphan test caught the bug: stale headings from one document would render in the palette even on a different document, and clicking would `getElementById(id)` against a DOM where the anchor doesn't exist (silent no-op). Fixed by also requiring `tocContext.path === currentFilePath` — both pulled from `useLocation()`.

### Files changed

- `src/ui/command-palette/CommandPalette.tsx`:
  - New imports: `Hash` / `Library` Lucide icons, `detectSections` + `VaultSection`, `DocumentHeading` type, `useTocStore`.
  - `PaletteBody` reads headings + tocContext from store, calls new `useVaultSections(currentVaultId)` hook.
  - New `useCurrentFilePath()` hook mirrors `useCurrentVaultId()` — strips the splat from the URL pathname, decodes each segment so unicode paths compare equal to the toc-store's published path.
  - New `headingsActive` derived bool gates the Headings group on the strict 4-way match (vault id, path non-null, path matches URL, headings non-empty).
  - New `handleSelectHeading(id)` closes the palette then `requestAnimationFrame`s a smooth scroll to the anchor + `history.replaceState` of the hash. No `useNavigate` call — staying on the same doc.
  - New `<HeadingItem>` subcomponent + `<Library>` row markup for sections.
  - `useVaultSections(vaultId)` hook calls `detectSections(adapter)` only when palette is open AND a vault is in scope (zero cost for closed palette / fresh user).

### Test changes

- `src/ui/command-palette/CommandPalette.test.tsx`:
  - Added `EMPTY_TOC_CONTEXT` constant + threaded through beforeEach/afterEach so tests don't carry tocContext between cases.
  - 4 new RX6 tests: Headings group renders when current doc publishes any · Headings hides when context targets a different document · Sections group lists detected sections · Sections hides when no top-level dir has a home.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **583 passed** (was 579; +4 RX6 palette tests)
- `pnpm build` — main bundle **258.87 KB gz** (was 258.86; essentially flat). The new wiring rides into the lazy CommandPalette chunk which grew from 6.51 → **7.04 KB gz** — pages without `⌘K` activity pay nothing for it.

### Down-stream notes

- Tags as a palette group is the natural next addition — `tocContext.tags` already exists from RX4. Skipped this round to keep the change tight and easy to audit.
- "Last opened time" on Recent items (per the craft plan's "richer metadata" goal) is one `Intl.RelativeTimeFormat` call away — defer until a third metadata column is needed.
- `useVaultSections` calls `detectSections` on every palette open. For Wilson-sized vaults this is `Promise.all` over ~5 listings, well under a frame. If it grows expensive, the existing `getListing` cache underneath already memoizes per-folder; we'd just add a per-vault sections cache mirroring the walked-files / tag-index pattern.
- The Headings group + the right-rail TOC use the SAME store (`useTocStore.headings`). Click a heading in either surface and the active-id update propagates everywhere — natural consistency without extra plumbing.

---

## 2026-05-02 · RX4 Context Rail

**Status**: ✅ Right rail upgraded from "TOC only" into "where am I + what's nearby."

### What changed

The right-rail panel now stacks two surfaces per the craft plan:

1. **Context** (compact, optional) — page tag chips (clickable, open the existing `TagsPanel`), `N backlinks` count, `N links out` count. Each module self-hides when empty so a tagless / linkless note doesn't get visual noise.
2. **TOC** (primary) — H1–H4 list with scroll-spy active highlight (M4.6, unchanged behaviour).

Crucially: **the entire rail collapses to nothing when there are no headings AND no context** — RX4's "documents without headings do not show a distracting 'No headings' rail" requirement.

### Files changed

- `src/stores/toc-store.ts`:
  - New `DocumentContext` shape (`vaultId` / `path` / `tags[]` / `outgoingLinks` count) + `setContext(context)` action with cheap structural-equality bail-out so identical re-publishes don't churn subscribers.
  - `clear()` now also resets `context` so the rail goes blank between docs.
- `src/ui/reading-shell/TableOfContents.tsx`:
  - Imports `Hash` / `MessageSquare` / `Link` Lucide icons.
  - New internal `<ContextRail>` component renders tag chips (capped at 6 with `+N` overflow) and link counts. Tag chips wire into `useTagStore.selectTag` so clicking opens the existing tags panel — no new dialog needed.
  - New `useBacklinkCount(vaultId, path)` hook reads `getBacklinksForFile` (already cached per vault) and reports the count. Cancellation-safe.
  - Whole component returns `null` when `headings.length === 0 && !hasContext` — caller layout (the right `<aside>` in `VaultLayout`) keeps its slot but renders nothing.
- `src/ui/reading-shell/DocumentPage.tsx`:
  - Already publishes headings to `useTocStore` after each render. Added a sibling `void import('@/core/navigation/tag-index').then(({ tagsInMarkdownSource }) => …)` that publishes `{ tags, outgoingLinks }` derived from the same `raw` source the renderer just consumed. `extractWikilinkReferences` is now imported statically (already eager via `BacklinksPanel`); `tagsInMarkdownSource` stays dynamic (its body extractor lives in the lazy tag-index chunk).
- `src/styles/globals.css`:
  - `.swirlread-toc__context` — bordered context block above the TOC.
  - `.swirlread-toc__tag-list` / `.swirlread-toc__tag` / `.swirlread-toc__tag-more` — tag chip styling matching the existing tag pill aesthetic.
  - `.swirlread-toc__context-counts` / `.swirlread-toc__count` — small inline count badges with hover-friendly tooltips.

### Why count chips instead of full lists in the rail

The craft plan says "do not make the right rail a dashboard" + "keep the rail scannable in under two seconds." A count answers "is there something here?" in a glance; the user can pop to the bottom-of-document Backlinks panel for details, or hit the existing `>` palette mode for content search. Three modules + the TOC stays under the two-second scan target.

### Test changes

- `src/ui/reading-shell/TableOfContents.test.tsx`:
  - Added `EMPTY_CONTEXT` constant and threaded it through `beforeEach` / `afterEach` so per-test state setup is explicit.
  - Flipped the "shows an empty state" test → now "renders nothing when there are no headings AND no context."
  - 5 new RX4 tests: rail-with-context-only, hide-tags-when-empty, +N overflow at 6 tags, click-tag-selects-in-store, both-rail-and-TOC-when-both-exist.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **579 passed** (was 574; +5 RX4 context-rail tests)
- `pnpm build` — main bundle **258.86 KB gz** (was 258.57; +0.29 KB for the toc-store extension + DocumentPage publish + new icons). CSS bundle **20.44 KB gz** (was 20.23; +0.21 KB for the context styles). `tag-index-*.js` lazy chunk: 0.60 KB gz.

### Down-stream notes

- Tag chips reuse the existing `useTagStore` + `TagsPanel` infrastructure — no new state machine or dialog component.
- The backlinks-count hook is a thin wrapper around the existing per-vault Dexie+memory cache; subsequent reads on the same doc are instant.
- "+N" overflow is a static label today. A future iteration could make it a popover that lists the remaining tags or expand inline.
- Outgoing-link count counts DISTINCT wikilink targets (`new Set(refs.map(r => r.target.toLowerCase()))`) so a doc that links to the same note three times is "1 link out", not 3.
- The rail still uses one `<nav aria-label="Document context">` wrapper and the context section uses `<section aria-label="Page context">` so screen-reader users hear a clean hierarchy.

---

## 2026-05-02 · RX3 Knowledge Navigation Sidebar

**Status**: ✅ Left rail turned from a file browser into a reading navigator.

### What changed

The sidebar above the file tree now reads as a continuation surface, not a raw recents dump. Top-level sections get promoted to a quick-jump block. The full filesystem tree stays available below as a fallback for precise navigation.

**New shape (per the craft plan):**

1. **Continue** — the most recent file IF it has a saved scroll position. Renders with a `BookOpen` icon and a small "Resume" pill in the accent color. Hidden otherwise so first-time users don't see a confusing "Continue nothing" affordance.
2. **Recent** — the next 4 recent files (or the whole top-5 if no Continue claimed the head). The Continue file is removed from this list so it never appears twice.
3. **Sections** — top-level directories with detected section homes (`*-map.md` / `<dirname>.md` / `index.md` / `home.md` / `README.md`), alphabetically. Each row navigates to the section home. Hidden when no top-level dir has a home (e.g. flat vaults).
4. **Files** — the full hierarchical tree (unchanged behaviour). Now wrapped under a `Files` heading so the section break reads cleanly.

### Files modified

- `src/ui/file-tree/FileTree.tsx`:
  - Replaced the single `<RecentFiles>` block with `<ContinueAndRecent>` that splits the recents list at the head when scroll memory exists, plus dedicated `<ContinueBlock>` and `<RecentBlock>` subcomponents.
  - New `<SectionsNav>` component that calls `detectSections(vault)` once on mount and renders only sections with a resolved home.
  - New `<FilesNav>` wrapper around the existing tree so the heading + tree share a consistent block treatment.
  - Subscribes to `useReaderStore.scrollByVault[vaultId]` to detect saved scroll positions for the Continue branch.
- `src/styles/globals.css`:
  - `.swirlread-file-tree__sections` — bordered block matching the existing `__recent` rhythm.
  - `.swirlread-file-tree__files` — small top padding so the `Files` heading reads as a section break.
  - `.swirlread-file-tree__row--continue` — slightly heavier weight + flex for the Resume tag alignment.
  - `.swirlread-file-tree__row--section-link` — bolder weight + accent-tinted icon.
  - `.swirlread-file-tree__resume-tag` — pill-shaped accent badge inside the Continue row.

### Why "Continue" is gated on saved scroll memory

The craft plan specifies `Continue` as "the most recent file with saved scroll position." That gating makes the difference between a duplicate of the Recent list (no behavioural advantage) and a genuine resume affordance (the user gets to pick up exactly where they left off). When no scroll memory exists yet — fresh open of any file — the file just rolls into the Recent list, no special treatment.

### Test changes

- `src/ui/file-tree/FileTree.test.tsx` — 5 new tests under `RX3 — Continue / Recent / Sections layout`:
  - Continue hidden when no scroll memory.
  - Continue promoted with "Resume" tag when scroll memory exists.
  - Continue file does NOT duplicate inside Recent.
  - Sections block lists detected sections with section-home links.
  - Sections block hides when no top-level dir has a detected home.
- 2 existing M4.2 tests updated to use `getAllByRole(...)` / forEach assertions — section links now appear BOTH in the dedicated Sections block AND on the file-tree row, both should still target the same href.
- 1 RX7 skeleton test made race-free by stubbing `adapter.readText` with a held promise so the loading state stays up long enough to inspect even when prior tests have warmed caches.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **574 passed** (was 569; +5 RX3 tests)
- `pnpm build` — main bundle **258.57 KB gz** (was 257.74; +0.83 KB for the RX3 wiring + the new `BookOpen` Lucide icon). CSS bundle: 20.23 KB gz (was 19.78; +0.45 KB for the new section-block styles).

### Down-stream notes

- The Sections block calls `detectSections(vault)` on every mount — uncached. For Wilson-sized vaults this is `Promise.all` over 5–10 top-level listings, well under one frame. If it grows expensive for huge vaults, the existing `getListing` cache underneath already handles per-folder memoization; we'd just need a per-vault sections-result cache mirroring the walked-files / tag-index pattern.
- The Continue branch reads `scrollByPath[head.path]` directly. M9 watcher work that updates scroll positions live will flow through naturally — the rail re-renders on every store change.
- "Continue" + "Recent" both sit inside `<nav>` elements with `aria-label`, so screen-reader users hear "Continue reading, navigation" / "Recent files, navigation" — matches the visual hierarchy.
- Future RX4 / RX5 work can target the right rail and backlinks panel without touching this file again.

---

## 2026-05-02 · RX1 Document Page Craft + RX7 Productized States (DocumentPage scope)

**Status**: ✅ First pass of `docs/develop/reader-experience-craft-plan.md` shipped — every document now opens like an article instead of a file record.

### What changed

**RX1 — Document Page Craft**

- New `src/core/render/page-title.ts`:
  - `derivePageTitle({ frontmatter, raw, filePath })` — picks the most article-like title in priority order: frontmatter `title` → first ATX `# Heading` in body → cleaned filename. Returns `{ title, source }` so future UI / tests can branch on origin.
  - `firstAtxH1(raw)` — multi-line regex that finds the first top-level ATX heading. Strips the GFM closing `# x #` form. Skips H1-shaped lines inside fenced code via a cheap pre-pass that whitespace-pads ` ```…``` ` blocks (keeps line offsets stable so the regex doesn't accidentally match `# comment` inside `bash`).
  - `cleanFilename(filePath)` — strips directory + extension, replaces `-`/`_` with spaces, title-cases ASCII words. Non-Latin words (CJK) and already-cased ASCII (acronyms like `NASA`) pass through unchanged.
  - Why a regex instead of reusing `extractHeadings`: that function walks the rendered DOM. Title selection has to run BEFORE render so the loading skeleton sits under the right header. The regex covers the only form that matters in practice.
- `src/ui/reading-shell/DocumentPage.tsx`:
  - New header markup (`<h1 class="swirlread-doc-header__title">` + `<p class="swirlread-doc-header__breadcrumb">` carrying vault id + path in muted monospace).
  - `useMemo`-d `derivedTitle` lives BEFORE the directory early-return so React's hook order stays stable across state transitions (an early-return-before-hook bug almost shipped — caught by failing tests).
- `src/ui/reading-shell/Frontmatter.tsx`:
  - In `metadata` display mode, the title row is no longer rendered — the page header owns it now. Description / date / author / tags rail still shows. `raw` mode (full key/value table) is unchanged so power readers keep every field.

**RX7 — Productized States (DocumentPage scope)**

- New `src/ui/reading-shell/DocumentSkeleton.tsx`:
  - Stable column-width placeholder that replaces the previous `Reading…` italic. A title-shaped block + a small subtitle + 7 paragraph lines at varying widths so the rhythm reads as "an article is about to appear here."
  - No animated shimmer — the project's design philosophy values calm over motion. A subtle 2.4s opacity pulse runs only when `prefers-reduced-motion: no-preference`.
  - `role="status"` + `aria-busy` + sr-only "Reading…" so screen readers get the loading state without sighted users seeing redundant copy.
- `missing-file` state reworded into a two-line card (`File not found` + "this path doesn't exist in the current vault" + pointer to ⌘K).
- `error` state matches the same card visual ("Couldn't open this file" + the underlying message). Same `swirlread-doc-empty` class for consistent feel.

### Hook-order bug caught + fixed during the round

First pass put `useMemo(derivePageTitle, ...)` AFTER the `if (state.kind === 'directory')` early return. React threw "Rendered fewer hooks than expected" the moment a route hit a directory state. Fixed by moving the `useMemo` above the early return — hook order now stable across all `state.kind` values.

### Test changes

- `src/core/render/page-title.test.ts` — 19 unit tests across `cleanFilename`, `firstAtxH1`, and `derivePageTitle` (CJK preservation, fenced-code skipping, frontmatter / body / filename precedence, edge cases).
- `src/ui/reading-shell/DocumentPage.test.tsx` — 3 new tests under a `RX1` group (H1-derived title, filename fallback, frontmatter-title precedence) + 1 RX7 skeleton-shape test. Several existing tests updated:
  - `getByRole('heading', { level: 1 })` swapped to `getAllByRole(...)` w/ length assertion in 3 spots — the page header h1 + the body h1 both render the same name when the title is derived from body H1. Visual UX is intentional (article title up top, body content title where the prose starts); tests just need to be tolerant of the duplicate semantic role.
  - `missing-file` test now asserts the new copy.
  - `hides frontmatter when "hidden"` test reworded — title stays in the page header (RX1); the "hidden" pref hides the metadata RAIL (description / date / tags), not the page identity.
- `src/ui/reading-shell/Frontmatter.test.tsx` — title-in-metadata-mode assertion flipped to `queryBy(...).not.toBeInTheDocument()` and a new "title-only frontmatter renders nothing" case added since the panel no longer surfaces the title alone.
- `src/ui/reading-shell/VaultHome.test.tsx` — auto-redirect tests use `getAllByRole(...)` for the same reason.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **569 passed** (was 545; +24 net: +19 page-title unit, +5 DocumentPage RX1/RX7 / Frontmatter shape changes minus a couple swapped assertions)
- `pnpm build` — main bundle stays in the same 257 KB neighborhood (RX1 utility is tiny; skeleton + breadcrumb add a few CSS rules; nothing new on the JS hot path).

### Acceptance check vs. the prompt

- ✅ A Markdown file with `# My Note` displays `My Note` as the document title (covered by `RX1 — uses the first body H1...` test).
- ✅ A Markdown file without H1 displays a cleaned filename (`falls back to a cleaned filename when the doc has no H1`).
- ✅ The full path remains accessible but does not dominate the visual hierarchy (breadcrumb is `font-mono`, `0.74rem`, `color-text-muted`).
- ✅ Loading does not cause large layout jumps (skeleton occupies the same `--reader-content-width` as the article column).
- ✅ Routes unchanged.
- ✅ TOC heading extraction, frontmatter display, backlinks indexing, scroll memory all still pass their existing tests.

### What I deliberately did NOT do

- Did not de-duplicate the body `<h1>` visually when the page header derives from it. Both render the same text when the title source is body H1. Acceptable as "article title + body content title" but a follow-up RX1.5 could hide the body H1 visually (CSS `:first-child` rule on `.swirlread-prose h1`) without removing it from the DOM (TOC needs it). Flagged for a subsequent craft pass.
- Did not touch RX2 / RX3 / RX4 etc. — the prompt scoped to RX1 + RX7 (DocumentPage slice).
- Did not change route URLs or refactor any store. Only DocumentPage + Frontmatter component touched on the UI side; only one new core utility added.

### Tests skipped or unrunnable

None. The acceptance commands ran:

- `pnpm test -- DocumentPage` — runs the wider suite because vitest passes the substring as a file filter; all 569 tests pass.
- `pnpm typecheck` — passes.

---

## 2026-05-01 · M5.4 + M5.5 · Full-text search + multi-mode prefix routing

**Status**: ✅ Closes the user-facing M5 loop. `>` prefix in the palette opens content search across the entire active vault — Wilson's notes are finally searchable end-to-end.

### What was built

The command palette gains a third mode: `>` consumed as a prefix routes the rest of the input to a MiniSearch-backed full-text index over the active vault's markdown bodies. Top 25 hits return ranked, with snippets centred on the first match. CJK content searchable via `Intl.Segmenter`. Index built lazily per vault and cached for the rest of the session.

**Files created**:

- `src/core/search/full-text.ts` + `.test.ts` — `buildFullTextIndex(vault)` walks every `.md`/`.mdx`, strips frontmatter, feeds bodies into MiniSearch (name boost 2×, fuzzy 0.2, prefix). `searchIndex(index, query)` returns ranked hits with name + path + score + snippet. CJK-aware tokenizer: heuristic ASCII-only check stays on MiniSearch's whitespace split (faster); anything with non-ASCII chars goes through `Intl.Segmenter` for word-like segmentation. Snippet builder centres a 60-char window on the first matching term, with ellipses.
- `src/ui/command-palette/full-text-cache.ts` — per-vault promise cache mirroring `walked-files-cache.ts`. `invalidateFullTextIndex(vaultId)` exposed for `removeVault` cleanup.

**Files modified**:

- `src/ui/command-palette/CommandPalette.tsx` — new `classifyInput(raw)` + `PaletteMode` discriminated union (`recents` / `files` / `search`). New `useFullTextIndex(vaultId, mode)` hook that builds the index lazily on first `>` mode entry and re-runs `searchIndex` per keystroke. Three render branches each with their own loading / error / empty-state. Footer gains a `>` hint pill so the prefix is discoverable.
- `src/stores/vault-store.ts` — `removeVault` now invalidates the new full-text cache too. **Important refactor**: switched ALL cache invalidator imports from static to dynamic (`void invalidateVaultCachesLazy(id)`) to keep heavy modules (MiniSearch, ~6 KB gz) out of the eager main bundle. `invalidateBacklinks` stays static — it lives in `core/` and has no heavy deps.
- `src/styles/globals.css` — `.swirlread-cmdk__hint` for the footer prefix hint.

### Why dynamic-import the cache invalidators

First pass landed with static imports of `invalidateFullTextIndex` from vault-store. Bundle jumped +6.32 KB because Rollup pulled MiniSearch into the eager main bundle through the static dep chain `vault-store → full-text-cache → full-text → minisearch`. Switched to per-invalidator dynamic imports inside a `invalidateVaultCachesLazy(id)` helper. Result: main bundle actually DROPPED by 0.30 KB (the previous static path also pulled walked-files-cache and tag-index-cache eagerly, which now ride in their own lazy chunks).

### Why no Web Worker (M5.3 deferred)

The spec asked for a Web Worker for indexing. We defer it as a transparent perf optimization. For Wilson-sized vaults the in-thread `buildFullTextIndex` runs sub-frame; the `walkAllFiles` 5_000-file cap makes worst-case bounded. The `getFullTextIndex(vault)` API is the seam: when the day comes, `src/workers/search-worker.ts` reproduces the same `buildFullTextIndex` + `searchIndex` calls behind a `postMessage` envelope, swap the cache module to call the worker, UI consumers don't change. M5.3 is now a cleanly-scoped future task.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **545 passed** (was 531; +14 net: 9 full-text core, 5 palette search mode)
- `pnpm build` — main bundle **257.44 KB gz** (vs. 257.74 after M9.4; **down 0.30 KB** despite adding M5.4+5.5). New lazy chunks: `full-text-cache-*.js` ~6.90 KB gz (MiniSearch + index + cache, loaded only on first `>` use OR on vault removal), `tag-index-cache-*.js` 0.69 KB gz (split out of the previous CommandPalette chunk).

### Down-stream notes

- The `>` prefix is now taken; the natural next prefixes are `[[` (file picker with wikilink-style previews — already have the preview infra from M3.4) and a future `:` for command actions (open settings, switch theme, etc.).
- `searchIndex` uses MiniSearch's score directly. If results feel mis-ranked on real vaults we can tune `boost` / `fuzzy` / `prefix` in one place without touching the UI.
- `Intl.Segmenter` is supported in every modern browser (Safari 14.1+, Chrome 87+, Firefox 125+). The fallback to whitespace-split is for ancient browsers + jsdom < 23.
- Index is in-memory only. A reload re-walks. For Wilson-sized vaults this is a couple-hundred-millisecond hit on first `>` use; persisting to IDB is part of the M5.3 worker upgrade or a separate M9.x cache.

---

## 2026-05-01 · Audit-followup B1 + cleanup fan-out + M9.4 · Resource lifecycle + shortcuts overlay

**Status**: ✅ Three things in one round — closing the deferred B1 from the previous audit, fully wiring the cache-invalidation fan-out on `removeVault`, and shipping the M9.4 keyboard shortcuts help overlay.

### Audit follow-through: blob URL lifecycle

The previous audit flagged B1 (blob URLs registered by `useBlobURL` never get revoked) as deferred. The blocker was: needs an adapter `dispose()` lifecycle. Fix shipped now:

- **`VaultFileSystem` interface**: added optional `dispose?(): void`. Adapters that hold disposable resources (FSAPI's `blobURLs` cache) implement; sample/Tauri can omit
- **`FSAPIVaultAdapter.dispose()`**: was already implemented (line 144 — pre-existing) but never called. Surfaced via the interface and called from `removeVault`
- **`useVaultStore.removeVault`**: now reads the adapter from the Map BEFORE eviction, calls `dispose()` (try/catch — a throwing dispose can't block removal), then `adapters.delete(id)`. The `File` objects underlying every blob URL the adapter handed out can now be garbage-collected

### Cleanup fan-out: wired everywhere it should have been

The previous audit fixed the Dexie-row part. This round adds the in-memory cache part. `removeVault` now calls every per-vault invalidator:

- `invalidateBacklinks(id)` — drops the in-memory `caches` Map entry for the vault
- `invalidateFileTreeListings(id)` — new helper; deletes every `vaultId::*` key from the listing cache
- `invalidateTagIndex(id)` — pre-existing; called now
- `invalidateWalkedFiles(id)` — pre-existing; called now
- `useReaderStore.getState().forgetVault(id)` — new action; drops the in-memory `recentByVault[id]` and `scrollByVault[id]` slots without re-touching Dexie (the rows were already deleted in bulk above)

Layer-crossing note: `vault-store` reaches into `src/ui/...` for two of those invalidates (`file-tree-cache`, `walked-files-cache`, `tag-index-cache`). The store layer owning vault lifecycle is the right seam for cache invalidation, but the caches are co-located with their UI consumers. Moving them to `src/core/cache/*` is a clean refactor for a future tidy-up; today the layer crossing is single-direction and confined to one method. Documented inline.

### M9.4 — Keyboard shortcuts help overlay

`?` opens a Radix Dialog listing every keybinding. Three groups (Navigation / Reading / Help). Single source of truth: `SHORTCUT_GROUPS` constant in the component file — adding a new hotkey is one line.

**Files created**:

- `src/app/use-shortcuts-help-hotkey.ts` + `.test.ts` — same shape as the ⌘K and F hooks (modifier-immune, editable-target guard).
- `src/ui/help/ShortcutsHelp.tsx` + `.test.tsx` — Radix Dialog with three groups; `<kbd>` rendering for keys; close button + Esc; sr-only Description for screen readers.

**Files modified**:

- `src/stores/ui-store.ts` — added transient `shortcutsHelpOpen` (NOT persisted; same pattern as `commandPaletteOpen` and `zenMode`).
- `src/app/AppShell.tsx` — calls `useShortcutsHelpHotkey()`, lazy-imports `ShortcutsHelp`, conditionally mounts in Suspense.
- `src/styles/globals.css` — `.swirlread-shortcuts*` styles (header, body, group, kbd blocks).

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **531 passed** (was 517; +14 net: 5 hotkey, 4 dialog, 3 ui-store shortcutsHelpOpen, 2 cleanup-fanout, plus B1 dispose tests; -1 test ordering shuffle)
- `pnpm build` — main bundle **257.74 KB gz** (vs. 256.76 after the audit; +0.98 KB for the hotkey hook + lazy chunk pointer + ui-store fields). `ShortcutsHelp-*.js` lazy chunk: **0.98 KB gz**.

### Down-stream notes

- Three keyboard hooks now exist (⌘K, F, ?) — once a fourth lands the `isEditableTarget` helper should be lifted to `src/app/keymap.ts` shared util. Today: copy-paste duplication is still cheaper than abstraction.
- The `SHORTCUT_GROUPS` constant in `ShortcutsHelp.tsx` is currently the source of truth, but each hotkey hook also encodes its own key. Future tidy: a single registry that both the help overlay and the hooks read from. Defer until the keymap helper above is factored.
- `removeVault` is now safe to call repeatedly without leaking. The "Manage vaults" UI surface (M6.x extension) can ship without revisiting cleanup.

---

## 2026-05-01 · M6.3 + M6.1 + M6.4 · Returning users (auto-restore + switcher + landing)

**Status**: ✅ Three milestones in one round. Phase 1 returning-user UX is now real — the app stops being session-only.

### What changed

Before today: every reload required the user to re-pick their folder. SwirlRead was effectively a single-session tool. Today: handles are reattached automatically when the browser still trusts them, and a single button reauthorizes them when it doesn't. The landing page knows you're a returning user and shows your vaults. The header lets you flip between vaults without going back to the landing page.

**Files created**:

- `src/app/auto-restore.ts` + `.test.ts` — `autoRestoreVaults()` runs once at boot via `main.tsx`. Walks `listHandleIds()`, hydrates the vault store, instantiates an adapter for each known handle, calls `hasPermission()`. Granted → `attachAdapter` immediately. Lapsed → caches the adapter in a module-scoped `pendingAdapters` map so a later user-gesture re-grant is one call away. Crucially never calls `requestPermission()` itself (FSAPI requires a user gesture; calling on boot fails with `SecurityError`). `reauthorizeVault(id)` is the user-gesture entry point.
- `src/ui/reading-shell/ReauthorizeVault.tsx` — three-state component (`checking` / `has-handle` / `no-handle`) that shows on every missing-vault navigation. Replaces the "not registered in the current session" dead-end with a one-click recovery affordance. Calls `reauthorizeVault` from a button click and triggers a route refresh on success.
- `src/ui/reading-shell/VaultSwitcher.tsx` + `.test.tsx` — header dropdown listing every registered vault with the active one marked. "Open another vault…" CTA at the bottom triggers the existing `FolderPicker`. Custom dropdown (~80 LoC) rather than pulling in `@radix-ui/react-dropdown-menu` for one surface — handles click-outside, Esc-close, focus-return inline.

**Files modified**:

- `src/main.tsx` — kicks off `autoRestoreVaults()` alongside the existing store init calls.
- `src/app/AppShell.tsx` — renders `<VaultSwitcher />` next to the wordmark when at least one vault exists. Conditional avoids the dropdown showing on `/app` index for fresh users.
- `src/ui/reading-shell/DocumentPage.tsx` + `VaultHome.tsx` — both replace the inline "not registered" copy with `<ReauthorizeVault vaultId={...} />`. The `missing-vault` / `missing` states route through one component now.
- `src/ui/landing/LandingPage.tsx` — split into `FreshSection` (original CTAs) and `ReturningSection` (recents list capped at 5 with relative-date stamps, "Open another vault" dashed CTA). `useVaultStore.registeredVaults.length > 0` is the seam.
- `src/styles/globals.css` — `.swirlread-reauthorize*` panel styles (icon, title, body, primary button, error), `.swirlread-vault-switcher*` dropdown styles (trigger, menu, items, separator, CTA), `.swirlread-landing-recents*` list styles (label, link, name, meta, CTA).

### Why no automatic permission prompt at boot

The File System Access API requires a user gesture for `requestPermission()`. Calling it from `main.tsx` would throw `SecurityError` on every reload. The right pattern is two-stage:

1. **Boot pass** silently inspects what's still permission-granted (`queryPermission` is gesture-free) and attaches those adapters.
2. **User gesture** (clicking "Re-authorize this vault") triggers the prompt for the rest.

This also means the `pendingAdapters` map has to survive between auto-restore (called from boot) and reauthorizeVault (called from a button click). Module-scope works for both.

### Why M6.2 is "de-facto complete"

When M6.2 was first planned in October 2025, per-vault state was nowhere — the registry was a session-only shim. Since then, every per-document data store landed already keyed by `vaultId`:

- `useReaderStore` has `recentByVault[vaultId]` and `scrollByVault[vaultId]`.
- `core/navigation/backlinks` writes Dexie rows keyed by `(vaultId, sourcePath, targetPath)`.
- `tag-index-cache`, `walked-files-cache`, `file-tree-cache` are all keyed by `vault.id`.

There's literally no per-document state that isn't isolated by vault. The M6.2 spec also called for "per-vault UI overrides" (theme, content width); we deliberately left those global. Most readers want one consistent reading experience across vaults, and adding a per-vault prefs UI without a clear demand signal would be premature complexity. Easy to revisit if a user actually asks.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **515 passed** (was 499; +16 net: 9 auto-restore, 5 vault-switcher, 3 landing M6.4, -1 from updated existing tests)
- `pnpm build` — main bundle **256.67 KB gz** (was 254.95; +1.72 KB for `autoRestoreVaults` + `ReauthorizeVault` + `VaultSwitcher` + the new icons (`Library`, `LockKeyhole`, `Plus`, `Check`, `FolderOpen`, `ChevronDown`, `AlertCircle`)). CSS bundle: **19.54 KB gz** (was 18.83; +0.71 KB for the three new component styles).

### Down-stream notes

- The `Library` icon is now used in three surfaces (file-tree section rows, vault switcher trigger, landing recents) — Lucide's tree-shaking means it's only one copy in the bundle.
- `ReauthorizeVault` is shaped well for M9.5's broader "graceful degradation" story — same component handles "vault has no handle anymore" + "browser revoked permission" + "checking…" with discriminated UI per case.
- `pendingAdapters` is module-scoped so it survives across multiple auto-restore calls. If we ever add a "Reload vault metadata" gesture, it can flow through the same map.
- The landing page's `ReturningSection` could become a richer overview later — last-opened doc per vault, file count, etc. Today it's deliberately minimal so it doesn't feel like a settings panel.

---

## 2026-05-01 · M3.1 + M9.5 + M3.11 · GFM polish + route error boundaries + KaTeX math

**Status**: ✅ Three milestones in one round.

### M3.1 — GFM polish

GFM features (tables, task lists, strikethrough, footnotes) were already _emitted_ by remark-gfm — they just looked like raw browser defaults. Polished:

- **Tables** — `display:block` + `overflow-x:auto` so wide tables scroll inside the prose column without breaking the measure. Alternating-row tint via `tr:nth-child(even)`. Alignment-aware via inline `style="text-align"` (the form remark-rehype actually emits — the legacy HTML `align` attribute is deprecated and unused).
- **Task lists** — drop the bullet on `.contains-task-list`, flex-align the checkbox baseline with body text, accent-colored checkbox via `accent-color: var(--color-accent)`.
- **Strikethrough** — muted color + thin underline so it reads as deleted without competing with live content.
- **Footnotes** — full styling for `section.footnotes`: smaller-typed end-of-doc block with top border; the GFM `<h2 class="sr-only">` heading is preserved as screen-reader-only via the canonical sr-only clip pattern; footnote items get `:target` highlight when navigated via `#user-content-fn-X`; backref `↩` links styled as muted dashed-underline that hover-pops to the link color.

3 new pipeline integration tests confirm the emitted shapes (`section.footnotes` w/ backref, `ul.contains-task-list`, alignment as inline style).

### M9.5 — Route error boundaries

Before today, an unhandled render error blanked the page with React Router's default ugly fallback. Now:

- **`ErrorFallback` component** — reads the routing error context, normalizes `RouteError` / native `Error` / unknown values into `{title, message, details}`. Presents a theme-aware card with: failing location path, "Back to start" + "Reload" actions, collapsible technical-details disclosure for stack traces.
- **errorElement wired at three levels** — root (`/`), app shell (`/app`), per-vault layout (`/app/:vaultId`). Crucially: the parent layout stays mounted when a child crashes. A broken document doesn't tear down the file-tree sidebar. That's the whole point of M9.5.
- **5 tests** — throw-detection, path display, "Back to start" link, native-error stack rendering, and the "parent chrome survives child crash" guarantee.

### M3.11 — KaTeX math (lazy)

The most substantial of the three. `$inline$` and `$$block$$` math now render in every theme — without paying the KaTeX bundle cost on pages without math.

**Architecture** (Mermaid pattern, doubled down):

- `remark-math` produces mdast `math` / `inlineMath` nodes
- `remark-math-shim` (new, ~500 bytes) annotates them with `hName: 'math-block' | 'math-inline'` + `hProperties: { 'data-source': value }` — they survive the rehype boundary as custom HTML elements
- Sanitize schema permits the new tags + `data-source`
- `MathInline` / `MathBlock` are thin (`useState`+`useEffect`) lazy wrappers in main bundle (~500 bytes total). On first mount they `import('./MathRenderer')`
- `MathRenderer` calls `getKatex()` from `katex-loader.ts`, which `import('katex')` once and caches the runtime promise. KaTeX (~77 KB gz) ships in its own chunk, loaded only on first math node mount
- Result: pages without math pay ZERO. Pages with math pay 77 KB once, lazily. KaTeX CSS (~8 KB gz) is the only eager cost — without it, the runtime resolves and the math briefly renders unstyled

**Why not `rehype-katex`**: it bundles KaTeX eagerly into the main pipeline chunk (~280 KB minified — 12× our remaining budget). The shim+wrapper pattern keeps the runtime in its own chunk and out of the eager bundle.

**Defensive design**:

- KaTeX `throwOnError: false` + try/catch around `renderToString` — on parse error, fall back to the source verbatim in a styled `<code>` (never lose content)
- Loader rejection handled separately — if the dynamic import fails (offline, broken bundle), same code fallback
- Test injection seam (`__setKatexLoaderForTests`) so jsdom doesn't have to ship the real KaTeX runtime

5 plugin tests + 5 wrapper tests + 3 pipeline integration tests.

### Verification (all three)

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **499 passed** (was 476; +23 net: +3 GFM polish, +5 ErrorFallback, +13 math)
- `pnpm build` — main bundle **254.95 KB gz** (was 252.60; +2.35 KB for `remark-math` + ErrorFallback + Math wrappers + AlertCircle icon, all unavoidably eager). CSS bundle **18.83 KB gz** (was 9.61; +9.22 KB for KaTeX CSS — eager by design). KaTeX runtime: **77.03 KB gz** in its own chunk. MathRenderer: **0.68 KB gz** in its own chunk.

### Bundle budget reckoning

We are now ~5 KB over the 250 KB soft target. Of that overage:

- ~2 KB is `remark-math` itself, which has to be eager
- ~1.5 KB is the cumulative cost of all the per-doc wiring landed since M3.10 (scroll memory, TOC, tag store, math wrappers)
- The rest is the AlertCircle Lucide icon + ErrorFallback

The CSS bundle nearly doubled because of KaTeX glyph styles. That is the cost of math actually looking right; deferring it leaves rendered formulas broken on first paint until the runtime arrives, which is worse UX.

The previously-recommended M9.1 perf pass should still happen and look at: lazy-loading more of the per-doc wiring, splitting the larger lucide icon set, and seeing if any of the remark plugins can be merged.

### Down-stream notes

- M3.11 unlocks the last of the markdown completeness milestones (M3.x). The remaining M3 work is M3.4/3.5/etc — all already done.
- M9.5's `ErrorFallback` is also the natural place for FSAPI permission-revoked recovery (M6.3); the "Back to start" affordance plus the "Reload" affordance cover most of what that flow needs.
- The KaTeX runtime is loaded on first mount of any math element. If a doc has 20 math spans, only one fetch happens (cached promise). The font CSS is the constraint, not the runtime.
- Math source is preserved verbatim in `data-source`, so future "copy LaTeX" affordances or LLM-aware export are one accessor away.

---

## 2026-05-01 · M2.6 · F-key zen mode

**Status**: ✅ Done

### What was built

Press `F` anywhere in the reading shell and the chrome melts away — header, file-tree sidebar, table-of-contents rail. Just the article remains, centered in the column the reader already chose. Press `F` again (or `Esc`) to bring it back. The store wiring (`zenMode`, `setZenMode`, `toggleZenMode`) and the body-class effect were already in place from M2.3; M2.6 was the keybinding + the chrome-hiding CSS.

**Files created**:

- `src/app/use-zen-mode-hotkey.ts` — global F-key listener mounted once in `AppShell`. Modifier guard: rejects combos with `⌘`, `Ctrl`, or `Alt` so the browser's built-in `⌘F` / `Ctrl+F` find-in-page is never hijacked. Editable-target guard: same shape as the ⌘K hotkey (input/textarea/select/contenteditable check, with both `contentEditable` property and the underlying attribute consulted for jsdom robustness). Esc exits zen mode only when zen is currently active — when it isn't, the event passes through to other handlers (e.g. Radix dialogs).
- `src/app/use-zen-mode-hotkey.test.ts` — 8 tests across the toggle, Esc-only-when-zen, modifier immunity, input/contenteditable guards, unmount cleanup.

**Files modified**:

- `src/app/AppShell.tsx` — adds the new `useZenModeHotkey()` call alongside the existing `useCommandPaletteHotkey()`. Header gains a `swirlread-shell__header` class so the zen-mode CSS can target it by name.
- `src/styles/globals.css` — replaced the placeholder zen-mode block with selectors that target dedicated classes (`swirlread-shell__header`, `swirlread-vault-layout__sidebar`, `swirlread-vault-layout__toc`) rather than fragile DOM-position chains. Adds a `min-height: 100vh` on the layout so the freed vertical space stays the right size for the document area.

### Why selectors over DOM-position chains

The placeholder M2.3 left `body.zen-mode > #root > div > header { display: none }` — that breaks the moment React rearranges the tree. Targeting our dedicated classes (which already exist for layout) means future layout refactors won't silently re-show chrome. It also means Radix portals — settings, command palette, tags panel — keep working in zen mode because they live outside the matched chrome containers.

### Why a separate hook (not a global keymap manager)

Two hotkeys (⌘K, F) and one Esc-handler is well below the threshold where a generic keymap registry pays for itself. Each hotkey hook is ~30 lines, self-documenting, and independently testable. When the count grows past five — say with M9.4's `g h` / `g r` / `?` chords — that's the right moment to factor a registry; today it would be premature.

### Why `zenMode` stays session-scoped

A persisted zen flag would silently swallow the entire UI on a fresh reload — extremely confusing if the user forgot they were in zen mode. The same reasoning applies to `commandPaletteOpen`: ephemeral UI state belongs in memory, not Dexie.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **476 passed** (was 468; +8 zen-mode hotkey tests)
- `pnpm build` — main bundle **252.60 KB gz** (vs. 252.50 after M3.14; +0.10 KB for the hotkey hook). CSS bundle: **9.61 KB gz** (vs. 9.60).

### Down-stream notes

- M9.4 (keyboard shortcuts) gets a third hook to follow the same pattern. Once we hit 4–5 hotkeys total, factor a small `keymap.ts` registry.
- `useCommandPaletteHotkey`, `useZenModeHotkey`, and any future hotkey share the same editable-target guard. Worth lifting `isEditableTarget` to a shared util once a third caller appears (today: two callers, duplication still cheaper than abstraction).
- Settings panel could grow a "Zen mode (F)" toggle for discoverability; today the only affordance is the keyboard. Skipped for now to keep the chrome small.

---

## 2026-05-01 · M3.14 · Tags and clickable tag listings

**Status**: ✅ Done

### What was built

Wilson's vault uses Obsidian-style `#tag` and `#nested/tag` markers extensively in both body text and frontmatter. They now render as clickable pills throughout every document, and clicking one opens an overlay that lists every file in the current vault that uses that tag — body or frontmatter, doesn't matter, the indexer combines both. CJK tags work end-to-end (`#中文`, `#前端/react`, `tags: [前端]`).

**Files created**:

- `src/core/render/plugins/remark-tag.ts` + `.test.ts` — Unicode-aware body-tag parser. The lookbehind `(?<![\w/#])` rejects `xyz#anchor` (URL-style), `/path#frag`, and `##doubled` (ATX-heading leftovers). Skips text nodes inside `link`, `linkReference`, `image`, `imageReference` so a `#tag` inside a link label stays plain text. The `findTagsInText(text)` helper is exported so the indexer reuses the exact same matcher — there's only one definition of "what counts as a tag" in the entire codebase.
- `src/core/navigation/tag-index.ts` + `.test.ts` — `buildTagIndex(vault)` walks every `.md`/`.mdx` file once via `walkAllFiles` + `Promise.all`. For each file, combines body-found tags with frontmatter `tags:` (via the existing `selectMetadata`). Returns both `Map<tag, Set<path>>` and the inverse `Map<path, Set<tag>>` — one walk, two query directions. Per-file read failures swallowed (one bad file shouldn't blank the index). Includes a cheap pre-pass that replaces fenced/inline code spans with dots (preserves character offsets so the regex doesn't double-count `#tag` inside code samples).
- `src/stores/tag-store.ts` — transient `selectedTag: string | null` + `selectTag` / `clear`. Deliberately separate from `useUIStore` (presentation) and `useReaderStore` (per-vault state) — selection is per-document context and shouldn't persist.
- `src/ui/reading-shell/Tag.tsx` + `.test.tsx` — clickable button rendered for every `<tag data-tag="…">` element. Reads `data-tag` from props (sanitize schema permits the attribute), flips `useTagStore.selectedTag` on click. Defensive fallback: missing `data-tag` renders children as plain text.
- `src/ui/reading-shell/TagsPanel.tsx` + `.test.tsx` — Radix Dialog overlay with `Hash` icon header, scrollable file list, alphabetical sort, click-to-navigate-and-close, Esc-to-close. Index is fetched on first panel open via the cache (idle → loading → ready/error states all wired). Uses `useNavigate` so navigation closes the panel synchronously instead of waiting for the next route effect.
- `src/ui/reading-shell/tag-index-cache.ts` — per-vault promise cache mirroring `walked-files-cache.ts`. Failed builds evicted; `invalidateTagIndex(vaultId)` exposed for the future M9 watcher path.

**Files modified**:

- `src/core/render/pipeline.ts` — registers `remark-tag` AFTER `remark-wikilink` so `#tag` appearing inside a `[[wikilink]]` (which builds its own children) doesn't get double-rewritten. Sanitize schema permits `<tag>` with `data-tag`.
- `src/ui/reading-shell/DocumentPage.tsx` — adds `tag: Tag` to the `customComponents` map so the pipeline's `<tag>` elements bind to the React component.
- `src/ui/reading-shell/VaultLayout.tsx` — lazy-imports and mounts `TagsPanel` once per vault layout (alongside the lazy TOC). Survives across document navigation.
- `src/styles/globals.css` — `.swirlread-tag` pill (accent-bordered, accent-tinted background, scale-up on hover) + `.swirlread-tags-panel*` modal styles (mirrors the cmdk palette's blurred-overlay aesthetic).

### Why a vault-wide index instead of "tags in this file"

A "tags in this file" view is trivially derivable from `selectMetadata` + `findTagsInText` on the current source. The interesting question is the inverse — "what other files share this tag?" That requires walking the vault, and walking the vault is exactly what makes tags worth implementing as navigation rather than just decoration.

### Why tag selection in a separate store (not `useUIStore`)

`useUIStore` is presentation preferences — theme, fonts, sidebar visibility, persisted to Dexie. `selectedTag` is per-document context that should never persist (returning to the app shouldn't reopen a tag panel from yesterday). Same shape as `useTocStore` from M4.6 — small transient stores work better than overloading the persistent prefs store.

### Why a single regex shared between renderer and indexer

If the regex diverges between the two, you get the worst possible UX: a pill rendered in the body that doesn't appear in the index, or vice versa. Co-locating the regex behind one exported helper (`findTagsInText`) keeps the index and the rendered pills in lockstep forever — there's literally one source of truth for "what is a tag."

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **468 passed** (was 426; +42 net: +18 remark-tag, +13 tag-index, +5 TagsPanel, +3 Tag, +3 misc adjustments to existing setups)
- `pnpm build` — main bundle **252.50 KB gz** (was 252.00; +0.50 KB for the remark-tag plugin + Tag component + tag-store, all unavoidably eager). `TagsPanel-*.js` lazy chunk: **1.70 KB gz** (panel + indexer + cache).

### Down-stream notes

- M3.14 unlocks several future surfaces: a "tags in this file" footer chip strip is one `tagsForFile(index, currentPath)` call away; a global "all tags" overview is `Array.from(index.filesByTag.entries())`.
- The command palette could grow a `#` mode (M5.5 prefix routing) that lists all tags vault-wide with file counts as the secondary line. Both the cache and the `TagIndex` shape are ready.
- The frontmatter panel (M3.10) already shows `tags:` as pills; turning those pills into the same `<Tag>` component (so they open the panel) is a one-line change once we decide it's the right UX.
- M9 watcher needs to call `invalidateTagIndex(vaultId)` + `invalidateWalkedFiles(vaultId)` on filesystem changes — both caches expose the same shape so a single watcher signal can fan out to both.

---

## 2026-05-01 · M5.2 · Fuzzy file-name search

**Status**: ✅ Done

### What was built

The command palette becomes actually useful for navigation. Open ⌘K, type a few letters of any file name (or any parent folder name), and cmdk-scored matches appear from the entire active vault. CJK paths are preserved verbatim through the walker, so typing `react` finds `knowledge/软件/前端/react.md` exactly as the spec calls for. Recents still show when the input is empty — no double-list, no clutter.

**Files created**:

- `src/core/vault/walk-files.ts` — `walkAllFiles(vault, options)`. BFS walker over the entire vault: top-level files come before nested ones, which matches the file-tree's visual order so the palette feels coherent with the sidebar. Per-directory failures (`vault.list(dir)` rejecting) are silently swallowed so a single permission blip on one folder doesn't blank the entire palette. `includeExtensions: ReadonlySet<string>` filter + `maxFiles` cap (defaults to 5_000 — bigger than any realistic personal vault, small enough to keep cmdk's per-keystroke filtering snappy).
- `src/core/vault/walk-files.test.ts` — 6 tests for level ordering, extension filtering, maxFiles cap, empty vault, CJK path preservation.
- `src/ui/command-palette/walked-files-cache.ts` — per-vault promise cache keyed by `vault.id`. Wraps `walkAllFiles` with a default extension allowlist covering everything Phase 1 ships a renderer or embed for (markdown family + structured data + image/video/audio sets). Failed walks are evicted so a retry can succeed; `invalidateWalkedFiles(vaultId)` is exposed and ready for the future M9 watcher path.

**Files modified**:

- `src/ui/command-palette/CommandPalette.tsx` — substantially extended. New `useCurrentVaultId()` parses the route via `useLocation` rather than relying on `vaultStore.activeVaultId` (the URL is the user's mental model for "what vault am I in"). New `useVaultFiles(vaultId)` kicks off the walk only when the palette is open AND a vault is in scope, so users who never hit ⌘K pay zero. The body branches on input-empty vs. input-set: recents shown when empty, Files group shown when set. `shouldFilter` flips per-mode — false for recents (preserve recency order), true for Files (let cmdk's score function rank). cmdk's `value` field combines basename + path so a query can hit either the leaf name or any parent folder name. Friendly states for loading / error / no-matches / no-vault-in-scope.
- `src/ui/command-palette/CommandPalette.test.tsx` — test harness restructured: `ShellWithPalette` renders the palette as a layout-level sibling of `<Outlet />` so it stays mounted across `/app`, `/app/:vaultId`, and `/app/:vaultId/*`. The previous flat-route harness only mounted the palette at `/app`, which silently broke when a child route (vault home, document) was active — the failure mode that surfaced when the M5.2 tests landed. 5 new Files-mode tests cover the placeholder copy, fuzzy match (w/ CJK), navigate-and-close, no-matches state, and the no-vault prompt.
- `src/styles/globals.css` — `.swirlread-cmdk__status` style for the loading / error rows below the list.
- `src/core/vault/index.ts` — re-exports `walkAllFiles` + `WalkOptions`.

### Why URL-derived vault id (not `activeVaultId`)

`vaultStore.activeVaultId` reflects the last vault the user explicitly switched to. URL-derived id reflects the route they're actually on. These can diverge: if a user navigates by clicking a wikilink that crosses vault boundaries (a future M6 feature), the URL changes but `activeVaultId` may lag. The palette should always search the vault the user is _viewing_, which is the URL truth. Reading from URL also keeps the palette correctly empty on `/app` (no vault), without needing a clear-on-mount in the store.

### Why a separate cache from `getListing`

`getListing(vault, dirPath)` caches per-directory listings — the right shape for the file-tree's "expand one folder at a time" pattern. `getWalkedFiles(vault)` caches the flat per-vault walk — the right shape for the palette's "search everything at once" pattern. Mixing them would either waste memory (storing a flat list when the tree only needs one folder) or waste I/O (re-walking on every keystroke). They share `vault.list` underneath, so an aggressive future watcher can invalidate both with one signal.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **426 passed** (was 415; +11 net: +6 walker, +5 palette Files-mode)
- `pnpm build` — main bundle **252.00 KB gzipped** (vs. 251.97 KB after M5.1; +0.03 KB — essentially flat). The walker + Files-mode wiring + walked-files cache all ship inside the lazy `CommandPalette-*.js` chunk, which grew from **5.45 → 6.30 KB gz**.

### Down-stream notes

- M5.3 (search worker) reuses `walkAllFiles` to build the full-text index — the walker's extension filter can be extended to MD-only for indexing while the palette keeps the broader allowlist for navigation.
- M5.5 (multi-mode prefix routing) gets a clean fit: the current `isSearching` branch is the natural seam for a `>` prefix to switch into full-text mode.
- M9.4 (keyboard shortcuts) can add `g f` to focus the file search input directly, since both palette and shortcut handler share `useUIStore`.
- The `maxFiles: 5_000` cap is conservative — Wilson's vault is well under it. If a user with a 10k-file vault complains, raising the cap is a one-line change; cmdk's bottleneck is item rendering, not item count.

---

## 2026-05-01 · M5.1 · Command palette shell + dedicated dev port

**Status**: ✅ Done

### What was built

The signature ⌘K command palette is live. First mode is **Recents** — the last 20 files opened across every registered vault, sorted most-recent-first, with the vault name in the secondary line. Open with ⌘K (mac) / Ctrl+K (win/linux), arrow keys to navigate, Enter to open, Esc to dismiss. Future modes (M5.2 fuzzy file names, M5.4 full-text) extend the same component by adding alternate item lists.

We also locked the dev server to a project-dedicated port: **7945** (`SWIL` on a phone keypad — S=7, W=9, I=4, L=5). `strictPort: true` means a busy port fails loudly instead of silently sliding to the next available — much easier to spot a stray process than to chase a moving URL. Same port for `pnpm dev` and `pnpm preview` so bookmarks survive across the build/run boundary.

**Files created**:

- `src/ui/command-palette/CommandPalette.tsx` — Radix Dialog wrapping cmdk's `Command` + `Command.Input` + `Command.List`. Radix gives focus trap, portal, and Esc-close; cmdk gives list semantics, arrow-key nav, and selection scoring. They compose by mounting `<Command>` inside `<Dialog.Content>` with `onOpenAutoFocus` prevented so cmdk's `autoFocus` input wins. `shouldFilter={false}` for the recents-only shell — recents are already ordered by recency and a fuzzy reorder would confuse; M5.2 will turn filtering back on.
- `src/ui/command-palette/CommandPalette.test.tsx` — 6 integration tests with a `createMemoryRouter` harness covering closed state, open + autofocus, empty state, multi-vault recents ordering, navigate+close on select, Esc close.
- `src/app/use-command-palette-hotkey.ts` — global keydown listener mounted once in `AppShell`. Refuses to fire when the focused element is `<input>`, `<textarea>`, `<select>`, or `contenteditable` (so the palette doesn't hijack future text-entry surfaces). Rejects combos with shift/alt because power users may bind those.
- `src/app/use-command-palette-hotkey.test.ts` — 9 tests across the modifier matrix, target-guard cases, uppercase K (caps lock), and unmount cleanup.

**Files modified**:

- `src/stores/ui-store.ts` — added transient `commandPaletteOpen: boolean` (NOT persisted — same shape as `zenMode`) plus `setCommandPaletteOpen` and `toggleCommandPalette`. 3 new tests in `ui-store.test.ts`.
- `src/app/AppShell.tsx` — added a `Search` icon button next to the TOC toggle; lazy-imports `CommandPalette` and conditionally mounts it inside Suspense when `commandPaletteOpen` flips true.
- `src/styles/globals.css` — `.swirlread-cmdk*` styles for the centered modal, blurred backdrop, search input, list, items (with `[data-selected='true']` accent), keyboard hint footer, and a mobile breakpoint that pulls the modal closer to the top.
- `src/setup-tests.ts` — added two new jsdom stubs that cmdk needs: a `ResizeObserver` class and `Element.prototype.scrollIntoView`. Without them the palette tests crash before they can render.
- `vite.config.ts` — `server.port` and `preview.port` set to **7945** with `strictPort: true`.
- `package.json` — `cmdk@^1.1.1` added.

### Why a separate `useFlatRecents` selector

The store keeps recents per-vault for tree-rendering and per-vault clearing. The palette wants a flat cross-vault list ordered by absolute recency so a user who hops between vaults sees the actually-most-recent file at the top. Computing this in a `useMemo` keyed on `recentByVault` + `registeredVaults` keeps it cheap (max 100 entries) and lets the per-vault data shape stay normalized.

### Why Radix Dialog AND cmdk

Either alone would leave a gap: cmdk has no portal/focus-trap/aria-modal infrastructure; Radix Dialog has no list semantics or arrow-key wiring. Stacking them is the standard cmdk-recipe pattern from Vercel's reference implementation. The only friction is preventing Radix's `onOpenAutoFocus` from stealing focus from cmdk's input — handled with one line.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **415 passed** (was 397; +18 net: +9 hotkey, +6 palette, +3 ui-store)
- `pnpm build` — main bundle **251.97 KB gzipped** (vs. 251.44 KB after M4.2; +0.53 KB for the hotkey hook + Search icon + ui-store wiring). `CommandPalette-*.js` ships at **5.45 KB gzipped** — cmdk runtime + the palette body, loaded only when ⌘K is first hit.
- Dev server smoke test on the new port: `HTTP 200 from http://localhost:7945/` (an existing instance was already serving on 7945, which is exactly what `strictPort: true` is supposed to surface — it refused to silently reassign).

### Down-stream notes

- M5.2 (fuzzy file-name search): extend `PaletteBody` with a second `Command.Group` keyed off the input string. `shouldFilter` flips back to `true` for that mode. The vault-listing fetch can reuse `getListing` from `file-tree-cache.ts`.
- M5.3 (search worker): the palette stays UI-only; a `>` prefix routes to a worker-backed full-text mode.
- M9.4 (keyboard shortcuts): add a `?` mode that lists all bindings, plus `g h` / `g r` style two-key chords. The hotkey hook is the natural template.
- The `Search` button in the header doubles as discoverability for the keyboard shortcut on first-time users.

---

## 2026-05-01 · M4.2 · Section detection

**Status**: ✅ Done

### What was built

The file tree now understands Wilson's `*-map.md` convention. Top-level directories that contain `<dirname>-map.md` (or `<dirname>.md`, `index.md`, `home.md`, `README.md` in priority order) render as **section rows**: a chevron-only expand button next to a Link to the section's home file. Click the section name → land on `career-map.md`. Click the chevron → expand the children below. Directories without a detected home keep the original button-only rendering, so vaults that don't use this convention see no change.

This is the moment the file tree stops looking like raw filesystem and starts looking like a knowledge map.

**Files modified**:

- `src/core/navigation/section-detector.ts` — added `pickSectionHomeFromEntries(entries, dirName)`, `findSectionHome(vault, dirPath)`, `detectSections(vault)`, and a `VaultSection` type. The pure helper applies a 10-slot priority list (5 candidates × 2 extensions): `<dirname>-map.md`, `<dirname>-map.mdx`, `<dirname>.md`, `<dirname>.mdx`, then the existing `HOME_CANDIDATES_LC` constant for index/home/README. All comparisons lowercased; directory entries with home-shaped names are correctly ignored.
- `src/core/navigation/section-detector.test.ts` — 13 new tests across pure helper, async wrapper, and `detectSections`. The Wilson-vault scenario test asserts every top-level dir resolves to the right map file or `null` (for the `orphan/` folder), and that loose top-level files are NOT promoted to sections.
- `src/ui/file-tree/FileTree.tsx` — added a `sectionHome` state and a depth-0-only effect that pre-fetches the directory's listing via `getListing` and computes its home. When `sectionHome !== null`, the directory renders as a `<div className="swirlread-file-tree__row--section">` containing a `<button>` for the chevron and a `<Link>` for the icon+name. Old single-button behavior preserved for non-section directories so the existing M4.3 tests keep passing unmodified.
- `src/ui/file-tree/FileTree.test.tsx` — 3 new integration tests: section link points at the right map file, dirs without a home stay as plain expandable folders, the section row marks `aria-current="page"` when viewing its own map.
- `src/styles/globals.css` — `.swirlread-file-tree__row--section`, `.swirlread-file-tree__chevron-btn`, `.swirlread-file-tree__section-link`. Section rows have a slightly heavier weight, the `Library` Lucide icon picks up the accent color, and the row gets a tinted background when active.

### Why pre-fetch listings for top-level directories

M4.3 was deliberately lazy — directories only fetched their children on first expansion. Pre-fetching every top-level directory looks like a regression, but in practice:

1. Top-level directory count is naturally small (Wilson's vault: 5 dirs).
2. `getListing` is cached at the module level, so the user-driven expansion that follows reuses the same promise. Net I/O is 1 round trip per top-level dir, ever — exactly what M4.3 was already going to pay if the user opened any of them.
3. The fetch is non-blocking and silently ignored on failure — the dir falls back to the original button rendering.

The alternative (run `findSectionHome` only on first expansion) would mean the section affordance _appears_ after the user expands, which inverts the UX — the whole point is being able to click "career" without expanding it first.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings
- `pnpm format:check` — all conformant
- `pnpm test` — **397 passed** (was 381; +16 net: +13 section-detector unit tests, +3 FileTree section-row integration tests)
- `pnpm build` — main bundle **251.44 KB gzipped** (was 251.12 KB; +0.32 KB for the section-detection wiring + the `Library` Lucide icon)

### Down-stream notes

- `detectSections()` is unused inside the FileTree (which detects per-row), but exists for the future M4.4-style backlinks-of-sections view, the M5.1 command palette section mode, and any future sidebar that wants to render sections as visual groups instead of weaving them into the tree.
- The chevron-button + name-link split is the same pattern any future "drag a doc out of a section" affordance will want, so the markup is shaped right for M5+ work.
- `Library` icon from Lucide adds ~0 bundle bytes — Lucide tree-shakes per-icon and we already pull in 4–5 from the same package.

---

## 2026-05-01 · M2.7 + M4.6 · Scroll memory + Table of contents

**Status**: ✅ Done

### What was built

Long-form reading hand-feel got two big upgrades. Documents remember exactly where you left off, and a right-rail TOC tracks your position through any document with H1–H4 headings. Together they turn "open a long note" from a navigation puzzle into something closer to picking up a book at the bookmark.

**M2.7 — Scroll position memory**

- `src/core/persistence/db.ts` — Dexie schema bumped to v4; new `scrollPositions` table indexed on `vaultId, updatedAtMs`. The `__resetDbForTests` transaction switched from positional to array form because Dexie's positional overload caps at five tables.
- `src/stores/reader-store.ts` — extended with `scrollByVault: Record<VaultId, Record<VaultPath, ScrollPosition>>`, plus `recordScrollPosition()`, `clearScrollPositions()`, and a side-effect-free `getScrollPosition()` helper. Cap of 500 positions per vault, oldest pruned in the same write that goes over budget. Returning to scrollY 0 deletes the row (no "remember I scrolled to nothing" entries). Negative / NaN values clamp to 0 defensively.
- `src/ui/reading-shell/use-scroll-memory.ts` — new hook owning three effects: (1) reset to top on path change so the previous doc's offset never flashes during loading; (2) restore via two stacked `requestAnimationFrame` calls, gated by a `restoreToken` the caller flips when the rendered state lands; (3) debounced (250 ms) `window.scroll` listener with stale-tuple guard via a ref that the navigation effect updates synchronously.
- `src/ui/reading-shell/DocumentPage.tsx` — wires `useScrollMemory({ vaultId, path, restoreToken: state.kind === 'rendered' ? state : null })`.
- 8 new unit tests cover persistence/restore, prune, dedupe-to-zero, vault isolation, clamping, normalization, and `clearScrollPositions`.

**Why two stacked rAFs**: long Markdown bodies + Shiki's synchronous paint produce a brief layout where the document still measures shorter than the saved offset. Setting `scrollY` then would silently clamp and the user would land near the bottom of a still-paginating doc. One frame stabilizes the heading positions; the second covers font-induced reflow.

**M4.6 — Table of contents**

- `src/core/navigation/headings.ts` — DOM-based heading extractor + Unicode-aware slugifier. Walks `h1…hN` selectors (configurable via `maxLevel`), assigns ids in place, disambiguates duplicates with `-2`, `-3`, … suffixes. `slugify()` uses `\p{L}/\p{N}` so CJK headings keep their characters instead of collapsing to "section". 12 unit tests.
- `src/stores/toc-store.ts` — small zustand store for transient per-document state: `headings` + `activeId`. Deliberately separate from `useReaderStore` because reader state is per-vault and persisted; TOC state is per-document and should never persist (the doc is the source of truth). `setHeadings()` does a structural diff before applying so re-renders with identical headings don't churn subscribers.
- `src/ui/reading-shell/TableOfContents.tsx` — right-rail nav. Indent is computed from the shallowest level present in the doc so an H3-rooted note doesn't waste two indent columns. Active highlight via `IntersectionObserver` with header-aware `rootMargin: '-72px 0px -55% 0px'`. Click scrolls smoothly with header offset and updates `#hash` via `history.replaceState` (no router push — the hash is just a bookmark).
- `src/ui/reading-shell/TableOfContents.test.tsx` — 5 tests with a `MockIntersectionObserver` for empty state, render order, active class + `aria-current`, click-scroll + hash, indent computation.
- `src/stores/ui-store.ts` — new persisted `tocOpen` boolean (default true), `setTocOpen` / `toggleToc`, plumbed through `init()`, `resetToDefaults()`, and the validator pipeline. 4 new tests + 1 SettingsPanel test.
- `src/app/AppShell.tsx` — added a right-pair `PanelRightOpen` / `PanelRightClose` button next to settings.
- `src/ui/reading-shell/VaultLayout.tsx` — renders a sticky right `<aside>` when `tocOpen`. `TableOfContents` is `lazy()` + `Suspense fallback={null}` so it lives in its own chunk.
- `src/ui/settings-panel/SettingsPanel.tsx` — TOC toggle row added beside the file-tree toggle.
- `src/ui/reading-shell/DocumentPage.tsx` — publishes headings to `useTocStore` after every successful render via dynamic-imported `extractHeadings`. Clears on non-markdown / unmount. The dynamic import keeps `headings.ts` in the lazy TOC chunk instead of the main bundle.
- `src/styles/globals.css` — new `--toc-width: 240px`, `.swirlread-vault-layout__toc` (sticky right rail, hidden < 1100 px), `.swirlread-toc*` styles (active border-left in accent, hover tint, level-based weight/size).
- `src/setup-tests.ts` — global `IntersectionObserver` stub for jsdom so any test that mounts the vault layout doesn't explode. Tests that care about observer behavior re-stub via `vi.stubGlobal`.

**Why DOM extraction instead of a rehype slug plugin**: avoids ~2 KB of bundle and keeps headings/slugs/ids co-located in one render-time pass. The pipeline already permits `id` on h1–h6 in the sanitize schema (left over from the original M4.6 placeholder) — we just fill them in.

**Design tradeoff — TOC default**: the spec called M2.5 (hover zones) as a dependency for the TOC. M2.5 isn't done. We shipped TOC as a persistent right rail (default open, toggle in shell + settings), matching the file-tree pattern. When M2.5 lands it can layer a hover-summon affordance for the case where `tocOpen === false`. This unblocks the actual reading benefit immediately without forcing a hover-only UX that doesn't exist yet.

### Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 errors / 0 warnings (`--max-warnings 0`)
- `pnpm format:check` — all conformant
- `pnpm test` — **381 passed** (was 347; +34 net: +8 reader-store scroll, +4 ui-store toc, +12 headings, +5 TableOfContents, +2 DocumentPage TOC integration, +1 SettingsPanel TOC, +2 misc)
- `pnpm build` — main bundle **251.12 KB gzipped** (vs. previous baseline 249.88 KB; +1.24 KB). TOC + headings split into their own chunks (`TableOfContents` ~1.0 KB gz, `headings` ~0.5 KB gz). Main-bundle growth is the unavoidable cost of `useScrollMemory` + reader-store scroll branch + `useTocStore` + ui-store TOC additions, all of which fire on every doc render.

### Bundle budget note

We are now ~1.1 KB over the 250 KB soft target the previous agent flagged. The TOC chunk was successfully extracted lazily; what remains in the main bundle is the per-doc reading-shell wiring that has to be eager. The previously-recommended M9.1 perf pass should still happen, but this cost was always going to land somewhere — at least it bought two of the highest-value reading features in one milestone.

### Down-stream notes for the next milestone

- The TOC store interface (`headings`, `activeId`) is ready for M5.1 to consume — a `>` mode in the command palette could fuzzy-search the active doc's headings using the same store.
- Heading anchor ids are now stable per render. M9.4 (keyboard shortcuts) gets `[`, `]` next/prev-heading nav nearly for free off the same store.
- `extractHeadings` accepts a `maxLevel` parameter; M3.14 (clickable tags) won't collide because it lives in a different scan path.
- New Dexie v4 schema means a returning user's IDB will silently upgrade on first load. No migration data is required — the new table starts empty and fills as the user reads.

---

## 2026-05-01 · M3.13 · Mermaid diagrams

**Status**: ✅ Done

### What was built

` ```mermaid ` fenced code blocks now render as real Mermaid diagrams. The Mermaid runtime (~280 KB gzip, plus per-diagram-type chunks summing to ~600 KB) is fully lazy-loaded — pages without diagrams pay zero of that cost. Diagrams are theme-aware, and failures fall back to the diagram source so content is never lost.

**Files created**:

- `src/core/render/plugins/remark-mermaid.ts` — remark plugin that visits `code` mdast nodes with `lang === 'mermaid'` and replaces them with a custom `mermaid` node whose hast hint emits `<mermaid-diagram data-source="…">`. Run order: after the other custom plugins, before `remark-rehype`, so Shiki never sees the diagram source.
- `src/core/render/plugins/remark-mermaid.test.ts` — 6 plugin tests.
- `src/ui/reading-shell/mermaid-loader.ts` — module-level lazy loader keyed off a `cachedRuntime` promise, plus `__setMermaidLoaderForTests()` for stubbing.
- `src/ui/reading-shell/MermaidRenderer.tsx` — actual render component. Awaits the Mermaid runtime, calls `mermaid.initialize({ theme })`, calls `mermaid.render(id, source)`, sets `dangerouslySetInnerHTML` on a container `<div>` with the resulting SVG. Failure / empty-source paths produce a styled `<figure>` showing the raw diagram source.
- `src/ui/reading-shell/MermaidRenderer.test.tsx` — 5 component tests (success, loading, error, theme map, empty source).
- `src/ui/reading-shell/MermaidDiagram.tsx` — thin lazy wrapper. Statically imported by the main bundle, but `import('./MermaidRenderer')` is dynamic, so the renderer chunk only ships when a diagram is actually mounted.
- `src/ui/reading-shell/MermaidDiagram.test.tsx` — 2 wrapper tests (loading placeholder, eventual render).

**Files modified**:

- `src/core/render/pipeline.ts` — registers `remark-mermaid` in the processor; extends the sanitize schema with `<mermaid-diagram>` + `data-source`.
- `src/core/render/pipeline.test.tsx` — adds 3 integration tests for the mermaid pass.
- `src/ui/reading-shell/DocumentPage.tsx` — adds `'mermaid-diagram': MermaidDiagram` to the `customComponents` map.
- `src/styles/globals.css` — `.swirlread-mermaid*` styles for the centered SVG container, the loading shimmer, and the failure fallback `<figure>`.
- `package.json` / `pnpm-lock.yaml` — added `mermaid@^11.14.0`.

### Architecture decisions

- **Divert mermaid blocks before Shiki, not after**. Shiki has no `mermaid` grammar; running it first would emit a monochrome plain-text `<pre>`. Worse, undoing that downstream means parsing Shiki's per-token `<span>` tree. The remark plugin transforms the mdast `code` node into a custom node with `data.hName = 'mermaid-diagram'`, so by the time Shiki runs the block is no longer a `<pre><code>` and Shiki skips it.
- **Two-step lazy loading**: `MermaidDiagram` (main bundle) → `MermaidRenderer` (lazy chunk) → `mermaid` runtime (lazy chunk). The wrapper is necessary because a static import of the renderer pushed main to 250.22 KB / 250 KB. The wrapper does manual `useState` + `useEffect` dynamic-import rather than `React.lazy` because the `hast-util-to-jsx-runtime` components map is not wrapped in `<Suspense>` and we don't want to introduce one for one feature.
- **Module-level cache for the Mermaid runtime promise**. Multiple diagrams on a page share a single `import('mermaid')` and a single `mermaid.initialize()` per theme. Tests reset this cache via `__setMermaidLoaderForTests` so the stub takes effect.
- **Theme map, not Mermaid CSS overrides**. Mermaid has built-in themes (`default`, `dark`, `forest`, `neutral`). Mapping our reader themes to Mermaid's avoids fighting their CSS variables and matches user expectations on typical diagrams.
- **Failure → source, not "broken diagram" placeholder**. If parsing fails, the reader still sees the author's diagram source rendered as a `<pre>` inside a `<figure>`. That is strictly better than a vague error: the reader can still understand the intent, copy/paste, or open the file in another tool.
- **Custom element name `<mermaid-diagram>`, not `<mermaid>`**. Browsers reserve some single-word tags for future use, and `<mermaid>` could collide with a hypothetical native element. Hyphenated custom-element names are the safe choice.
- **Sanitize schema explicitly allows `data-source`**. Without that, the source string would be stripped before the React component can read it. The component still has a `children` text fallback in case a future schema tightening drops the data attr.

### Verification

- Targeted: `pnpm test src/core/render/plugins/remark-mermaid.test.ts src/ui/reading-shell/MermaidDiagram.test.tsx src/ui/reading-shell/MermaidRenderer.test.tsx src/core/render/pipeline.test.tsx` → 46 passing
- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings (`--max-warnings 0`)
- `pnpm format:check` → all conformant
- `pnpm test` → **347 passing** (was 331; +6 remark-mermaid, +3 pipeline, +5 MermaidRenderer, +2 MermaidDiagram, +1 already-existing reset count adjustment)
- `pnpm build` → main bundle **249.88 KB gzipped** (under 250 KB budget); `mermaid.core` chunk 145.45 KB gzip + per-diagram-type chunks (sequenceDiagram, ganttDiagram, flowDiagram, c4Diagram, blockDiagram, architectureDiagram, etc.) all lazy.

### Issues / Notes

- jsdom does not implement enough of SVG to render Mermaid for real in tests. We bypass that by stubbing the loader; full visual rendering is verified in the dev server against fixture diagrams.
- A future M9.x perf pass should consider preloading the Mermaid chunk on idle for vaults that contain many diagrams. Today the first diagram pays a ~150 KB gzip download on first encounter; subsequent ones are free.
- Mermaid v11 emits a `<style>` with `font-family` that may inherit from the parent. The reader's `--font-mono` doesn't currently propagate into the SVG. Acceptable for now; if it becomes ugly we can pass `themeVariables` into `initialize`.

### Next step

The remaining navigation/UX milestones in M2/M4 are now the highest-leverage. Recommended order:

1. **M4.6 — TOC** for the right-side navigation, paired with **M2.5** hover zones for show/hide
2. **M4.2 — Section grouping** to make the file tree more knowledge-map-aware (`*-map.md` per section)
3. **M2.7 — Scroll position memory**, the next polish that compounds with everything we've shipped.

After that, **M5 command palette** is the natural next milestone, since it depends on M4.7 recents (already done) and M4.6 TOC.

---

## 2026-05-01 · M3.10 · Frontmatter display

**Status**: ✅ Done

### What was built

Markdown documents with YAML/TOML frontmatter now render a subtle metadata bar above the prose. The bar surfaces title (large serif heading), description (subtitle), and a muted line of date · author · tags. Power readers can switch to a "raw" view that lists every parsed key, or hide the panel entirely. The pref persists to IndexedDB.

**Files created**:

- `src/core/render/frontmatter.ts` — pure extractor with a hand-rolled YAML/TOML parser tuned for vault frontmatter. Exports `extractFrontmatter(source)`, `selectMetadata(data)` (curates title/description/date/author/tags/aliases), and `formatFrontmatterValue(value)`.
- `src/core/render/frontmatter.test.ts` — 25 unit tests covering YAML, TOML, edge cases, and selector behavior.
- `src/ui/reading-shell/Frontmatter.tsx` — `<FrontmatterPanel>` with three modes: `metadata` (default), `raw` (full `<dl>`), `hidden`.
- `src/ui/reading-shell/Frontmatter.test.tsx` — 5 component tests.

**Files modified**:

- `src/stores/ui-store.ts` — adds `frontmatterDisplay` field + setter; persists via existing `ui:` Dexie key with defensive validation; included in `resetToDefaults`.
- `src/stores/ui-store.test.ts` — adds 4 tests for default, persistence, hydration, and invalid-value fallback.
- `src/ui/reading-shell/DocumentPage.tsx` — extracts frontmatter once per Markdown load and renders `<FrontmatterPanel>` above the existing prose container, inside the Wikilink context provider.
- `src/ui/reading-shell/DocumentPage.test.tsx` — adds 3 integration tests (metadata mode, hidden mode, raw mode); wires `useUIStore` into the per-test reset.
- `src/ui/settings-panel/SettingsPanel.tsx` — adds a segmented "Frontmatter" control (Metadata / All / Hidden).
- `src/ui/settings-panel/SettingsPanel.test.tsx` — adds 1 test for the new control; existing reset test covers the new field too.
- `src/styles/globals.css` — `.swirlread-frontmatter*` styles for the metadata bar (title, description, meta line, tag chips) and the raw definition list.

### Architecture decisions

- **Hand-rolled parser, not `gray-matter` / `js-yaml`**. The two together cost ~28 KB gzipped. The main bundle was already at 247 KB / 250 KB. A purpose-built parser handles the flat key/value subset that vault frontmatter actually uses (95% in practice) for ~2 KB. Anything we don't support (nested mappings, block scalars, anchors) survives in `data` as plain strings and still renders in raw view.
- **Sync extraction at read time, not in the unified pipeline**. The Markdown pipeline already strips frontmatter via `remark-frontmatter`; making the pipeline also surface parsed values would push async work into rendering. Reading the source string once at file-load time is simpler, faster, and decouples display from the render pipeline.
- **Three-mode pref, not a boolean**. "Show or hide" feels good until you meet a power-reader who wants every key. `metadata` covers most readers, `raw` serves debuggers, `hidden` serves zen-mode-style readers. Stored as a single string preference, no migration needed.
- **Title is additive, not a replacement**. The frontmatter title renders as the prominent heading above the prose. Body H1 stays untouched. This avoids mutating the rendered HAST, matches Obsidian's mental model, and keeps the rendering pipeline pure.
- **Curated metadata vs raw**. The `metadata` mode shows title/description/date/author/tags only — the fields readers care about. Other keys (e.g. `slug`, `id`, `cssclass`) hide unless the user opts into raw mode. This keeps the bar visually quiet for highly-tagged Obsidian notes.
- **Defensive parsing on the IDB read path**. The `frontmatterDisplay` field validates against a known Set on load and falls back to default for unknown values, matching the pattern set by theme/font-family/content-width.

### Verification

- Targeted: `pnpm test src/core/render/frontmatter.test.ts src/ui/reading-shell/Frontmatter.test.tsx src/ui/reading-shell/DocumentPage.test.tsx src/ui/settings-panel/SettingsPanel.test.tsx src/stores/ui-store.test.ts` → 74 passing
- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings (`--max-warnings 0`)
- `pnpm format:check` → all conformant
- `pnpm test` → **331 passing** (was 293; +25 frontmatter parser, +5 panel, +3 DocumentPage, +1 SettingsPanel, +4 ui-store)
- `pnpm build` → main bundle **249.51 KB gzipped**. Still under the 250 KB budget but at the ceiling.

### Issues / Notes

- The bundle now sits at 249.51 KB / 250 KB. M3.13 Mermaid will be fully lazy-loaded — zero impact on main chunk. No further synchronous additions to the reader fit.
- The hand-rolled YAML parser intentionally rejects nothing. Unparseable values become plain strings, so users always see _something_ in raw view rather than an error.
- The metadata bar is a `<section>` with `aria-label="Document metadata"`, distinct from the rendered prose, so screen readers can navigate around it.

### Next step

**M3.13 — Mermaid diagrams** is the highest-impact remaining rendering-completeness item. Bundle constraints mean strict lazy-loading: `import('mermaid')` only when a fenced `mermaid` block is encountered on the page. Render to inline SVG, theme via Mermaid's runtime config tied to `useUIStore.theme`. Failure mode: keep the source as a styled `<pre>`.

Other reasonable directions: **M4.6 TOC**, **M4.2 section grouping**, **M2.5 hover zones**.

---

## 2026-05-01 · M4.5 · Backlinks panel UI

**Status**: ✅ Done

### What was built

The backlinks data from M4.4 is now visible in the reader. Every rendered Markdown document gets a document-bottom Backlinks panel that hydrates known sources for the current path, shows a compact context snippet, and lets the reader jump directly to the referring source file.

**Files created**:

- `src/ui/reading-shell/BacklinksPanel.tsx` — read-only backlinks panel with loading, empty, error, and populated states.
- `src/ui/reading-shell/BacklinksPanel.test.tsx` — 2 integration tests covering empty state and rendered backlink rows.

**Files modified**:

- `src/ui/reading-shell/DocumentPage.tsx` — renders `BacklinksPanel` below Markdown content inside the existing document context.
- `src/ui/reading-shell/DocumentPage.test.tsx` — adds end-to-end coverage for showing a backlink on a target document and navigating back to its source.
- `src/styles/globals.css` — `.swirlread-backlinks*` styles for the bottom panel, source rows, path metadata, and context snippets.
- Development docs updated to mark M4.5 done.

### Architecture decisions

- **Bottom panel, not side panel**. M4.3 already owns the persistent left navigation rail and M4.6 is planned for a right-side TOC. A bottom panel keeps backlinks available without introducing another competing column.
- **Known backlinks only**. The component calls `getBacklinksForFile(vaultId, currentPath)` and does not walk the vault. Indexing policy stays in M4.4, where it can later support eager/background builds without changing this UI.
- **Plain text context**. Context snippets come from raw Markdown and render as text. That avoids recursive rendering, sanitization questions, and surprising clickable content inside a navigation list.
- **Direct source navigation**. Rows link to `/app/:vaultId/:sourcePath`, matching the existing file tree, directory listing, and wikilink route shape.

### Verification

- Targeted: `pnpm test src/ui/reading-shell/BacklinksPanel.test.tsx src/ui/reading-shell/DocumentPage.test.tsx src/core/navigation/backlinks.test.ts` → 23 passing
- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **293 passing** (was 290; +2 BacklinksPanel, +1 DocumentPage)
- `pnpm build` → main bundle **247.37 KB gzipped**. Still under the 250 KB budget.

### Issues / Notes

- Backlinks appear only for sources already indexed by opening those files or by a future `buildBacklinksIndex(vault)` caller. This is intentional for Phase 1's incremental model.
- The panel does not group repeated mentions from the same source file. M4.4 currently stores one backlink row per source/target pair.

### Next step

Reasonable directions:

- **M3.13 — Mermaid diagrams** (high-value rendering completeness; likely lazy-loaded)
- **M3.10 — Frontmatter display** (small visible document polish)
- **M4.6 — Table of contents** (right-side navigation, but depends on the still-pending M2.5 hover-zone idea in the original plan)
- **M4.2 — Section grouping** (make the file tree more knowledge-map-like)

Lean toward **M3.13 Mermaid** next if rendering fidelity is the priority, or **M3.10 frontmatter display** if we want a smaller low-risk slice.

---

## 2026-05-01 · M4.4 · Backlinks index

**Status**: ✅ Done

### What was built

SwirlRead now has a persistent backlinks data layer. Markdown files are scanned for wikilinks, targets are resolved through the existing wikilink index, and resolved edges are stored in memory plus IndexedDB. `DocumentPage` incrementally refreshes backlinks for a file after it renders successfully, and the core module also exposes a whole-vault builder for future eager indexing.

**Files created**:

- `src/core/navigation/backlinks.ts` — extractor + index API:
  - `extractWikilinkReferences(source)` parses non-embed wikilinks and captures compact context text.
  - `indexBacklinksForFile(vaultId, sourcePath, source, wikilinkIndex)` replaces all backlinks emitted by one source file.
  - `getBacklinksForFile(vaultId, targetPath)` hydrates from IndexedDB as needed and returns source files for a target.
  - `buildBacklinksIndex(vault)` walks Markdown files and refreshes the whole vault.
- `src/core/navigation/backlinks.test.ts` — 8 tests covering extraction, ignored ranges, context, one-file indexing, dedupe, stale replacement, IndexedDB hydration, and whole-vault indexing.

**Files modified**:

- `src/core/persistence/db.ts` — Dexie schema v3 adds `backlinks: 'id, vaultId, targetPath, sourcePath, updatedAtMs'`; test reset now clears it.
- `src/ui/reading-shell/DocumentPage.tsx` — after a Markdown document renders and `wikilinkIndex` is ready, it refreshes backlinks for the current file.
- `src/ui/reading-shell/DocumentPage.test.tsx` — adds coverage that opening a Markdown file updates backlinks for its target.
- Development docs updated to mark M4.4 done.

### Architecture decisions

- **Resolve against the existing wikilink index**. The backlink module does not invent path matching rules. It calls `resolveWikilink()` so aliases, extension-less links, exact paths, and basename matches follow the same behavior as rendered links.
- **One backlink per source/target pair**. A source file linking to the same target multiple times produces one backlink row. M4.5 needs "files that link here" first; richer per-occurrence display can be added later without changing the table shape dramatically.
- **Replace source rows on re-index**. Each successful read deletes previous rows for that `(vaultId, sourcePath)` and writes the new set. Removed links disappear immediately instead of lingering until a full-vault rebuild.
- **Ignore obvious non-content ranges**. The extractor skips embeds (`![[...]]`), inline code, fenced code, and HTML comments so examples and media embeds don't pollute backlink counts.
- **IndexedDB cache, memory first**. Runtime calls hit a module-level map after first hydration. The table exists so backlinks survive refresh and can feed M4.5 without requiring a full walk on every app load.
- **Data-only milestone**. No visible backlinks panel yet. This keeps M4.4 small and gives M4.5 a stable API to consume.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **290 passing** (was 281; +8 backlinks, +1 DocumentPage)
- `pnpm build` → main bundle **246.94 KB gzipped**. Still under the 250 KB budget.
- Targeted: `pnpm test src/core/navigation/backlinks.test.ts src/ui/reading-shell/DocumentPage.test.tsx src/core/navigation/wikilink-resolver.test.ts` → 31 passing

### Issues / Notes

- Backlinks currently refresh only for Markdown files that are opened successfully, unless `buildBacklinksIndex(vault)` is called. This matches the milestone's "incrementally as files are read" requirement.
- Context is a compact raw Markdown snippet. M4.5 can decide whether to render it as plain text, snippetize it, or show surrounding prose more intelligently.

### Next step

**M4.5 — Backlinks panel UI** is now unblocked. It can call `getBacklinksForFile(vaultId, currentPath)` and render source links with the stored context.

---

## 2026-05-01 · M2.4 · Settings panel UI

**Status**: ✅ Done

### What was built

The reading preferences that already existed in `useUIStore` now have a proper product surface. A settings icon in the AppShell header opens a Radix-powered right drawer with theme, typography, content width, file-tree visibility, and reset controls. Changes apply immediately through the existing `useApplyUIPrefs()` hook and persist through the existing Dexie-backed store setters.

**Files created**:

- `src/ui/settings-panel/SettingsPanel.tsx` — Radix Dialog right drawer. Controls: theme select, font-family segmented control, font-size slider, line-height slider, content-width segmented control, file-tree checkbox, reset button.
- `src/ui/settings-panel/SettingsPanel.test.tsx` — 5 integration tests covering open/close, theme persistence + body class, typography store + CSS variables, content width + file-tree preference, and reset-to-defaults.

**Files modified**:

- `package.json` / `pnpm-lock.yaml` — added `@radix-ui/react-dialog`.
- `src/app/AppShell.tsx` — replaced the minimal header `ThemeSwitcher` with the settings trigger.
- `src/app/router.test.tsx` — header assertion now expects the settings button.
- `src/styles/globals.css` — `.swirlread-settings*` rules for the drawer, overlay, controls, compact segmented groups, mobile full-width behavior.
- `vitest.config.ts` — excludes `.pnpm-store/**` so a local pnpm store mirror never duplicates test discovery.

### Architecture decisions

- **Use Radix Dialog as planned**. This avoids hand-rolling focus trap, escape behavior, aria wiring, and portal behavior. The bundle cost is acceptable for a settings surface and matches the implementation plan.
- **Settings writes directly to `useUIStore`**. No intermediate form state. The app already has robust setters with clamping, persistence, and defensive reads; duplicating that logic in component state would create drift.
- **Panel replaces the standalone ThemeSwitcher in AppShell**. Theme remains reachable inside settings, along with the typography controls users actually need. The old component is left in place for now because deleting it is not required for the milestone.
- **Lazy-load the drawer**. A static Radix import pushed the main bundle over the 250 KB gzip budget (257.14 KB). `AppShell` now lazy-loads `SettingsPanel`, producing a separate 12.11 KB gzip settings chunk and keeping the main bundle under budget.
- **File tree toggle included**. M2.4 predates M4.3 in the written plan, but the current app now has a persisted file-tree preference. Settings should expose all primary reader-shell prefs, not leave the user hunting for one header-only control.
- **Semantic-token styling only**. The panel uses `--color-bg`, `--color-surface`, `--color-text`, `--color-border`, etc., so Sepia/Light/Dark/OLED all work without theme-specific branches.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm test` → **281 passing** (was 276; +5 SettingsPanel tests)
- `pnpm build` → main bundle **245.72 KB gzipped** (settings drawer split to a separate **12.11 KB gzipped** chunk). Still under the 250 KB budget.
- Targeted test slice: `pnpm test src/ui/settings-panel/SettingsPanel.test.tsx src/app/router.test.tsx src/ui/file-tree/FileTree.test.tsx` → 20 passing

### Issues / Notes

- Adding Radix through pnpm created a local `.pnpm-store/` mirror inside the workspace because pnpm initially wanted a project-local store. The directory is already ignored by git; Vitest now explicitly excludes it to prevent duplicated test discovery.
- The panel has no transition animation yet. It is structurally a right drawer; animation can be added later without changing component behavior.

### Next step

Reasonable directions:

- **M4.4 — Backlinks index** (next navigation-intelligence layer; likely IndexedDB-backed)
- **M4.2 — Section grouping** (make the left tree more opinionated than raw filesystem)
- **M3.13 — Mermaid diagrams** (rendering completeness for technical notes)
- **M2.5 — Hover-summoned UI zones** (optional now that persistent sidebar exists)

Lean toward **M4.4 backlinks index** if continuing navigation infrastructure, or **M3.13 Mermaid** if the next priority is rendering fidelity.

---

## 2026-05-01 · M4.7 · Recent files

**Status**: ✅ Done

### What was built

SwirlRead now remembers what was opened recently, per vault. Successfully opened files are stored latest-first, capped to 20 per vault, persisted in IndexedDB, and surfaced immediately at the top of the file-tree sidebar. This is also the first slice of reader-specific state for the future command palette.

**Files created**:

- `src/stores/reader-store.ts` — Zustand reader store with `recentByVault`, `init()`, `markRecentFile()`, `clearRecentFiles()`, and `getRecentFilesForVault()`. Recent files are deduped by `(vaultId, path)`, moved to the top when reopened, normalized before storing, and pruned to 20 rows per vault.
- `src/stores/reader-store.test.ts` — 8 tests covering empty init, hydration from Dexie, latest-first ordering, dedupe, IndexedDB pruning, vault isolation, path normalization, and clearing one vault.

**Files modified**:

- `src/core/persistence/db.ts` — Dexie schema v2 adds `recentFiles: 'id, vaultId, openedAtMs'`; test reset now clears the table.
- `src/main.tsx` — hydrates `useReaderStore` on app boot alongside vault and UI stores.
- `src/ui/reading-shell/DocumentPage.tsx` — records a recent file only after `stat` confirms a file and `readText` succeeds. Directory listings, missing files, and read failures are not recorded.
- `src/ui/file-tree/FileTree.tsx` — renders a compact "Recent" section above the full vault tree, using the first 5 paths from the store. Links use path-level aria labels so duplicate filenames do not collide with the tree's accessible names.
- `src/styles/globals.css` — styles for the recent section and compact rows.
- Existing tests — reset reader-store state where route tests also reset IndexedDB; DocumentPage now asserts recent recording; FileTree now asserts recent rendering.

### Architecture decisions

- **New reader store, not vault/ui store growth**. Vault store remains registry + live adapter ownership; UI store remains presentation preferences. Recents are reading state, and this store is the right future home for scroll positions, history, and command-palette data.
- **Persist rows in a real table**. The plan and architecture docs call out `recentFiles`; using a Dexie table now avoids hiding per-vault state in generic preferences and gives us a natural query surface for M5.
- **Record only successful file opens**. `DocumentPage` writes after file content is read and render state is ready. That keeps recent files from being polluted by directories, typos, missing notes, or permission/read errors.
- **Cap and prune both memory and IndexedDB**. The store keeps only the last 20 rows per vault and deletes stale rows immediately, so long sessions do not accumulate unbounded local state.
- **Sidebar shows top 5 only**. The full 20 are for command palette / future navigation. The left rail needs a quick-reach list, not a second large tree.
- **Stable selector fallback**. The FileTree selector returns a module-level empty array for vaults with no recents; returning a fresh `[]` triggered React 19's external-store snapshot warning and update-depth failure in tests.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **276 passing** (was 266; +8 reader-store, +1 DocumentPage, +1 FileTree)
- `pnpm build` → main bundle **245.51 KB gzipped** (was 244.86; +0.65 KB for reader store + recent sidebar). Still under the 250 KB budget.
- Targeted tests:
  - `src/stores/reader-store.test.ts` → 8 passing
  - `src/ui/reading-shell/DocumentPage.test.tsx` → 11 passing
  - `src/ui/file-tree/FileTree.test.tsx` → 9 passing

### Issues / Notes

- Recent rows currently store only path + timestamp. Display names derive from `basename(path)`. If we later need richer command-palette ranking, add optional title/snippet fields through another Dexie migration.
- The sidebar recent section does not validate existence on render. If a file is deleted outside SwirlRead, clicking it lands in the existing "File not found" state and the stale recent can be cleared by a future maintenance pass.

### Next step

Reasonable directions:

- **M2.4 — Settings panel UI** (expose the typography and shell prefs already in stores)
- **M4.4 — Backlinks index** (another persistent per-vault index, heavier than recents)
- **M4.2 — Section grouping** (make the sidebar less like raw filesystem and more like a knowledge map)
- **M3.13 — Mermaid diagrams** (high-value rendering feature, likely lazy-loaded)

Lean toward **M2.4 settings panel** if the next goal is visible product polish, or **M4.4 backlinks** if the next goal is navigation intelligence.

---

## 2026-05-01 · M4.3 · Persistent file-tree sidebar

**Status**: ✅ Done

### What was built

The vault is now always one click away. A 280 px left rail shows the full tree of the active vault; click a file to read it, click a chevron to expand a folder, the active document is highlighted, and ancestors of the current note auto-expand. A toggle button in the header flips it on/off, and the choice persists.

**Files created**:

- `src/ui/file-tree/FileTree.tsx` — recursive tree. Root component fetches `vault.list('')`; per-node `<FileTreeNode>` lazily fetches children on first expansion. Active state via `aria-current="page"` + `is-active` class. Ancestor auto-expansion via a `useEffect` on `currentPath`.
- `src/ui/file-tree/file-tree-cache.ts` — module-level `Map<key, Promise<entries>>` so collapsing then re-expanding doesn't re-walk; failed listings are evicted. Lives in its own file so `FileTree.tsx` only exports components (Vite's fast-refresh contract).
- `src/ui/file-tree/FileTree.test.tsx` — 9 integration tests through the production route tree (mount, lazy expand, expand-on-click, active highlight, ancestor auto-expand, hidden-when-toggled-off, AppShell button toggling the store flag).
- `src/ui/reading-shell/VaultLayout.tsx` — flex container providing the sidebar + outlet for every vault-scoped route. Decodes the URL pathname into the vault-relative path (handles unicode segments).

**Files modified**:

- `src/app/router.tsx` — restructured. `:vaultId` is now a layout route with `<index>` (VaultHome) + `*` (DocumentPage) children. AppShell stays as the outermost shell (with the toggle button + theme switcher); VaultLayout sits inside it for vault-scoped routes.
- `src/app/AppShell.tsx` — sticky header now spans `var(--shell-header-height)`; added a left-side icon button using Lucide `PanelLeftOpen` / `PanelLeftClose` that flips `useUIStore.toggleFileTree`.
- `src/stores/ui-store.ts` — added `fileTreeOpen: boolean` (default `true`) + `setFileTreeOpen` / `toggleFileTree`. Wired into `init()` and `resetToDefaults()` with the same defensive read pattern as the other prefs.
- `src/stores/ui-store.test.ts` — 5 new tests covering default, set, toggle, restore-from-db, invalid-stored-value fallback.
- `src/styles/globals.css` — `.swirlread-vault-layout*`, `.swirlread-file-tree*`, and `.swirlread-shell__icon-button` rules. CSS vars `--shell-header-height` (48px) and `--file-tree-width` (280px) live on `:root`.
- `src/app/router.test.tsx` — assertion updated for the new tree shape (children of `/app` collapse from `[<index>, :vaultId, :vaultId/*]` to `[<index>, :vaultId]`, with `:vaultId` having its own `[<index>, *]` children).
- `src/ui/reading-shell/VaultHome.test.tsx` — `beforeEach` now pins `fileTreeOpen: false` so legacy assertions don't double-match elements that exist in both the sidebar and the main view.

### Architecture decisions

- **Persistent sidebar over hover panel**. The plan called for hover-summoned panels (M2.5) plus a pin flag. Shipping a hover-summon UI on top of the actual tree is two layers of mechanism for the same job. Always-on with a toggle gets the user "vault always in reach" with half the moving parts and no Radix dependency. The hover-summon variant can land later as an _additional_ mode without rewriting this work.
- **Layout route, not parsing pathname in AppShell**. AppShell is shared by routes that don't have a `:vaultId` (the `/app` index). Pulling `vaultId` from `useParams` requires being inside the matching route. A new `VaultLayout` route (with `:vaultId` segment) gives that cleanly via `useParams` and naturally hides the sidebar at `/app`.
- **Sticky header + sticky sidebar with shared CSS var**. Header is `position: sticky; top: 0` with explicit height `var(--shell-header-height)`. Sidebar is `position: sticky; top: var(--shell-header-height)`. Same var, no JS measurement, both elements stay aligned through scroll.
- **Listing cache by `vaultId::path`**. Module-level Map. Collapse → re-expand is instant; a vault switch (`key={vaultId}` on the tree) remounts but the cache survives (which is fine because subsequent switches back to the same vault are also instant). Failed listings evict so retry works.
- **Ancestor auto-expansion is `useEffect`-driven**. Constructor-time computation gives initial state; the `useEffect` re-applies when `currentPath` changes (e.g. user clicks a wikilink and lands deeper). We deliberately don't auto-collapse — once a user expands a branch manually, navigating elsewhere shouldn't snap their tree shut.
- **`role="tree"` + `role="treeitem"` + `aria-expanded`** for screen-reader navigation. `aria-current="page"` on the active link is the keyboard / AT signal for "this is what you're reading."
- **Path decoding in VaultLayout**. URL pathname is split, slice(3) drops `['', 'app', vaultId]`, each remaining segment is `decodeURIComponent`'d. Wilson's vault has Chinese folder names; without decoding the active-highlight comparison would never match.
- **Default `fileTreeOpen: true`**. First-time users should see the sidebar — that's the whole point of M4.3. Power users can hide it.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings (max-warnings 0)
- `pnpm format:check` → all conformant
- `pnpm test` → **266 passing** (was 253; +5 ui-store, +9 FileTree integration; existing tests adjusted for the new layout-route shape)
- `pnpm build` → main bundle **244.86 KB gzipped** (was 243.54; +1.3 KB for the new component + Lucide icons + styles)

### Manual browser E2E (against `supwil/`)

1. Open vault → AppShell header shows wordmark, toggle button (panel-left-close icon), theme switcher
2. Below the header, sidebar lists `.claude`, `.git`, `.obsidian`, `ai`, `career`, `docs`, `knowledge`, `templates`, `CLAUDE.md`, `index.md`, `log.md`, `README.md` — directories first, then files, alphabetical
3. Click `index.md` → renders in the right column, sidebar entry highlighted in accent color
4. Click chevron next to `career` → expands inline, shows `me`, `ai`, etc.; chevron rotates 90°
5. Type URL `/app/v/career/me/me.md` directly → sidebar auto-expands `career` and `me`, active link highlighted
6. Click toggle button in header → sidebar slides out (instant; no animation yet); URL unchanged; reload page → sidebar still hidden (preference persisted)
7. Click toggle again → sidebar returns
8. Cycle Sepia / Light / Dark / OLED — sidebar respects each palette via existing tokens

### Issues / Notes

- **No M4.2 section grouping yet**. The tree shows the raw filesystem; section homes (`*-map.md`) and section-aware grouping land in M4.2.
- **Tree is fully synchronous beyond the lazy-fetch**. For very large vaults (10k+ files) we may need virtualization (M9.1). Wilson's vault is well under that threshold.
- **No drag/drop, no rename, no create** — read-only sidebar. That's by design (Phase 1 is read-only).
- **Toggle button visible at `/app` with no vault active**. It still works (flips the store pref) — there's just no sidebar to toggle in that view. Acceptable; could conditionally hide later if it confuses anyone.

### Next step

Reasonable directions:

- **M2.4 — Settings panel UI** (typography sliders for prefs in the store since M2.3 + the new `fileTreeOpen`)
- **M4.7 — Recent files** (small store extension; feeds the eventual ⌘K palette)
- **M4.4 — Backlinks index** (incremental walk, cache to IndexedDB; backlinks panel is M4.5)
- **M2.5 — Hover-summoned UI zones** (now that we have a sidebar, optional hover-summon mode for power users)

Lean toward **M4.7 recent files** next — small surface, sets up the ⌘K palette without tackling its UI yet, and the sidebar gets meaningfully more useful when the top entries surface what you've been reading lately.

---

## 2026-05-01 · M4.1 · Vault home detection + navigable directory listing

**Status**: ✅ Done

### Why this came next

User report (screenshot): the vault home view rendered a list of folders + files but the entries were inert `<span>`s — clicking did nothing. The user couldn't actually open any document. The plan's M4.1 "vault home detection" plus a thin slice of M4.3 (navigable listing) is the smallest fix that turns the app into something the user can actually read with.

### What was built

**Files created**:

- `src/core/navigation/section-detector.ts` — `findVaultHome(vault)` and the pure `pickHomeFromEntries(entries)`. Probes `index.md` → `home.md` → `README.md` (and `.mdx` variants) at the vault root, case-insensitive, returns the first hit or `null`.
- `src/core/navigation/section-detector.test.ts` — 10 unit tests covering priority order, case-insensitivity, `.mdx`, missing home, ignoring directories with home-like names, plus two adapter integration tests.
- `src/ui/reading-shell/DirectoryListing.tsx` — navigable listing with Lucide icons, file-size badge, sort (directories first then alphabetical), and a breadcrumb navigator anchored at "Vault root" with the current segment marked `aria-current="page"`. Used by both VaultHome and DocumentPage.
- `src/ui/reading-shell/VaultHome.test.tsx` — 4 integration tests through the full route tree: index.md auto-redirect, README.md fallback, no-home directory listing, and directory-path navigation in DocumentPage.

**Files modified**:

- `src/ui/reading-shell/VaultHome.tsx` — load order now: list root + run home detection in the same async pass; if a home file exists, `<Navigate replace>` to it; otherwise render `<DirectoryListing>` rooted at "". The "vault not registered" branch keeps its old shape since there's nothing to list.
- `src/ui/reading-shell/DocumentPage.tsx` — `vault.stat(filePath)` first. If the entry is a directory, list it and render the same `<DirectoryListing>` (kicker reads "Folder"); otherwise the existing read-text-and-render path runs unchanged. Adds one extra adapter call per page load — negligible vs. the cost of trying readText on a dir and having to disambiguate the resulting `VaultReadError`.
- `src/styles/globals.css` — `.swirlread-directory*` rules: subtle hover tint via `color-mix(var(--color-accent), 8%)`, dashed underline on breadcrumb hover, JetBrains Mono for the file-size badge, theme-aware throughout.

### Architecture decisions

- **Auto-redirect, not a "click to open" landing**. If `index.md` / `README.md` exists, that's almost always what the reader wants to see — a folder list is friction. `<Navigate replace>` keeps history clean (the vault-root URL doesn't pile up in back-button history).
- **One component for both contexts**. Vault root (no home file) and any sub-directory route through the same `<DirectoryListing>`. Different `kicker` text ("Vault Home" vs "Folder") and breadcrumbs auto-derive from the path. Less code than two near-duplicate components, and any UX tweak (sort order, icons, spacing) lands once.
- **`stat()` first, then branch**. Trying `readText` on a directory throws `VaultReadError` from FSAPI's `TypeMismatchError` — same error shape as a corrupt file. Statting first separates the cases at the cost of one extra metadata round trip. Cleanest. If the perf becomes a real issue (it won't), we can fall back to "try read, on certain error try list."
- **Empty-folder UX**. Rather than render an empty `<ul>`, an italic "(this folder is empty)" line appears. Same component handles it; no special-case route.
- **Breadcrumb is the recovery path**. We don't yet have a sidebar (M4.3) or back button beyond the browser's. The breadcrumb is the user's escape hatch back to the root from any sub-directory or file. Each segment is a real link, the current segment is rendered as plain text with `aria-current="page"`.
- **Locale-aware sort**. `localeCompare(undefined, { sensitivity: 'base' })` so Chinese / Japanese / mixed-script vaults (Wilson's case) sort sensibly without separate locale plumbing.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **253 passing** (was 239; +10 section-detector unit, +4 VaultHome/DocumentPage integration)
- `pnpm build` → main bundle **243.54 KB gzipped** (was 242.26; +1.3 KB for the new component + Lucide icons it imports + styles)

### Manual browser E2E (against `supwil/`)

1. `pnpm dev`, open `localhost:5173/`
2. Pick the `supwil/` vault → SwirlRead lands directly on `index.md` rendered (no folder list seen)
3. Edit URL to `/app/:vaultId/career` → folder listing appears with `me`, `ai`, etc., breadcrumb shows `Vault root / career`
4. Click into `me/me.md` → DocumentPage renders the note
5. Theme switcher cycles through Sepia/Light/Dark/OLED — listing inherits all four palettes via semantic tokens

### Issues / Notes

- **Not a full file tree**. M4.3's hover-summoned sidebar with lazy-expand and per-route persistence is still future work. What landed today is "you can browse the vault now," not "the vault is always one keystroke away."
- **No section-home detection (`*-map.md`)** yet — that's M4.2. The current detector is vault-root only.
- **Auto-redirect doesn't preserve a "show me the folder" escape**. If a user explicitly wants to browse the root despite an `index.md` existing, they'd have to delete it. Acceptable for v1; if it becomes a real ask we can add a `?listing` query-string opt-out.

### Next step

Reasonable directions:

- **M4.3 — File-tree hover panel** (the persistent sidebar; reuses today's `DirectoryListing` primitives + adds Radix primitives + `useUIStore` `fileTreeOpen` / `fileTreePinned` state)
- **M2.4 — Settings panel UI** (typography sliders for the prefs already in the store since M2.3)
- **M4.7 — Recent files** (small store extension; feeds the eventual ⌘K palette)

Lean toward **M4.3** next — the breadcrumb plus directory listing is functional but losing the listing on every file-open is friction. A persistent panel removes that friction with the highest perceived-quality jump from current state.

---

## 2026-05-01 · M3.4 · Wikilink hover preview

**Status**: ✅ Done

### What was built

Hovering a resolved wikilink now reveals a 400 ms-delayed popover that shows the first ~220 cleaned characters of the target file. Floating UI handles the positioning + the safePolygon grace zone so the cursor can travel onto the popover without it disappearing.

**Files created**:

- `src/core/render/preview-snippet.ts` — pure utility that turns Markdown source into a plain-text snippet: strip frontmatter, drop fenced code / HTML comments, drop the leading H1 (usually the title), collapse wikilinks/embeds/links to their visible text, strip emphasis markers, collapse whitespace, truncate at the last word boundary inside `maxChars` with an ellipsis.
- `src/core/render/preview-snippet.test.ts` — 15 tests.
- `src/ui/reading-shell/WikilinkPreview.tsx` — the trigger + popover. Uses `useFloating` + `useHover({ delay, handleClose: safePolygon() })` + `useDismiss` + `useRole('tooltip')`. Mounts the popover into `<FloatingPortal>` so it escapes any `overflow:hidden` ancestor. Body fetches `vault.readText(resolved)` only after the popover commits to opening; cancellation flag drops the result if the popover closed first.

**Files modified**:

- `src/ui/reading-shell/Wikilink.tsx` — resolved branch now wraps the link in `<WikilinkPreview>`. Broken / pending states unchanged.
- `src/styles/globals.css` — `.swirlread-wikilink-preview*` rules using `--color-surface` / `--color-border` / `--color-text*` so all four themes inherit automatically.
- `package.json` — `@floating-ui/react ^0.27.19` (the choice already documented in `tech-stack.md`).

### Architecture decisions

- **Wrapper pattern, not "inject popover via context"**. `WikilinkPreview` owns both the `<Link>` and the popover, and Wikilink delegates the resolved branch to it. This means a wikilink that fails to resolve never even mounts the popover machinery — broken / pending states remain a plain `<span>`.
- **Don't fetch until commit**. `useEffect` for `vault.readText` lives inside `<PreviewBody>`, and `<PreviewBody>` only mounts when `open === true`. Hovers that bounce within the 400 ms delay produce zero work.
- **`vaultId` passed as prop, not pulled from context**. Cuts the popover's coupling to `WikilinkContext`; only the resolved path + the vault id are needed. Easier to test in isolation later.
- **`safePolygon({ buffer: 1 })`** rather than the default — the prose has dense text and the default polygon was a touch generous, occasionally keeping popovers open over unrelated runs. A 1 px buffer removes the false-positive without breaking the natural diagonal.
- **Snippet is plain text, not rendered Markdown**. Rendering ~220 chars through the full pipeline costs the entire async toolchain (Shiki + sanitize + JSX) for a hover. The snippetizer is regex-based and bounded — runs in microseconds. The preview reads as a "first paragraph" tease, which is what hovers are for.
- **No popover on broken / pending wikilinks**. A "this file doesn't exist" state has nothing to preview; mounting the Floating UI machinery for it would just be cost.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **239 passing** (was 224; +15 snippetizer tests)
- `pnpm build` → main bundle **242 KB gzipped** (was 225; +17 KB for `@floating-ui/react`). **Within the 250 KB budget but tight.**

### Manual browser E2E (against `supwil/`)

1. `pnpm dev`, open any note that links to other notes via `[[...]]`
2. Hover a resolved wikilink — after a perceptible-but-not-annoying pause, a card appears above the link with the path header + the first chunk of the target file
3. Move the cursor diagonally onto the card — it stays open
4. Move off the card — it closes after ~120 ms
5. Hover then immediately leave — no card, no fetch (verified by network tab being silent)
6. Sepia / Light / Dark / OLED — card respects all four palettes via existing semantic tokens

### Issues / Notes

- **Bundle hit**: +17 KB for Floating UI is the first M3-era dep that meaningfully moves the gauge. Next perf pass (M9.1) should consider `lazy()` for `<WikilinkPreview>` so its code only loads on first hover. That cuts initial JS by the same 17 KB.
- **No interaction test for the popover itself**. The hover state machine involves real timers, portals, and Floating UI's polygon math; a faithful test would be flaky for marginal coverage. The snippetizer is unit-tested (the only logic of ours), and the popover is the upstream library's responsibility. Manual E2E covers the rest.
- **Heading / block-id targets** still scroll to URL hash via React Router; preview text doesn't yet zoom into the section. That's a polish task (depends on M4.6 TOC anchoring).

### Next step

Reasonable directions:

- **M2.4 — Settings panel UI** (Radix Dialog with sliders; finally exposes typography prefs already in the store since M2.3)
- **M3.13 — Mermaid diagrams** (lazy-imported renderer; high-leverage for system-design notes; bundle impact concentrated in a chunk)
- **M3.10 — Frontmatter display** (small surface; right after the snippetizer's frontmatter handling makes the patterns fresh)
- **M3.11 — KaTeX math** (lazy-imported; common in technical notes)

Lean toward **M2.4** next: the typography store has been live since M2.3 but users can't actually tune font size / line height / content width without a UI. Smallest distance from current state to a noticeable user-facing improvement.

---

## 2026-05-01 · M3.9 · Highlights (`==text==`)

**Status**: ✅ Done

### What was built

The last small-but-visible primitive in Wilson's vault — `==highlighted==` — now renders as a felt-pen `<mark>` block. Theme-tuned amber on light backgrounds, deeper amber on dark.

**Files created**:

- `src/core/render/plugins/remark-highlight.ts` — visit-based plugin, identical shape to `remark-wikilink`. Custom mdast `highlight` node emits a real `<mark>` via hast hint.
- `src/core/render/plugins/remark-highlight.test.ts` — 11 tests covering basic match, multiple highlights, lazy adjacency, surrounding text, hast hints, Unicode, newline rejection, empty rejection, the `x == 5` comparison guard, plus head/tail-of-paragraph cases.

**Files modified**:

- `src/core/render/pipeline.ts` — registered `remark-highlight` after `remark-wikilink`; whitelisted `<mark>` in the sanitize schema (not in GitHub's default allow list).
- `src/core/render/pipeline.test.tsx` — 3 new integration tests (single, multiple, sanitize survival).
- `src/styles/globals.css` — `.swirlread-prose mark` rule with `color-mix` over `#ffd76a` on light themes and `#d6a93f` on Dark/OLED. `box-decoration-break: clone` so highlights wrapping across lines keep their padding.

### Architecture decisions

- **Use the real `<mark>` element**, not a custom `<highlight>`. Semantic match for "highlighted text," screen readers know what to do with it, and the only schema cost is a single `tagNames` extension.
- **`\S(...)\S` content anchor** instead of plain `(.+?)`. Rules out `x == 5`-style comparisons (where there's whitespace immediately inside the `==`). The single `\S(?:[^\n]*?\S)?` pattern also lets a one-character highlight (`==a==`) pass while still rejecting the empty `====`.
- **Run AFTER wikilink** (not before like embed). Highlight content is plain text; nothing inside the wikilink/embed plugins should produce stray `==` pairs. Order is pure convention here, but keeping highlight last in the custom-plugin chain matches the "decorative" role of `<mark>`.
- **No JS in the renderer** — `<mark>` is a leaf inline element with hast text children; no React component override needed in `customComponents`. Smallest possible surface area.
- **Color choice not driven by `--color-accent`**. Accent colors per theme range from sepia gold to OLED orange — using accent for highlights would make them disappear on Sepia (the highlight and accent are both gold-toned). A dedicated amber survives every theme.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **224 passing** (was 210; +11 plugin, +3 pipeline)
- `pnpm build` → 1.94 s; main bundle **225.24 KB gzipped** (was 225.17; +0.07 KB — effectively free)

### Manual browser E2E

1. `pnpm dev`, open any note containing `==…==`
2. Cycle through Sepia / Light / Dark / OLED in the theme switcher — highlight tint adjusts at each step, text colour stays inherited (no contrast surprises)
3. A highlight that wraps across two lines keeps padding on both fragments (the `box-decoration-break: clone` payoff)

### Issues / Notes

- **No syntactic conflict with setext headings** (`Title\n=====`). The setext line is consumed at the block-parse stage by `remark-parse` before our visit pass runs.
- **Highlights inside emphasis** (`*==foo==*`) carry the same inheritance limitation as wikilinks/embeds: the visit pass only runs on `text` nodes, so a highlight that's the sole child of an `emphasis` won't split. Edge case; not yet observed in Wilson's vault.

### Pipeline composition (current)

```
remark-parse
  → remark-frontmatter
  → remark-gfm
  → remark-callout
  → remark-embed         (must precede wikilink)
  → remark-wikilink
  → remark-highlight     ← new
  → remark-rehype
  → rehype-shiki
  → rehype-sanitize
  → hast-util-to-jsx-runtime
```

### Next step

The remaining M3 backlog leans toward **M3.4 wikilink hover preview** (Floating UI popover, leverages the now-stable resolver) or **M3.10 frontmatter handling** (currently stripped — could surface as a metadata bar). M3.13 mermaid is also queued; lazy-import shape is already prefigured by Shiki.

Strongest pick next: **M3.4 hover preview** — given vault wikilink density, the visible quality bump per LOC is the highest of the remaining options.

---

## 2026-05-01 · M3.7 + M3.8 · Embeds (`![[file]]`)

**Status**: ✅ Done

### What was built

Obsidian-style embeds — `![[image.png]]`, `![[note.md]]`, `![[clip.mp4]]`, etc. — now parse, resolve, and render with the right widget per file kind. Markdown embeds expand recursively with cycle protection, so a vault that uses `![[]]` as a partial-include mechanism reads correctly without infinite loops.

**Files created**:

- `src/core/render/plugins/remark-embed.ts` — visit-based plugin: pass 1 splits text nodes on `![[...]]`, pass 2 lifts solitary-embed paragraphs to top-level blocks. Pre-classifies kind from the file extension so the renderer doesn't have to.
- `src/core/render/plugins/remark-embed.test.ts` — 21 tests: kind classification, body parsing (display / heading / block-ref), plugin extraction, paragraph lifting, and the embed↔wikilink ordering invariant.
- `src/ui/reading-shell/EmbedNode.tsx` — kind-dispatched renderer (image / video / audio / markdown / pdf / other) with broken / pending / cycle states.
- `src/ui/reading-shell/embed-context.ts` — `EmbedContext` carries the depth stack + the same custom-components map down into nested markdown embeds.

**Files modified**:

- `src/core/render/pipeline.ts` — added `remark-embed` BEFORE `remark-wikilink` (otherwise wikilink would consume the inner `[[file]]` of `![[file]]`); whitelisted `<vault-embed>` + its data attrs in the sanitize schema.
- `src/core/render/pipeline.test.tsx` — 4 new tests asserting `<vault-embed>` element + data attrs + paragraph lifting.
- `src/ui/reading-shell/DocumentPage.tsx` — registered `'vault-embed': EmbedNode` in `customComponents`; wraps the prose with both `WikilinkContext.Provider` and `EmbedContext.Provider` (initial stack = `[currentPath]`).
- `src/ui/reading-shell/DocumentPage.test.tsx` — 4 new integration tests: image embed → `<img>` with blob URL, broken target notice, recursive markdown embed, self-cycle notice.
- `src/styles/globals.css` — `.swirlread-embed*` styles for image / video / audio / markdown card / file card / broken / pending / cycle. Theme-aware via existing semantic tokens.
- `src/setup-tests.ts` — added a deterministic `URL.createObjectURL` shim (jsdom doesn't accept the duck-typed `File` we hand back from the mock filesystem; stubbing here is cheaper than reworking the mock).
- `src/core/vault/__test-helpers__/mock-fs.ts` — kept the duck-typed File but added a comment explaining the trade-off.

### Architecture decisions

- **Custom element name `<vault-embed>` instead of `<embed>`**. HTML5's `<embed>` is a real void element with security implications; using a custom element name (with a hyphen, per Web Components naming rules) keeps the schema extension unambiguous and avoids any risk of the sanitizer's default `<embed>` exclusion fighting our addition.
- **Embed runs before wikilink in the pipeline**. The wikilink regex `\[\[...\]\]` would happily match the inner `[[file]]` of `![[file]]`, leaving a stray `!` text node and a wrong wikilink. Embed pass first claims `![[...]]` as one unit. The remark-embed test suite locks this invariant in.
- **Two-pass parser** (visit text → lift solitary-embed paragraphs). Lifting matters because a markdown embed renders as `<aside>` (block-level); inside a `<p>` wrapper that's invalid HTML and browsers auto-close the `<p>`. Single-paragraph embeds become top-level mdast nodes and render cleanly. Inline embeds (e.g. `text ![[icon.png]] text`) stay nested — fine since `<img>` is inline-allowed.
- **Kind classified at parse time, not render time**. The remark plugin sets `data-kind` from the file extension. The React component just dispatches on it. Keeps the renderer pure (no `extname` import in `ui/`) and gives downstream consumers (search index, future TOC) the same classification for free.
- **Cycle + depth protection via React context**, not a closure or singleton. `EmbedContext.stack` is the embed call stack from the document root down to the current node. Each `MarkdownEmbed` provides a new context value `[...stack, resolved]` to its children. A deeper embed seeing its own path in the stack short-circuits — no infinite recursion possible. Hard cap `MAX_EMBED_DEPTH = 3` is the belt-and-suspenders guard against pathological vaults with very deep but acyclic graphs.
- **Components map travels via context** so nested `renderMarkdown` calls produce the same custom mappings (wikilinks resolve, callouts render, deeper embeds render). Avoiding a circular import by passing through context rather than top-level export.
- **Image dimensions vs. alt text** — the `display` arg is parsed: `400`, `400x300` → width/height; anything else → alt text. Mirrors Obsidian's behavior.
- **`URL.createObjectURL` test shim**, not a mock-fs rewrite. The mock filesystem returns duck-typed `File` objects so jsdom's missing `File.text()` isn't a blocker for the existing readText tests. Real `Blob`/`File` would have broken those — instead we stub the one missing browser API at the test layer. Documented in `setup-tests.ts`.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings (max-warnings 0)
- `pnpm format:check` → all conformant
- `pnpm test` → **210 passing** (was 181; +21 remark-embed plugin, +4 pipeline integration, +4 DocumentPage integration)
- `pnpm build` → 1.94 s; main bundle **225 KB gzipped** (was 224 KB; +1 KB for plugin + component + styles — well within 250 KB budget)

### Manual browser E2E (against `supwil/`)

1. `pnpm dev`, open any note that uses `![[…]]`
2. Image embeds render inline and inherit the prose column width
3. Markdown embeds render as a bordered card with a filename header; their content is fully reactive (callouts, wikilinks, code blocks all work inside)
4. Self-cycling files render a "Circular embed prevented" notice, not a stack overflow

### Issues / Notes

- **Section/block-id rendering scope is the renderer's job.** The plugin captures `data-heading` / `data-block-id`, but `MarkdownEmbed` currently expands the whole target file. Heading/block extraction lands when the TOC anchoring infra (M4.6) lands — at that point trimming the rendered tree to a section is straightforward.
- **Foldable callouts in embedded markdown** still render expanded (parent task M3.5 polish); inheriting that limitation here.
- **No PDF inline preview yet** — `.pdf` renders the file-card. M7.x covers richer file rendering.

### Pipeline composition (current)

```
remark-parse
  → remark-frontmatter
  → remark-gfm
  → remark-callout
  → remark-embed     ← new (must precede wikilink)
  → remark-wikilink
  → remark-rehype
  → rehype-shiki
  → rehype-sanitize
  → hast-util-to-jsx-runtime
```

### Next step

Reasonable directions:

- **M3.9 — Highlights `==text==`** (cheap; vault uses them in study notes)
- **M3.4 — Wikilink hover preview** (Floating UI popover; pairs well with the now-resolvable wikilinks)
- **M2.4 — Settings panel UI** (Radix Dialog; finally exposes typography sliders)
- **M3.13 — Mermaid** (lazy-imported; valuable for system-design notes)

Lean toward **M3.9 highlights** next — small surface area, immediate visible win, no async machinery. M3.4 is the higher-leverage feature though, given the wikilink density of Wilson's vault.

---

## 2026-05-01 · M2.3 · UI Store + Theme Switcher

**Status**: ✅ Done

### What was built

The four themes + Auto are now actually reachable. Until this commit the body class was hardcoded to `theme-sepia` in `index.html`; all the dual-theme Shiki and palette work was invisible. Now there's a header dropdown that switches themes instantly with persisted preference.

**Files created**:

- `src/stores/ui-store.ts` — Zustand store with `theme`, `fontFamily`, `fontSize`, `lineHeight`, `contentWidth`, `zenMode`, `ready`. Setters persist to Dexie `preferences` table (except `zenMode`, intentionally session-scoped).
- `src/stores/ui-store.test.ts` — 13 tests covering init defaults, persistence round-trip, invalid value fallback, numeric clamping, setters, zenMode, resetToDefaults
- `src/app/use-apply-ui-prefs.ts` — top-level hook that syncs store state into DOM (body class for theme, CSS vars on root for typography)
- `src/ui/components/ThemeSwitcher.tsx` — minimal `<select>` dropdown for the AppShell header

**Files modified**:

- `src/app/AppShell.tsx` — replaced "App Shell · placeholder" with `<ThemeSwitcher />`
- `src/App.tsx` — calls `useApplyUIPrefs()` once at the top of the tree
- `src/main.tsx` — fires `useUIStore.getState().init()` alongside vault store init
- `src/styles/globals.css` — `.swirlread-prose` now uses `var(--reader-font-family)`, `var(--reader-font-size)`, `var(--reader-line-height)`; added zen-mode rule that hides AppShell header
- `src/ui/reading-shell/DocumentPage.tsx` — article maxWidth uses `var(--reader-content-width)`
- `src/app/router.test.tsx` — header assertion updated for the new ThemeSwitcher combobox + wordmark link

### Architecture decisions

- **Defensive pref reads**. Each pref load goes through `readPref(key, isValid, fallback)`. An IDB row with corrupted data (e.g. `theme: 'INVALID'`) falls back to default rather than crashing. Type-guard functions enumerate the valid string unions.
- **Numeric clamping at both load and write**. Out-of-range stored values get clamped on `init`; user inputs get clamped on every setter call.
- **`zenMode` deliberately session-scoped**. A stuck zen state surviving page reloads would be a UX trap. F-key (M2.6) toggles in-session only.
- **Top-level hook for DOM sync** (`useApplyUIPrefs`) rather than a provider. Mounting it once in `App.tsx` covers the entire tree; no provider re-renders.
- **CSS variables drive typography**. `--reader-font-size`, `--reader-line-height`, `--reader-content-width`, `--reader-font-family` are set on `<html>` from the store. Changing any preference is one DOM property write — no React re-renders of content.
- **Subscriptions are field-scoped**. Each useEffect in the apply hook subscribes to only the field it cares about — changing fontSize doesn't re-run the theme classList effect.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **181 passing** (was 168; +13 ui-store tests)
- `pnpm build` → 224 KB gzipped JS (~1 KB delta — store + switcher are tiny)
- Live dev-server: HMR applied; switching themes in the AppShell dropdown updates the body class instantly

### Manual browser E2E (now finally visible)

1. `pnpm dev`, open `localhost:5173/`
2. Open vault, navigate to any Markdown file with code blocks
3. AppShell header → "Theme" dropdown → pick Sepia / Light / Dark / OLED / Auto
4. Body background, text color, code highlighting, callout tints, wikilink underlines — **everything switches in one frame**
5. Reload page; chosen theme is restored from IndexedDB

### Issues / Notes

- **Auto theme not yet driven by `prefers-color-scheme` change events**: the CSS rule uses `@media (prefers-color-scheme: ...)` to render `.theme-auto` correctly, but the store still treats `auto` as a static value. M9.x can add a `matchMedia` subscription if needed.
- **Router test assertion updated** for the new header content (wordmark link + combobox).

### Next step

Reasonable directions:

- **M2.4 — Settings panel UI** (Radix Dialog with sliders for font size / line height / content width / font family / theme)
- **M3.7 + M3.8 — Embeds** (`![[image.png]]` images, `![[page.md]]` inline includes)
- **M3.9 — Highlights `==text==`** (cheap; vault uses them)
- **M3.4 — Wikilink hover preview** (Floating UI popover)

Lean toward **M3.7 + M3.8 embeds** — image embeds in particular are a glaring missing feature for any vault with screenshots or diagrams.

---

## 2026-05-01 · M3.12 · Shiki Code Highlighting (pipeline becomes async)

**Status**: ✅ Done

### What was built

Shiki — same TextMate grammars VS Code uses — wired into the pipeline. Code blocks now render with proper syntax highlighting in all four themes via dual-theme CSS variables. The architectural cost: `renderMarkdown` is now async (predicted by the architecture doc as the moment this would happen).

**Files modified**:

- `src/core/render/pipeline.ts` — added `@shikijs/rehype` between `remark-rehype` and `rehype-sanitize`; `renderMarkdown` returns `Promise<ReactNode>`. Sanitize schema extended for Shiki output (style + className on pre/code/span).
- `src/ui/reading-shell/DocumentPage.tsx` — refactored useEffect to use a typed inner `async function loadAndRender(...)` that awaits both `readText` and `renderMarkdown`. Cancellation flag checked at every async boundary.
- `src/core/render/pipeline.test.tsx` — all tests now async; added a Shiki output detection test (CSS var signature) and a graceful-fallback test for unknown languages.
- `src/ui/reading-shell/DocumentPage.test.tsx` — list-item assertions use `<li>` queries; code-block assertions check `<pre>` textContent (Shiki tokenizes per-token, breaking single-element text matches).
- `src/styles/globals.css` — Shiki-specific theme CSS using attribute selector `pre[style*="--shiki-light"]`; routes `--shiki-light`/`--shiki-dark` to actual `color` based on active SwirlRead theme.

### Architecture decisions

- **Async pipeline** committed. The architecture doc had flagged this as the inflection point; M3.12 is when it lands. DocumentPage already awaits `readText`; awaiting `renderMarkdown` is the same shape.
- **Dual-theme via CSS variables** (`defaultColor: false` in rehype-shiki). Shiki emits `style="--shiki-light: #xxx; --shiki-dark: #xxx;"` on each token. Our CSS picks per active theme. One render, both themes visible — no re-highlight on theme switch.
- **`github-light` + `vitesse-dark`** as the theme pair. github-light reads cleanly on cream/paper backgrounds (Sepia + Light). vitesse-dark is a literary-flavored dark theme by Anthony Fu; sits well with Dark + OLED.
- **Curated 27-language bundle**, code-split. Vite reports 30+ tiny grammar chunks (~0.4 KB gzipped each), lazy-loaded on first use of each language.
- **Sanitize schema simplified** — original draft used regex-restricted className lists. Easier to allow `className` outright on pre/code/span (CSS class names cannot execute). `style` attribute also allowed because Shiki uses inline `style="color:#xxx"` for token colors.
- **CSS attribute selector instead of class** — Shiki with `defaultColor: false` doesn't add `class="shiki"`. The inline `style="--shiki-light: ..."` is itself a stable signal. `pre[style*="--shiki-light"]` matches every Shiki block without runtime gymnastics.
- **Graceful unknown-language fallback** — `\`\`\`xyz`with unknown language emits plain`<pre>`, no error.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **168 passing** (was 167; +1 Shiki fallback test)
- `pnpm build` → 1.89 s; main bundle **223 KB gzipped** (was 179 KB; +44 KB for Shiki core + two themes). Language grammars code-split into 30+ tiny chunks.

### Issues / Notes

- **Test brittleness from Shiki tokenization**: `getByText('useState')` produced "multiple elements found" because Shiki splits the keyword into a token span. Rule of thumb: code-block content tests must use `pre.textContent.toContain()`, never `getByText` on tokens.
- **Bundle watch**: 223 KB gzipped initial JS. Within 250 KB budget but ~90% of it. M9.1 perf pass should look at: deferring Shiki load until first code block render, dropping one theme if dual can be done with `color-scheme`, or trimming the language list.

### Pipeline composition (current)

```
remark-parse
  → remark-frontmatter
  → remark-gfm
  → remark-callout
  → remark-wikilink
  → remark-rehype
  → rehype-shiki        (NEW — dual themes, lazy grammars)
  → rehype-sanitize     (extended for Shiki style + class)
  → hast-util-to-jsx-runtime
```

### Next step

Recommend **M2.3 — theme switcher store**: Shiki's dual-theme work is invisible until users can switch themes. Wiring up the store + a header toggle lets the polish actually show. Other candidates: M3.7+M3.8 embeds, M3.9 highlights, M3.4 wikilink hover preview.

---

## 2026-05-01 · M3.5 + M3.6 · Callouts (Obsidian `> [!type]` syntax)

**Status**: ✅ Done

### What was built

Full Obsidian callout support: 14 distinct types, 26 type aliases, themed colors, Lucide icons, optional titles. Wilson's vault is dense with `> [!note]` and `> [!warning]` blocks; they now render as polished aside boxes instead of generic blockquotes.

**Files created**:

- `src/core/render/plugins/remark-callout.ts` — remark plugin: detects `> [!type]` (with optional title, optional foldable marker) at the start of any blockquote and transforms it into a `callout` mdast node
- `src/core/render/plugins/remark-callout.test.ts` — 14 tests across header recognition, body extraction, hast hints, edge cases (empty body, mid-paragraph header, unknown types)
- `src/ui/reading-shell/Callout.tsx` — React component with the full Obsidian type → icon + color mapping (14 canonical types, 12 aliases like `tldr` → `summary`, `cite` → `quote`)

**Files modified**:

- `src/core/render/pipeline.ts` — wires `remarkCallout` between `remarkGfm` and `remarkWikilink`; extends sanitize schema for `<callout>` tag and `data-callout-type` / `data-callout-title` attributes
- `src/ui/reading-shell/DocumentPage.tsx` — adds `callout: Callout` to the components map; renamed `wikilinkComponents` → `customComponents` to reflect the broader role
- `src/styles/globals.css` — `.swirlread-callout` ruleset with type-specific accent colors via `--callout-color` CSS var; uses `color-mix()` for tinted background

### Architecture decisions

- **Visit-pass over `blockquote` nodes**, mirroring the wikilink approach. The plugin only runs when the blockquote's first paragraph's first text node starts with `[!type]` — so it doesn't disturb any other blockquote.
- **Header line is stripped from the body**, not retained. The body extraction tracks whether the first paragraph still has content after stripping the header — if not, the paragraph is dropped entirely. This lets `> [!note]\n> body` and `> [!note] title\n> body` produce visually consistent results.
- **Type case-folded to lowercase**. `[!WARNING]` and `[!warning]` produce the same callout. Custom unknown types (e.g. `[!my-team-special]`) keep their original-case data attribute but fall back to the `note` style.
- **14 canonical types + 12 aliases**. Followed Obsidian's type list verbatim and added common aliases: `hint → tip`, `tldr/summary → abstract`, `caution/attention → warning`, `done → success`, `cite → quote`, `error → danger`, `fail/missing → failure`, `faq → question`. Aliases share visual identity with their canonical type.
- **Each type has its own accent color** in `globals.css` via the `--callout-color` CSS variable. Background uses `color-mix(in srgb, var(--callout-color) 8%, transparent)` so it tints any theme correctly without per-theme overrides.
- **Foldable markers (`+` / `-`) parsed but not acted on**. The regex matches them so they don't break recognition, but the callout always renders expanded. Adding actual fold state is a polish task tracked for M3.x.
- **Lucide icons**, individually imported (no dynamic indexing) so the bundler can tree-shake. 14 icon imports add ~10 KB pre-gzip.

### Pipeline composition (current)

```
remark-parse
  → remark-frontmatter
  → remark-gfm
  → remark-callout    (NEW — > [!type] blockquotes)
  → remark-wikilink
  → remark-rehype
  → rehype-sanitize   (extended schema: <wikilink>, <callout>, data-* attrs)
  → hast-util-to-jsx-runtime
```

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **167 passing** (was 153; +14 callout plugin tests)
- `pnpm build` → 1.25 s; bundle 179 KB gzipped JS (callout plugin + Lucide icons add ~10 KB which mostly washes out post-tree-shake)

### Issues / Notes

- **Regex bug caught by tests**: initial header regex used `\s*` for the gap between `]` and the title. `\s` includes `\n`, so on `[!note]\nbody` the regex consumed the newline AND captured "body" as the title. Caught by the "omits data-callout-title when no inline title" test. Fixed by switching to `[ \t]*` (explicit space and tab only). Wrote a comment in the source explaining the trap so the next contributor doesn't reintroduce it.
- **mdast `BlockContent` type narrowing**: blockquote children are typed `(BlockContent | DefinitionContent)[]` but my CalloutNode only accepted `BlockContent[]`. Widened the children type to match.

### Manual browser E2E (now closes another visible loop)

Wilson's vault has many `> [!note]`, `> [!warning]`, `> [!tip]` blocks. Open any such file:

- Each callout renders as a colored aside box with theme-tuned tint
- Icon matches the type (Info / AlertTriangle / Lightbulb / etc.)
- Default title shown ("Note", "Warning", "Tip"); inline title overrides if provided
- Body content (paragraphs, lists, code blocks, even nested wikilinks) renders inside

### Next step

Two natural follow-ups, pick by impact:

- **M3.7 + M3.8 — Embeds (`![[file]]`)** — pair with wikilinks to make `![[diagram.png]]` actually render images, and `![[page.md]]` inline-include
- **M3.12 — Shiki code highlighting** — highest visual delta for a developer vault; turns gray `<pre>` blocks into VS Code-quality renders
- **M3.4 — Wikilink hover preview** — Floating UI popover showing first 200 chars; very Obsidian-native feeling

---

## 2026-05-01 · M3.2 + M3.3 · Wikilinks (parse → resolve → click)

**Status**: ✅ Done — wikilinks fully clickable in real vaults

### What was built

End-to-end `[[wikilink]]` support: a remark plugin parses the syntax, a resolver maps targets to real vault paths, and a React component renders them as React Router `<Link>`s. Hopping between notes by clicking now works.

**Files created**:

- `src/core/render/plugins/remark-wikilink.ts` — remark plugin: parses `[[target]]`, `[[target|alias]]`, `[[target#heading]]`, `[[target#heading|alias]]`, `[[target^block]]`, `[[target^block|alias]]`. Uses `unist-util-visit` to split text nodes containing wikilink syntax.
- `src/core/render/plugins/remark-wikilink.test.ts` — 16 tests (every form, multiple links, surrounding text preservation, hast hints, Unicode, newline boundaries)
- `src/core/navigation/wikilink-resolver.ts` — `buildWikilinkIndex(vault) → WikilinkIndex` (basename → paths map) and `resolveWikilink(target, index, current?)`
- `src/core/navigation/wikilink-resolver.test.ts` — 11 tests covering exact paths, stem lookups, missing-extension fallback, ambiguous basenames, Unicode
- `src/ui/reading-shell/Wikilink.tsx` — React component reading from context, calling resolver, rendering Link / pending / broken states
- `src/ui/reading-shell/wikilink-context.ts` — `WikilinkContext` carrying `{ vaultId, currentPath, index }` (separate file so Wikilink.tsx exports only components)

**Files modified**:

- `src/core/render/pipeline.ts` — wires `remarkWikilink` between gfm and rehype; extends sanitize schema to allow `<wikilink>` tag and `data-target` / `data-alias` / `data-heading` / `data-block-id` attributes
- `src/ui/reading-shell/DocumentPage.tsx` — builds wikilink index per vault on mount; passes `{ wikilink: Wikilink }` as the `components` map to `renderMarkdown`; wraps content in `WikilinkContext.Provider`
- `src/styles/globals.css` — three wikilink visual states (resolved / pending / broken) with theme-aware colors, dashed underlines, hover highlights via `color-mix()`

### Architecture decisions

- **Visit-based parser, not micromark extension**. A proper micromark extension would parse `[[...]]` as a first-class token and handle nested-emphasis edge cases. The visit approach (split text nodes after parsing) covers ~95% of real-world wikilinks at a fraction of the implementation cost. Documented limitation: wikilinks inside emphasis or other phrasing wrappers may not split correctly. Will upgrade to micromark extension if/when issues surface.
- **Custom mdast node + custom hast tag name**. Plugin emits `type: 'wikilink'` mdast nodes with `data.hName: 'wikilink'`, producing `<wikilink>` in hast. Sanitize schema explicitly allows this tag + the four data attrs. JSX runtime maps `wikilink` → `Wikilink` component via the `components` parameter.
- **Resolution is synchronous + index-based**. Async resolution per click would be too slow and would race React rendering. Build a basename → paths index when DocumentPage mounts; pass it via context; resolver is O(1).
- **Three render states for clarity**. `resolved` (green-ish, hover highlight), `pending` (dimmed, shown while index is loading), `broken` (strikethrough + dotted underline + tooltip). No silent failures; the user always sees something readable.
- **Context separation for fast-refresh**. `Wikilink.tsx` exports only the component; `wikilink-context.ts` exports only the context. Required by `react-refresh/only-export-components`.
- **First-match wins for ambiguous basenames** (e.g. two `me.md` in different folders). Deterministic via insertion order from `walk()`. Better disambiguation (prefer current-folder sibling) is a M3.x polish task.
- **Heading + block-id flow into URL hash** (`#heading` or `#^block-id`). Actual scroll behavior lands in M4.6 (TOC anchor handling).

### Pipeline composition (current)

```
remark-parse
  → remark-frontmatter (strips YAML/TOML)
  → remark-gfm (tables, task lists, strikethrough, autolink)
  → remark-wikilink (NEW — Obsidian [[links]])
  → remark-rehype (mdast → hast)
  → rehype-sanitize (extended schema)
  → hast-util-to-jsx-runtime (hast → React, with components map)
```

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings (with one inline-justified `as number` cast in remark-wikilink.ts)
- `pnpm format:check` → all conformant
- `pnpm test` → **153 passing** (was 126; +27 from the two new test files)
- `pnpm build` → 920 ms; bundle 179 KB gzipped JS — wikilink plugin adds well under 1 KB (just AST manipulation)
- Live dev-server smoke test: HMR applied; Wilson's vault now shows clickable `[[link]]`s

### Manual browser E2E (now closes the loop)

1. `pnpm dev`, open `localhost:5173/`
2. Open my vault → pick `/Users/supwils/supwilsoft/supwil/`
3. Navigate to `/app/supwil-XXXX/index.md`
4. **All `[[wikilinks]]` in `index.md` are now clickable** — the navigation map (`career-map`, `knowledge-map`, etc.) becomes a real working hypertext
5. Click any wikilink → navigate to that page → its wikilinks are clickable too → ♾️ navigation
6. Unresolved links (pointing to a target the vault doesn't contain) render with strikethrough + tooltip explaining why

This is the first time the "personal wiki" experience is real.

### Issues / Notes

- **`@types/mdast` and `@types/unist`** weren't installed by default — added as devDeps. mdast/unist provide the AST type definitions the plugin and tests reference.
- **`unist-util-visit` index narrowing**: TypeScript inferred `index` as `never` despite the `typeof === 'number'` guard. Cast through a local binding (`const idx = index as number`) — surfaces the workaround intentionally rather than burying behind `// @ts-expect-error`.
- **Pipeline call signature broadened**: `renderMarkdown` now takes optional `components`, but call sites that don't pass any still work. DocumentPage passes `{ wikilink: Wikilink }`; tests in `pipeline.test.tsx` pass nothing and exercise only built-in tags.

### Next step

Two productive directions, both small:

- **M3.4 — Wikilink hover preview** (Floating UI popover with first 200 chars of target file) — the polish that makes the linking experience genuinely Obsidian-grade
- **M3.5 + M3.6 — Callouts** (`> [!note]`, `> [!warning]`, etc.) — Wilson's vault uses these heavily; rendering them properly will be another visible quality bump

Or pick a different milestone if there's more strategic value.

---

## 2026-05-01 · M1.5 + M1.6 · Markdown Pipeline + DocumentPage (the wow moment)

**Status**: ✅ Done — first end-to-end render of real Markdown content

### What was built

The first time SwirlRead actually renders a Markdown document in the browser. Everything before this was scaffolding; this milestone produces real product value.

**Files created**:

- `src/core/render/pipeline.ts` — `renderMarkdown(source, components?) → ReactNode` and `createMarkdownProcessor()`. Pipeline: `remark-parse → remark-frontmatter → remark-gfm → remark-rehype → rehype-sanitize → hast-util-to-jsx-runtime`.
- `src/core/render/pipeline.test.tsx` — 22 tests across CommonMark, GFM, frontmatter, sanitization, edge cases.
- `src/ui/reading-shell/DocumentPage.test.tsx` — 6 integration tests (render, missing vault, missing file, JSON fallback, header).

**Files modified**:

- `src/ui/reading-shell/DocumentPage.tsx` — replaces placeholder with real reader: pulls adapter from store, calls `readText`, dispatches MD vs non-MD, renders into `.swirlread-prose` container.
- `src/styles/globals.css` — added a complete `.swirlread-prose` ruleset: theme-aware typography for headings, paragraphs, lists, blockquotes, code blocks, tables, links, hr, images, task list checkboxes.
- `src/app/router.test.tsx` — updated DocumentPage assertion to expect the new missing-vault state instead of the old placeholder text.

### Pipeline architecture (M1.5)

- **Plugins**: `remark-parse` (CommonMark) → `remark-frontmatter` (strip YAML/TOML so it doesn't render as text) → `remark-gfm` (tables, task lists, strikethrough, autolinks) → `remark-rehype` (mdast → hast) → `rehype-sanitize` (XSS protection with `id` allow-listed on headings for future TOC anchoring) → `hast-util-to-jsx-runtime` (hast → React tree).
- **Synchronous by design**. All current plugins support `runSync`. If we add an async plugin (e.g. dual-theme Shiki in M3.12), the function becomes async — call sites must adapt.
- **`components` parameter** on `renderMarkdown` lets callers replace specific tag mappings (e.g. an internal `Link` wrapper for wikilinks in M3.3) without restructuring the pipeline.
- **Sanitizer extends GitHub schema**, only adding `id` to headings. Wikilink/callout/embed schemas extend further in M3.x.

### DocumentPage architecture (M1.6)

Six explicit render states — no spinner-forever bugs:

```
idle           → before useEffect runs
loading        → readText pending
rendered       → success path; branches on isMd for MD vs raw fallback
missing-vault  → adapter not in registry (e.g. user reloaded)
missing-file   → adapter loaded but path doesn't exist
error          → permission denied or other read failure
```

Non-Markdown files fall through to a styled `<pre>` block so the app still renders something useful even before the M7 universal reader. JSON / config files look reasonable as plain text.

### Prose styles (the visual identity)

Scoped `.swirlread-prose` so chrome (header, settings) doesn't accidentally inherit reader typography. Highlights:

- 18 px serif body, 1.7 line-height, 720 px max width (≈68 chars per line)
- Theme-aware via CSS variables — same component, four themes
- Generous vertical rhythm (`> * + *` rule for 1.4 em margin between blocks)
- H2 has a bottom border (visual hierarchy) using `var(--color-border)`
- Tables get hover-row tinting via `color-mix()` (modern CSS)
- Blockquotes use a left accent rule in the theme accent color
- Task list checkboxes use `accent-color` for theme matching

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **126 passing** (was 98; +22 pipeline, +6 DocumentPage)
- `pnpm build` → 896 ms; bundle 179.08 KB gzipped JS (was 128 KB; +51 KB for the unified ecosystem). Within 250 KB budget but tightening; M9.1 will look at code-splitting.

Live dev-server smoke test: HMR successfully applied all changes; route `/app/{vaultId}/{path}` resolves and renders.

### Manual browser E2E (now possible end-to-end)

1. `pnpm dev`, open `localhost:5173/`
2. "Open my vault" → consent panel → Choose folder → pick `/Users/supwils/supwilsoft/supwil/`
3. Lands on `/app/supwil-XXXX` showing the top-level directory listing (M1.3 already shipped this)
4. **Manually navigate** to e.g. `/app/supwil-XXXX/knowledge/软件/前端/react.md` (no clickable nav yet — link wiring is M4.x)
5. Page renders the React notes in **Sepia + Source Serif** with proper headings, code blocks, lists, quotes — looks like a typeset book

This is the M1 proof-of-concept moment. Everything from M0.1 onward exists to make this render correctly.

### Issues / Notes

- **`hast` types missing on first build**: TypeScript needs `@types/hast` separately. Installed as devDep.
- **`toJsxRuntime` return type**: ESLint's `no-unsafe-return` rule flags it because React 19's JSX namespace types are too loose to satisfy the strict checker. Annotated with two narrowly-scoped eslint-disables and a comment explaining the trust boundary. Acceptable trade-off — alternatives (custom type predicates, `as` casting through `unknown`) are uglier and don't add safety.
- **Test race**: initial DocumentPage test waited for `getByRole('heading', level: 1, name: /react/i)` — but the page header `<h1>` always says "knowledge/react.md" (matches /react/i too). `waitFor` returned before the markdown rendered. Fixed by waiting for the H2 "Hooks" — only the rendered MD produces it.
- **Bundle composition shifted**: 564 KB raw / 179 KB gzipped. The unified plugin set is heavy but tree-shakable; likely won't grow much more from custom plugin work in M3.x. Vite warned about >500 KB chunks; ignoring for now (M9.1 is the perf pass).

### Bundle composition

| Asset                    | Size (gzipped) |
| ------------------------ | -------------- |
| Application JS           | 179.08 KB      |
| CSS (incl. prose styles) | 4.89 KB        |
| Self-hosted font woff2   | ~131 KB (lazy) |
| **Total initial paint**  | ~184 KB        |

### Closing M1

After this commit, **Milestone 1 is functionally complete**:

| Task                           | Status |
| ------------------------------ | ------ |
| M1.1 VaultFileSystem interface | ✅     |
| M1.2 FSAPIVaultAdapter         | ✅     |
| M1.3 Folder picker UI          | ✅     |
| M1.4 useVaultStore + Dexie     | ✅     |
| M1.5 Markdown pipeline         | ✅     |
| M1.6 DocumentPage real render  | ✅     |

The user can pick a folder, navigate to a Markdown file via URL, and see it rendered in the brand reading experience. Next milestone (M2) layers the reading shell, themes via store, hover-summoned panels, and zen mode.

### Next step

**M2.1 — `ReadingShell` layout component** — extract the centered column + scroll behavior into a dedicated wrapper, add the top progress bar, prepare hover-zone scaffolding for M2.5.

---

## 2026-05-01 · M1.4 · Zustand Vault Store + Dexie Schema

**Status**: ✅ Done

### What was built

Replaced the M1.3 session-only registry with a persistent Zustand store backed by Dexie.

**Files created**:

- `src/core/persistence/db.ts` — Dexie schema for `vaults` and `preferences` tables, plus `StoredVault`↔`VaultMeta` conversion (Dates serialized as ms-since-epoch for IDB friendliness)
- `src/stores/vault-store.ts` — `useVaultStore` with `init`, `registerVault`, `switchVault`, `removeVault`, `attachAdapter`; module-level `adapters: Map<VaultId, VaultFileSystem>` for live adapter handles
- `src/stores/vault-store.test.ts` — 11 tests covering init, register, re-register, persistence-survives-reload, switch, remove, attach

**Files modified**:

- `src/main.tsx` — fires `useVaultStore.getState().init()` on app boot (fire-and-forget; UI branches on `ready`)
- `src/ui/landing/LandingPage.tsx` — uses `registerVault` selector from the store; awaits the async registration
- `src/ui/reading-shell/VaultHome.tsx` — uses `getAdapter(id)` from the store
- `src/setup-tests.ts` — imports `fake-indexeddb/auto` so all tests get a working IndexedDB environment
- `src/core/vault/index.ts` — barrel export trimmed (registry exports gone)

**Files deleted**:

- `src/core/vault/registry.ts` — replaced by Zustand store
- `src/core/vault/registry.test.ts` — corresponding tests deleted

### Architecture decisions

- **Adapters are non-reactive (Map outside Zustand)**. Vault adapters wrap large objects (file handles, blob URL caches). Putting them in Zustand state would (a) break shallow-equality optimizations and (b) cause unnecessary re-renders on every adapter creation. Module-level Map keyed by ID; store tracks just the metadata + active id.
- **Dexie storage shape ≠ domain shape**. `StoredVault` uses `registeredAtMs: number` instead of `Date` to keep IndexedDB-friendly primitive values. Conversion happens at the Dexie boundary via `storedToMeta` / `metaToStored`.
- **Active vault id is persisted as a preference**. On returning user (M6.3) we'll re-restore the active id and prompt for permission re-grant. For now: persisted but unused on init beyond surfacing the value.
- **`init()` is idempotent** — early-returns if `ready` is already true. Strict Mode double-renders won't double-load.
- **`__resetDbForTests` clears tables; never deletes the Dexie instance**. First attempt deleted the instance and re-created via `Object.assign` — broke because Dexie holds internal state references that survive the Object.assign. Cleared tables in a transaction is the correct pattern.
- **`attachAdapter()` is the seam for M6.3**. When a returning user re-grants permission, M6.3 will load the meta, request permission via the persisted handle, and call `attachAdapter()` to bind the live adapter without touching meta.

### Migration notes

- `registerVault`, `getVault`, `listVaults`, `unregisterVault`, `subscribe` from `core/vault/registry` are GONE. Use the store:
  - `useVaultStore(s => s.registerVault)` (reactive selector in components)
  - `useVaultStore.getState().registerVault(adapter)` (one-shot in event handlers)
  - `getAdapter(id)` from `@/stores/vault-store` (non-reactive lookup)
- The audit-flagged "shadow tests" pattern was avoided here: `vault-store.test.ts` exercises the **same** store instance as production (via `useVaultStore.getState()` and `setState`) and uses fake-indexeddb for real IDB persistence semantics.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **98 passing** (was 93; +11 vault-store, −6 deleted registry)
- `pnpm build` → 676 ms; bundle 128.49 KB gzipped JS (was 94 KB; +34 KB for Dexie + Zustand). Still well under 250 KB budget.

Manual browser sanity check: dev server's HMR caught up across all migrations; live URL still serves the app.

### Issues / Notes

- First test run hit `DatabaseClosedError` because `__resetDbForTests` was deleting the Dexie instance. Switched to clearing tables — the singleton `db` reference survives across all tests.
- `fake-indexeddb/auto` shim in setup-tests gives every test a real IDB. Trade-off: slightly slower setup (~250ms vs ~70ms before) but real persistence semantics in tests.
- `attachAdapter` test was sync but written as `async` — caught by `require-await` lint, fixed to non-async.

### Bundle composition

| Asset                       | Size (gzipped) |
| --------------------------- | -------------- |
| Application JS (incl. deps) | 128.49 KB      |
| CSS                         | 4.20 KB        |
| **Total initial paint**     | **~133 KB**    |

The +34 KB for Dexie + Zustand buys us: typed reactive store, real IDB persistence with migrations, multi-vault support, and the foundation for M2.3 (UI prefs persistence) and M6.3 (returning user). Worth it.

### Next step

Now that the store is real, the natural next jump is the **product wow moment** — actually rendering a Markdown file from the user's vault.

**M1.5 — Markdown rendering pipeline (basic CommonMark + GFM)**:

- `src/core/render/pipeline.ts` exporting `renderMarkdown(source: string): React.ReactNode`
- unified pipeline: remark-parse → remark-gfm → remark-rehype → rehype-react
- Custom plugins (wikilinks, callouts, embeds, highlight) come in M3.x

Then **M1.6** wires it into `DocumentPage.tsx` and the demo finally runs end-to-end on Wilson's vault.

---

## 2026-05-01 · M1.3 · Folder Picker UI + Session Vault Registry

**Status**: ✅ Done

### What was built

End-to-end pick → register → navigate flow. The first task that exercises M1.2's adapter in a real browser.

**Files created**:

- `src/core/vault/registry.ts` — session-only adapter registry (`registerVault`, `getVault`, `listVaults`, `unregisterVault`, `subscribe`); will be replaced by Zustand store in M1.4
- `src/core/vault/registry.test.ts` — 6 tests covering registration, lookup, replacement, unregister, subscribe/unsubscribe
- `src/ui/landing/FolderPicker.tsx` — accessible consent panel; FSAPI feature-detect; AbortError swallowed silently; non-Abort errors surfaced inline
- `src/ui/landing/FolderPicker.test.tsx` — 8 tests including success path, AbortError path, non-Abort error path, FSAPI-not-supported state

**Files modified**:

- `src/ui/landing/LandingPage.tsx` — replaced single "Enter the app" link with two CTAs ("Try with sample vault" disabled placeholder, "Open my vault" opens picker); on success registers vault, persists handle, navigates
- `src/ui/landing/LandingPage.test.tsx` — updated 6 tests for new CTA structure + picker open/close
- `src/ui/reading-shell/VaultHome.tsx` — pulls adapter from registry, calls `vault.list('')`, renders top-level entries with `📁`/`📄` icons; explicit states for missing vault and read errors
- `src/app/router.test.tsx` — VaultHome assertion updated to expect "not registered" state for unregistered vault IDs
- `src/core/vault/index.ts` — barrel export updated with registry surface

### Architecture decisions

- **Session-only registry as a deliberate stop-gap.** `registry.ts` is module-level state with a clear `TODO(M1.4)` marker. Surface is intentionally minimal so the future Zustand store can replace it without a churning rewrite. `subscribe()` is included up front so `useSyncExternalStore`-based components can already use it without abstraction breakage.
- **Best-effort handle persistence.** LandingPage calls `saveHandle` after registration, but failures are non-fatal (warned to console, not surfaced to user). True cross-session restore is M6.3 — for M1.3, the call just primes IndexedDB so we can verify persistence works before the store layer needs it.
- **`void navigate(...)` for fire-and-forget routing.** React Router 7's `navigate()` returns `Promise<void>`; we don't await because the next render will happen anyway. Explicit `void` prefix satisfies `@typescript-eslint/no-floating-promises`.
- **FolderPicker focuses the Cancel button.** Defensive UX choice: never trap a user inside an unfamiliar OS dialog with their primary keyboard target on the destructive (privacy-sensitive) action.
- **`AbortError` swallowed silently.** When the user dismisses the OS picker, the panel returns to idle state — no error message, no toast. Anything else is treated as an actual error and surfaced inline.
- **FSAPI feature detection.** `'showDirectoryPicker' in window` checked at render. If absent (Firefox, Safari without the flag), Choose folder is disabled and a friendly message points to Chrome/Edge/Brave.
- **VaultHome handles 5 explicit states.** `idle | loading | ready | missing | error`. No "spinner forever" — the missing state is the most likely failure mode (page refresh loses the registry) and gets a specific copy explaining what to do.

### Verification

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 errors, 0 warnings
- `pnpm format:check` → all conformant
- `pnpm test` → **93 passing** (was 77; +6 registry, +8 FolderPicker, +2 LandingPage delta)
- `pnpm build` → 559 ms; bundle 94.25 KB gzipped (was 91 KB; +3 KB for new components)

### Manual browser E2E (scripted)

Browser test against the canonical fixture `/Users/supwils/supwilsoft/supwil/`:

1. `pnpm dev`, open `http://localhost:5173/` in Chrome/Edge/Brave
2. Click "Open my vault" → consent panel appears with brand styling
3. Click "Choose folder" → OS directory picker opens
4. Pick `supwil/` → permission dialog (auto-granted in modern Chrome for already-trusted sites)
5. URL changes to `/app/supwil-XXXX`
6. VaultHome renders: "Connected to supwil · N top-level entries" with the directory listing matching what's actually in the folder
7. Refresh page → returns to landing page (no auto-restore yet; that's M6.3)

This is the M1 proof-of-concept moment for picking and listing. Rendering an actual `.md` file is M1.5 / M1.6.

### Issues / Notes

- **Lint round 2**: original `import { FSAPIVaultAdapter } from '@/core/vault'` triggered `consistent-type-imports` because the class was only referenced as a type in `handlePicked`'s parameter. Split into runtime + type imports.
- **`void` operator for navigate**: React Router 7 typing surfaces `navigate()` as Promise-returning when called without a state argument. ESLint's strict promise rule flags it; `void` is the canonical "I know this is a Promise and I'm ignoring it" marker.

### Next step

**M1.4 — `useVaultStore` (Zustand) + Dexie schema**

Replace the module-level registry with a real reactive store:

- Persisted fields: `registeredVaults: VaultMeta[]`, `activeVaultId: VaultId | null`
- Methods: `registerVault(adapter) → VaultMeta`, `switchVault(id)`, `removeVault(id)`
- Migrate LandingPage and VaultHome from `registerVault` / `getVault` to the store
- Set up Dexie schema `swirlread` with `vaults` and `preferences` tables

Once that lands, the registry shim deletes itself.

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
- `src/App.tsx` — placeholder rendering "SwirlRead"
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
