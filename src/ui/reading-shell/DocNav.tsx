import { Link } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface DocNavProps {
  vaultId: string
  prev: string | null
  next: string | null
}

function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? path : path.slice(slash + 1)
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

export function DocNav({ vaultId, prev, next }: DocNavProps) {
  if (!prev && !next) return null

  return (
    <nav aria-label="Document navigation" className="swirlread-doc-nav">
      <div className="swirlread-doc-nav__prev-slot">
        {prev && (
          <Link
            to={`/app/${vaultId}/${prev}`}
            className="swirlread-doc-nav__btn swirlread-doc-nav__btn--prev"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <span className="swirlread-doc-nav__label">
              {stripExt(basename(prev))}
            </span>
          </Link>
        )}
      </div>
      <div className="swirlread-doc-nav__next-slot">
        {next && (
          <Link
            to={`/app/${vaultId}/${next}`}
            className="swirlread-doc-nav__btn swirlread-doc-nav__btn--next"
          >
            <span className="swirlread-doc-nav__label">
              {stripExt(basename(next))}
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  )
}
