import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { PebbleGarden } from './PebbleGarden'
import { SampleVaultAdapter } from '@/core/vault/sample-adapter'
import { __resetFolderWeightCacheForTests } from '@/core/vault/folder-weight'
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
  __resetFolderWeightCacheForTests()
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

  it('renders system folders muted and last', async () => {
    const adapter = makeAdapter({
      'knowledge/a.md': '#',
      'knowledge/b.md': '#',
      '.git/HEAD': 'ref',
      '.git/config': '[core]',
    })
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)

    await screen.findByRole('button', { name: 'knowledge' })
    // The system folder is shown, not hidden.
    const gitTitle = await screen.findByRole('button', { name: '.git' })
    expect(gitTitle).toBeInTheDocument()

    // Its pebble carries the muted flag…
    const gitPebble = gitTitle.closest('.swirlread-pebble')
    expect(gitPebble).toHaveAttribute('data-muted', 'true')
    // …while a content folder does not.
    const knowledgePebble = screen
      .getByRole('button', { name: 'knowledge' })
      .closest('.swirlread-pebble')
    expect(knowledgePebble).not.toHaveAttribute('data-muted')

    // …and it sorts after the content folder in DOM order.
    const titles = Array.from(
      container.querySelectorAll('.swirlread-pebble__title'),
    ).map((el) => el.textContent)
    expect(titles.indexOf('knowledge')).toBeLessThan(titles.indexOf('.git'))
  })

  it('sizes a content-heavy folder larger than a sparse one', async () => {
    const files: Record<string, string> = {
      'small/only.md': '#',
    }
    // 41 recursive descendant files → weight ≥ 40 → 'lg'.
    for (let i = 0; i < 41; i++) {
      files[`big/nested/note-${String(i).padStart(2, '0')}.md`] = '#'
    }
    const adapter = makeAdapter(files)
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)
    await screen.findByRole('button', { name: 'big' })

    // Weights resolve asynchronously after first paint; wait for the heavy
    // folder's cell to upgrade to the large span.
    await waitFor(() => {
      const bigCell = screen
        .getByRole('button', { name: 'big' })
        .closest('.swirlread-pebble-garden__cell')
      expect(bigCell).toHaveAttribute('data-size', 'lg')
    })

    const smallCell = within(container)
      .getByRole('button', { name: 'small' })
      .closest('.swirlread-pebble-garden__cell')
    expect(smallCell).toHaveAttribute('data-size', 'sm')
  })

  it('shows a Back button when drilled that goes up one level', async () => {
    const adapter = makeAdapter({
      'knowledge/sub/deep.md': '#',
      'knowledge/top.md': '#',
    })
    await registerSample(adapter)

    renderGarden(adapter.id)

    await userEvent.click(
      await screen.findByRole('button', { name: 'knowledge' }),
    )
    // Inside `knowledge` now; the nested folder appears.
    await screen.findByRole('button', { name: 'sub' })
    await userEvent.click(await screen.findByRole('button', { name: 'sub' }))

    // Two levels deep → a Back button is present.
    const back = await screen.findByRole('button', { name: /back/i })
    expect(back).toBeInTheDocument()
    await userEvent.click(back)

    // Back from `sub` lands on `knowledge` (one level up), not the root.
    expect(
      await screen.findByRole('heading', { level: 1, name: /knowledge/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'sub' })).toBeInTheDocument()

    // From `knowledge`, Back returns to the vault root.
    await userEvent.click(await screen.findByRole('button', { name: /back/i }))
    expect(
      await screen.findByRole('heading', { level: 1, name: /sample pebbles/i }),
    ).toBeInTheDocument()
  })

  it('opens a folder context menu on right-click with pane actions', async () => {
    const adapter = makeAdapter({
      'knowledge/a.md': '#',
      'knowledge/b.md': '#',
    })
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)
    await screen.findByRole('button', { name: 'knowledge' })

    const pebble = container.querySelector('.swirlread-pebble')
    expect(pebble).not.toBeNull()
    fireEvent.contextMenu(pebble!)

    // Folder menu surfaces the pane actions…
    expect(await screen.findByText('Open left')).toBeInTheDocument()
    expect(screen.getByText('Open right')).toBeInTheDocument()
    // …but hides file-only actions like Copy contents.
    expect(screen.queryByText('Copy contents')).not.toBeInTheDocument()
  })

  it('renders sub-folders as chips inside the folder pebble', async () => {
    const adapter = makeAdapter({
      'knowledge/readme.md': '#',
      'knowledge/projects/plan.md': '#',
      'knowledge/goals/q1.md': '#',
    })
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)
    await screen.findByRole('button', { name: 'knowledge' })

    // The sub-folders surface as their own chips inside the card — without
    // drilling in first. The chips carry the folder color via data-folder-id.
    const chips = Array.from(
      container.querySelectorAll<HTMLElement>('.swirlread-pebble__folder-chip'),
    )
    const chipNames = chips.map(
      (chip) =>
        chip.querySelector('.swirlread-pebble__folder-chip-name')?.textContent,
    )
    expect(chipNames).toEqual(expect.arrayContaining(['projects', 'goals']))
  })

  it('drills into a sub-folder when its chip is clicked', async () => {
    const adapter = makeAdapter({
      'knowledge/readme.md': '#',
      'knowledge/projects/plan.md': '#',
    })
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)
    await screen.findByRole('button', { name: 'knowledge' })

    const projectsChip = Array.from(
      container.querySelectorAll<HTMLElement>('.swirlread-pebble__folder-chip'),
    ).find(
      (chip) =>
        chip.querySelector('.swirlread-pebble__folder-chip-name')
          ?.textContent === 'projects',
    )
    expect(projectsChip).toBeDefined()
    await userEvent.click(projectsChip!)

    // Drilling into `projects` switches the masthead heading and exposes the
    // Back affordance, mirroring the title-click drill behaviour.
    expect(
      await screen.findByRole('heading', { level: 1, name: /projects/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /back/i }),
    ).toBeInTheDocument()
  })

  it('opens the folder context menu on sub-folder chip right-click', async () => {
    const adapter = makeAdapter({
      'knowledge/readme.md': '#',
      'knowledge/projects/plan.md': '#',
    })
    await registerSample(adapter)

    const { container } = renderGarden(adapter.id)
    await screen.findByRole('button', { name: 'knowledge' })

    const projectsChip = Array.from(
      container.querySelectorAll<HTMLElement>('.swirlread-pebble__folder-chip'),
    ).find(
      (chip) =>
        chip.querySelector('.swirlread-pebble__folder-chip-name')
          ?.textContent === 'projects',
    )
    expect(projectsChip).toBeDefined()
    fireEvent.contextMenu(projectsChip!)

    // The chip opens the FOLDER menu (pane actions present, file-only absent).
    expect(await screen.findByText('Open left')).toBeInTheDocument()
    expect(screen.getByText('Open right')).toBeInTheDocument()
    expect(screen.queryByText('Copy contents')).not.toBeInTheDocument()
  })
})
