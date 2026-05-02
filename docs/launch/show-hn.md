# Show HN — draft

> Edit before posting. Title goes in the post field; body goes in the
> first comment (HN convention for Show posts is a brief comment from
> the author explaining the project).

## Title

```
Show HN: SwilRead – a reading-first interface for your Markdown vault
```

(80 chars. Under HN's 80-char limit. Avoid emojis, "the AI era",
"supercharged".)

## URL

```
https://swilread.app
```

(Replace with the actual production URL once the domain is live.)

## First comment (the explainer)

```
Author here. SwilRead is a local-first, web-based, read-optimised
interface for Markdown knowledge vaults — a calmer place to RE-READ
your own notes, not another writer.

Most Markdown apps optimise for editing: a sidebar tree, a preview
pane, a toolbar of formatting shortcuts. The text gets second billing.
SwilRead does the opposite. The reading column is the centre of
gravity; everything else hovers in or out as needed. There's a
Sepia-Light-Dark-OLED theme set tuned for long-form reading, a zen
mode (F), serif typography (Source Serif 4 + Noto Serif SC for
Chinese), and a command palette for navigation.

The bet is that reading your own knowledge — slowly, deliberately, in
a space that respects the text — still matters in 2026, even though
models can summarise everything in a paragraph. Especially because of
that.

It's a Vite + React + TypeScript SPA. It uses the File System Access
API to read a vault folder directly from disk; vault content never
auto-uploads. IndexedDB stores metadata only (recents, scroll
positions, backlinks index). No telemetry. MIT licensed.

What works in v0.1:
- Full Markdown surface: GFM, wikilinks, callouts, embeds (image /
  video / audio / nested-Markdown), KaTeX math, Shiki-highlighted
  code (~30 languages bundled), Mermaid diagrams, tags, highlights
- A universal file reader: plain text, source code, images, video,
  audio, CSV/TSV (proper table), HTML (sandboxed iframe), JSON
  (foldable tree)
- Multi-vault, recent files, scroll position memory, backlinks panel
  ranked by recency, full-text search via MiniSearch, ⌘K command
  palette
- 5 themes, zen mode, settings panel for typography
- A "Try with sample vault" button on the landing page so you can
  see it without granting any disk permission first

What's NOT in v0.1 (and won't be soon):
- Editing. v0.2 will add lightweight current-document edits;
  authoring tools are out of scope by design.
- AI features. Phase 1 ships zero AI. The goal is the opposite: a
  reading sanctuary.
- iOS Safari support. The File System Access API isn't there.
- A mobile-native app. Tauri / iOS bridges are a Phase 3 question.

Caveats:
- Chromium-only for "Open my vault" (Chrome, Edge, Brave, Arc).
  Firefox and Safari can use the sample vault but not real folders.
- The bundle is ~248 KB gz; lazy chunks bring in heavier surfaces
  (KaTeX, Mermaid, Shiki extras) on demand.

Code: <https://github.com/your-handle-here/swil-read>
Docs (design + implementation): in `docs/` in the repo.

I'd love feedback from anyone who lives in their own knowledge vault
— what does "calm" mean for your reading flow, and where does
SwilRead get in the way?
```

## Things to NOT say

- "AI-powered" anything (the entire pitch is the opposite)
- "The Obsidian killer" / any kill-the-other-tool framing
- "Beautifully designed" (let people decide)
- "Blazing fast" / "supercharged" / generic startup adjectives
- Don't preempt the comment "why not just use [X]?" — wait for
  someone to ask, then answer specifically.
