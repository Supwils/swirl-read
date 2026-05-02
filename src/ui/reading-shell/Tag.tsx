/**
 * Tag — clickable inline `#tag` rendered by the markdown pipeline (M3.14).
 *
 * The pipeline emits `<tag data-tag="…">#raw-text</tag>`; this component
 * upgrades that to a real button that flips `useTagStore.selectedTag`,
 * which `TagsPanel` reacts to and opens its overlay.
 */

import { type ReactNode } from 'react'
import { useTagStore } from '@/stores/tag-store'

interface TagProps {
  'data-tag'?: string
  children?: ReactNode
}

export function Tag(props: TagProps): ReactNode {
  const tag = props['data-tag'] ?? ''
  const selectTag = useTagStore((state) => state.selectTag)

  if (!tag) {
    // Defensive — sanitize lets the element through, but a missing
    // data-tag means the parser produced no value. Render the raw
    // children as plain text so we don't introduce a non-functional
    // pill.
    return <>{props.children}</>
  }

  return (
    <button
      type="button"
      className="swilread-tag"
      data-tag={tag}
      onClick={() => selectTag(tag)}
      aria-label={`Show files with tag #${tag}`}
      title={`#${tag}`}
    >
      {props.children}
    </button>
  )
}
