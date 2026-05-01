import { Link, Outlet } from 'react-router'
import { ThemeSwitcher } from '@/ui/components/ThemeSwitcher'

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
        <ThemeSwitcher />
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
