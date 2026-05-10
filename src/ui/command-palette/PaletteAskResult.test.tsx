/**
 * Behavioural tests for the AI answer surface inside the command palette.
 * Covers the rich-render upgrade: Markdown body, clickable wikilinks,
 * clickable source chips, and the copy-answer affordance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { CommandPalette } from './CommandPalette'
import { __resetWalkedFilesCacheForTests } from './walked-files-cache'
import { __resetFullTextCacheForTests } from './full-text-cache'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import { useReaderStore } from '@/stores/reader-store'
import { useTabsStore } from '@/stores/tabs-store'
import { useTocStore } from '@/stores/toc-store'
import { useUIStore } from '@/stores/ui-store'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { __resetDbForTests } from '@/core/persistence/db'
import { setAIKey, setActiveProvider } from '@/core/ai/key-store'
import { XIAOMI_DEFAULT_BASE_URL } from '@/core/ai/xiaomi-provider'

const EMPTY_TOC_CONTEXT = {
  vaultId: null,
  path: null,
  tags: [],
  outgoingLinks: 0,
}

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  __resetWalkedFilesCacheForTests()
  __resetFullTextCacheForTests()
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
  useTocStore.setState({
    headings: [],
    activeId: null,
    context: EMPTY_TOC_CONTEXT,
  })
  useUIStore.setState({ commandPaletteOpen: false })
  useTabsStore.setState({
    tabsByVault: {},
    recentlyClosedByVault: {},
    tabCapHit: false,
    previewReplaced: false,
    ready: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  useUIStore.setState({ commandPaletteOpen: false })
})

function ShellWithPalette() {
  return (
    <div>
      <Outlet />
      <CommandPalette />
    </div>
  )
}

function renderPaletteAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/app',
        element: <ShellWithPalette />,
        children: [
          { index: true, element: <div data-testid="no-vault-stub" /> },
          { path: ':vaultId', element: <div data-testid="vault-home-stub" /> },
          { path: ':vaultId/*', element: <div data-testid="doc-stub" /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

async function registerVault(
  id: string,
  tree: Parameters<typeof mockRoot>[1],
): Promise<FSAPIVaultAdapter> {
  const root = mockRoot('vault', tree)
  const adapter = FSAPIVaultAdapter.fromHandle(root, { id, name: 'My Vault' })
  await useVaultStore.getState().registerVault(adapter)
  return adapter
}

/** Build a factory that yields a fresh Anthropic-shaped SSE response on
 *  every call. Each keystroke restarts the ask request, so the mocked
 *  fetch must produce a new ReadableStream per invocation — sharing one
 *  Response across calls trips "stream is locked". */
function streamFactory(chunks: string[]): () => Promise<Response> {
  const encoder = new TextEncoder()
  const payload = [
    `data: ${JSON.stringify({ type: 'message_start' })}\n\n`,
    ...chunks.map(
      (c) =>
        `data: ${JSON.stringify({
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: c },
        })}\n\n`,
    ),
    `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ].join('')
  return () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload))
        controller.close()
      },
    })
    return Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
  }
}

describe('PaletteAskResult — rich answer rendering', () => {
  it('renders the streamed answer through the Markdown pipeline', async () => {
    await registerVault('ai-md', { 'note.md': '# Note\n\nbody' })
    await setAIKey('anthropic', 'sk-ant-test')

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        streamFactory(['Here is **bold** text and a list:\n\n- one\n- two\n']),
      )

    const user = userEvent.setup()
    renderPaletteAt('/app/ai-md/note.md')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/Search files/i)
    await user.type(input, '? what is this?')

    // Pipeline turns **bold** into <strong>; assert the rendered tag
    // exists rather than the raw asterisks.
    const bold = await screen.findByText('bold', undefined, { timeout: 4000 })
    expect(bold.tagName).toBe('STRONG')

    // Lists land as proper <li> nodes.
    expect(await screen.findByText('one')).toBeInTheDocument()
    expect(await screen.findByText('two')).toBeInTheDocument()

    expect(fetchSpy).toHaveBeenCalled()
  })

  it('turns wikilinks the model emits into clickable resolved links', async () => {
    await registerVault('ai-wikilink', {
      'note.md': '# Note',
      'react.md': '# React',
    })
    await setAIKey('anthropic', 'sk-ant-test')

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      streamFactory(['See [[react]] for the long version.']),
    )

    const user = userEvent.setup()
    renderPaletteAt('/app/ai-wikilink/note.md')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/Search files/i)
    await user.type(input, '? where is react?')

    const link = await screen.findByRole(
      'link',
      { name: 'react' },
      { timeout: 4000 },
    )
    expect(link.getAttribute('href')).toBe('/app/ai-wikilink/react.md')
    expect(link).toHaveClass('swirlread-wikilink--resolved')
  })

  it('renders source neighbours as clickable chips that navigate', async () => {
    const user = userEvent.setup()
    await registerVault('ai-sources', {
      'note.md': '# Note\n\nLinks to [[react]] for context.',
      'react.md': '# React\n\nbody',
    })
    await setAIKey('anthropic', 'sk-ant-test')

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      streamFactory(['Short answer.']),
    )

    renderPaletteAt('/app/ai-sources/note.md')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/Search files/i)
    await user.type(input, '? tell me about react')

    // Source chip is a real button with the file basename — react.md
    // is the only neighbour `note.md` links to, so it should appear.
    const chip = await screen.findByRole(
      'button',
      { name: /react\.md/i },
      { timeout: 4000 },
    )
    await user.click(chip)

    // Selecting a source closes the palette and routes to the note.
    await waitFor(() => {
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })
    expect(await screen.findByTestId('doc-stub')).toBeInTheDocument()
  })

  it('routes ⌘K through Xiaomi when the user picks it as default', async () => {
    await registerVault('ai-xiaomi-active', { 'note.md': '# Note' })
    // Both providers configured — without the explicit default,
    // resolveProvider's chain would prefer Anthropic. The active-provider
    // preference must override that.
    await setAIKey('anthropic', 'sk-ant-also-set')
    await setAIKey('xiaomi', 'tp-xiaomi-active')
    await setActiveProvider('xiaomi')

    // Build an OpenAI-compatible-shaped response (matches Xiaomi's wire
    // format) so the routing — not the parsing — is what's under test.
    const encoder = new TextEncoder()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                choices: [{ delta: { content: 'xiaomi answer' } }],
              })}\n\ndata: [DONE]\n\n`,
            ),
          )
          controller.close()
        },
      })
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
    })

    const user = userEvent.setup()
    renderPaletteAt('/app/ai-xiaomi-active/note.md')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/Search files/i)
    await user.type(input, '? hello')

    await screen.findByText(/xiaomi answer/i, undefined, { timeout: 4000 })

    // Every fetch should have hit the Xiaomi base URL — never the
    // Anthropic endpoint that would have been picked by the default chain.
    const urls = fetchSpy.mock.calls.map((c) =>
      typeof c[0] === 'string' ? c[0] : '',
    )
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url).toBe(`${XIAOMI_DEFAULT_BASE_URL}/chat/completions`)
    }
  })

  it('exposes a copy-answer button after the stream completes', async () => {
    await registerVault('ai-copy', { 'note.md': '# Note' })
    await setAIKey('anthropic', 'sk-ant-test')

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      streamFactory(['Final answer text.']),
    )

    // jsdom ships its own non-configurable navigator.clipboard, so the
    // defineProperty trick won't replace it — spy on the live method
    // directly. vi.restoreAllMocks unwinds the spy in afterEach.
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)

    const user = userEvent.setup()
    renderPaletteAt('/app/ai-copy/note.md')
    useUIStore.getState().setCommandPaletteOpen(true)

    const input = await screen.findByPlaceholderText(/Search files/i)
    await user.type(input, '? give me a sentence')

    const copyBtn = await screen.findByRole(
      'button',
      { name: /copy answer/i },
      { timeout: 4000 },
    )
    await user.click(copyBtn)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    expect(writeText.mock.calls[0]?.[0]).toBe('Final answer text.')
    // Affordance flips to "copied" while the timer is live.
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })
})
