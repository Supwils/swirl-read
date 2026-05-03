/**
 * UnsupportedRenderer (M7.8).
 *
 * Quiet card shown for files we can't render in the current SwirlRead build:
 * binaries (images / video / audio land here today; M7.6 will lift those
 * into a media renderer next), PDFs, archives, fonts, opaque blobs.
 *
 * The goal is to keep the reading surface honest: tell the user the file
 * exists, what it is, and how big it is, instead of silently rendering
 * garbled bytes through `readText`.
 */

import { type ReactNode } from 'react'
import { FileQuestion } from 'lucide-react'
import { basename, extname } from '@/core/vault'
import type { VaultFile } from '@/core/vault'
import { formatSize } from './file-renderer-utils'

interface UnsupportedRendererProps {
  file: VaultFile
}

export function UnsupportedRenderer({
  file,
}: UnsupportedRendererProps): ReactNode {
  const ext = extname(file.path)
  const name = basename(file.path) || file.path
  return (
    <section
      className="swirlread-unsupported"
      role="status"
      aria-label="Unsupported file"
    >
      <FileQuestion
        size={28}
        aria-hidden="true"
        className="swirlread-unsupported__icon"
      />
      <h2 className="swirlread-unsupported__title">{name}</h2>
      <p className="swirlread-unsupported__body">
        SwirlRead doesn&apos;t render <code>{ext || 'extensionless'}</code>{' '}
        files yet. The file is on disk; this view just isn&apos;t built for it.
      </p>
      <dl className="swirlread-unsupported__meta">
        <div>
          <dt>Size</dt>
          <dd>{formatSize(file.size)}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{formatDate(file.modifiedAt)}</dd>
        </div>
        <div>
          <dt>Path</dt>
          <dd className="swirlread-unsupported__path">{file.path}</dd>
        </div>
      </dl>
    </section>
  )
}

function formatDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
