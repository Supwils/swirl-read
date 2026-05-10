import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Library } from 'lucide-react'
import type { VaultEntry, VaultId, VaultPath } from '@/core/vault'
import {
  detectSections,
  type VaultSection,
} from '@/core/navigation/section-detector'
import {
  isPathHiddenInSet,
  useSidebarVisibilityStore,
} from '@/stores/sidebar-visibility-store'
import { getAdapter } from '@/stores/vault-store'

interface SectionsNavProps {
  vaultId: VaultId
  currentPath: VaultPath
  contentRevision: number
  onContextMenu: (
    event: React.MouseEvent<HTMLElement>,
    entry: VaultEntry,
  ) => void
}

export function SectionsNav({
  vaultId,
  currentPath,
  contentRevision,
  onContextMenu,
}: SectionsNavProps): ReactNode {
  // Subscribe to the live hidden-set; an undefined value just means
  // nothing is hidden in this vault. The shared `isPathHiddenInSet`
  // helper keeps the file-tree and sections-nav semantics in lockstep
  // with the store itself.
  const hiddenSet = useSidebarVisibilityStore((s) => s.hiddenByVault[vaultId])
  const [sections, setSections] = useState<VaultSection[] | null>(null)

  useEffect(() => {
    const vault = getAdapter(vaultId)
    if (!vault) return
    let cancelled = false
    setSections(null)
    detectSections(vault)
      .then((found) => {
        if (cancelled) return
        setSections(found.filter((s) => s.home !== null))
      })
      .catch(() => {
        if (!cancelled) setSections([])
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, contentRevision])

  if (!sections || sections.length === 0) return null

  // Hide sections whose directory (or an ancestor of it) the user has
  // hidden — same semantics as the file tree below, so a single
  // right-click → Hide gesture sweeps both surfaces at once.
  const visible = sections.filter(
    (s) => !isPathHiddenInSet(s.directory.path, hiddenSet),
  )
  if (visible.length === 0) return null

  const sorted = [...visible].sort((a, b) =>
    a.directory.name.localeCompare(b.directory.name, undefined, {
      sensitivity: 'base',
    }),
  )

  return (
    <nav className="swirlread-file-tree__sections" aria-label="Sections">
      <p className="swirlread-file-tree__section-label">Sections</p>
      <ul>
        {sorted.map((section) => {
          if (!section.home) return null
          const isActive = currentPath === section.home
          return (
            <li key={section.directory.path}>
              <Link
                to={`/app/${vaultId}/${section.home}`}
                className={`swirlread-file-tree__row swirlread-file-tree__row--section-link${
                  isActive ? ' is-active' : ''
                }`}
                aria-label={`Open ${section.directory.name} section`}
                aria-current={isActive ? 'page' : undefined}
                title={section.home}
                onContextMenu={(event) => {
                  onContextMenu(event, section.directory)
                }}
              >
                <Library
                  className="swirlread-file-tree__icon"
                  size={14}
                  aria-hidden="true"
                />
                <span className="swirlread-file-tree__name">
                  {section.directory.name}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
