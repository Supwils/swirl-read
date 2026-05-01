import { Link, Outlet } from 'react-router'

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="flex items-center justify-between border-b px-6 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Link
          to="/"
          className="font-serif text-lg font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          SwilRead
        </Link>
        <span
          className="font-serif text-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          App Shell · placeholder
        </span>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
