/**
 * Integration tests for the card-generation dialog.
 *
 * The dialog is mounted at AppShell level via review-store. Tests
 * exercise the full flow: open intent, model stream, navigate-on-
 * success, cancel-while-generating, parse-failure error path.
 *
 * The AI side is faked by spying on `globalThis.fetch` so we exercise
 * the real Anthropic provider, the real generator, the real Dexie
 * persistence, and React Router. Mocking at the fetch boundary keeps
 * the test honest without painting jsdom-specific shortcuts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/app/router'
import { __resetDbForTests } from '@/core/persistence/db'
import { setAIKey } from '@/core/ai/key-store'
import { useReviewStore } from '@/stores/review-store'
import { useReaderStore } from '@/stores/reader-store'
import { useSidebarVisibilityStore } from '@/stores/sidebar-visibility-store'
import { useTabsStore } from '@/stores/tabs-store'
import { useUIStore } from '@/stores/ui-store'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import type { MockTreeNode } from '@/core/vault/__test-helpers__/mock-fs'
import type { VaultId, VaultPath } from '@/core/vault'

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
    adapterRevision: 0,
    contentRevisionByVault: {},
  })
  useUIStore.setState({ ready: true, chromeMode: 'working' })
  useReaderStore.setState({ recentByVault: {}, scrollByVault: {}, ready: true })
  useTabsStore.setState({
    tabsByVault: {},
    recentlyClosedByVault: {},
    tabCapHit: false,
    previewReplaced: false,
    ready: true,
  })
  useSidebarVisibilityStore.setState({ hiddenByVault: {}, ready: false })
  await useSidebarVisibilityStore.getState().init()
  useReviewStore.setState({ pending: null })
})

afterEach(() => {
  vi.restoreAllMocks()
  useReviewStore.setState({ pending: null })
})

async function registerVault(id: string, tree: MockTreeNode): Promise<void> {
  const root = mockRoot('vault', tree)
  const adapter = FSAPIVaultAdapter.fromHandle(root, { id, name: 'vault' })
  await useVaultStore.getState().registerVault(adapter)
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

interface AnthropicChunk {
  type: 'message_start' | 'content_block_delta' | 'message_stop'
  delta?: { type: 'text_delta'; text: string }
}

/** Anthropic-shaped SSE response with the model "thinking" between
 *  events so the test can fire `abort()` mid-stream. Each call to the
 *  factory yields a fresh ReadableStream — re-using a Response trips
 *  "stream is locked" on later requests. */
function anthropicStreamFactory(
  events: AnthropicChunk[],
  options: { delayMs?: number } = {},
) {
  const encoder = new TextEncoder()
  const delay = options.delayMs ?? 0
  return () => {
    let i = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (i >= events.length) {
          controller.close()
          return
        }
        if (delay > 0) await new Promise((r) => setTimeout(r, delay))
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(events[i])}\n\n`),
        )
        i += 1
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

function asTextDelta(text: string): AnthropicChunk {
  return {
    type: 'content_block_delta',
    delta: { type: 'text_delta', text },
  }
}

function fireGenerate(vaultId: VaultId, path: VaultPath): void {
  useReviewStore.getState().requestGenerate({ vaultId, path })
}

describe('GenerateCardsDialog — full flow', () => {
  it('streams cards, persists the batch, navigates to the review page', async () => {
    await registerVault('gen-flow', {
      'note.md': '# Note\n\nReact has hooks.',
    })
    await setAIKey('anthropic', 'sk-ant-test')

    const cards = JSON.stringify([
      { question: 'Q1', answer: 'A1', explanation: 'E1' },
      { question: 'Q2', answer: 'A2', explanation: 'E2' },
    ])
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      anthropicStreamFactory([
        { type: 'message_start' },
        asTextDelta(cards),
        { type: 'message_stop' },
      ]),
    )

    const user = userEvent.setup()
    renderAt('/app/gen-flow/note.md')

    fireGenerate('gen-flow', 'note.md')

    // Dialog opens with idle UI — slider + Generate.
    const generateBtn = await screen.findByRole('button', {
      name: /^generate$/i,
    })
    await user.click(generateBtn)

    // After the model returns, we navigate to /__review__/<batchId>.
    // ReviewPage is lazy — wait for the question text to appear.
    await waitFor(
      () => {
        expect(screen.getByText('Q1')).toBeInTheDocument()
      },
      { timeout: 4000 },
    )
    // Dialog should be closed by then.
    expect(useReviewStore.getState().pending).toBeNull()
  })

  it('surfaces a parse-failure error with Retry when the model returns junk', async () => {
    await registerVault('gen-err', { 'note.md': '# Note' })
    await setAIKey('anthropic', 'sk-ant-test')

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      anthropicStreamFactory([
        { type: 'message_start' },
        asTextDelta('I cannot help with that.'),
        { type: 'message_stop' },
      ]),
    )

    const user = userEvent.setup()
    renderAt('/app/gen-err/note.md')
    fireGenerate('gen-err', 'note.md')

    await user.click(await screen.findByRole('button', { name: /^generate$/i }))

    // Error UI appears — both Close and Retry are reachable.
    await screen.findByText(/could not parse as cards/i, undefined, {
      timeout: 4000,
    })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    // The dialog stays open so the user can read the error and retry.
    expect(useReviewStore.getState().pending).not.toBeNull()
  })

  it('Cancel during generation aborts the fetch and keeps the user on the document', async () => {
    await registerVault('gen-cancel', { 'note.md': '# Note' })
    await setAIKey('anthropic', 'sk-ant-test')

    // Slow stream so the test can cancel before completion. Each chunk
    // takes 80ms; the full stream is ~250ms which gives us a clear
    // window to fire Cancel after Generate.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      anthropicStreamFactory(
        [
          { type: 'message_start' },
          asTextDelta('[{"question":"Q","answer":"A"}]'),
          { type: 'message_stop' },
        ],
        { delayMs: 80 },
      ),
    )

    const user = userEvent.setup()
    renderAt('/app/gen-cancel/note.md')
    fireGenerate('gen-cancel', 'note.md')

    await user.click(await screen.findByRole('button', { name: /^generate$/i }))

    // The "Asking the model" status appears once the request is in
    // flight — that's our signal the AbortController is now hot.
    await screen.findByText(/Asking the model/i)
    const cancelBtn = await screen.findByRole('button', { name: /^cancel$/i })
    await user.click(cancelBtn)

    // Even if the stream eventually completes, post-cancel navigation
    // is suppressed. Confirm by waiting a tick longer than the stream
    // would have taken: we should NOT be on the review page.
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.queryByText(/of\s+\d+/i)).not.toBeInTheDocument()
    expect(useReviewStore.getState().pending).toBeNull()
  })

  it('shows the no-provider error when nothing is configured', async () => {
    await registerVault('gen-no-key', { 'note.md': '# Note' })
    // Deliberately no setAIKey call.

    const user = userEvent.setup()
    renderAt('/app/gen-no-key/note.md')
    fireGenerate('gen-no-key', 'note.md')

    await user.click(await screen.findByRole('button', { name: /^generate$/i }))

    expect(
      await screen.findByText(/no ai provider configured/i),
    ).toBeInTheDocument()
  })
})
