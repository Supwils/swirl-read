import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnsupportedRenderer } from './UnsupportedRenderer'
import { formatSize } from './file-renderer-utils'
import type { VaultFile } from '@/core/vault'

function file(overrides: Partial<VaultFile> = {}): VaultFile {
  return {
    path: 'photos/image.png',
    name: 'image.png',
    extension: '.png',
    size: 4096,
    modifiedAt: new Date('2025-08-01T10:30:00Z'),
    isDirectory: false,
    ...overrides,
  }
}

describe('formatSize (M7.8 helper)', () => {
  it('returns bytes verbatim under 1 KiB', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
  })

  it('promotes to KB / MB / GB at the right thresholds', () => {
    expect(formatSize(2048)).toBe('2.0 KB')
    expect(formatSize(1024 * 1024 * 5)).toBe('5.0 MB')
    expect(formatSize(1024 * 1024 * 1024 * 3)).toBe('3.0 GB')
  })

  it('handles invalid input without crashing', () => {
    expect(formatSize(Number.NaN)).toBe('—')
    expect(formatSize(-1)).toBe('—')
  })
})

describe('UnsupportedRenderer (M7.8)', () => {
  it('shows the file name, extension, size, and path', () => {
    render(<UnsupportedRenderer file={file()} />)

    expect(
      screen.getByRole('heading', { name: 'image.png' }),
    ).toBeInTheDocument()
    expect(screen.getByText('photos/image.png')).toBeInTheDocument()
    expect(screen.getByText('4.0 KB')).toBeInTheDocument()
    expect(screen.getByText('.png')).toBeInTheDocument()
  })

  it('labels extensionless files clearly', () => {
    render(
      <UnsupportedRenderer
        file={file({
          path: 'LICENSE.bin',
          name: 'LICENSE.bin',
          extension: '.bin',
          size: 100,
        })}
      />,
    )
    expect(screen.getByText('.bin')).toBeInTheDocument()
  })
})
