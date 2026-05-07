# SwirlRead — Architecture Overview

> Status: Decided 2026-05-01

This document describes the high-level structure of the SwirlRead codebase. Implementation tasks reference modules defined here.

---

## Module Map

```
swirl-read/
├── public/
│   └── (static assets, including bundled sample vault)
├── src/
│   ├── app/                ← top-level routes, providers, entrypoint
│   ├── core/               ← business logic, no UI
│   │   ├── vault/          ← VaultFileSystem abstraction + adapters
│   │   ├── render/         ← markdown pipeline (unified plugins)
│   │   ├── search/         ← MiniSearch index management
│   │   ├── navigation/     ← section detection, wikilink resolution, backlinks
│   │   └── persistence/    ← IndexedDB schemas (Dexie)
│   ├── ui/
│   │   ├── reading-shell/  ← the immersive layout container
│   │   ├── command-palette/
│   │   ├── file-tree/
│   │   ├── settings-panel/
│   │   ├── landing/        ← landing page components
│   │   ├── components/     ← shared atoms (Button, Tooltip, Popover, Toast)
│   │   └── primitives/     ← unstyled, accessible primitives (often from Radix)
│   ├── themes/             ← CSS variables for sepia/light/dark/oled
│   ├── stores/             ← zustand stores (vault, ui, settings)
│   ├── hooks/              ← shared React hooks
│   ├── styles/             ← global CSS, Tailwind layer extensions
│   └── utils/
├── tests/
│   ├── e2e/
│   └── unit/
└── ...config
```

---

## Layer Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  ui/                                                         │
│  React components — pure presentation, drives via stores    │
│  No direct file I/O, no markdown parsing                    │
└─────────────────────────────────────────────────────────────┘
                           ↓ reads via hooks/selectors
┌─────────────────────────────────────────────────────────────┐
│  stores/                                                     │
│  Zustand stores — orchestrate state                         │
│  Calls into core/ for actual work                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  core/                                                       │
│  Pure logic, framework-free where possible                  │
│  ├─ vault/    — file access (FSAPI / future Tauri / sample) │
│  ├─ render/   — markdown → React tree                       │
│  ├─ search/   — index build, query                          │
│  ├─ navigation/ — wikilink resolution, section detection    │
│  └─ persistence/ — IndexedDB                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Browser APIs                                                │
│  File System Access API · IndexedDB · Web Workers           │
└─────────────────────────────────────────────────────────────┘
```

**Rules**:

- `ui/` may import from `stores/`, `hooks/`, `themes/`, `utils/`. Never directly from `core/` (decouples UI from logic).
- `core/` modules may import from each other only when necessary, and never depend on `ui/` or React.
- `stores/` is the orchestration layer — it's the only thing that calls into `core/` from the UI side.

---

## The `VaultFileSystem` Interface (Critical Abstraction)

The single most important piece of architecture. Everything builds on it.

```typescript
// src/core/vault/types.ts

export interface VaultFile {
  path: string // posix-style relative path: "career/me/me.md"
  name: string // "me.md"
  size: number // bytes
  modifiedAt: Date
  isDirectory: false
}

export interface VaultDirectory {
  path: string // "career/me"
  name: string // "me"
  isDirectory: true
}

export type VaultEntry = VaultFile | VaultDirectory

export interface VaultFileSystem {
  /** Unique identifier for this vault instance (used for persistence keys) */
  readonly id: string
  /** Display name shown in UI */
  readonly name: string

  /** List entries in a directory (non-recursive) */
  list(path: string): Promise<VaultEntry[]>

  /** Recursively walk all files; yields paths */
  walk(): AsyncIterable<VaultFile>

  /** Read a file as text */
  readText(path: string): Promise<string>

  /** Read a file as binary (for images, etc.) */
  readBinary(path: string): Promise<Uint8Array>

  /** Get a Blob URL for a file (for use in <img src=...>) */
  getBlobURL(path: string): Promise<string>

  /** Whether this filesystem currently has permission */
  hasPermission(): Promise<boolean>

  /** Request permission (no-op if already granted) */
  requestPermission(): Promise<boolean>
}
```

**Adapters that implement this**:

1. **`FSAPIVaultAdapter`** — Web App via File System Access API (Phase 1 default)
2. **`SampleVaultAdapter`** — In-memory, bundled sample content (Phase 1)
3. **`TauriVaultAdapter`** — Native filesystem (Phase 3+)

The rest of the app only knows about the interface. Switching adapters requires zero changes elsewhere.

---

## Markdown Rendering Pipeline

`src/core/render/pipeline.ts`

```
input markdown string
  ↓
unified()
  .use(remark-parse)              [CommonMark → mdast]
  .use(remark-gfm)                [tables, task lists, strikethrough]
  .use(remark-frontmatter)        [YAML frontmatter detection]
  .use(remark-math)               [math syntax]
  .use(remark-wikilink)           [CUSTOM: [[page]] → mdast wikilink node]
  .use(remark-callout)            [CUSTOM: > [!note] → mdast callout node]
  .use(remark-embed)              [CUSTOM: ![[file]] → mdast embed node]
  .use(remark-highlight)          [CUSTOM: ==text== → mdast highlight node]
  .use(remark-rehype)             [mdast → hast]
  .use(rehype-katex)              [math → HTML/SVG]
  .use(rehype-shiki)              [code highlighting]
  .use(rehype-mermaid)            [mermaid diagrams]
  .use(rehype-sanitize)           [XSS protection]
  .use(rehype-react)              [hast → React tree]
  .processSync(input)
  ↓
React component tree
```

**Custom plugins live in** `src/core/render/plugins/`:

- `remark-wikilink.ts`
- `remark-callout.ts`
- `remark-embed.ts`
- `remark-highlight.ts`

Each is a small unified plugin (~50 lines).

---

## Routing

Single-page app, URL-driven state via `react-router` v7:

```
/                            ← Landing page (with hero + CTAs)
/app                         ← App shell with vault picker / current vault
/app/:vaultId                ← Specific vault home (renders index.md)
/app/:vaultId/*              ← Specific file path within vault
```

Examples:

- `/app/sample` → sample vault home
- `/app/sample/reading/slow-reading.md` → specific file in sample vault
- `/app/my-vault/career/me/me.md` → specific file in user's vault

Vault IDs are short slugs derived from the vault folder name + a hash, e.g., `supwil-a3f7`.

---

## State Management (Zustand)

Three stores:

### `useVaultStore` — vault registration and active vault

```typescript
{
  registeredVaults: VaultMeta[]      // persisted
  activeVaultId: string | null
  activeVaultFs: VaultFileSystem | null

  registerVault(fs): VaultMeta
  switchVault(id): Promise<void>
  removeVault(id): void
}
```

### `useReaderStore` — what's being read right now

```typescript
{
  currentPath: string | null
  documentTree: HastTree | null      // parsed result
  scrollPositions: Map<path, number>
  recentPaths: string[]

  open(path): Promise<void>
  goBack(): void
  goForward(): void
}
```

### `useUIStore` — UI state (theme, panels, settings)

```typescript
{
  theme: 'sepia' | 'light' | 'dark' | 'oled' | 'auto'
  fontFamily: 'serif' | 'sans' | 'system'
  fontSize: number
  lineHeight: number
  contentWidth: 'narrow' | 'medium' | 'wide'
  zenMode: boolean
  fileTreeOpen: boolean
  fileTreePinned: boolean
  tocOpen: boolean
  commandPaletteOpen: boolean

  setTheme, setZenMode, etc...
}
```

Persistence: `useUIStore` and `useVaultStore` persist relevant fields to IndexedDB via Dexie. `useReaderStore` is mostly ephemeral but persists scroll positions per-vault.

---

## Performance Strategy

| Concern            | Approach                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| Initial vault scan | Lazy: don't pre-scan; list files on demand as user navigates                |
| Search index       | Build incrementally in Web Worker after first interaction                   |
| Large files        | Virtualize rendering (only render viewport ± buffer) for files > 5000 lines |
| Code highlighting  | Shiki bundle with on-demand language loading                                |
| Mermaid diagrams   | Lazy import; only loaded when a `mermaid` block is encountered              |
| KaTeX              | Lazy import; only loaded when math is encountered                           |
| Image rendering    | Browser-native `<img>`; let browser handle caching and decoding             |

---

## Vault Content Sync

SwirlRead reads user vaults through `VaultFileSystem`, but browser FSAPI does
not provide a portable native file watcher. The app therefore treats vault
content as cache-backed and refreshes deliberately instead of pretending it has
millisecond-level disk events.

### Sync phases

1. **P0 — manual sidebar refresh**
   - Add a refresh control to the file-tree toolbar.
   - Clear the active vault's in-memory derived caches:
     - file-tree directory listings
     - walked file list used by command palette
     - tag index
     - full-text index
     - graph cache
     - backlinks in-memory cache
   - Bump a per-vault content revision so subscribed UI re-lists the vault.
   - Do not delete persisted user state such as recents, scroll memory, tabs,
     or vault registration.

2. **P1 — focus-triggered stale marking**
   - Listen for `window.focus` / `visibilitychange`.
   - Mark the active vault as possibly stale when the user returns from another
     app.
   - Refresh only cheap visible surfaces first, such as the root or currently
     open directory listing.

3. **P2 — current document external-change detection**
   - On stale focus, `stat()` the currently open file and compare cheap metadata
     (`modifiedAt`, `size`) before re-reading.
   - In read mode, reload or show a calm "file changed" action.
   - In edit mode, never overwrite the draft; route through the existing
     stale-on-disk conflict model.

4. **P3 — slow visibility-bound polling**
   - `useVaultPollSync` ticks every 30 s while `visibilityState === 'visible'`.
   - Each tick calls `refreshVaultContent(activeVaultId)`, sharing the same
     invalidation-and-revision path as P0 manual refresh and P1 focus refresh.
   - Hidden tabs pause the timer entirely; coming back visible restarts it.
   - Only currently-expanded `FileTreeNode` instances re-list on revision bump
     (lazy-load effect is gated on `expanded`); collapsed directories pay
     nothing. Expensive derived indexes (full-text, walked-files cache) stay
     lazy and rebuild only when the palette opens.

### Revision model

Vault content refresh should flow through a small per-vault revision counter.
Components that cache derived data subscribe to `revision[vaultId]` and include
it in their load effects. Cache invalidation happens before the revision bump,
so the next read goes back through `VaultFileSystem.list()` / `walk()` instead
of returning stale promises.

Adapter writes, manual refresh, future focus detection, and future polling
should all use the same invalidation-and-revision path so internal and external
changes do not become separate systems.

---

## Web Workers

Two workers (`src/workers/`):

1. **`search-worker.ts`** — builds and queries the MiniSearch index off the main thread
2. **`markdown-worker.ts`** — (Phase 2) parses markdown off the main thread for very large files

Phase 1 ships only `search-worker`. Markdown parsing in Phase 1 is on the main thread (acceptable for typical files).

---

## Persistence Schema (IndexedDB via Dexie)

Database: `swirlread`

Tables:

- `vaults` — registered vaults (id, name, lastOpenedAt, fileHandle)
- `preferences` — global settings (theme, font, etc.)
- `vaultPreferences` — per-vault overrides (theme, last opened file)
- `recentFiles` — recent file paths per vault
- `bookmarks` — per-vault (Phase 2)
- `annotations` — per-vault (Phase 2)
- `searchIndices` — serialized search indices keyed by vaultId
- `hintsSeen` — tracks which contextual hints have been shown

Migrations are versioned in `src/core/persistence/db.ts`.

---

## Build Targets

- **Modern browsers only**: Chrome ≥ 110, Edge ≥ 110, Safari ≥ 16.4, Firefox ≥ 117
- **No IE11** support
- **ES2022 target** (top-level await, etc. used freely)
- **Module type**: ESM

This lets us use modern APIs without polyfill bloat.
