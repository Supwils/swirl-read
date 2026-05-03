import { useEffect, useState, type ReactNode } from 'react'
import type { VaultId } from '@/core/vault'
import type { TagIndex } from '@/core/navigation/tag-index'
import { getAdapter } from '@/stores/vault-store'
import { getTagIndex } from '@/ui/reading-shell/tag-index-cache'

interface TagChip {
  name: string
  count: number
}

interface TagFilterBarProps {
  vaultId: VaultId
  activeTag: string | null
  onSelect: (tag: string | null) => void
}

const MAX_CHIPS = 20

// Hex color codes (#3b82f6, #fff) and bare numbers are not meaningful tags.
const HEX_COLOR_RE = /^[0-9a-f]{3}$|^[0-9a-f]{6}$/i
const DIGIT_ONLY_RE = /^\d+$/

function isMeaningfulTag(name: string): boolean {
  return (
    name.length >= 2 && !HEX_COLOR_RE.test(name) && !DIGIT_ONLY_RE.test(name)
  )
}

export function TagFilterBar({
  vaultId,
  activeTag,
  onSelect,
}: TagFilterBarProps): ReactNode {
  const [chips, setChips] = useState<TagChip[] | null>(null)

  useEffect(() => {
    const vault = getAdapter(vaultId)
    if (!vault) return
    let cancelled = false

    void getTagIndex(vault)
      .then((index: TagIndex) => {
        if (cancelled) return
        const sorted: TagChip[] = Array.from(index.filesByTag.entries())
          .filter(([name]) => isMeaningfulTag(name))
          .map(([name, files]) => ({ name, count: files.size }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
          .slice(0, MAX_CHIPS)
        setChips(sorted)
      })
      .catch(() => {
        if (!cancelled) setChips([])
      })

    return () => {
      cancelled = true
    }
  }, [vaultId])

  if (!chips || chips.length === 0) return null

  return (
    <div className="swirlread-tag-filter" aria-label="Filter by tag">
      <div className="swirlread-tag-filter__chips" role="group">
        {chips.map((chip) => (
          <button
            key={chip.name}
            type="button"
            aria-pressed={chip.name === activeTag}
            className={
              chip.name === activeTag
                ? 'swirlread-tag-filter__chip swirlread-tag-filter__chip--active'
                : 'swirlread-tag-filter__chip'
            }
            onClick={() => onSelect(chip.name === activeTag ? null : chip.name)}
          >
            <span className="swirlread-tag-filter__chip-hash">#</span>
            {chip.name}
            <span className="swirlread-tag-filter__chip-count">
              {chip.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
