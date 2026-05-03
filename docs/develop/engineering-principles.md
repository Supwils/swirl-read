# SwilRead — Engineering Principles

> Status: Decided 2026-05-01

How code is written in this project.

---

## Code Style

### TypeScript

- **Strict mode required**: `tsconfig.json` has `"strict": true`, `"noUncheckedIndexedAccess": true`
- **No `any`** without an explicit `// @reason: ...` comment justifying it
- **Prefer `type` over `interface`** for unions and props; use `interface` for extensible object shapes
- **Use `as const`** for literal arrays / objects
- **No `enum`** — use `const` objects with `as const`
- **Function components only** — no class components

### Naming

- **Components**: PascalCase (`ReadingShell`, `CommandPalette`)
- **Hooks**: `useFooBar` (camelCase with `use` prefix)
- **Files**: kebab-case for non-components (`vault-fs.ts`), PascalCase for components (`ReadingShell.tsx`)
- **Stores**: `useFooStore`
- **Types**: PascalCase
- **Constants**: SCREAMING_SNAKE for true constants; camelCase for derived values

### Imports

- Absolute imports via `@/` alias (configured in `vite.config.ts` and `tsconfig.json`)
- Group order: external → `@/core/...` → `@/ui/...` → `@/stores/...` → `@/utils/...` → relative
- No barrel imports for performance-sensitive modules (Shiki, Mermaid, KaTeX)

### Comments

- **Default to none.** Variable names should explain intent.
- Comments are for **why**, not **what**. Bad: `// increment counter`. Good: `// FSAPI requires user gesture; defer to next click`.
- No JSDoc on internal functions. Use it only on exported APIs of `core/`.
- No `TODO`s in committed code without an associated GitHub issue number.

---

## React Patterns

### Component Structure

```tsx
// Good
export function ReadingShell({ children }: { children: React.ReactNode }) {
  const theme = useUIStore(s => s.theme)
  // ...
}

// Bad — destructuring everything from store causes re-renders
export function ReadingShell({ children }: { children: React.ReactNode }) {
  const { theme, fontSize, lineHeight, fileTreeOpen, ... } = useUIStore()
}
```

Use **selectors** with Zustand to subscribe to only what you need.

### Effects

- Avoid `useEffect` for derived state — use `useMemo` or compute during render
- Effects are for **synchronization with external systems** (DOM, IndexedDB, network)
- Always include cleanup if subscribing to anything

### Memoization

- Don't preemptively `useMemo` / `useCallback` — measure first
- Only memoize when there's a real perf issue or when crossing a memo boundary
- React 19's compiler handles much of this automatically

### Async

- Use Suspense for data fetching where it makes sense
- Use `use(promise)` for one-shot async values
- Show explicit loading states; never spinners-by-default

---

## Architecture Rules

These are enforced via lint rules where possible (`eslint-plugin-import` + custom rules):

1. `core/` modules **never import** from `ui/` or `stores/`
2. `ui/` modules **never directly import** from `core/`; go through `stores/` or `hooks/`
3. `themes/` is a leaf module — no imports from elsewhere in the app
4. `utils/` may not import from `core/`, `ui/`, `stores/`

---

## Error Handling

- **Errors are first-class UI**: design every error state as a component, not a `console.error`
- **Never silently swallow errors** — at minimum, surface to the user via toast
- **Validate at boundaries** (FSAPI calls, user input, parsed YAML); trust internal code
- **No `try/catch` with empty catch blocks**

---

## Performance Discipline

- Long lists: virtualize (use `@tanstack/react-virtual` if needed)
- Heavy computation: Web Worker
- Large bundle imports: `import()` lazy
- Images: native `loading="lazy"`
- Don't preemptively optimize — measure first with React DevTools profiler and Lighthouse

---

## File-size discipline

> **Soft ceiling: 500 lines per source file** (`.ts` / `.tsx`). The
> threshold is heuristic, not hard — exceeding it is allowed when the
> file's responsibility is genuinely cohesive and a split would create
> more friction than clarity (deep prop drilling, helper-export gymnastics
> for `react-refresh`). When you cross 500 lines, **document the split
> plan or the explicit exemption** in `audit-YYYY-MM-DD.md`.

Why the rule:

- Files over ~500 lines stop fitting comfortably on one screen during
  review; reviewers skim instead of read, and bugs slip through.
- Large component files concentrate too many responsibilities. Editing
  one block triggers re-renders / re-tests / merge conflicts on every
  unrelated block.
- The `react-refresh` lint rule (`react-refresh/only-export-components`)
  already forces helper extraction for components — large files are
  usually a sign helpers should have been extracted earlier.

Practical guidance:

- **Components** trend smaller. Aim for 100–250 LOC per `.tsx` file. If
  a JSX tree spans hundreds of lines, look for natural sub-components.
- **Stores** can run a little longer (250–400 LOC) because state +
  actions + selectors live together for clarity.
- **Pure-logic modules** (`core/*`) are fine up to 500 LOC if focused on
  one concept; over that, split by sub-concept (e.g. `backlinks/build.ts`
  - `backlinks/query.ts`).
- **Data files** (`sample-content.ts`, generated fixtures) are exempt —
  they're tables, not logic.
- **CSS** has no fixed cap but follows the same instinct: a stylesheet
  over ~ 800 LOC needs sectioning at minimum and is a candidate for
  splitting by feature into multiple files imported from a shim.

How to handle existing offenders: see the active backlog in
`docs/develop/audit-2026-05-02.md` § Section B. New code that lands
above the threshold without a documented plan should be flagged in PR
review.

Mechanically: `find src -name '*.ts*' ! -name '*.test.*' -exec wc -l {} \;`
gives a sortable census. Re-run on a quarterly cadence and refresh the
backlog.

---

## Testing Philosophy

- **Unit tests** for `core/` modules — they're pure logic, easy to test
- **Component tests** for complex UI behavior (command palette, search results)
- **E2E tests** for critical paths: open vault, render document, navigate, search
- **No tests for trivial code** (don't test `<Button>` renders text)
- **Use the user's actual vault** as a fixture in CI when possible (read-only, anonymized snapshot)

---

## Accessibility

- All interactive elements reachable via keyboard
- Focus states are visible (not just hover)
- Sufficient color contrast in all themes (use Lighthouse to verify)
- Screen reader: semantic HTML; ARIA only where HTML doesn't suffice
- Reduced motion: respect `prefers-reduced-motion` for animations

---

## Definition of Done (per task)

A task is "done" when:

1. ✅ Code is written and matches the architectural module placement
2. ✅ TypeScript compiles with no errors
3. ✅ ESLint passes
4. ✅ Unit tests for new logic pass
5. ✅ Manually verified against the user's vault (`/Users/supwils/supwilsoft/supwil/`) where applicable
6. ✅ No visual regressions (eyeball check on Sepia theme + dark mode)
7. ✅ Documentation updated if the task changed architecture or public APIs

---

## Git Workflow

- Branch per task: `task/M3.2-wikilink-rendering`
- Commit messages: Present-tense imperative, prefix with task ID: `M3.2 add wikilink remark plugin`
- One PR per task milestone (not per task) — keeps reviews focused
- Squash on merge

---

## Common Pitfalls to Avoid

- **Don't** import the user's vault path into the app — that's a fixture, not a config
- **Don't** add a setting for everything — be opinionated; users want defaults
- **Don't** install a library before checking the tech-stack doc
- **Don't** use `dangerouslySetInnerHTML` outside the sanitized rehype output
- **Don't** add toast notifications for routine actions (only for errors and rare success states)
- **Don't** ship code that crashes on edge cases listed in `rendering-spec.md`
