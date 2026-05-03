# SwirlRead — Reader Experience Craft Plan

> Status: Proposed · Last updated: 2026-05-02

This document turns the product principle "reading first" into concrete UI and interaction work.

SwirlRead should not win by having more features than Obsidian, GitHub, or VS Code preview. It should win because opening and reading a personal Markdown knowledge base feels calmer, clearer, and more natural than in those tools.

The design target:

> SwirlRead is not a place where Markdown is merely rendered. It is a dedicated reading room for a user's own knowledge.

---

## Product Experience Principles

### 1. Calm by default

The default screen should privilege the document. Chrome, sidebars, metadata, and navigation should be available without visually competing with the prose.

### 2. Context when needed

Tools should appear when they answer a reader's immediate question:

- Where am I?
- What section am I in?
- What should I read next?
- What references this page?
- How do I get back?

### 3. Recoverable movement

The user should never feel lost. Every transition should make it obvious where the user came from, where they are, and how to return.

### 4. Repair, not authoring

Editing, when added, should feel like a quick repair inside a reading session, not a separate writing workspace.

---

## Experience Gap In The Current App

The current app has many correct building blocks:

- file tree
- TOC
- backlinks
- recent files
- command palette
- themes
- settings
- zen mode
- Markdown feature coverage

The main gap is not capability. The gap is **craft**:

- document pages still expose file-path thinking too strongly
- the app header feels more like persistent tool chrome than reading chrome
- the file tree is still primarily a filesystem browser
- TOC and backlinks are useful, but not yet a unified reading context
- command palette is functional, but can become the core navigation surface
- loading / empty / error states are still too engineering-oriented

This plan focuses on turning these features into a coherent reading experience.

---

## Phase RX1 — Document Page Craft

### Goal

Make every document open like an article, not a file record.

### Changes

- Use the first Markdown H1 as the visible page title when present
- Fall back to filename without extension
- Move raw path into a quiet breadcrumb row
- Make `vaultId` secondary or hide it when the vault switcher already gives context
- Keep frontmatter visible only when it helps reading; collapse or soften raw metadata by default
- Preserve the reading column width and typography rhythm during loading

### Implementation notes

- Add a small utility that derives display metadata from `raw`, `frontmatter`, and `filePath`
- Reuse the heading extraction logic where possible, but do not require rendered DOM for the page title
- Keep route URLs unchanged; this is presentation only

### Acceptance criteria

- A Markdown file with `# My Note` displays `My Note` as the document title
- A Markdown file without H1 displays a cleaned filename
- The full path remains accessible but does not dominate the visual hierarchy
- Loading does not cause large layout jumps

---

## Phase RX2 — Reading Chrome Modes

### Goal

Make the shell feel like a reading app instead of a fixed admin toolbar.

### Changes

- Define three chrome levels:
  - `reading`: minimal persistent chrome
  - `working`: full toolbar and side navigation available
  - `zen`: content only
- Make sidebars and header feel summoned rather than permanently dominant
- Keep keyboard access reliable: command palette, settings, TOC, file tree, and zen mode must remain available
- Ensure chrome behavior respects editable targets and future edit mode

### Implementation notes

- Extend `useUIStore` only if the mode cannot be derived from existing state
- Avoid complex animation first; use opacity, transform, and pointer-event transitions
- Do not hide essential controls on focus-only or keyboard-only users

### Acceptance criteria

- Reading a long note does not require staring at a heavy toolbar
- Moving to top/side controls remains predictable
- Zen mode has a visibly cleaner, more immersive layout than normal reading
- Tests cover keyboard guards for shortcuts in editable targets

---

## Phase RX3 — Knowledge Navigation Sidebar

### Goal

Turn the left rail from a file browser into a reading navigator.

### Proposed structure

1. `Continue`
2. `Recent`
3. `Sections`
4. `Files`

### Changes

- Add a `Continue` item for the most recent file with saved scroll position
- Keep `Recent`, but make it read as a continuation surface rather than a raw list
- Promote top-level detected sections above the full tree
- Keep the full file tree as a fallback for precise navigation

### Implementation notes

- Reuse existing recent files and scroll memory data
- Reuse section detection from `section-detector`
- Do not remove the existing tree; reorganize presentation first
- Keep lazy loading and cache behavior unchanged

### Acceptance criteria

- Returning users can resume reading in one click
- Top-level knowledge sections are visible without expanding raw directories
- Full filesystem navigation remains available
- Active file highlighting still works

---

## Phase RX4 — Context Rail

### Goal

Make the right rail answer "where am I in this document and what is nearby?"

### Changes

- Keep TOC as the primary content
- Add compact, non-dominant context modules:
  - current section
  - page tags
  - backlinks count
  - referenced notes count
- Hide empty modules rather than showing noisy empty states
- Let backlinks remain detailed at the document bottom, but surface a lightweight summary in the rail

### Implementation notes

- Do not make the right rail a dashboard
- Keep the default rail scannable in under two seconds
- Favor progressive disclosure over always-visible lists

### Acceptance criteria

- Documents without headings do not show a distracting "No headings" rail
- Documents with headings clearly show active section
- Tags and backlinks become discoverable without pushing content down
- The rail still feels secondary to the document

---

## Phase RX5 — Backlinks As Reading Continuation

### Goal

Make backlinks help the reader decide what to read next.

### Changes

- Keep backlink snippets concise
- Highlight or emphasize the sentence around the reference
- Sort backlinks by likely usefulness:
  - recent source documents
  - same section
  - stronger contextual snippets
- Hide the panel entirely when empty, or show a minimal collapsed affordance

### Implementation notes

- Start with presentation and sorting improvements before changing the backlinks index
- Avoid heavy graph UI
- Keep snippets readable in both English and Chinese

### Acceptance criteria

- Backlinks feel like suggested next reading, not database rows
- Empty backlink state does not interrupt reading
- Snippets provide enough context to decide whether to open the source

---

## Phase RX6 — Command Palette As Primary Navigation

### Goal

Make `Cmd/Ctrl + K` the fastest way to move through the vault.

### Grouping model

- `Continue`
- `Files`
- `Headings`
- `Tags`
- `Backlinks`
- `Search`
- `Actions`

### Changes

- Show richer result metadata:
  - section
  - path
  - snippet
  - last opened time
- Add current-document heading navigation
- Add current-document backlink navigation
- Keep prefix routing for full-text search

### Implementation notes

- Continue lazy-loading heavy search code
- Do not make the initial palette slow
- Preserve keyboard-first ergonomics

### Acceptance criteria

- User can jump to a current heading without touching the mouse
- User can jump to a recent file or section from the first screen
- Full-text search remains available but does not dominate the default palette

---

## Phase RX7 — Productized States

### Goal

Make loading, empty, permission, and error states feel intentional.

### Changes

- Replace plain text loading with stable reading-column skeletons
- Auto-hide or soften empty rails
- Make permission states explicit and trust-building:
  - content stays local
  - browser needs folder permission again
  - user can reauthorize from a clear action
- Give unsupported-browser states a concrete next step

### Acceptance criteria

- Loading states do not cause layout jumps
- Empty states do not compete with content
- Permission errors explain what happened and what to do next
- Error UI uses the same visual language as the rest of the reader

---

## Phase RX8 — Quick Edit Visual Integration

### Goal

When lightweight editing lands, make it feel like a reading repair mode.

### Changes

- Add a quiet `Edit` action in the document toolbar
- Use CodeMirror 6 with SwirlRead theme variables
- Keep the editor in the same page context and reading width family
- Show dirty state clearly but calmly
- Save returns directly to rendered reading mode

### Acceptance criteria

- Edit mode does not look like a separate IDE
- Save / cancel flows are obvious
- Dirty state protects user work without creating anxiety
- Reader returns to the rendered document after save

---

## Suggested Implementation Order

### Now / Current Phase

1. RX1 Document Page Craft
2. RX7 Productized States
3. RX3 Knowledge Navigation Sidebar
4. RX4 Context Rail
5. RX6 Command Palette Navigation polish

### Later Phase

1. RX2 Reading Chrome Modes if it requires larger layout refactoring
2. RX5 Backlinks ranking if it requires index changes
3. RX8 Quick Edit visual integration alongside the editing implementation

This order keeps the work close to the current codebase and improves the daily reading experience before adding new product surfaces.

---

## Development Agent Prompt

Use this prompt when asking another coding agent to implement the first experience pass:

```text
You are working in /Users/supwils/supwilsoft/swil/swirl-read.

Goal: implement the first pass of SwirlRead's reader-experience craft plan. The product must feel like a dedicated reading room for Markdown knowledge, not a generic file viewer.

Read these files first:
- CLAUDE.md
- docs/design/vision.md
- docs/design/reading-experience.md
- docs/develop/reader-experience-craft-plan.md
- docs/develop/architecture-overview.md
- docs/develop/engineering-principles.md

Scope for this pass:
1. Implement RX1 Document Page Craft.
   - Display the first Markdown H1 as the page title when available.
   - Fall back to a cleaned filename when no H1 exists.
   - Move raw vault/path information into a quiet breadcrumb/metadata row.
   - Keep route URLs unchanged.
   - Do not break TOC heading extraction, frontmatter display, backlinks indexing, or scroll memory.

2. Implement RX7 Productized States where it touches DocumentPage.
   - Replace plain "Reading..." with a stable reading-column loading skeleton.
   - Keep missing-file, missing-vault, and error states visually calm and useful.
   - Do not add new dependencies unless clearly justified.

3. Add focused tests.
   - H1-derived title.
   - filename fallback title.
   - loading state shape.
   - existing render behavior still passes.

Constraints:
- Preserve local-first, read-first behavior.
- Do not add editing in this pass.
- Do not refactor unrelated stores or routing.
- Do not remove existing markdown features.
- Keep UI consistent with existing theme variables and typography.
- Use existing helpers/patterns where possible.

Before finishing, run:
- pnpm test -- DocumentPage
- pnpm typecheck

Final response should summarize changed files, behavior changes, and any tests that could not be run.
```

---

## Review Checklist

Use this checklist when reviewing any UX craft PR:

- Does the document feel more like an article than a file?
- Did any chrome become visually louder than the content?
- Can a keyboard-only user still reach the same controls?
- Does the layout remain stable during loading and route changes?
- Are empty states quiet?
- Does navigation still preserve vault-relative URLs?
- Are Chinese and English paths/titles handled cleanly?
- Did the change avoid introducing editor-like surfaces into read mode?

If the answer to any of these is "no", the change needs another pass.
