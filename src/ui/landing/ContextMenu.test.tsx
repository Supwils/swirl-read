import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { ContextMenu, type ContextMenuFile } from './ContextMenu'
import { useVaultStore } from '@/stores/vault-store'

const FILE: ContextMenuFile = {
  path: 'reading/why-we-read.md',
  name: 'why-we-read',
  ext: 'md',
}

const VAULT_ID = 'ctx-vault'

function renderMenu(
  kind: 'file' | 'folder' = 'file',
  onClose: () => void = () => undefined,
  file: ContextMenuFile = FILE,
) {
  return render(
    <MemoryRouter initialEntries={[`/app/${VAULT_ID}`]}>
      <Routes>
        <Route
          path="/app/:vaultId"
          element={
            <ContextMenu
              x={10}
              y={10}
              vaultId={VAULT_ID}
              file={file}
              folderColor="knowledge"
              kind={kind}
              onClose={onClose}
            />
          }
        />
        <Route path="/app/:vaultId/*" element={<div>doc-page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function labelsOf(): string[] {
  return screen
    .getAllByRole('menuitem')
    .map((b) => b.querySelector('span')?.textContent?.trim() ?? '')
}

beforeEach(() => {
  useVaultStore.setState({ registeredVaults: [], activeVaultId: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ContextMenu', () => {
  it('lists every file action for a file target in order', () => {
    renderMenu()
    expect(labelsOf()).toEqual([
      'Open here',
      'Open left',
      'Open right',
      'Open in new tab',
      'Peek preview',
      'Reveal in folder',
      'Copy path',
      'Copy contents',
    ])
  })

  it('hides file-only actions when kind is folder', () => {
    renderMenu('folder')
    expect(labelsOf()).toEqual([
      'Open here',
      'Open left',
      'Open right',
      'Reveal in folder',
      'Copy path',
    ])
  })

  it('disabled items advertise no shortcut hint', () => {
    renderMenu()
    const peek = screen.getByRole('menuitem', { name: /peek preview/i })
    expect(peek).toBeDisabled()
    expect(
      peek.querySelector('.swirlread-pebble-context-menu__shortcut'),
    ).toBeNull()
    // An enabled item DOES show its shortcut.
    const copyPath = screen.getByRole('menuitem', { name: /copy path/i })
    expect(
      copyPath.querySelector('.swirlread-pebble-context-menu__shortcut'),
    ).not.toBeNull()
  })

  it('copies the file path when Copy path is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderMenu()
    fireEvent.click(screen.getByText('Copy path'))
    expect(writeText).toHaveBeenCalledWith('reading/why-we-read.md')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderMenu('file', onClose)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes after Open here is chosen', async () => {
    const onClose = vi.fn()
    renderMenu('file', onClose)
    fireEvent.click(screen.getByText('Open here'))
    // run() resolves then finally(onClose) fires on a microtask.
    await Promise.resolve()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('folder header shows the name without an ext chip', () => {
    renderMenu('folder', () => undefined, {
      path: 'reading',
      name: 'reading',
      ext: '',
    })
    const header = document.querySelector(
      '.swirlread-pebble-context-menu__header',
    )
    expect(header?.textContent).toContain('reading')
    expect(header?.querySelectorAll('.swirlread-ext-chip').length).toBe(0)
  })
})
