import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FolderPicker } from './FolderPicker'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'

describe('FolderPicker', () => {
  beforeEach(() => {
    // Stub showDirectoryPicker so the FSAPI feature-detect check passes.
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <FolderPicker open={false} onClose={vi.fn()} onPicked={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders consent text when open', () => {
    render(<FolderPicker open onClose={vi.fn()} onPicked={vi.fn()} />)
    expect(
      screen.getByRole('heading', { name: /open your vault/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/nothing is uploaded/i)).toBeInTheDocument()
    expect(
      screen.getByText(/obsidian vaults, logseq graphs/i),
    ).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    render(<FolderPicker open onClose={onClose} onPicked={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(<FolderPicker open onClose={onClose} onPicked={vi.fn()} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('invokes FSAPIVaultAdapter.pick and onPicked on Choose folder success', async () => {
    const root = mockRoot('test-vault', { 'index.md': '# hi' })
    const adapter = FSAPIVaultAdapter.fromHandle(root, {
      id: 'test-vault-aaaa',
      name: 'test-vault',
    })
    const pickSpy = vi
      .spyOn(FSAPIVaultAdapter, 'pick')
      .mockResolvedValue(adapter)
    const onPicked = vi.fn()

    render(<FolderPicker open onClose={vi.fn()} onPicked={onPicked} />)
    await userEvent.click(
      screen.getByRole('button', { name: /choose folder/i }),
    )

    await waitFor(() => {
      expect(pickSpy).toHaveBeenCalledTimes(1)
      expect(onPicked).toHaveBeenCalledWith(adapter)
    })
  })

  it('silently returns to idle when user dismisses the OS dialog (AbortError)', async () => {
    vi.spyOn(FSAPIVaultAdapter, 'pick').mockRejectedValue(
      new DOMException('aborted', 'AbortError'),
    )
    const onPicked = vi.fn()

    render(<FolderPicker open onClose={vi.fn()} onPicked={onPicked} />)
    await userEvent.click(
      screen.getByRole('button', { name: /choose folder/i }),
    )

    await waitFor(() => {
      expect(onPicked).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /choose folder/i }),
      ).not.toBeDisabled()
    })
  })

  it('shows an error message for non-Abort failures', async () => {
    vi.spyOn(FSAPIVaultAdapter, 'pick').mockRejectedValue(
      new Error('Permission denied by browser policy'),
    )

    render(<FolderPicker open onClose={vi.fn()} onPicked={vi.fn()} />)
    await userEvent.click(
      screen.getByRole('button', { name: /choose folder/i }),
    )

    expect(
      await screen.findByText(/permission denied by browser policy/i),
    ).toBeInTheDocument()
  })

  it('disables Choose folder when FSAPI is unavailable', () => {
    // Simulate a browser without FSAPI support
    Reflect.deleteProperty(window, 'showDirectoryPicker')

    render(<FolderPicker open onClose={vi.fn()} onPicked={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: /choose folder/i }),
    ).toBeDisabled()
    expect(screen.getByText(/file system access api/i)).toBeInTheDocument()
  })
})
