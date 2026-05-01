# SwilRead — Product Vision

> Status: Brainstorming · Last updated: 2026-04-30

---

## The Core Insight

Every PKM (Personal Knowledge Management) tool ever built is optimized for **input** — capturing, writing, organizing, linking.

Nobody built a tool optimized for **output** — reading, recalling, reviewing, presenting.

This is the gap SwilRead fills.

A library has two rooms: the **cataloging room** (where librarians organize books) and the **reading room** (where readers actually consume knowledge). Obsidian, Notion, Logseq — they are all cataloging rooms. SwilRead is the reading room.

---

## The Real Problem

People who maintain Markdown-based knowledge systems — engineers, researchers, students, knowledge workers — share the same broken workflow:

**They spend hours writing notes they never efficiently read back.**

Why? Because reading from the same tool you write in is a bad experience:

- Editors (VS Code, Cursor) are built for code, not prose. The UI chrome, gutter numbers, and dense layout fight against comfortable reading.
- Obsidian is powerful but is fundamentally a writing and organization tool — the graph view is impressive but rarely useful in practice; mobile requires a paid subscription; configuring it takes longer than actually reading.
- GitHub web rendering is decent but has no wikilink support, no search, no cross-file navigation.
- Notion is cloud-only and requires uploading your private knowledge to someone else's servers.

The result: a graveyard of well-organized notes that rarely get used, even though the user put real effort into building them.

---

## The Specific Problem (Wilson's case, which represents a real user archetype)

The user has a structured local Markdown repository that functions as a **Personal Life OS**:

```
knowledge/         ← CS notes: frontend, backend, algorithms, system design
career/me/         ← STAR stories, background, resume content
career/interviews/ ← Interview prep material
career/applications/ ← Job application tracking
ai/context-bundles/ ← Pre-composed AI context packs
tasks/ + z-journal/ ← Task logs, weekly reviews
```

This repo is accessed through:

| Tool                     | Why it fails for reading                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| VS Code / Cursor preview | Code editor UI; no wikilinks; no cross-file nav; reading mode buried                                    |
| Obsidian                 | Complex setup required for each vault; graph view rarely practical; mobile = paid; no AI-aware features |
| GitHub web               | No `[[wikilink]]` support; no full-text search; no reading-optimized layout                             |
| Terminal (cat/grep)      | Cannot navigate relationships; no rendered Markdown                                                     |

**The core contradiction**: This person spent significant effort building a knowledge system. But consuming that knowledge has no dedicated tool.

---

## Product Vision Statement

> SwilRead is a **local-first, read-optimized interface** for Markdown knowledge systems.
>
> It turns any folder of Markdown files into a beautiful, navigable, AI-augmented reading experience — without uploading your data to any cloud, without requiring a complex setup, and without trying to replace the tools you already use to write.

---

## The Deeper Mission — Reading in the Age of AI

SwilRead exists for a reason that goes beyond rendering Markdown nicely.

In the AI era, knowledge is becoming disposable. Why memorize, why deeply read, why reflect — when AI can answer anything in seconds? But there is a quiet cost: people stop knowing things, critical thinking atrophies, and conversations with AI become one-sided. The mind becomes a search interface for someone else's index.

The phrase that captures this: **being dragged by AI** instead of **walking with it**.

SwilRead's stance:

> In the age of AI, the people who think clearly are the ones who still read deeply. They build their own substrate of knowledge — slowly, attentively, through real engagement with ideas. That substrate is what lets them have meaningful conversations with AI instead of being passive recipients of it.

SwilRead is a tool for those people. A **sanctuary for deep reading** in an era that increasingly devalues it.

This is not anti-AI. AI is part of the roadmap. But the question is whose terms AI operates on:

- AI working **for** the reader = augmenting recall, surfacing connections, asking good questions
- AI working **on** the reader = generating answers that bypass thinking, summarizing things you should have read

SwilRead picks the first.

**Brand promise (one sentence)**:

> SwilRead helps you read your own knowledge so deeply that AI becomes your collaborator, not your replacement.

---

## What SwilRead Is NOT

Being explicit about this prevents scope creep:

| It is NOT               | Why this boundary matters                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| A note-taking app       | You already have one. SwilRead reads what you wrote.                                             |
| An Obsidian replacement | Obsidian wins at editing, linking while writing, and plugin ecosystem. SwilRead wins at reading. |
| A cloud knowledge base  | Notion, Confluence, GitBook exist. SwilRead is local-first by design.                            |
| A second brain builder  | Building your knowledge base is out of scope. Reading it is the entire scope.                    |
| An AI chatbot           | AI is a feature to enhance reading and recall, not the main product surface.                     |

---

## Core Product Principles

### 1. Reading Is a First-Class Activity

Every UI decision optimizes for comfortable, focused reading:

- Typographic defaults tuned for long-form prose (65-char line width, 1.8 line height, readable serif/sans option)
- Zero unnecessary chrome when in reading mode
- Scroll position memory so you can pick up where you left off
- Low-distraction layout — TOC is visible but not intrusive

### 2. Local-First, Privacy by Default

Your personal knowledge often contains sensitive content: career plans, salary targets, personal reflections, private projects, health data. SwilRead never requires you to upload your files.

- Reads directly from your local filesystem (File System Access API in browser, or native FS in Tauri)
- AI features send only the content of the specific file(s) you're actively reading — never bulk-indexes your vault to a third-party server by default
- Local embedding option for semantic search (transformers.js, runs entirely in-browser)
- API keys stored locally in browser storage, never transmitted

### 3. Vault-Aware, Not Generic

A generic Markdown renderer treats all files equally. SwilRead understands the shape of structured knowledge repositories:

- Recognizes `*-map.md` files as navigation hubs for their directory
- Resolves `[[wikilinks]]` to actual files across the vault
- Surfaces backlinks: "which other pages reference this one?"
- Understands `ai/context-bundles/` as reading packs
- Can ingest a repo's `index.md` as its navigation root

### 4. AI That Serves Reading, Not Replaces It

AI features are additive, not central:

- "What do I know about X?" — semantic search across your notes
- "Summarize this section for quick review" — works on the open document
- "Prepare me for this interview based on my notes" — aggregates relevant knowledge on demand
- AI does not auto-generate content, modify your files, or pretend to know things not in your vault

### 5. Zero Setup for the Simple Case

Target: open the app, select a folder, start reading. No config file required, no plugin installation, no account creation.

Advanced features (AI, custom vault structure, themes) are opt-in and non-blocking.

---

## Target User Profile

### Primary: The Developer-Researcher (you, Wilson)

- Maintains a structured Markdown repository as a personal knowledge system
- Uses it for job search, interview prep, technical learning, and personal planning
- Spends time writing notes but struggles to retrieve and read them efficiently
- Comfortable with technical tools but frustrated by configuration overhead
- Wants AI assistance that respects their data privacy

### Secondary: The Knowledge-Intensive Professional

- Researcher, writer, or analyst who maintains large Markdown-based notes
- Works on multiple machines and needs consistent reading access
- May use Obsidian for writing but wants a better reading interface
- Values local-first and version-control-friendly workflows

### Tertiary: The Open Source / Community User

- Developer who discovers SwilRead via GitHub or Hacker News
- Has an existing Markdown vault in any format (Obsidian, Logseq, plain files)
- Wants to self-host or run locally without cloud dependency
- May contribute themes, vault adapters, or integrations

---

## Competitive Landscape

| Product    | Strength                                          | Why SwilRead is different                                  |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Obsidian   | Rich plugin ecosystem, graph view, desktop-native | Input-optimized; reading is an afterthought; closed source |
| Logseq     | Open source, local-first, outline-based           | Still editor-first; not a dedicated reading interface      |
| Notion     | Beautiful reading UX, collaborative               | Cloud-only; requires migrating your content; subscription  |
| GitBook    | Great reading UX for docs                         | For publishing to others, not for personal reading         |
| Foam       | Open source, VS Code-based                        | Lives inside a code editor; not reading-optimized          |
| NotebookLM | AI-powered document Q&A                           | Cloud-only; you upload your content; no navigation layer   |
| Typora     | Clean Markdown editing                            | Single-file editor; no vault/navigation support            |

**The gap**: No product exists that is simultaneously (a) local-first, (b) read-optimized, (c) vault-aware, and (d) AI-augmented. SwilRead owns that intersection.

---

## Success Metrics (Early Stage)

For personal use (v0.1):

- Time to open vault and navigate to a specific note: < 10 seconds
- Reading a 3000-word technical note feels as comfortable as reading a blog post
- Can answer "what do I know about X topic?" in under 30 seconds using search + AI

For public product (v1.0):

- 500+ GitHub stars within 3 months of open-source launch
- 10+ community-contributed vault adapters or themes
- Used by at least 50 people in their daily workflow (verified via opt-in analytics or GitHub issues)
