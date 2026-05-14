import type { FolderColorId } from '@/core/vault'

interface ExtChipProps {
  ext: string
  folderId: FolderColorId
}

/**
 * `.md` / `.html` / `.png` chip — sits next to a filename to communicate the
 * file type at the same eye-line as the name. `.html` swaps to `--paper`
 * because rendered HTML is materially different from raw markdown.
 */
export function ExtChip({ ext, folderId }: ExtChipProps) {
  const normalized = ext.replace(/^\./, '').toLowerCase()
  const isHtml = normalized === 'html'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 6px',
        borderRadius: 3,
        border: `1px solid var(--f-${folderId}-ink)`,
        background: isHtml ? 'var(--paper)' : `var(--f-${folderId})`,
        color: `var(--f-${folderId}-ink)`,
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        fontWeight: 500,
        lineHeight: 1.6,
        letterSpacing: '0.02em',
      }}
    >
      .{normalized}
    </span>
  )
}
