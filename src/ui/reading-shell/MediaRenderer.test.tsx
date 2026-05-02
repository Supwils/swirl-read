import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MediaRenderer } from './MediaRenderer'
import type { VaultFile, VaultFileSystem } from '@/core/vault'

function makeFile(overrides: Partial<VaultFile> = {}): VaultFile {
  return {
    path: 'photos/cat.png',
    name: 'cat.png',
    extension: '.png',
    size: 12345,
    modifiedAt: new Date('2025-08-01T10:30:00Z'),
    isDirectory: false,
    ...overrides,
  }
}

function makeVault(
  resolver: (path: string) => Promise<string>,
): VaultFileSystem {
  const vault: Partial<VaultFileSystem> = {
    id: 'v',
    name: 'v',
    list: vi.fn(),
    walk: vi.fn(),
    stat: vi.fn(),
    readText: vi.fn(),
    readBinary: vi.fn(),
    getBlobURL: vi.fn((path: string) => resolver(path)),
    hasPermission: vi.fn(),
    requestPermission: vi.fn(),
  }
  return vault as VaultFileSystem
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MediaRenderer (M7.6)', () => {
  it('renders an <img> with the blob URL once getBlobURL resolves', async () => {
    const vault = makeVault(() => Promise.resolve('blob:fake-image'))
    render(<MediaRenderer vault={vault} file={makeFile()} media="image" />)

    await waitFor(() => {
      expect(screen.getByTestId('media-renderer')).toBeInTheDocument()
    })
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'blob:fake-image')
    expect(img).toHaveAttribute('alt', 'cat.png')
    expect(screen.getByText('12 KB')).toBeInTheDocument()
  })

  it('renders a <video> for the video subtype', async () => {
    const vault = makeVault(() => Promise.resolve('blob:fake-video'))
    const file = makeFile({
      path: 'clips/intro.mp4',
      name: 'intro.mp4',
      extension: '.mp4',
    })
    const { container } = render(
      <MediaRenderer vault={vault} file={file} media="video" />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('media-renderer')).toBeInTheDocument()
    })
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('src', 'blob:fake-video')
    expect(video).toHaveAttribute('controls')
  })

  it('renders an <audio> for the audio subtype', async () => {
    const vault = makeVault(() => Promise.resolve('blob:fake-audio'))
    const file = makeFile({
      path: 'songs/track.mp3',
      name: 'track.mp3',
      extension: '.mp3',
    })
    const { container } = render(
      <MediaRenderer vault={vault} file={file} media="audio" />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('media-renderer')).toBeInTheDocument()
    })
    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio).toHaveAttribute('src', 'blob:fake-audio')
  })

  it('shows a broken state when getBlobURL rejects', async () => {
    const vault = makeVault(() =>
      Promise.reject(new Error('permission denied')),
    )
    render(<MediaRenderer vault={vault} file={makeFile()} media="image" />)

    await waitFor(() => {
      expect(screen.getByTestId('media-renderer-broken')).toBeInTheDocument()
    })
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument()
  })
})
