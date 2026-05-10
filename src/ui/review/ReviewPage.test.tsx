/**
 * Integration tests for the review surface.
 *
 * Seeds Dexie directly via `card-store.persistBatch` so the AI side
 * stays out of the picture — these tests are about the UX of stepping
 * through cards, not generating them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/app/router'
import { __resetDbForTests } from '@/core/persistence/db'
import { persistBatch } from '@/core/review/card-store'
import { useReviewStore } from '@/stores/review-store'
import { useReaderStore } from '@/stores/reader-store'
import { useSidebarVisibilityStore } from '@/stores/sidebar-visibility-store'
import { useTabsStore } from '@/stores/tabs-store'
import { useUIStore } from '@/stores/ui-store'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import type { ReviewBatch, ReviewCard } from '@/core/review/types'
import type { VaultId } from '@/core/vault'

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
})

async function registerVault(id: string): Promise<void> {
  const root = mockRoot('vault', { 'note.md': '# Note' })
  const adapter = FSAPIVaultAdapter.fromHandle(root, { id, name: 'vault' })
  await useVaultStore.getState().registerVault(adapter)
}

async function seedBatch(
  vaultId: VaultId,
  batchId: string,
  cards: { question: string; answer: string; explanation?: string }[],
  options: { expiresAt?: Date } = {},
): Promise<void> {
  // Far-future expiry so the lazy purge in `getBatch` doesn't drop our
  // fixture out from under the test.
  const now = new Date('2099-05-09T10:00:00Z')
  const expiresAt =
    options.expiresAt ?? new Date(now.getTime() + 24 * 3600 * 1000)

  const batch: ReviewBatch = {
    id: batchId,
    vaultId,
    sourcePaths: ['note.md'],
    label: 'note.md',
    providerLabel: 'fake-model',
    createdAt: now,
    expiresAt,
  }
  const records: ReviewCard[] = cards.map((c, i) => ({
    id: `${batchId}-card-${String(i)}`,
    batchId,
    vaultId,
    order: i,
    question: c.question,
    answer: c.answer,
    explanation: c.explanation ?? '',
    sourcePath: 'note.md',
    createdAt: now,
    expiresAt,
  }))
  await persistBatch(batch, records)
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

describe('ReviewPage — stepping through cards', () => {
  it('renders the question, click flips to the answer + explanation', async () => {
    await registerVault('rev-flip')
    await seedBatch('rev-flip', 'b1', [
      {
        question: 'What does useState return?',
        answer: 'A pair: state and setter.',
        explanation: 'Tuple destructured at the call site.',
      },
    ])

    const user = userEvent.setup()
    renderAt('/app/rev-flip/__review__/b1')

    await screen.findByText('What does useState return?')
    expect(screen.getByText(/Question/i)).toBeInTheDocument()

    const card = screen.getByRole('button', { name: /show answer/i })
    await user.click(card)

    await screen.findByText('A pair: state and setter.')
    expect(screen.getByText(/Tuple destructured/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /show question/i }),
    ).toBeInTheDocument()
  })

  it('arrow keys walk the deck and Space flips the active card', async () => {
    await registerVault('rev-keys')
    await seedBatch('rev-keys', 'b1', [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
      { question: 'Q3', answer: 'A3' },
    ])

    const user = userEvent.setup()
    renderAt('/app/rev-keys/__review__/b1')

    await screen.findByText('Q1')
    expect(screen.getByText(/Card 1 of 3/i)).toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(await screen.findByText('Q2')).toBeInTheDocument()
    expect(screen.getByText(/Card 2 of 3/i)).toBeInTheDocument()

    await user.keyboard(' ')
    expect(await screen.findByText('A2')).toBeInTheDocument()

    await user.keyboard('{ArrowLeft}')
    // Going back resets the flip — Q1's question side, not its answer.
    expect(await screen.findByText('Q1')).toBeInTheDocument()
  })

  it('shows the missing-batch state when the route id has no record', async () => {
    await registerVault('rev-missing')
    // No batch seeded.

    renderAt('/app/rev-missing/__review__/nonexistent')

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument()
  })

  it('shows the missing-batch state for a batch whose TTL has elapsed', async () => {
    await registerVault('rev-expired')
    await seedBatch('rev-expired', 'old', [{ question: 'Q', answer: 'A' }], {
      expiresAt: new Date('1999-01-01'),
    })

    renderAt('/app/rev-expired/__review__/old')

    // getBatch lazily purges expired rows on access — the page renders
    // its missing fallback rather than the cards.
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument()
  })
})
