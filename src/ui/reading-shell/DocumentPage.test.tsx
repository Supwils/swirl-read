import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DocumentPage } from './DocumentPage'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import {
  getBacklinksForFile,
  indexBacklinksForFile,
  __resetBacklinksForTests,
} from '@/core/navigation/backlinks'
import { buildWikilinkIndex } from '@/core/navigation/wikilink-resolver'
import { getRecentFilesForVault, useReaderStore } from '@/stores/reader-store'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { DEFAULT_FRONTMATTER_DISPLAY, useUIStore } from '@/stores/ui-store'
import { useTagStore } from '@/stores/tag-store'
import { useTocStore } from '@/stores/toc-store'
import { __resetDbForTests } from '@/core/persistence/db'

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetBacklinksForTests()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
  })
  useReaderStore.setState({
    recentByVault: {},
    scrollByVault: {},
    ready: true,
  })
  useUIStore.setState({
    frontmatterDisplay: DEFAULT_FRONTMATTER_DISPLAY,
  })
  useTocStore.setState({ headings: [], activeId: null })
  useTagStore.setState({ selectedTag: null })
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: '/app/:vaultId/*', element: <DocumentPage /> }],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

async function registerSampleVault() {
  const root = mockRoot('supwil', {
    'index.md': '# Welcome to my Vault\n\nThis is **bold** text.',
    knowledge: {
      'react.md': `# React

Some notes about React.

## Hooks

- useState
- useEffect
- useMemo

\`\`\`ts
const [count, setCount] = useState(0)
\`\`\`
`,
    },
    'logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    'metadata.json': '{"version": 1}',
    'util.ts': 'export const greeting = "hello"',
  })
  const adapter = FSAPIVaultAdapter.fromHandle(root, {
    id: 'supwil-doc',
    name: 'supwil',
  })
  await useVaultStore.getState().registerVault(adapter)
  return adapter
}

describe('DocumentPage — markdown rendering', () => {
  it('renders a markdown file from the registered vault', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/index.md')

    await waitFor(() => {
      // RX1: page header + body H1 both carry the title; either suffices.
      const headings = screen.getAllByRole('heading', {
        level: 1,
        name: /welcome to my vault/i,
      })
      expect(headings.length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('records successfully opened files in the recent-files store', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/index.md')

    await waitFor(() => {
      expect(getRecentFilesForVault('supwil-doc')[0]?.path).toBe('index.md')
    })
  })

  it('indexes backlinks after successfully rendering markdown', async () => {
    const root = mockRoot('supwil', {
      'host.md': '# Host\n\nSee [[target]].',
      'target.md': '# Target',
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)

    renderAt('/app/supwil-doc/host.md')

    await waitFor(async () => {
      const backlinks = await getBacklinksForFile('supwil-doc', 'target.md')
      expect(backlinks.map((item) => item.sourcePath)).toEqual(['host.md'])
    })
  })

  it('shows backlinks at the bottom of a document and navigates to the source', async () => {
    const user = userEvent.setup()
    const root = mockRoot('supwil', {
      'source.md': '# Source\n\nThis links to [[target]].',
      'target.md': '# Target\n\nTarget body.',
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)
    const index = await buildWikilinkIndex(adapter)
    await indexBacklinksForFile(
      'supwil-doc',
      'source.md',
      '# Source\n\nThis links to [[target]].',
      index,
    )

    renderAt('/app/supwil-doc/target.md')

    const backlink = await screen.findByRole('link', { name: 'source.md' })
    expect(backlink).toHaveAttribute('href', '/app/supwil-doc/source.md')
    // RX5: snippet wraps `[[target]]` in <mark>, so the text is split across
    // elements. Match by composed textContent on the snippet container.
    const snippet = screen
      .getAllByText((_, element) =>
        Boolean(
          element?.textContent
            ?.toLowerCase()
            .includes('this links to [[target]]'),
        ),
      )
      .find((node) => node.classList.contains('swirlread-backlinks__context'))
    expect(snippet).toBeDefined()

    await user.click(backlink)

    await waitFor(() => {
      // RX1: page header + body H1 both render "Source" — accept either.
      const headings = screen.getAllByRole('heading', {
        level: 1,
        name: 'Source',
      })
      expect(headings.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders nested markdown with headings, lists, and code blocks', async () => {
    await registerSampleVault()
    const { container } = renderAt('/app/supwil-doc/knowledge/react.md')

    // Wait for an element only the rendered markdown produces — page
    // header alone matches /react/i so we'd race the loading state.
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /hooks/i }),
      ).toBeInTheDocument()
    })
    // List items appear as their own list elements
    const listItems = container.querySelectorAll('ul li')
    const itemTexts = Array.from(listItems).map((li) => li.textContent)
    expect(itemTexts).toContain('useState')
    expect(itemTexts).toContain('useEffect')
    expect(itemTexts).toContain('useMemo')

    // Shiki tokenizes the code into per-token spans; assert against the
    // <pre>'s aggregated textContent rather than searching for a single span.
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain('const [count, setCount] = useState(0)')
  })

  it('shows missing-vault state when vault id is unknown (M6.3 reauthorize prompt)', async () => {
    renderAt('/app/never-registered/some.md')
    // Default state when no saved handle exists: prompts user to pick again.
    expect(
      await screen.findByText(/no saved handle for this vault/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /never-registered/i }),
    ).toBeInTheDocument()
  })

  it('shows missing-file state when path resolves but file does not exist', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/does-not-exist.md')

    // RX7 reworded the empty-state copy. Title is the visible anchor;
    // body explains what to try next.
    expect(await screen.findByText(/^file not found$/i)).toBeInTheDocument()
    expect(
      screen.getByText(/this path doesn't exist in the current vault/i),
    ).toBeInTheDocument()
  })

  it('renders source-code files via the CodeFileRenderer (M7.7)', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/util.ts')

    // Shiki splits the source into multiple spans, so we assert via the
    // code-file-renderer container's full textContent instead.
    const block = await screen.findByTestId('code-file-renderer')
    expect(block.textContent).toContain('hello')
    expect(block.querySelector('pre')).not.toBeNull()
  })

  it('renders an image embed as <img> with a blob URL', async () => {
    const root = mockRoot('supwil', {
      'index.md': 'Cover image:\n\n![[logo.png]]',
      'logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]),
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)
    const { container } = renderAt('/app/supwil-doc/index.md')

    await waitFor(() => {
      const img = container.querySelector('img.swirlread-embed--image')
      expect(img).not.toBeNull()
      expect(img?.getAttribute('src')).toMatch(/^blob:/)
    })
  })

  it('shows a broken-state notice when the embed target does not exist', async () => {
    const root = mockRoot('supwil', {
      'index.md': '![[nonexistent.png]]',
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)
    renderAt('/app/supwil-doc/index.md')

    await waitFor(() => {
      expect(screen.getByText(/couldn't find/i)).toBeInTheDocument()
    })
  })

  it('embeds a markdown file inline with cycle detection', async () => {
    const root = mockRoot('supwil', {
      'host.md': '# Host\n\n![[snippet.md]]',
      'snippet.md': '## Embedded heading\n\nReusable text.',
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)
    const { container } = renderAt('/app/supwil-doc/host.md')

    await waitFor(() => {
      expect(
        container.querySelector('aside.swirlread-embed--markdown'),
      ).not.toBeNull()
    })
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /embedded heading/i }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText(/reusable text/i)).toBeInTheDocument()
  })

  it('breaks a self-embedding cycle with a notice', async () => {
    const root = mockRoot('supwil', {
      'loop.md': '# Loop\n\n![[loop.md]]',
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)
    renderAt('/app/supwil-doc/loop.md')

    await waitFor(() => {
      expect(screen.getByText(/circular embed prevented/i)).toBeInTheDocument()
    })
  })

  it('keeps the vault id and file path visible in the breadcrumb', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/knowledge/react.md')

    await waitFor(() => {
      // Both pieces still appear — vault id is the small caps in the
      // breadcrumb, full path is the muted mono row beside it.
      expect(screen.getByText('supwil-doc')).toBeInTheDocument()
    })
    expect(screen.getByText('knowledge/react.md')).toBeInTheDocument()
  })

  describe('RX1 — derived page title', () => {
    it('uses the first body H1 as the document header title', async () => {
      const root = mockRoot('supwil', {
        knowledge: {
          'react.md': '# React Hooks\n\nbody about hooks',
        },
      })
      const adapter = FSAPIVaultAdapter.fromHandle(root, {
        id: 'supwil-doc',
        name: 'supwil',
      })
      await useVaultStore.getState().registerVault(adapter)

      renderAt('/app/supwil-doc/knowledge/react.md')

      await waitFor(() => {
        const titles = screen.getAllByRole('heading', {
          level: 1,
          name: 'React Hooks',
        })
        // One in the page header, one in the rendered body — both are
        // expected. The header title comes from RX1; the body H1 is
        // preserved so the TOC still picks it up.
        expect(titles.length).toBeGreaterThanOrEqual(1)
      })
      // The header title sits inside the article header element.
      const header = document.querySelector('.swirlread-doc-header__title')
      expect(header?.textContent).toBe('React Hooks')
    })

    it('falls back to a cleaned filename when the doc has no H1', async () => {
      const root = mockRoot('supwil', {
        career: {
          'career-map.md': 'No leading heading.\n\nJust prose.',
        },
      })
      const adapter = FSAPIVaultAdapter.fromHandle(root, {
        id: 'supwil-doc',
        name: 'supwil',
      })
      await useVaultStore.getState().registerVault(adapter)

      renderAt('/app/supwil-doc/career/career-map.md')

      await waitFor(() => {
        const header = document.querySelector('.swirlread-doc-header__title')
        expect(header?.textContent).toBe('Career Map')
      })
    })

    it('prefers a frontmatter title over both the body H1 and the filename', async () => {
      const root = mockRoot('supwil', {
        'with-fm.md': `---
title: A Considered Note
---

# Body Heading
`,
      })
      const adapter = FSAPIVaultAdapter.fromHandle(root, {
        id: 'supwil-doc',
        name: 'supwil',
      })
      await useVaultStore.getState().registerVault(adapter)

      renderAt('/app/supwil-doc/with-fm.md')

      await waitFor(() => {
        const header = document.querySelector('.swirlread-doc-header__title')
        expect(header?.textContent).toBe('A Considered Note')
      })
      // Body H1 still rendered (TOC depends on it).
      expect(
        screen.getByRole('heading', { level: 1, name: 'Body Heading' }),
      ).toBeInTheDocument()
    })
  })

  describe('RX7 — productized loading state', () => {
    it('renders a column-width skeleton instead of plain text while loading', async () => {
      const root = mockRoot('supwil', {
        'slow.md': '# slow doc\n\nbody',
      })
      const adapter = FSAPIVaultAdapter.fromHandle(root, {
        id: 'supwil-doc',
        name: 'supwil',
      })
      await useVaultStore.getState().registerVault(adapter)

      // Race-free: stub readText so the loading state stays up long
      // enough to inspect even when prior tests warmed caches.
      const realRead = adapter.readText.bind(adapter)
      let resolveRead: (value: string) => void = () => undefined
      adapter.readText = () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve
        })

      renderAt('/app/supwil-doc/slow.md')

      const skeleton = await screen.findByRole('status', {
        name: /loading document/i,
      })
      expect(
        skeleton.querySelectorAll('.swirlread-doc-skeleton__line').length,
      ).toBeGreaterThan(0)
      // Plain "Reading…" italic is gone — the skeleton has the text
      // only as sr-only for assistive tech.
      expect(skeleton.querySelector('.sr-only')?.textContent).toMatch(
        /reading/i,
      )

      // Resolve the read so the test cleans up gracefully.
      const real = await realRead('slow.md')
      resolveRead(real)
      await waitFor(() => {
        expect(
          screen.queryByRole('status', { name: /loading document/i }),
        ).not.toBeInTheDocument()
      })
    })
  })

  it('renders frontmatter metadata above the prose body (M3.10)', async () => {
    const root = mockRoot('supwil', {
      'with-fm.md': `---
title: A Considered Note
description: A short subtitle
date: 2026-04-12
author: Wilson
tags: [reading, ai]
---

# Body Heading

Hello.
`,
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)

    renderAt('/app/supwil-doc/with-fm.md')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'A Considered Note' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('A short subtitle')).toBeInTheDocument()
    expect(screen.getByText('2026-04-12')).toBeInTheDocument()
    expect(screen.getByText('Wilson')).toBeInTheDocument()
    expect(screen.getByText('reading')).toBeInTheDocument()
    expect(screen.getByText('ai')).toBeInTheDocument()

    // Body H1 still rendered (frontmatter metadata is additive, not a
    // replacement for body content).
    expect(
      screen.getByRole('heading', { level: 1, name: 'Body Heading' }),
    ).toBeInTheDocument()

    // YAML key labels never leak as visible text.
    expect(screen.queryByText(/^title:/)).not.toBeInTheDocument()
  })

  it('hides the frontmatter panel when the user pref is "hidden" (page title still shows in header per RX1)', async () => {
    const root = mockRoot('supwil', {
      'with-fm.md': `---
title: Hidden
description: Should not appear
tags: [secret]
---

Body.
`,
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)
    useUIStore.setState({ frontmatterDisplay: 'hidden' })

    renderAt('/app/supwil-doc/with-fm.md')

    await waitFor(() => {
      expect(screen.getByText('Body.')).toBeInTheDocument()
    })
    // RX1: title remains in the document header — the "hidden" pref
    // hides the metadata RAIL (description / tags / etc.), not the
    // page identity.
    expect(
      document.querySelector('.swirlread-doc-header__title')?.textContent,
    ).toBe('Hidden')
    // The metadata rail itself is gone.
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('publishes document headings to the TOC store after rendering (M4.6)', async () => {
    const root = mockRoot('supwil', {
      'with-headings.md': `# Top
Body.

## Why

Why text.

## How

How text.
`,
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)

    renderAt('/app/supwil-doc/with-headings.md')

    await waitFor(() => {
      expect(useTocStore.getState().headings.length).toBeGreaterThan(0)
    })
    const titles = useTocStore.getState().headings.map((h) => h.text)
    expect(titles).toEqual(['Top', 'Why', 'How'])
  })

  it('clears the TOC store when navigating away from a markdown file (M4.6)', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/util.ts')

    await screen.findByTestId('code-file-renderer')
    expect(useTocStore.getState().headings).toEqual([])
  })

  it('renders all frontmatter fields when the user pref is "raw"', async () => {
    const root = mockRoot('supwil', {
      'with-fm.md': `---
title: Raw View
custom: value
draft: true
---

Body.
`,
    })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'supwil-doc',
      name: 'supwil',
    })
    await useVaultStore.getState().registerVault(adapter)
    useUIStore.setState({ frontmatterDisplay: 'raw' })

    renderAt('/app/supwil-doc/with-fm.md')

    await waitFor(() => {
      expect(screen.getByText('Frontmatter')).toBeInTheDocument()
    })
    // Every key (including unrecognised ones) appears.
    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('custom')).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
    // RX1: "Raw View" appears in the page header AND in the raw
    // frontmatter table; assert at least one match (the raw row is
    // the one we care about for this test).
    expect(screen.getAllByText('Raw View').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('value')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
  })
})
