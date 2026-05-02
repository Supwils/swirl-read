# Launch announcement — drafts

> Several short variants for different audiences. Pick what matches the
> channel; don't post all of them on the same network.

## Twitter / X — primary thread

```
Today I'm shipping SwilRead — a reading-first interface for your
Markdown knowledge vault.

Most Markdown apps optimise for editing. SwilRead does the opposite:
the reading column is the product.

Local-first. No telemetry. MIT.

→ swilread.app
```

(280-char first tweet; thread continuation below.)

```
What it does in v0.1:

· Renders every Markdown feature your vault uses — wikilinks,
  callouts, embeds, math, code, mermaid, tags
· Universal file reader for non-Markdown too (CSV table, JSON tree,
  sandboxed HTML, source code, media)
· 5 themes (Sepia is the default), zen mode, ⌘K palette,
  full-text search
· Multi-vault, recents, scroll memory, backlinks panel
· Reads a folder directly via File System Access API; vault content
  never uploads anywhere

Source + design docs: github.com/<handle>/swil-read
```

```
What it deliberately doesn't do:

· No editing in v0.1 (lightweight repair-style edit lands in v0.2)
· No AI features (the point is a reading sanctuary)
· No iOS Safari support (FSAPI isn't there yet)

It's an opinionated tool for slow re-reading of your own notes,
not a writing app, not a second brain, not a wrapper around an LLM.
```

```
Try the sample vault to see what reading there feels like — no disk
permission needed: swilread.app

Show HN thread: <link>

Feedback welcome, especially from people who live in their vaults.
```

## Mastodon / Bluesky — single-post variant

```
Just shipped SwilRead — a reading-first web app for Markdown vaults.

Local-first (FSAPI, never uploads). No telemetry. MIT.

The pitch: most Markdown tools were built for the writer. This one
is built for re-reading your own notes — slowly, in a space that
respects the text.

swilread.app
```

(295 chars; fits both networks comfortably.)

## r/ObsidianMD — long-form, careful framing

```
Title: Built a reading-first Markdown viewer that points at your
Obsidian vault folder

Body:

Hi r/ObsidianMD. Long-time vault user, recently started caring more
about *re-reading* my own notes than writing new ones. None of the
existing readers felt right — too IDE-flavoured, too feature-y,
too keen to be a second brain.

So I built SwilRead. It's a web app you point at any folder of
.md files (yes, your vault works directly — no import). It reads
the same wikilinks, callouts, embeds, tags, frontmatter, etc.
that Obsidian writes, plus math, mermaid, and Shiki-highlighted
code.

It's not a replacement for Obsidian. There's no editing in v0.1,
no plugin system, no graph view, no canvas, no daily-notes. It's
intentionally a *viewer* — what GitHub's Markdown rendering
should feel like if it cared about reading.

Local-first via the File System Access API. Vault content never
auto-uploads. MIT licensed.

Try the sample vault: swilread.app

If you have a vault and want to give it a real spin, open in
Chromium-based browsers (Chrome / Edge / Brave / Arc). Firefox /
Safari only see the sample for now.

Source: github.com/<handle>/swil-read

Happy to answer questions about the rendering pipeline (it's
unified + remark, similar shape to what Obsidian does internally
but exposed as a clean Markdown→HTML pipeline).
```

## Lobste.rs — minimum viable

```
Title: SwilRead: a reading-first interface for your Markdown vault

Body:

Local-first web app, points at a folder via File System Access API,
renders Markdown (with wikilinks / callouts / embeds / math / mermaid)
into a calm reading shell. Built on Vite + React 19 + TypeScript
strict; bundle is ~248 KB gz with the heavy bits in lazy chunks.
No telemetry, no AI, MIT.

swilread.app · github.com/<handle>/swil-read
```

## Things to skip

- Don't post to general /r/programming (low signal, high
  off-topic-flag risk)
- Don't post to /r/sideproject same week as Show HN (overexposed
  to the same crowd)
- Don't DM-spam productivity influencers
