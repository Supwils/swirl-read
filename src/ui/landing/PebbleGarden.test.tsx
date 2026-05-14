import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { PebbleGarden } from './PebbleGarden'
import { SampleVaultAdapter } from '@/core/vault/sample-adapter'
import { __resetDbForTests } from '@/core/persistence/db'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'

function makeAdapter(files: Record<string, string>) {
  return new SampleVaultAdapter({
    id: 'sample-pebble-test',
    name: 'Sample Pebbles',
    files,
  })
}

function renderGarden(vaultId: string) {
  return render(
    <MemoryRouter initialEntries={[`/app/${vaultId}`]}>
      <Routes>
        <Route path="/app/:vaultId" element={<PebbleGarden />} />
        <Route path="/app/:vaultId/*" element={<div>doc page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function registerSample(adapter: SampleVaultAdapter) {
  await useVaultStore.getState().registerVault(adapter)
}

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
})

afterEach(() => {
  __resetAdaptersForTests()
})

describe('PebbleGarden', () => {
  it('renders the reauthorize prompt when the vault adapter is missing', async () => {
    renderGarden('ghost-vault')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /vault unavailable/i,
      }),
    ).toBeInTheDocument()
  })

  it('renders one pebble per top-level folder with file pills inside', async () => {
    const adapter = makeAdapter({
      'knowledge/react.md': '# react',
      'knowledge/css.md': '# css',
      'knowledge/grid.html': '<h1>grid</h1>',
      'career/resume.md': '# r',
      'reading/why.md': '# why',
      'tasks/todo.md': '# t',
    })
    await registerSample(adapter)

    renderGarden(adapter.id)

    expect(
      await screen.findByRole('heading', { level: 1, name: /sample pebbles/i }),
    ).toBeInTheDocument()
    // Each folder name shows up as a pebble title.
    expect(
      await screen.findByRole('button', { name: 'knowledge' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'career' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'reading' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tasks' })).toBeInTheDocument()
    // Files inside the folders rendered as pills.
    expect(
      screen.getAllByRole('button', { name: /react/i }).length,
    ).toBeGreaterThan(0)
  })

  it('clicking a folder title drills into the folder and shows a breadcrumb back', async () => {
    const adapter = makeAdapter({
      'knowledge/react.md': '#',
      'knowledge/css.md': '#',
      'knowledge/nested/deep.md': '#',
      'career/cv.md': '#',
    })
    await registerSample(adapter)

    renderGarden(adapter.id)

    const knowledgeTitle = await screen.findByRole('button', {
      name: 'knowledge',
    })
    await userEvent.click(knowledgeTitle)

    // After drilling in, the masthead heading switches to the folder
    // name and a breadcrumb back to the vault root appears.
    expect(
      await screen.findByRole('heading', { level: 1, name: /knowledge/i }),
    ).toBeInTheDocument()
    // Vault-root crumb button uses the vault name as its label.
    expect(
      await screen.findByRole('button', { name: /sample pebbles/i }),
    ).toBeInTheDocument()
    // Nested sub-folder shows up as its own pebble in the drilled view.
    expect(
      await screen.findByRole('button', { name: 'nested' }),
    ).toBeInTheDocument()
  })

  it('+N more expands hidden files inline rather than drilling', async () => {
    const folders: Record<string, string> = {}
    // Single folder with many files so the size heuristic gives 'md' or
    // 'lg' and "+N more" is rendered.
    for (let i = 0; i < 12; i++) {
      folders[`knowledge/file-${String(i).padStart(2, '0')}.md`] = '#'
    }
    const adapter = makeAdapter(folders)
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)
    await screen.findByRole('button', { name: 'knowledge' })
    const more = await screen.findByRole('button', {
      name: /show \d+ more files/i,
    })
    await userEvent.click(more)
    // After expansion every direct file inside the folder is rendered
    // in the same pebble — count the pills as a proxy.
    await waitFor(() => {
      const pills = container.querySelectorAll('.swirlread-pebble__file-pill')
      expect(pills.length).toBe(12)
    })
    // And we have NOT navigated into the folder — the masthead still
    // shows the vault name.
    expect(
      screen.getByRole('heading', { level: 1, name: /sample pebbles/i }),
    ).toBeInTheDocument()
  })

  it('navigates to the document route when a file pill is clicked', async () => {
    const adapter = makeAdapter({
      'reading/why.md': '# why',
    })
    await registerSample(adapter)

    renderGarden(adapter.id)

    const pill = await screen.findByRole('button', { name: /why/i })
    await userEvent.click(pill)

    await waitFor(() => {
      expect(screen.getByText('doc page')).toBeInTheDocument()
    })
  })

  it('shows the empty state when the vault has no files', async () => {
    const adapter = makeAdapter({})
    await registerSample(adapter)

    renderGarden(adapter.id)

    expect(await screen.findByText(/this vault is empty/i)).toBeInTheDocument()
  })

  it('applies the folder palette via data-folder-id', async () => {
    const adapter = makeAdapter({
      'ai/prompt.md': '# p',
      'journal/today.md': '# j',
    })
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)

    await screen.findByRole('button', { name: 'ai' })
    const pebbles = container.querySelectorAll<HTMLElement>(
      '.swirlread-pebble[data-folder-id]',
    )
    const ids = Array.from(pebbles).map((p) => p.dataset.folderId)
    expect(ids).toEqual(expect.arrayContaining(['ai', 'journal']))
  })

  it('paginates past PEBBLES_PER_PAGE top-level folders', async () => {
    const folders: Record<string, string> = {}
    for (const slug of [
      'knowledge',
      'career',
      'reading',
      'ai',
      'tasks',
      'journal',
      'extra-one',
      'extra-two',
    ]) {
      folders[`${slug}/index.md`] = '#'
    }
    const adapter = makeAdapter(folders)
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)

    // ai is alphabetically first so it always renders on page 0.
    await screen.findByRole('button', { name: 'ai' })
    // Synthetic 'more folders →' pebble occupies the 6th cell when
    // page 0 cannot fit every folder.
    const moreButton = within(container).getByRole('button', {
      name: /more folders/i,
    })
    expect(moreButton).toBeInTheDocument()
  })
})
