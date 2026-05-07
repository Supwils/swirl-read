import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Library } from 'lucide-react'
import type { VaultId, VaultPath } from '@/core/vault'
import {
  detectSections,
  type VaultSection,
} from '@/core/navigation/section-detector'
import { getAdapter } from '@/stores/vault-store'

interface SectionsNavProps {
  vaultId: VaultId
  currentPath: VaultPath
  contentRevision: number
}

export function SectionsNav({
  vaultId,
  currentPath,
  contentRevision,
}: SectionsNavProps): ReactNode {
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

  const sorted = [...sections].sort((a, b) =>
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
