# SwirlRead — Open Source Strategy

> Status: Brainstorming · Last updated: 2026-04-30

---

## Should SwirlRead Be Open Source?

Short answer: **Yes, and it's the right default for this type of product.**

Here's why:

### 1. The Product's Core Promise Is Privacy

The entire value proposition of SwirlRead includes "your data never leaves your machine." Open source is the strongest possible proof of that claim. Users can inspect the code and verify there's no telemetry, no hidden upload, no tracking.

A closed-source local-first tool is a contradiction. Users have to trust your word. Open source makes trust verifiable.

### 2. The PKM Community Lives on GitHub

People who maintain Git-backed Markdown knowledge systems are developers. They discover tools through:

- GitHub trending
- Hacker News Show HN posts
- r/PKM, r/ObsidianMD, r/Zettelkasten
- Word of mouth among engineers

All of these channels favor open source projects. A closed-source Markdown reader will be viewed with skepticism.

### 3. Comparable Successful Open Source Products

| Product  | GitHub Stars | Model                | Lesson                                                                  |
| -------- | ------------ | -------------------- | ----------------------------------------------------------------------- |
| Logseq   | 33k+         | Open source (AGPL)   | OSS drives trust in local-first PKM; monetizes via cloud sync           |
| Obsidian | N/A (closed) | Freemium + paid sync | Proves there's a paid market — but closed limits contribution           |
| Foam     | 15k+         | Open source (MIT)    | VS Code extension; community contributed vault formats                  |
| Zettlr   | 10k+         | Open source (GPL)    | Academic use; reading-focused Markdown editor                           |
| Markwhen | 5k+          | Open source (MIT)    | Timeline rendering for Markdown; niche but loved                        |
| Notable  | 23k+         | Open source          | Read-optimized Markdown notes; proves the "read-first" angle has demand |

**Key observation**: The highest-growth PKM tools in 2023-2025 are open source or built strong communities before adding paid features.

---

## Licensing Options

### MIT License (Recommended for early stage)

```
Pros:
- Maximum adoption: anyone can use, modify, distribute
- Developers can embed SwirlRead in their own tools
- Lowest friction for community contributions
- Consistent with "this is a tool for developers" brand

Cons:
- Anyone can fork it and sell it without contributing back
- Harder to protect a hosted/cloud business later
```

### AGPL-3.0

```
Pros:
- Network copyleft: if someone hosts SwirlRead as a service, they must open source their version
- Protects your potential SaaS business from competitors who would run a hosted version

Cons:
- Corporate users (big companies) often can't use AGPL due to legal policy
- Reduces commercial adoption
- More complex contributor license agreements needed
```

### Recommendation

**Start with MIT.** At the brainstorming stage, maximizing adoption and trust matters more than protecting a commercial moat that doesn't exist yet. If a hosted/cloud version becomes the business model, you can dual-license later.

---

## What to Open Source vs. What to Keep Closed / Paid

### Open Source Core (Always Free)

Everything that makes SwirlRead useful for personal use:

- Vault reading engine (File System Access API + local FS)
- Markdown renderer (remark/rehype pipeline)
- Wikilink resolution
- Full-text search (local)
- Navigation (file tree, backlinks, TOC, map-file awareness)
- Theme engine
- PWA shell
- Context bundle support
- Export to PDF / HTML

### Paid / Hosted Features (Future)

Features that require infrastructure or are clearly "team/professional" tier:

| Feature                                                           | Why it's paid                        |
| ----------------------------------------------------------------- | ------------------------------------ |
| Cloud sync (read your vault on any device without iCloud/Dropbox) | Requires servers; ongoing infra cost |
| Shareable note links (publish a note as a public URL)             | Requires hosting                     |
| Team vaults (shared read access for a team)                       | Requires multi-user auth             |
| AI features that use hosted LLM (no API key required)             | Requires API cost coverage           |
| Priority support / custom themes                                  | Time cost                            |

The line: **anything that runs entirely on the user's machine is free and open source forever.**

---

## Community Strategy

### Phase 0: Build It for Yourself (Now → 3 months)

- No public release yet. Build and iterate using your own vault.
- Document everything in `docs/`. When you open source, the docs make the project look serious.
- Capture design decisions and their rationale in `docs/develop/architecture-decisions.md`.

### Phase 1: Show HN / Soft Launch (Month 3-4)

- Polish a demo: record a 90-second screen recording showing your vault in SwirlRead vs. VS Code
- Post to: Hacker News (Show HN), r/ObsidianMD, r/PKM, Twitter/X dev community
- README must answer: what it is, how to try it in 2 minutes, screenshot, why local-first
- License and CONTRIBUTING.md in place before launch

### Phase 2: Community Vault Adapters (Month 5-6)

- The thing that will drive GitHub stars: supporting Obsidian, Logseq, Foam vault formats
- Write an adapter interface (`VaultAdapter`) that community can implement for their format
- Built-in adapters: plain folders, Obsidian (wikilinks + callouts), Logseq (block references)
- Community submits adapters via PR — this is the highest-value contribution type

### Phase 3: Plugin System (Month 8+)

- Light plugin API for: custom renderers, additional AI providers, custom search backends
- Modeled after Vite's plugin system — simple, composable, well-documented
- This is what turns SwirlRead from a tool into a platform

---

## Monetization Roadmap

### Revenue Stream 1: SwirlRead Cloud (SaaS)

- Upload your vault (or connect a Git repo / iCloud / Dropbox)
- Read from any device without the File System Access API limitation
- Generate shareable note links
- Team access for small teams

Pricing model: freemium

- Free: personal use, 1 vault, read-only cloud access
- Pro ($6/month): unlimited vaults, shareable links, priority sync
- Team ($12/user/month): shared vaults, team search, access control

### Revenue Stream 2: SwirlRead Desktop (One-time Purchase)

- Native Tauri app with full OS filesystem access (no browser permission dance)
- Offline AI (runs a local LLM for semantic search, no API key needed)
- One-time purchase: $29 personal, $49 professional

### Revenue Stream 3: Consulting / Integration

- Help teams integrate SwirlRead into their internal documentation workflow
- Custom vault adapters for enterprise knowledge systems

### Non-Revenue That Builds the Business

- GitHub stars → developer reputation → job market signal for Wilson
- Visibility → invitations to speak or write about local-first / PKM tools
- Open source contributors → future employees or co-founders

---

## Risks to the Open Source Strategy

| Risk                                                        | Mitigation                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Someone forks it and builds a better version                | MIT allows this. Focus on being the fastest-moving, most actively maintained version.                            |
| Large company ships the same thing as a free product        | The local-first, privacy-first angle is specifically unattractive to large companies — their incentive is cloud. |
| Community asks for features that conflict with your roadmap | Maintain a clear public roadmap; label issues as `accepted` / `declined` with reason. Set expectations.          |
| Burn out maintaining an open source project                 | Don't promise a support SLA. Set boundaries early. Contributions welcome but not required to merge.              |
