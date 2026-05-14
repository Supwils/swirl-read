import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ContextMenu, type ContextMenuFile } from './ContextMenu'
import { SampleVaultAdapter } from '@/core/vault/sample-adapter'
import { __resetDbForTests } from '@/core/persistence/db'
import { __resetAdaptersForTests, useVaultStore } from '@/stores/vault-store'
import { useTabsStore } from '@/stores/tabs-store'

const FILE: ContextMenuFile = {
  path: 'reading/why-slow.md',
  name: 'why-slow',
  ext: 'md',
}

function renderMenu(
  vaultId: string,
  onClose = vi.fn(),
  file: ContextMenuFile = FILE,
) {
  const utils = render(
    <MemoryRouter initialEntries={[`/app/${vaultId}`]}>
      <Routes>
        <Route
          path="/app/:vaultId"
          element={
            <ContextMenu
              x={120}
              y={200}
              vaultId={vaultId}
              file={file}
              folderColor="reading"
              onClose={onClose}
            />
          }
        />
        <Route path="/app/:vaultId/*" element={<div>doc-page</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...utils, onClose }
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
  useTabsStore.setState({
    tabsByVault: {},
    recentlyClosedByVault: {},
    ready: true,
    tabCapHit: false,
    previewReplaced: false,
  })
})

afterEach(() => {
  __resetAdaptersForTests()
  vi.restoreAllMocks()
})

describe('ContextMenu', () => {
  it('renders the eight actions in the HANDOFF §3.6 order', () => {
    renderMenu('v1')
    const items = screen.getAllByRole('menuitem')
    // First child <span> holds the label; second holds the shortcut.
    const labels = items.map(
      (b) => b.querySelector('span:first-child')?.textContent ?? '',
    )
    expect(labels).toEqual([
      'Open here',
      'Open in split pane',
      'Open beside',
      'Open in new tab',
      'Peek preview',
      'Reveal in folder',
      'Copy path',
      'Copy contents',
    ])
  })

  it('marks Peek and Reveal disabled until later PRs', () => {
    renderMenu('v1')
    expect(
      screen.getByRole('menuitem', { name: /peek preview/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole('menuitem', { name: /reveal in folder/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole('menuitem', { name: /copy path/i }),
    ).not.toBeDisabled()
  })

  it('Open here navigates to the document route and closes the menu', async () => {
    const adapter = new SampleVaultAdapter({
      id: 'ctx-v',
      name: 'ctx',
      files: { 'reading/why-slow.md': '# slow' },
    })
    await useVaultStore.getState().registerVault(adapter)
    const { onClose } = renderMenu(adapter.id)
    await userEvent.click(screen.getByRole('menuitem', { name: /open here/i }))
    await waitFor(() => {
      expect(screen.getByText('doc-page')).toBeInTheDocument()
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('Open in new tab pins the tab in the tabs-store', async () => {
    const adapter = new SampleVaultAdapter({
      id: 'ctx-v2',
      name: 'ctx2',
      files: { 'reading/why-slow.md': '# slow' },
    })
    await useVaultStore.getState().registerVault(adapter)
    renderMenu(adapter.id)
    await userEvent.click(
      screen.getByRole('menuitem', { name: /open in new tab/i }),
    )
    await waitFor(() => {
      const tabs = useTabsStore.getState().tabsByVault[adapter.id] ?? []
      const opened = tabs.find((t) => t.path === FILE.path)
      expect(opened?.pinned).toBe(true)
    })
  })

  it('Copy path writes the file path to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderMenu('v1')
    await userEvent.click(screen.getByRole('menuitem', { name: /copy path/i }))
    expect(writeText).toHaveBeenCalledWith(FILE.path)
  })

  it('Copy contents reads via the adapter then writes to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const adapter = new SampleVaultAdapter({
      id: 'ctx-v3',
      name: 'ctx3',
      files: { 'reading/why-slow.md': '# slow content body' },
    })
    await useVaultStore.getState().registerVault(adapter)
    renderMenu(adapter.id)
    await userEvent.click(
      screen.getByRole('menuitem', { name: /copy contents/i }),
    )
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('# slow content body')
    })
  })

  it('Escape closes the menu', () => {
    const { onClose } = renderMenu('v1')
    const root = screen.getByRole('menu')
    fireEvent.keyDown(root, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ArrowDown moves focus across enabled items only', () => {
    renderMenu('v1')
    const root = screen.getByRole('menu')
    // First enabled item starts focused (index 0).
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    // After 4 ArrowDown presses from index 0, focus should land on the
    // 5th enabled item (skipping the two disabled ones). Enabled order:
    // 0 Open here, 1 Open split, 2 Open beside, 3 Open new tab,
    // 6 Copy path, 7 Copy contents (peek=4 disabled, reveal=5 disabled).
    const items = screen.getAllByRole('menuitem')
    expect(items[6]?.dataset.focused).toBe('true')
  })
})
