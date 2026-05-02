# SwilRead

**Read your knowledge. Beautifully.**
_A reading sanctuary for the AI era._

SwilRead is a local-first, web-based, read-optimized interface for Markdown
knowledge vaults. Open a folder, see your notes rendered with serif
typography, navigate via wikilinks, find anything with `⌘K`. Your files
never leave your device.

## Why this exists

Most Markdown apps were built for editing. They optimise for the writer.
SwilRead does the opposite: it tries to make the **reading** part feel
calm, focused, and beautiful — closer to a book than a code editor.

The bet is that reading your own knowledge — slowly, deliberately, in a
space that respects the text — still matters in 2026, even though models
can summarise everything in a paragraph. Especially because of that.

## Status

**Pre-1.0.** Phase 1 implementation is substantially complete. Try the
sample vault on the landing page or open a real Markdown folder.

- 654 tests passing
- Main bundle 248 KB gz
- All Markdown features land: wikilinks, callouts, embeds, math, code,
  mermaid, tags
- Universal file reader for plain text, source code, images, video,
  audio, CSV, HTML (sandboxed), and JSON
- 5 themes (Sepia / Light / Dark / OLED / Auto)
- Multi-vault, recent files, scroll memory, backlinks, full-text search,
  command palette

See [`docs/develop/README.md`](docs/develop/README.md) for the milestone
status and [`docs/develop/work-log.md`](docs/develop/work-log.md) for
implementation details.

## Quick start

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). Click **Try with
sample vault** to see SwilRead render seven interlinked Markdown notes,
or **Open my vault** to point at a real folder.

The "Open my vault" CTA needs a Chromium-based browser (Chrome, Edge,
Brave, Arc) — Safari and Firefox don't ship the File System Access API
yet. Once a vault is registered, all reading happens locally in your
browser and survives across reloads.

## Tech stack

- **Vite 7** + **React 19** + **TypeScript 5.9** (strict)
- **Tailwind v4** with semantic theme tokens (no utility-class soup)
- **React Router 7** with route-level error boundaries
- **Zustand** for in-memory state, **Dexie** (IndexedDB) for persistence
- Markdown pipeline: `unified` + `remark-parse` + `remark-gfm` +
  custom plugins for wikilinks / callouts / embeds / highlights / tags +
  `rehype-shiki` for code highlighting + `KaTeX` for math + `Mermaid`
  for diagrams
- Heavy renderers (Mermaid, KaTeX, Floating UI, M7 file renderers) all
  live in lazy-loaded chunks so the main bundle stays under 250 KB gz

See [`docs/develop/tech-stack.md`](docs/develop/tech-stack.md) for the
full list with version pins.

## Local-first, by construction

- Vault content **never** auto-uploads. The browser reads files directly
  from disk via the File System Access API.
- IndexedDB stores **metadata only** (vault name, last-opened timestamp,
  recent-files list, scroll positions, backlinks index). No file
  contents are persisted outside the vault folder you picked.
- No analytics, no telemetry, no A/B tests. Open source from day one.

## Project layout

```
src/
├── core/           # Pure logic — pipeline, vault adapters, navigation indexes
│   ├── render/         # Markdown pipeline + custom remark plugins
│   ├── vault/          # FSAPI / sample adapters, path utilities
│   ├── navigation/     # Wikilink resolver, backlinks, headings, tag index
│   ├── persistence/    # Dexie schema
│   └── search/         # Full-text MiniSearch index
├── stores/         # Zustand stores (vault / ui / reader / toc / tag)
├── ui/             # Components (file tree, command palette, settings, …)
│   └── reading-shell/  # The actual reading surface
├── app/            # Routing, hotkeys, error boundary, auto-restore
└── styles/         # globals.css with the theme system
```

See [`docs/develop/architecture-overview.md`](docs/develop/architecture-overview.md)
for the full module map.

## Documentation

- [`docs/design/`](docs/design/) — vision, brand, reading experience,
  rendering spec
- [`docs/develop/`](docs/develop/) — architecture, tech stack,
  engineering principles, ordered milestone plan, work log

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: run
`pnpm check` before opening a PR, match the existing engineering style,
keep the reading experience first.

## License

MIT — see [`LICENSE`](LICENSE).
