# SwirlRead — Rendering & File Format Spec

> Status: Decided 2026-05-01 · Living document

This document is the **completeness contract**: SwirlRead must render anything a user reasonably puts in front of it, and render it beautifully. Any failure to render something correctly is a P1 bug.

---

## Core Promise

> If it's text-based and lives in a folder, SwirlRead should read it.
> If it's Markdown, SwirlRead should render every feature anyone has reasonably defined for Markdown.

A user must never feel "I have to use Obsidian for this file because SwirlRead breaks my callouts" or "I need GitHub to render this table."

---

## Markdown — Full Coverage Required

The renderer must support the complete superset of features used in real-world Markdown vaults. We target three layers:

### Layer 1: CommonMark (mandatory in MVP)

| Feature                    | Notes                                           |
| -------------------------- | ----------------------------------------------- |
| Headings (h1–h6)           | Anchored IDs auto-generated for TOC             |
| Paragraphs                 |                                                 |
| Bold, italic, both         | `**`, `*`, `***`, `_`, `__` all variants        |
| Inline code                | `​`​code`​`​                                    |
| Code blocks (fenced)       | Triple backtick + language tag                  |
| Code blocks (indented)     | 4-space indented (legacy, less common)          |
| Lists (ordered, unordered) | Including arbitrarily nested                    |
| Blockquotes                | Including nested                                |
| Links                      | Inline `[text](url)` and reference `[text][id]` |
| Images                     | Inline `![alt](url)` and reference              |
| Horizontal rule            | `---`, `***`, `___`                             |
| Inline HTML                | Sanitized passthrough (DOMPurify)               |
| Hard line breaks           | Two trailing spaces or backslash                |
| Escaped characters         | `\*`, `\_`, etc.                                |

### Layer 2: GitHub Flavored Markdown / GFM (mandatory in MVP)

| Feature       | Notes                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Tables        | Full alignment support (`:---`, `:---:`, `---:`)                       |
| Strikethrough | `~~text~~`                                                             |
| Task lists    | `- [ ]`, `- [x]`, with interactive checkbox toggling (Phase 2 editing) |
| Auto-linking  | Bare URLs become links                                                 |
| Footnotes     | `[^1]` syntax with backref                                             |

### Layer 3: Obsidian / PKM Extensions (mandatory in MVP — these are critical for Wilson's vault)

| Feature                | Syntax                            | Notes                               |
| ---------------------- | --------------------------------- | ----------------------------------- |
| Wikilinks              | `[[page]]`                        | Resolve to vault file               |
| Wikilink with alias    | `[[page\|Display Text]]`          |                                     |
| Wikilink with heading  | `[[page#heading]]`                | Scroll to heading on navigate       |
| Wikilink with block ID | `[[page^block-id]]`               | Phase 2                             |
| Embeds                 | `![[page]]`                       | Render the embedded file inline     |
| Image embeds           | `![[image.png]]`                  | Resolve relative paths              |
| Callouts               | `> [!NOTE]`, `> [!WARNING]`, etc. | Full Obsidian callout types         |
| Tags                   | `#tag/nested`                     | Clickable; jumps to tag listing     |
| Highlights             | `==highlighted text==`            | Yellow background, theme-aware      |
| Comments               | `%%hidden text%%`                 | Not rendered (Obsidian-style)       |
| Frontmatter            | YAML at top of file               | Optionally rendered as metadata bar |

### Obsidian Callout Types (full list to support)

```
> [!note]      → blue
> [!info]      → blue
> [!tip]       → green
> [!success]   → green
> [!question]  → purple
> [!warning]   → yellow / amber
> [!failure]   → red
> [!danger]    → red
> [!bug]       → red
> [!example]   → purple
> [!quote]     → grey
> [!abstract]  → cyan
> [!summary]   → cyan
> [!todo]      → blue (with checkbox if collapsible)
```

Each gets a theme-tuned color, an icon, and the title is rendered prominently.

Custom callouts (`> [!my-custom-type]`) should fall back to a generic style without breaking.

### Layer 4: Math, Diagrams, and Rich Embeds (Phase 1 stretch / Phase 2 mandatory)

| Feature            | Library                | Notes                      |
| ------------------ | ---------------------- | -------------------------- |
| Inline math        | `$x^2$`                | KaTeX                      |
| Display math       | `$$...$$`              | KaTeX                      |
| Mermaid diagrams   | ` ```mermaid `         | Mermaid.js, lazy loaded    |
| Sequence diagrams  | (via Mermaid)          |                            |
| Flowcharts         | (via Mermaid)          |                            |
| Gantt charts       | (via Mermaid)          |                            |
| Class diagrams     | (via Mermaid)          |                            |
| Excalidraw         | `.excalidraw.md` files | Phase 3 (complex)          |
| Tikzjax            | `​```tikz`             | Phase 3                    |
| ABC music notation | `​```abc`              | Phase 3 / community plugin |

### Layer 5: Code Block Excellence

This deserves its own section because reading code in notes is critical for a developer audience.

| Feature               | Implementation                                                              |
| --------------------- | --------------------------------------------------------------------------- |
| Syntax highlighting   | **Shiki** (VS Code grammars, accurate; ~600KB but worth it)                 |
| 100+ languages        | TypeScript, Python, Rust, Go, Java, C++, etc.                               |
| Theme integration     | Highlighting matches SwirlRead theme (Sepia / Light / Dark / OLED variants) |
| Filename annotation   | ` ```typescript filename="app.ts"` → shown as a chip                        |
| Line highlighting     | ` ```ts {1,3-5}` → those lines get a subtle background                      |
| Diff blocks           | ` ```diff` with red/green for +/- lines                                     |
| Copy button           | Appears on hover, top-right; copies to clipboard                            |
| Optional line numbers | Setting toggle; off by default for cleaner reading                          |
| Long line wrap toggle | Setting; default = horizontal scroll                                        |
| Language icon         | Optional icon next to filename (Phase 2)                                    |

**Shiki vs alternatives**: Prism is faster but produces less accurate highlighting. Shiki uses the same grammars as VS Code, so the result looks "professional." We'll bundle a curated subset of grammars (top 30 languages) with on-demand loading for the rest.

---

## Beyond Markdown — Generous File Reader

> SwirlRead is a Markdown reader, but a generous reader of related text-based formats.

The principle: if a user has a folder of mixed content, SwirlRead opens what it can and degrades gracefully on what it can't.

### Tier 1: Plain Text (MVP)

| Format           | Render Strategy                                                                    |
| ---------------- | ---------------------------------------------------------------------------------- |
| `.txt`           | Render as monospace pre-formatted text; preserve line breaks; no special parsing   |
| `.log`           | Same as .txt but with timestamp highlighting if detected                           |
| `.csv`           | Render as a styled table; sortable headers; truncate at 1000 rows with "load more" |
| `.tsv`           | Same as .csv with tab delimiter                                                    |
| `.json`          | Syntax-highlighted, optionally collapsible tree view                               |
| `.yaml` / `.yml` | Syntax-highlighted                                                                 |
| `.toml`          | Syntax-highlighted                                                                 |
| `.xml`           | Syntax-highlighted, optionally collapsible                                         |

### Tier 2: Web-Native Formats (MVP)

| Format             | Render Strategy                                                                       |
| ------------------ | ------------------------------------------------------------------------------------- |
| `.html` / `.htm`   | Render in sandboxed iframe with allowlist; respects theme via injected CSS where safe |
| `.svg`             | Render inline (it's also an image)                                                    |
| `.url` / `.webloc` | Show as a card with title + open-in-browser button                                    |

### Tier 3: Documents (Phase 2)

| Format  | Library    | Notes                                                            |
| ------- | ---------- | ---------------------------------------------------------------- |
| `.pdf`  | PDF.js     | Lazy load; render page by page; supports text selection + search |
| `.epub` | epub.js    | Render in same immersive layout as Markdown                      |
| `.docx` | mammoth.js | Convert to HTML and render in our pipeline                       |
| `.rtf`  | rtf.js     | Best-effort conversion                                           |

### Tier 4: Alternative Markup (Phase 2)

| Format                    | Strategy                                                                       |
| ------------------------- | ------------------------------------------------------------------------------ |
| `.org` (Emacs Org Mode)   | Convert via uniorg → render through markdown pipeline                          |
| `.rst` (reStructuredText) | docutils.js or convert via pandoc-wasm                                         |
| `.adoc` (AsciiDoc)        | Asciidoctor.js                                                                 |
| `.tex` (LaTeX)            | Show source + KaTeX preview for equations; full LaTeX rendering is too complex |

### Tier 5: Media (MVP)

| Format                                            | Render Strategy                                |
| ------------------------------------------------- | ---------------------------------------------- |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif` | Render at max content width; click to lightbox |
| `.svg`                                            | Inline render                                  |
| `.mp4`, `.webm`, `.mov`                           | Native `<video>` with theme-tuned controls     |
| `.mp3`, `.wav`, `.ogg`, `.flac`                   | Native `<audio>` with theme-tuned UI           |

### Tier 6: Obsidian-Specific (MVP)

| Format                      | Strategy                                           |
| --------------------------- | -------------------------------------------------- |
| `.canvas` (Obsidian Canvas) | Phase 3 — complex, requires custom canvas renderer |
| `.excalidraw.md`            | Phase 3 — requires Excalidraw renderer             |
| `.base` (Obsidian Bases)    | Phase 3 — render as filtered table view            |

### Tier 7: Code Files (MVP — read-only display)

If a user has source code in their vault (very common for developer notes):

| Format                                                                                                                            | Strategy                                                             |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `.js`, `.ts`, `.tsx`, `.py`, `.rs`, `.go`, `.java`, `.cpp`, `.cs`, `.rb`, `.php`, `.swift`, `.kt`, `.sh`, `.sql`, `.css`, `.scss` | Shiki-rendered with full syntax highlighting; same UX as code blocks |

The reading experience for a `.py` file in your vault should be **as beautiful as a code block in a Markdown file**. This is a real use case for engineers.

### Files We Don't Render (Show a metadata card instead)

For unsupported formats, show a card with:

- File name and icon
- File size and modified date
- "Open in default app" button (uses native handler)
- "Show in folder" button

Examples: binary files, unknown extensions, encrypted files, very large files (>50MB warn before loading).

---

## Renderer Architecture (high level)

```
File detected
  ↓
Format dispatcher
  ↓
  ├─ .md / .mdx     → unified pipeline (remark → rehype → React)
  ├─ .txt / .log    → text renderer
  ├─ .json/.yaml    → syntax-highlighted code renderer
  ├─ .html          → sandboxed iframe renderer
  ├─ .pdf           → PDF.js renderer (Phase 2)
  ├─ .epub          → epub.js renderer (Phase 2)
  ├─ .csv / .tsv    → table renderer
  ├─ .png/.jpg/etc  → image viewer
  ├─ source code    → Shiki code renderer
  └─ unknown        → metadata card
  ↓
Common shell (theme, scroll, hover UI, settings)
```

Every renderer outputs into the same theme-aware **reading shell**, so the UX is consistent regardless of file type. Background, typography, content width, dark mode — all unified.

---

## Markdown Pipeline (Core Tech)

```
unified
  └─ remark-parse           (CommonMark → mdast)
  └─ remark-gfm             (tables, task lists, strikethrough)
  └─ remark-math            (math syntax)
  └─ remark-frontmatter     (YAML frontmatter)
  └─ remark-wikilink        (custom: [[page]] resolution)
  └─ remark-callout         (custom: > [!note] etc.)
  └─ remark-embed           (custom: ![[page]] inline render)
  └─ remark-rehype          (mdast → hast)
  └─ rehype-katex           (math → HTML)
  └─ rehype-shiki           (code highlighting)
  └─ rehype-mermaid         (mermaid diagrams)
  └─ rehype-sanitize        (XSS protection)
  └─ rehype-react           (hast → React tree)
```

Custom plugins (the `remark-wikilink`, `remark-callout`, `remark-embed`) are SwirlRead's secret sauce. They're what makes the experience feel "vault-aware" instead of "generic markdown."

---

## What "Beautiful Rendering" Means

Beyond correctness, the rendering must feel **crafted**:

- **Typographic micro-details**: smart quotes (`"text"` → `"text"`), em-dashes (`---` → `—`), ellipsis (`...` → `…`)
- **Math formatting**: KaTeX rendering with appropriate font and spacing
- **Tables don't break**: long tables get horizontal scroll inside a contained box, not page-wide overflow
- **Code blocks have texture**: subtle shadow, rounded corners, theme-tuned background — not generic `<pre>`
- **Image loading is graceful**: blurred placeholder during load, no layout shift
- **Empty states are designed**: a file with just frontmatter shows the metadata beautifully, not a blank page

---

## Edge Cases the Renderer Must Handle

These are the cases that break most Markdown viewers. SwirlRead must handle all of them:

- A document with **only frontmatter** — show metadata, not blank
- A document **starting with a code block** — no orphan margin
- **Nested wikilinks** in tables and footnotes
- **Images inside callouts**
- **Code blocks in blockquotes**
- **Math inside tables**
- A **10,000-line code block** — virtualize rendering, don't crash
- **Mixed RTL/LTR text** (Hebrew, Arabic notes)
- **Wikilink that doesn't resolve** — show as text with subtle "broken link" indicator, not crash
- **Circular wikilink embeds** (A embeds B embeds A) — detect and stop
- **Files with weird names** — emoji, spaces, Chinese characters, very long names
- **Very long single line** (e.g., a JWT token) — wrap or scroll, not break layout

---

## Performance Budget

For files up to 50,000 words:

- Initial render: < 200ms
- Scroll feels native (60fps)
- Memory < 50MB per opened file

For larger files:

- Virtualize rendering (only render visible viewport + buffer)
- Background-parse the rest
- Show a "large file" indicator if > 100k words
