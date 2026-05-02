# SwilRead — Gaps and Open Questions

> Status: Brainstorming · Last updated: 2026-04-30

This document is intentionally honest about what we don't know yet, where the product concept has weak points, and what decisions need to be made before or during development. Surfacing these early prevents building into a corner.

---

## Section 1: Platform & Architecture Decisions

### OQ-01: Web App (File System Access API) vs. Desktop App (Tauri)?

**Decision (2026-04-30)**: **Web App first.** Tauri desktop deferred to Phase 3+.

**Rationale**:

- Zero install → easiest to demo, share, and onboard new users
- File System Access API is good enough for the primary user (Wilson on Chrome/Edge)
- Tauri can be added later as an adapter without rewriting the core, if we keep the FS layer abstracted

**Implications locked in by this decision**:

- Architecture must abstract file I/O behind a `VaultFileSystem` interface so a Tauri adapter can be added later
- Mobile (iOS) is a known limitation (FSAPI not available); deferred to Phase 3
- File watching is poll-on-focus, not real-time push (FSAPI has no native watcher)
- Bundle size matters more than for desktop (web load time)

**Status**: Decided.

---

### OQ-02: Editing Boundary

**Decision (2026-05-01)**: **Phased approach — strict read-only in Phase 1, current-document lightweight source editing in Phase 2, in-app annotations integrated as a UX feature.**

**Phase-by-phase plan**:

**Phase 1** — Strict read-only:

- No editing UI
- Optional "Open in external editor" path for users who need a full authoring environment
- Focus 100% on proving the reading experience

**Phase 2 — Lightweight source edit for the current document**:

- Enter an `Edit` mode from the rendered document; switch to a plain Markdown text editor for that file
- **Text-oriented edits only**: fix typos, tweak wording, replace phrases, adjust links, update frontmatter values
- **No workspace authoring features**: no file create/delete, no drag/drop media authoring, no block handles, no structural page builder
- The editor is temporary and subordinate to reading: save, re-render, return to the reading view
- Browser implementation should request `readwrite` permission only when needed, not up front

**Why this constraint is the right one technically**:

- We avoid reverse-mapping rendered HTML back into Markdown source
- A simple source editor plus `writeText()` on the active file is enough for the target workflow
- We do not need ProseMirror/TipTap, AST-to-source patching, or a block schema just to support typo fixes and sentence-level revisions
- It preserves the architecture's file-first nature: Markdown remains the source of truth

**Phase 2 — Annotations (in-app, not sidecar files)**:

- Highlights, margin notes, bookmarks stored in IndexedDB (or `.swilread/` sidecar later)
- **Integrated into other features**, not as a standalone tool:
  - "Show me what I highlighted in this topic" view
  - AI uses highlights as signal of importance ("you cared about this")
  - Spaced repetition: re-surface highlighted passages over time
  - Reading insights: "you've highlighted 23 things in `frontend/` this month"

**What we explicitly will NOT do**:

- Multi-pane writing workspace
- Block-level structural editing (insert image, change heading level, reorder blocks)
- File creation / deletion within the app
- Rich-text / WYSIWYG document authoring
- Auto-complete for wikilinks while editing (initially)

**Status**: Decided 2026-05-01.

---

### OQ-03: How to Handle Real-Time File Changes?

**The problem**: The vault is a live folder. The user might have VS Code or Obsidian open simultaneously, editing files while SwilRead displays them.

- File System Access API: can check if a file was modified via `getFile()` again, but no native file-watching event
- Tauri: full `fs::read_dir` watch via `tauri-plugin-fs-watch`
- Web without Tauri: must poll (e.g., every 30s) or refresh on tab focus

**Gap**: FSAPI has no push-based file watcher. We need a strategy for staleness.

**Options**:

- Poll on tab focus: re-read the current file when the window regains focus. Simple, covers the main case.
- Manual refresh button: explicit user action, no surprise reloads.
- Tauri watch: fully automatic, but only in desktop app.

**Status**: For MVP, implement poll-on-focus. Document the limitation.

---

## Section 2: Technical Gaps

### TG-01: Chinese Text Search

**The problem**: Standard search tokenizers (including MiniSearch's default) split text at word boundaries. Chinese text has no spaces — "数据库索引" is one token, not two. This means searching for "索引" won't match "数据库索引" unless the tokenizer is Chinese-aware.

**Solutions**:

- `nodejieba` — Node.js binding for jieba; not available in browser
- `jieba-wasm` — WebAssembly port of jieba; works in browser; adds ~2MB to bundle
- `TinySegmenter` — Japanese/Chinese segmenter, smaller but less accurate
- n-gram tokenization — no dictionary needed; slower and less precise but works without a library
- Use browser's `Intl.Segmenter` API (Chrome 87+, Firefox 125+) — built-in, no bundle cost

**Recommendation**: `Intl.Segmenter` first (zero dependency cost); fall back to n-gram for older browsers.

**Status**: Must solve before launch — Wilson's vault is mixed Chinese/English.

---

### TG-02: Wikilink Format Variations

Different PKM tools use slightly different wikilink syntax:

| Format           | Example                       | Tool                   |
| ---------------- | ----------------------------- | ---------------------- |
| Standard         | `[[page-name]]`               | Obsidian, Foam, Logseq |
| With alias       | `[[page-name\|Display Text]]` | Obsidian               |
| With heading     | `[[page-name#section]]`       | Obsidian               |
| Block reference  | `[[page-name^block-id]]`      | Obsidian, Logseq       |
| Logseq block ref | `((block-uuid))`              | Logseq                 |
| Roam block ref   | `((block-uid))`               | Roam Research          |

**Gap**: If we build a single wikilink parser, it will break on vaults from other tools.

**Solution**: Build a `WikilinkParser` interface with pluggable implementations per vault format. Default parser handles the Obsidian superset (covers most cases). Advanced formats (Logseq block refs) handled by vault adapter plugins.

**Status**: Design this abstraction early; it affects the core rendering pipeline.

---

### TG-03: Local Embedding Performance

**For AI semantic search**, we need to convert all vault documents into vector embeddings. Options:

| Approach                                        | Pros                          | Cons                                            |
| ----------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| transformers.js (in-browser)                    | Zero backend; private         | ~100ms per doc; large model download (~50MB)    |
| Claude API embeddings                           | High quality; no download     | Sends content to Anthropic; costs money per doc |
| OpenAI text-embedding-3-small                   | Fast; cheap ($0.02/1M tokens) | Sends content to OpenAI; requires API key       |
| Pre-built WASM embedding (e.g., FastEmbed-wasm) | Faster than transformers.js   | Less accurate; limited model options            |

**Gap**: For a vault of ~500 files × avg 2000 tokens = 1M tokens. At $0.02/1M tokens with OpenAI, that's $0.02 per full index build — basically free. But users with privacy concerns won't allow it.

**Recommendation**:

- Default: offer the user a choice on first use ("use local (slower, private) or cloud API (faster, requires key)")
- Local path: transformers.js with `Xenova/all-MiniLM-L6-v2` (sentence similarity, 30MB download, ~50ms/doc in browser)
- For MVP: skip AI entirely; ship keyword search first.

**Status**: Defer to Phase 2. Design the `EmbeddingProvider` interface early to avoid a rewrite later.

---

### TG-04: Vault Size / Performance Limits

**Concern**: Vaults can grow large. Wilson's current repo has ~150 files; a power user might have 3000+.

**Bottlenecks**:

1. Initial file listing via FSAPI: reading 3000 file handles is slow (~5-15 seconds in browser)
2. Full-text search index build: MiniSearch can handle 10k documents in memory, but indexing takes time
3. Rendering a single very long file (e.g., a 10,000-line algorithms template) can lag the main thread

**Mitigations**:

- Lazy loading: only read file contents on demand; index files in background after first interaction
- Virtual scroll: don't render 3000 items in the file tree DOM
- Web Worker: run search indexing and embedding off the main thread
- Chunk large file rendering into 500-line viewport windows

**Status**: Not an MVP blocker, but design the architecture to not require a full upfront scan.

---

### TG-05: API Key Security

**For AI features**, users need to provide a Claude or OpenAI API key.

**Risk**: If we store the key in localStorage, it's accessible to any JavaScript on the page (XSS risk). If this is a hosted web app, any malicious script injection could exfiltrate it.

**Mitigations**:

- Store key in `sessionStorage` (cleared on tab close) rather than `localStorage` for sensitive use
- Or use the browser's IndexedDB with encryption (subtle crypto API)
- For the Tauri desktop app: use the OS keychain via `tauri-plugin-keychain`
- For the hosted version: API keys should only be used client-side; never proxied through our server

**Status**: Must solve before adding any paid AI features.

---

## Section 3: Product & UX Gaps

### PG-01: The "Read-Only" Problem — Will Users Accept It?

**The risk**: Users will naturally want to fix typos, add a quick note, or update a checklist while reading. If they can't, they'll find SwilRead frustrating and prefer Obsidian.

**Evidence in both directions**:

- Kindle is 100% read-only and users accept it because the reading experience is so good
- Most web-based doc readers (Notion published pages, GitBook) are read-only and users don't complain
- However, Markdown readers that tried to be read-only (e.g., early Typora versions) eventually added editing

**The mitigation**:

- In Phase 1, make the "Open in editor" path extremely fast
- In Phase 2, add a lightweight current-file text edit mode for quick repairs so the user does not have to context-switch for every typo
- Keep the boundary strict enough that SwilRead does not become another general-purpose editor

**Status**: Decision updated — Phase 1 still ships read-only; Phase 2 adds limited quick-edit capability.

---

### PG-02: Onboarding for Non-Technical Users

**The gap**: "Select a folder of Markdown files" assumes the user knows what Markdown is, has files organized in a folder, and understands what they're selecting.

**For Wilson**: zero problem. For a student or writer unfamiliar with Markdown folder structures: confusing.

**What needs to exist**:

1. A sample vault bundled with the app (or linkable) so users can try SwilRead before connecting their own files
2. A "what is a vault?" explainer on the empty state screen
3. Clear error states: "no markdown files found in this folder" → "here's what to do"

**Status**: Not a blocker for personal use, but required before public launch.

---

### PG-03: Mobile File Access

**The gap**: File System Access API has no iOS support for local files (Apple restricts it). On iOS, users cannot select a local folder.

**Workarounds**:

- iCloud Drive integration: iOS apps can open files from iCloud; if the vault is synced to iCloud, the user opens it through the iCloud Files provider
- Dropbox / Google Drive API: authenticate and read files from cloud storage
- This means "truly local" on iOS is not possible without a native app

**Options**:

- Accept this limitation for v1 (document it clearly); mobile is a Phase 3 feature
- Ship a SwiftUI native app for iOS that reads from the local Files app (significant scope)
- Build a minimal cloud sync feature so vaults can be read on mobile

**Status**: Mobile is a known gap. Phase 3 concern, but shape the architecture to support it.

---

### PG-04: The "Vault Structure Assumptions" Problem

**The gap**: Current design assumes vaults have:

- `*-map.md` navigation files
- `[[wikilink]]` format
- Structured folder hierarchy

**Reality**: Many users' vaults are flat folders of files named `2024-03-15 meeting notes.md`. Zero structure. No wikilinks. Just files.

**What should happen**: SwilRead should degrade gracefully:

- No map files → auto-generate navigation from folder tree
- No wikilinks → skip backlinks panel; no errors
- Flat structure → list all files alphabetically; offer date-sorted view

**Status**: Design the "no assumptions" fallback path in Phase 1.

---

## Section 4: Market & Strategic Gaps

### MG-01: Obsidian Is Getting Better

Obsidian is actively improving its reading experience and mobile app. If they ship a "reading mode" that matches SwilRead's core feature, the differentiation narrows.

**Counter**: SwilRead's differentiation is not just reading mode — it's local-first AI Q&A + vault-structure-aware navigation + open source trust. Obsidian is unlikely to open source or make AI fully local.

**Monitor**: Obsidian release notes quarterly.

---

### MG-02: NotebookLM Is the AI Competitor

Google's NotebookLM does AI Q&A over uploaded documents and is well-resourced. If it adds local file support, it becomes a direct competitor.

**Counter**: NotebookLM requires uploading files to Google. It will never be local-first by design — Google's business model requires data access. SwilRead's privacy positioning is structurally differentiated.

**Monitor**: Any NotebookLM announcements about offline/local mode.

---

### MG-03: Is There Enough Market?

**The concern**: "Developers who maintain structured Git-backed Markdown vaults and want a better reading interface" is a niche.

**The counter**:

- Obsidian has 1M+ active users. Even 5% of that is 50,000 potential users.
- The "markdown knowledge system" workflow is growing: more people are choosing local-first PKM
- SwilRead doesn't need millions of users to be successful. 10,000 daily active users of an open-source tool with a paid cloud tier = viable side business.

**The real question**: Can we reach the right community without paid marketing? (Yes — HN, GitHub, PKM subreddits are organic channels that reach exactly this audience.)

---

## Summary: Critical Decisions Before Building

| Decision         | Options                              | Recommendation                                                                                    | Status                |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------- |
| Platform         | Web FSAPI vs. Tauri                  | Web first, Tauri later (abstract the FS layer)                                                    | ✅ Decided 2026-04-30 |
| Editing          | None / minimal / annotations         | Phased: Phase 1 read-only → Phase 2 lightweight current-document source edit + in-app annotations | ✅ Decided 2026-05-01 |
| AI backend       | Local (transformers.js) / API        | User-selectable; skip for MVP                                                                     | Defer                 |
| License          | MIT vs. AGPL                         | MIT                                                                                               | Decided               |
| Chinese search   | Intl.Segmenter / jieba-wasm / n-gram | Intl.Segmenter                                                                                    | Recommended           |
| Mobile           | Not in v1 / iCloud / native app      | Not in v1                                                                                         | Defer                 |
| Wikilink formats | Single parser / adapter pattern      | Adapter pattern                                                                                   | Design early          |
