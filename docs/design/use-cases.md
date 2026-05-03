# SwirlRead — Use Cases

> Status: Brainstorming · Last updated: 2026-04-30

This document maps out concrete use cases, ordered from highest-priority (your personal use) to broader public scenarios. Each case includes: who, when, current pain, what SwirlRead does, and what success looks like.

---

## Personal Use Cases (Priority 1 — Build for These First)

---

### UC-01: Technical Interview Prep

**Actor**: Developer (Wilson) preparing for a coding / system design interview  
**Context**: The night before or morning of an interview; time is limited; need to review breadth, not depth

**Current pain**:

- Opening VS Code to read `knowledge/软件/` feels like opening a workshop to read a book
- Obsidian requires finding the right vault file in a tree; graph view doesn't help under time pressure
- No way to say "show me everything I know about React performance + system design + behavioral answers" in one view

**What SwirlRead does**:

1. Opens vault to interview-relevant knowledge in one action (`⌘K` → "interview")
2. Surfaces a curated reading list based on keywords or a saved "Interview Mode" reading pack
3. Presents notes in a clean, distraction-free reading layout (like a textbook, not a code editor)
4. AI sidebar: "What are my strongest talking points on database indexing?" — answers from vault content only
5. Tracks scroll position so you can pause and resume across multiple files

**Success**: In 30 minutes of reading, the user has reviewed 6-8 key topics without fighting the tool.

---

### UC-02: Job Application — Resume & Cover Letter Writing

**Actor**: Developer writing or tailoring a resume for a specific role  
**Context**: Has a job description open; needs to pull relevant STAR stories, metrics, and experience details

**Current pain**:

- `career/me/experience.md` is long; finding the right story requires scrolling or grep
- Comparing multiple STAR stories requires opening multiple tabs in VS Code
- No way to quickly see "which of my experiences is most relevant to this JD?"

**What SwirlRead does**:

1. Side-by-side reading: open the JD summary next to `career/me/experience.md`
2. AI-powered relevance: paste the job description → AI highlights which STAR stories match
3. Quick filter: search "TypeScript" → shows only notes mentioning that skill
4. Backlinks: `experience.md` shows which resume drafts already used each story
5. Export to clipboard: select a STAR block and copy as clean text for pasting into resume editor

**Success**: Writing a tailored resume takes 20 minutes instead of 45 because finding the right content is fast.

---

### UC-03: Daily Knowledge Inbox Review

**Actor**: Developer doing a daily learning session  
**Context**: Has captured new ideas, links, and rough notes in `knowledge/inbox.md`; wants to process them

**Current pain**:

- Reading `inbox.md` in VS Code is fine, but navigating from inbox items to related permanent notes requires manually opening other files
- No visual connection between an inbox item and the existing knowledge page it should be integrated into
- No reading progress tracking ("did I already process this section?")

**What SwirlRead does**:

1. Opens `inbox.md` in reading mode; each `[[wikilink]]` in the text is hoverable to preview the target
2. Side panel shows "Related pages" for the section being read (based on shared terms/links)
3. Mark-as-read highlighting: items can be tagged as "processed" visually without editing the file
4. Quick-navigate: from an inbox item, jump to the relevant permanent page to compare/read before integrating

**Success**: Inbox processing feels like reading a newspaper with hyperlinks, not a task in a code editor.

---

### UC-04: Weekly Retrospective

**Actor**: Developer doing end-of-week review  
**Context**: Friday or Sunday; wants to review what was done, decide next week's priorities

**Current pain**:

- `tasks/weekly/` files are just plain Markdown; reading them one by one is tedious
- No quick summary or cross-week comparison
- `log.md` is long and hard to skim

**What SwirlRead does**:

1. Timeline view for `tasks/weekly/` and `z-journal/` — shows entries chronologically in a readable format
2. AI-assisted summary: "Based on this week's entries, what are my top 3 accomplishments and 2 blockers?"
3. Cross-week navigation: previous / next week with a keyboard shortcut
4. Highlight changed areas: if a goal from last week isn't mentioned this week, it surfaces as a gap

**Success**: Weekly review takes 10 minutes and produces a clear next-week focus without manually grep-ing across files.

---

### UC-05: AI-Powered Semantic Q&A Over Vault

**Actor**: Developer with a question that spans multiple notes  
**Context**: Any time — "what do I already know about X before I look it up externally?"

**Current pain**:

- Full-text search only works for exact keyword matches; you might not remember the exact term you used
- No way to ask a question in natural language and get an answer grounded in your own notes
- ChatGPT answers from training data; it doesn't know what YOU specifically have learned or documented

**What SwirlRead does**:

1. Natural language query: "What's the difference between B-tree and B+tree as I understand it?"
   - Retrieves relevant sections from your knowledge notes
   - Answers using only your own content; cites the source file and line
2. "What do I know about X?" mode — aggregates all mentions of a topic across the vault
3. Gap detection: "You have notes on HTTP caching but nothing on service workers. Want to add a placeholder?"
4. Works offline with local embedding (transformers.js); or optionally uses Claude API for richer answers

**Success**: Before opening Google or ChatGPT, users habitually check SwirlRead first to recall their own knowledge.

---

### UC-06: China Return Planning Research

**Actor**: Developer planning a career move to China's job market  
**Context**: Has `career/china-return/` with analysis, todo list, workstation plan; needs to review and update

**Current pain**:

- The files in `career/china-return/` are interconnected (analysis references todo, todo references timing) but there's no unified view
- Opening each file individually loses the cross-file context

**What SwirlRead does**:

1. Context bundle: `career/china-return/` is treated as a thematic reading pack — open all related files in a tabbed reading session
2. AI cross-reference: "What's still unresolved in my China return plan?" — reads all files in the bundle, surfaces open items
3. Progress checklist: renders `- [ ]` items from `todo.md` as a live checklist visible in the sidebar

**Success**: China return planning feels like consulting a personal advisor who has read all the files, not manually jumping between tabs.

---

## Community / Open Source Use Cases (Priority 2 — Design For Later)

---

### UC-07: Obsidian Vault Reader (Without Obsidian)

**Actor**: Developer who has an Obsidian vault but doesn't want to open Obsidian (e.g., on a machine where it's not installed, or on mobile)

**Current pain**:

- Obsidian mobile requires a sync subscription
- On a borrowed or work machine, you don't want to install Obsidian just to read notes
- GitHub rendering doesn't resolve `[[wikilinks]]` or render callouts

**What SwirlRead does**:

- Opens an Obsidian-formatted vault: resolves `[[page]]` and `[[page|alias]]` links
- Renders Obsidian callouts (`> [!NOTE]`, `> [!WARNING]`) correctly
- No installation required — runs in any modern browser from a hosted URL
- Permission granted once per browser session via File System Access API

**Success**: A user on any device with a browser can read their Obsidian vault without installing anything.

---

### UC-08: Team/Project Documentation Reading

**Actor**: Small engineering team using a Git-based Markdown wiki (e.g., `docs/` folder in a repo)  
**Context**: Want a better reading interface than GitHub for their internal docs

**Current pain**:

- GitHub renders Markdown but has no search within a directory, no sidebar navigation, no wikilinks
- Setting up GitBook or Docusaurus requires migration and cloud hosting
- VS Code preview is per-file, not vault-aware

**What SwirlRead does**:

- Drop-in reader for any `docs/` directory in a Git repo
- Auto-generates navigation from folder structure + `README.md` files
- Full-text search across the entire docs folder
- Sharable deep links: `swirlread.app/read?path=docs/architecture/overview.md` (for hosted version)

**Success**: A team switches from "just read it on GitHub" to using SwirlRead as their internal docs reader, with zero migration.

---

### UC-09: Students Reading Course Notes

**Actor**: University student who takes notes in Markdown during lectures  
**Context**: Exam prep; needs to review notes organized by subject/week

**Current pain**:

- Notes are in folders by week or topic; reading across them requires manual file-switching
- No way to create a "study session" that covers notes from multiple topics
- No AI review assistant that knows their specific course notes

**What SwirlRead does**:

- Groups files by folder; creates a reading flow for each folder
- "Study Session" mode: select multiple files or folders → combined reading view with unified TOC
- AI quiz mode: "Ask me questions based on these notes" — generates practice questions from vault content
- Spaced repetition hint: highlights sections not reviewed in > 7 days (tracked in local storage)

**Success**: Students use SwirlRead as their primary exam-prep tool instead of re-reading raw files.

---

### UC-10: Sharing Notes With Someone Else

**Actor**: Developer who wants to share a specific note or reading pack with a colleague or friend  
**Context**: "Here's my notes on system design — read this before our interview prep session"

**Current pain**:

- Sharing a Markdown file requires the recipient to have a compatible viewer
- Sending the raw `.md` file via email looks terrible to non-technical recipients
- No quick way to publish a note to a shareable URL without setting up a static site generator

**What SwirlRead does** (future/hosted version):

- "Share this page" button: generates a temporary read-only link to the rendered page
- No account required for the recipient to view
- Option to share a reading bundle (multiple files) as a single link
- Links expire after 7 days by default for privacy

**Success**: Sharing a note is as easy as sharing a Google Doc link, but the content stays in your vault.

---

### UC-11: Cross-Device Reading (Mobile)

**Actor**: Developer wanting to read their knowledge system on a phone or tablet  
**Context**: Commuting, traveling, reading before bed

**Current pain**:

- Obsidian mobile requires Obsidian Sync ($10/month)
- iCloud/Dropbox-synced markdown files open in Notes or Files app — no wikilinks, no formatting
- VS Code mobile is unusable for reading

**What SwirlRead does**:

- Progressive Web App (PWA) installable on iOS/Android
- Syncs via the same folder (iCloud, local, or Dropbox-backed) — SwirlRead just reads whatever is there
- Mobile-optimized layout: larger touch targets, swipe to navigate, bottom navigation bar
- Offline reading: recently opened files are cached in browser storage

**Success**: Reading on mobile feels like using an ebook reader, not a code editor.

---

## Edge Cases Worth Designing For

### Non-Technical Users Opening Someone Else's Vault

- The "select folder" flow must be self-explanatory with zero technical jargon
- First-time experience should show a sample vault or quick tour, not an empty screen

### Very Large Vaults (1000+ files)

- File indexing must be lazy/incremental — don't block rendering on full vault scan
- Search index build happens in the background after first open
- Virtual scrolling for file trees with many entries

### Mixed-Language Vaults (Chinese + English)

- Chinese text requires specific tokenization for search (jieba or similar)
- UI language should follow browser locale OR be explicitly user-selectable

### Sensitive Content in Vault

- Some users have vault folders they want to exclude (e.g., `private/`, `finance/`)
- Must support `.swirlreadignore` file (same pattern as `.gitignore`) to exclude directories from indexing and AI
- Never log or transmit file paths or content to any external service without explicit user action

### Vault Structure Doesn't Match Expectations

- Not all vaults have `*-map.md` files or `[[wikilinks]]`
- SwirlRead must degrade gracefully: plain folder tree + basic MD rendering still works without any special structure
- Vault adapters (future): pluggable parsers for Obsidian, Logseq, Foam, Roam export formats
