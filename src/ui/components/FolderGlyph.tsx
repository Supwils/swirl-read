import type { CSSProperties } from 'react'
import type { FolderColorId } from '@/core/vault'

interface FolderGlyphProps {
  id: FolderColorId
  size?: number
  className?: string
  style?: CSSProperties
}

/**
 * Compact manila-folder mark rendered in the folder's palette.
 *
 * Used in the FileShelf, in tab chips, and inside the chrome breadcrumb so
 * the active folder is recognisable at a glance. Pure CSS so it scales with
 * the surrounding font size and reflects theme changes without re-rendering.
 */
export function FolderGlyph({
  id,
  size = 12,
  className,
  style,
}: FolderGlyphProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size * 1.2,
        height: size,
        flex: '0 0 auto',
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: `var(--f-${id})`,
          border: `1px solid var(--f-${id}-ink)`,
          borderRadius: 2,
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 1,
          top: -size * 0.28,
          width: size * 0.5,
          height: size * 0.3,
          background: `var(--f-${id})`,
          border: `1px solid var(--f-${id}-ink)`,
          borderBottom: 'none',
          borderRadius: '2px 2px 0 0',
        }}
      />
    </span>
  )
}
