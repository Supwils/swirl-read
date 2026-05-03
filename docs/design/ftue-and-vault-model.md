# SwirlRead — First-Time UX & Vault Model

> Status: Decided 2026-05-01 · Living document

This document covers two intertwined topics:

1. **First-time user experience** — the first 60 seconds determine whether a user stays
2. **Vault model** — how SwirlRead thinks about structure, both within one vault and across multiple

---

## Part 1: First-Time User Experience

### Landing Page Strategy: Hybrid Single-Page

The user lands on `swirlread.app` and sees:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                       SwirlRead                              │
│                                                             │
│         Read your knowledge. Beautifully.                   │
│                                                             │
│      A local-first reader for your Markdown vault.          │
│                                                             │
│                                                             │
│   ┌─────────────────────────┐  ┌──────────────────────┐    │
│   │ ✨ Try with sample      │  │ 📁 Open my vault     │    │
│   └─────────────────────────┘  └──────────────────────┘    │
│                                                             │
│                                                             │
│              [Single product screenshot/gif]                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

       ↓ scroll down for features ↓

┌─────────────────────────────────────────────────────────────┐
│ Why SwirlRead                                                │
│                                                             │
│  • Beautiful reading, not editing                           │
│  • Your files stay on your device                           │
│  • Works with Obsidian, Logseq, or plain folders            │
│  • Zero setup, no account                                   │
│  • Open source                                              │
└─────────────────────────────────────────────────────────────┘
```

**Design principles for the landing page**:

- One viewport's worth of hero — no scrolling required to "get it"
- Two clear CTAs above the fold
- A single screenshot (or 3-second loop GIF) showing the product in action
- Below the fold: short feature list, no marketing fluff
- Footer: GitHub link, docs link, that's it

**No fancy SaaS aesthetic**:

- No animated gradients
- No "trusted by" logos (we're not enterprise software)
- No newsletter signup
- No cookie banner (we don't track)
- Personality: clean, confident, slightly literary — like a well-designed reading app

---

### The 30-Second First Run

```
T+0s   User opens swirlread.app
T+1s   Hero loads. Two buttons visible.
T+3s   User clicks "Try with sample vault"
T+3.5s Sample vault loaded (instant; bundled or lazy-fetched)
T+4s   Beautiful welcome page renders in immersive mode
       Sepia background, serif typography, perfectly typeset
T+8s   User scrolls through the welcome page
       Sees wikilinks (hover preview demo), a callout, a math equation
T+15s  User clicks a wikilink → smooth transition to next page
T+20s  User notices the structure: it feels like browsing a curated wiki
T+25s  User presses F (or sees the hint) → zen mode, even progress bar gone
T+30s  User exhales. They get it.
```

The goal of those 30 seconds is **not to teach features**. It's to make the user **feel** the difference between this and every Markdown viewer they've used before.

---

### Sample Vault Content Strategy

**Decision: Curated knowledge content, not a product tutorial.**

The sample vault is itself a piece of content the user wants to read. It demonstrates the product by being good content rendered well.

**Theme: "Reading in the Age of AI"** — see [`brand-and-positioning.md`](./brand-and-positioning.md) for the canonical content list and structure. (Earlier drafts of this document proposed "The Art of Reading"; the brand doc is the source of truth and supersedes that.)

The vault contains ~15 files across three sections: `reading/`, `thinking/`, `knowing/`, plus an `index.md`, `why-this-vault-exists.md`, `recommended-readings.md`, and a closing `about-swirlread.md`. Every essay subtly reinforces the brand thesis (deep reading as a counter to passive AI consumption) without lecturing.

**Why this content** (in either earlier or final form):

- Universally interesting (anyone can engage with "how we know things")
- Demonstrates every Markdown feature naturally
- Shows the structured navigation pattern (map files, subdirectories)
- Subtly proves the product's thesis: "this is how knowledge should feel"
- `about-swirlread.md` at the end is the soft pitch, not a hard sell

**Bundling**: ship as a JSON blob in the app bundle (~150KB compressed). Loads instantly.

**Alternative content directions to consider**:

- "Learning How to Learn" (psychology-flavored)
- "An Introduction to System Design" (engineer-flavored — closer to your audience)
- "Notes on Software Craft" (engineer + literary)
- "The Curious Mind" (broad, philosophical)

We can ship multiple sample vaults later. v1 ships one.

---

### Folder Picker Flow (Real Vault)

```
User clicks "Open my vault"
  ↓
Inline panel slides up (NOT a system modal yet):
  ┌────────────────────────────────────────────────┐
  │ Open your vault                                │
  │                                                │
  │ Choose any folder containing your              │
  │ Markdown files. SwirlRead reads them            │
  │ directly from your device. Nothing             │
  │ is uploaded.                                   │
  │                                                │
  │ Compatible with: plain folders, Obsidian       │
  │ vaults, Logseq graphs                          │
  │                                                │
  │       [ Choose folder ]   [ Cancel ]           │
  └────────────────────────────────────────────────┘
  ↓
User clicks "Choose folder" → browser FSAPI dialog appears
  ↓
User selects folder → permission granted
  ↓
"Indexing 156 files..." progress (1-3 seconds for typical vault)
  ↓
Auto-render vault home: index.md → README.md → home.md → auto-tree
  ↓
Sticky toast: "✅ Connected to my-vault. Welcome back."
```

**Inline panel matters** — pasting users straight into a system file dialog is jarring and reads as suspicious. The panel adds context and consent before the OS dialog appears.

---

### Returning User Flow

When a user with a previously-opened vault comes back to `swirlread.app`:

```
Page load
  ↓
Check IndexedDB for saved vault handles
  ↓
Found 1 vault → auto-restore permission, render last-read page
Found N vaults → show vault picker:
  ┌───────────────────────────────┐
  │ Recent vaults                 │
  │                               │
  │ 🟢 my-knowledge               │
  │     156 files · 2 hours ago   │
  │                               │
  │ 🟢 work-notes                 │
  │     43 files · yesterday      │
  │                               │
  │ ✨ sample vault               │
  │                               │
  │ [+ Open new vault]            │
  └───────────────────────────────┘
```

Permissions: FSAPI persists handle but may require user gesture to re-grant access. We hand-hold this — show "Reconnecting..." spinner with a click-through if needed.

---

### Onboarding Tour (Skippable Hint System)

No modal walkthrough. Instead, **contextual hints** that appear once and dismiss themselves:

- First time hovering left edge: small tooltip "← Drag or pin to keep file tree"
- First time pressing ⌘K (or after 30s): tooltip "Try ⌘K — it's how you do everything"
- First time scrolling a long doc: subtle highlight on TOC arrow
- First time hovering a wikilink: tooltip "Hover for preview"

All hints stored as one-shot in IndexedDB. Settings has "Reset hints" to replay them.

**No forced tour. No "click next" walkthrough. No popups.**

---

## Part 2: Vault Model

### Core Principle: One Vault, Many Sections

A vault is just a folder. Inside it, structure is conveyed by:

1. **Subdirectories** (folders are sections)
2. **Map files** (`*-map.md` or `index.md` per directory)
3. **Wikilinks** (cross-cutting threads)

SwirlRead treats a single vault with rich subdirectory structure as a **first-class experience**. You don't need to split your knowledge into multiple vaults to get organized navigation — the existing folder structure IS the organization.

**Wilson's vault is the canonical example**:

```
supwil/                          ← The vault
├── index.md                     ← Vault home page
├── career/                      ← Section: career
│   ├── career-map.md            ← Section home
│   ├── me/
│   ├── projects/
│   └── interviews/
├── knowledge/                   ← Section: knowledge
│   ├── knowledge-map.md         ← Section home
│   ├── 软件/
│   └── 算法/
├── tasks/                       ← Section: tasks
│   └── tasks-map.md
└── ai/                          ← Section: AI
    └── ai-map.md
```

When the user opens `supwil/`, SwirlRead:

- Renders `index.md` as vault home
- Recognizes each top-level folder as a "section" with its own home (`*-map.md`)
- The hover-summoned file tree groups files by section, not by raw folder structure
- ⌘K search has scope filters: "search in current section" / "search whole vault"
- Breadcrumb shows: `Vault › Section › Page`

This means **one vault = one knowledge OS**, with sub-areas that feel like dedicated workspaces.

---

### Section Detection

SwirlRead automatically identifies sections within a vault using these signals (in order):

1. **Top-level directory contains a `*-map.md` file** → it's a section, the map file is its home
2. **Top-level directory contains an `index.md`** → it's a section, index is its home
3. **Top-level directory contains a `README.md`** → it's a section, README is its home
4. **Top-level directory has > 3 markdown files** → it's a section, auto-generated home
5. Otherwise: it's a folder that gets nested under "Other" in navigation

This is **pure convention, no config required**. Wilson's vault works out of the box because he already follows the `*-map.md` pattern.

For users who want explicit control, an optional `swirlread.config.json` at vault root can override:

```json
{
  "sections": [
    { "path": "career", "name": "Career", "home": "career-map.md", "icon": "💼" },
    { "path": "knowledge", "name": "Knowledge", "home": "knowledge-map.md", "icon": "🧠" }
  ],
  "ignore": ["z-archive/", "**/.obsidian/"]
}
```

But config is opt-in. **Convention over configuration.**

---

### Multi-Vault Support

For users who want hard separation between domains (e.g., personal knowledge vs. hobby vs. work), SwirlRead supports multiple registered vaults.

**Vault switcher (top-left, hover summoned)**:

```
┌─────────────────────────────────┐
│ Active: my-knowledge ▾          │
└─────────────────────────────────┘
  ↓ click ↓
┌─────────────────────────────────┐
│ ✓ my-knowledge                  │
│   work-notes                    │
│   hobby-cooking                 │
│ ─────────────────               │
│ + Open new vault                │
│ ⚙ Manage vaults                 │
└─────────────────────────────────┘
```

**Vault isolation guarantees**:

- Reading state (recent, scroll position, bookmarks, annotations) is per-vault
- Search index is per-vault (no cross-vault search by default)
- AI context is per-vault (Phase 2+)
- Themes/settings can be per-vault or global (user choice)

**Cross-vault search** (Phase 2+): optional toggle in ⌘K to "search all vaults" — useful for finding "where did I write about X" across personal + work.

---

### Vault Type Adapters

Different PKM tools have slightly different conventions. SwirlRead auto-detects:

| Vault Type    | Detection Signal                            | Adapter Behavior                                                                        |
| ------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Plain folders | No special markers                          | Generic Markdown rendering                                                              |
| Obsidian      | `.obsidian/` directory exists               | Full Obsidian extension support: callouts, embeds, dataview hint, frontmatter respected |
| Logseq        | `logseq/` directory or `journals/`+`pages/` | Block references, journal-first home, Logseq's `[[]]` semantics                         |
| Foam          | `.foam/` config                             | Daily notes, foam-specific link conventions                                             |
| Custom        | None                                        | Default to Obsidian-superset behavior (most permissive)                                 |

The adapter only affects parsing nuances; the reading experience is unified.

---

## Decisions Locked In

| Question               | Decision                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Landing strategy       | Hybrid single-page: hero + 2 CTAs + scroll-to-features                                              |
| Visual personality     | Clean, literary, confident; not SaaS-flashy                                                         |
| Sample vault           | Yes, ~15 curated knowledge files (theme: "Reading in the Age of AI" — see brand-and-positioning.md) |
| Vault picker UX        | Inline consent panel before OS dialog                                                               |
| Returning user         | Auto-restore last vault; multi-vault picker if multiple                                             |
| Onboarding tour        | None. Just contextual one-shot hints                                                                |
| Single vault structure | First-class via section detection (`*-map.md` convention)                                           |
| Multi-vault            | Supported via top-left vault switcher                                                               |
| Cross-vault search     | Phase 2+                                                                                            |
| Vault adapters         | Auto-detect Obsidian / Logseq / Foam / plain                                                        |
| Config file            | Optional (`swirlread.config.json`); convention-first                                                |
