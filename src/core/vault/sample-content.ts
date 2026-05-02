/**
 * Sample vault content (M8.1).
 *
 * Seven short Markdown files written for a "Reading in the Age of AI"
 * theme. Together they exercise every feature SwilRead claims:
 *
 *   - frontmatter (YAML)
 *   - GFM tables, task lists, footnotes
 *   - wikilinks, aliased wikilinks, broken wikilinks
 *   - callouts (note / warning / tip / quote)
 *   - fenced code blocks (multiple languages)
 *   - inline + block math (KaTeX)
 *   - mermaid diagrams
 *   - body tags (#nested/tag)
 *   - highlights (==text==)
 *
 * Authoring guideline: every paragraph should be readable without context.
 * The point of the sample vault is to demonstrate the reading experience,
 * not to teach SwilRead syntax.
 */

import type { SampleVaultSpec } from './sample-adapter'

const INDEX = `---
title: Reading in the Age of AI
description: A short series on why slow, deliberate reading still matters.
author: SwilRead
tags: [reading, ai]
---

# Reading in the Age of AI

This sample vault is a small ==reading sanctuary==. Seven notes, all
interlinked. Open any of them in the file tree on the left, or use
\`⌘K\` (\`Ctrl+K\` on Windows / Linux) to jump.

> [!tip]
> Try clicking a wikilink, then hovering it the second time. The
> popover preview only loads on hover, so you can feel the difference
> between a quick navigation and a deeper look.

## Where to start

- [[why-read|Why slow reading still wins]]
- [[knowledge-base|Building a knowledge base you can return to]]
- [[markdown-features|What this reader supports]]
- [[math-and-code|Math, code, and diagrams]]
- [[reading-rituals|Reading rituals]]
- [[colophon|How this sample is built]]

## Why a sanctuary?

Most apps that show you Markdown were built for engineers. They optimise
for editing, not reading. SwilRead does the opposite: it tries to make
the **reading** part feel calm, focused, and beautiful. The features in
this vault are here to support that, not to upstage it.

#sample/intro
`

const WHY_READ = `---
title: Why slow reading still wins
tags: [reading, attention]
---

# Why slow reading still wins

Models can summarise. You can skim a hundred posts in an hour. So why sit
with a single article for ten minutes?

Because you don't ==understand== something until you've held it long
enough for your own thinking to attach to it. The summary fits in your
short-term memory; the texture of the argument is what stays.

> [!quote]
> "Reading furnishes the mind only with materials of knowledge; it is
> thinking that makes what we read ours." — *John Locke*

## A simple test

Pick any note in this vault. Read it twice. After the second pass, look
away and try to retell it in your own words. The gap between what you
think you got and what you can actually say is the gap that careful
reading closes.

## Where this leaves us

- The internet rewards shallow.
- Tools should reward depth too.
- That's the whole pitch.

See also: [[knowledge-base]], [[reading-rituals]].
`

const KNOWLEDGE_BASE = `---
title: Building a knowledge base you can return to
tags: [knowledge, methodology]
---

# Building a knowledge base you can return to

A vault you can re-read is worth ten you only ever wrote into.
[[why-read]] is one half of the loop. This note is the other.

## What makes a vault re-readable

| Property | Why it matters |
|----------|----------------|
| Wikilinks | The graph is your memory's index |
| Sections | Browsing finds notes search misses |
| Frontmatter | A handle for filtering by tag / date |
| Plain Markdown | Survives every tool you'll ever try |

## Tasks

- [x] Pick a folder you'll keep
- [x] Stop using folders for everything
- [ ] Re-read at least one note this week
- [ ] Add a backlink from somewhere unexpected

## Why local-first

A note that lives in someone else's database is a note you'll lose. The
files in this vault are yours. SwilRead just reads them.[^1]

[^1]: That's the whole product principle. Local-first, read-first, no
upload. See also [[colophon]].

#sample/methodology
`

const MARKDOWN_FEATURES = `---
title: What this reader supports
tags: [markdown, features]
---

# What this reader supports

Quick tour through the surfaces. Each one is here because it shows up in
real knowledge vaults.

## Callouts

> [!note]
> A neutral aside.

> [!warning]
> Things that should make you stop.

> [!tip] Use the tip variant when you want to be friendly.
> Everything below the title is the body.

> [!quote]
> Used by [[why-read]].

## Wikilinks

- A direct link: [[why-read]]
- An alias: [[knowledge-base|Building a knowledge base]]
- A broken one: [[this-page-does-not-exist]]

## Tags

A note can be tagged inline with #reading or with a #nested/path,
or via frontmatter. Click any tag chip to see every note that uses it.

## Highlights

Use \`==text==\` to ==mark something worth remembering==. The colour is
theme-tuned; switch themes from the header settings to see it adapt.

## Embeds

Embed an image, a clip, or a snippet of another note with \`![[...]]\`:

![[diagram.svg]]

See [[math-and-code]] for code and math.
`

const MATH_AND_CODE = `---
title: Math, code, and diagrams
tags: [math, code]
---

# Math, code, and diagrams

## Inline and block math

Inline: $E = mc^2$ tucked into a sentence.

Block:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

KaTeX is lazy-loaded, so a note with no math pays nothing.

## Code

\`\`\`ts
type Reader<T> = {
  read(): Promise<T>
  next(): Reader<T> | null
}

const oneAtATime = async <T>(start: Reader<T>) => {
  let cursor: Reader<T> | null = start
  while (cursor) {
    yield await cursor.read()
    cursor = cursor.next()
  }
}
\`\`\`

\`\`\`python
def fibonacci(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
\`\`\`

Shiki ships ~30 languages eagerly; the rest stream in on first use.

## Mermaid

\`\`\`mermaid
flowchart LR
  A[Open vault] --> B[Pick a note]
  B --> C{Has wikilinks?}
  C -- yes --> D[Hover for preview]
  C -- no --> E[Read top to bottom]
  D --> F[Decide what's next]
  E --> F
\`\`\`

Diagrams ship in their own chunk. No diagram → no Mermaid runtime.

Back to [[index|the index]].
`

const READING_RITUALS = `---
title: Reading rituals
tags: [reading, habit]
---

# Reading rituals

Practical things you can try this week.

## A 20-minute ritual

1. Pick one note from your vault you haven't opened in a month.
2. Read it twice.
3. Add one sentence to it — something the second pass made obvious.
4. Close the tab.

That's it. The point isn't to fix your second-brain. The point is to
treat your own notes the way you treat books you respect.

## Where this fits

> [!tip]
> The Continue group on the left rail is your friend here. SwilRead
> remembers where you left off and surfaces it on every visit.

See [[why-read]] for the longer argument, or [[knowledge-base]] for
the structure side.

#sample/ritual
`

const COLOPHON = `---
title: How this sample is built
tags: [meta]
---

# How this sample is built

This vault is a tiny in-memory \`VaultFileSystem\` (M8.2). It implements
the same interface as the File System Access adapter, so every reading
feature works without touching your disk.

| Layer | What it does |
|-------|--------------|
| \`SampleVaultAdapter\` | Hands out paths, bytes, blob URLs |
| \`renderMarkdown\` | Same pipeline a real vault uses |
| Reading shell | Same TOC / backlinks / palette |

When you're done playing, click **Open my vault** in the header to grant
SwilRead access to a real folder. Nothing about your reading state
follows from one to the other — the sample vault is its own world.

[[index|Back to the index.]]
`

// A trivial 1×1 SVG used by the embed example in markdown-features.
const DIAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
  <rect width="320" height="80" fill="#e9d8b1"/>
  <text x="160" y="46" text-anchor="middle" font-family="serif" font-size="22" fill="#3a2f24">
    A reading sanctuary
  </text>
</svg>`

export const SAMPLE_VAULT_ID = 'sample-reading-in-the-age-of-ai'

export function buildSampleVaultSpec(): SampleVaultSpec {
  return {
    id: SAMPLE_VAULT_ID,
    name: 'Reading in the Age of AI',
    files: {
      'index.md': INDEX,
      'why-read.md': WHY_READ,
      'knowledge-base.md': KNOWLEDGE_BASE,
      'markdown-features.md': MARKDOWN_FEATURES,
      'math-and-code.md': MATH_AND_CODE,
      'reading-rituals.md': READING_RITUALS,
      'colophon.md': COLOPHON,
      'diagram.svg': DIAGRAM_SVG,
    },
  }
}
