# SwilRead — Work Log

> Reverse chronological log of implementation work. Most recent entries first.

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
- `src/styles/globals.css` — Shiki-specific theme CSS using attribute selector `pre[style*="--shiki-light"]`; routes `--shiki-light`/`--shiki-dark` to actual `color` based on active SwilRead theme.

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
- `src/styles/globals.css` — `.swilread-callout` ruleset with type-specific accent colors via `--callout-color` CSS var; uses `color-mix()` for tinted background

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

The first time SwilRead actually renders a Markdown document in the browser. Everything before this was scaffolding; this milestone produces real product value.

**Files created**:

- `src/core/render/pipeline.ts` — `renderMarkdown(source, components?) → ReactNode` and `createMarkdownProcessor()`. Pipeline: `remark-parse → remark-frontmatter → remark-gfm → remark-rehype → rehype-sanitize → hast-util-to-jsx-runtime`.
- `src/core/render/pipeline.test.tsx` — 22 tests across CommonMark, GFM, frontmatter, sanitization, edge cases.
- `src/ui/reading-shell/DocumentPage.test.tsx` — 6 integration tests (render, missing vault, missing file, JSON fallback, header).

**Files modified**:

- `src/ui/reading-shell/DocumentPage.tsx` — replaces placeholder with real reader: pulls adapter from store, calls `readText`, dispatches MD vs non-MD, renders into `.swilread-prose` container.
- `src/styles/globals.css` — added a complete `.swilread-prose` ruleset: theme-aware typography for headings, paragraphs, lists, blockquotes, code blocks, tables, links, hr, images, task list checkboxes.
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

Scoped `.swilread-prose` so chrome (header, settings) doesn't accidentally inherit reader typography. Highlights:

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
- Set up Dexie schema `swilread` with `vaults` and `preferences` tables

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
