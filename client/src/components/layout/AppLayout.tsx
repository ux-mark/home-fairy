import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Home, DoorOpen, Sparkles, LayoutGrid, Settings, Sun, Moon, Monitor } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import type { Theme } from '@/hooks/useTheme'
import ToastContainer from '@/components/ui/Toast'

function HomeFairyIcon({ className }: { className?: string }) {
  return (
    <img src="/home-fairy-icon.svg" alt="" aria-hidden="true" className={className} />
  )
}

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/rooms', icon: DoorOpen, label: 'Rooms' },
  { to: '/scenes', icon: Sparkles, label: 'Scenes' },
  { to: '/devices', icon: LayoutGrid, label: 'Devices' },
  { to: '/settings', icon: Settings, label: 'Settings' },
] as const

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark']
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const
const THEME_LABEL = { system: 'System theme', light: 'Light mode', dark: 'Dark mode' } as const

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const Icon = THEME_ICON[theme]

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme)
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    setTheme(next)
  }

  return (
    <button
      onClick={cycleTheme}
      aria-label={THEME_LABEL[theme]}
      title={THEME_LABEL[theme]}
      className={cn(
        'rounded-lg p-2 transition-colors',
        'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
        'hover:bg-[var(--bg-tertiary)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
      )}
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const { data: system } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="sidebar hidden w-56 shrink-0 border-r md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <HomeFairyIcon className="h-6 w-6" />
          <h1 className="text-heading text-lg font-semibold">Home Fairy</h1>
        </div>
        {system?.mode && (
          <div className="border-b px-5 py-3">
            <span className="inline-flex items-center rounded-full bg-fairy-500/15 px-2.5 py-0.5 text-xs font-medium text-fairy-400">
              {system.mode}
            </span>
          </div>
        )}
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isActive
                    ? 'bg-fairy-500/15 text-fairy-400'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-20 md:pb-0">
        {/* Header */}
        <header className="chrome flex items-center justify-between border-b px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-2">
            <HomeFairyIcon className="h-6 w-6 md:hidden" />
            <h1 className="text-heading text-lg font-semibold md:hidden">
              Home Fairy
            </h1>
            <h2 className="text-heading hidden text-lg font-semibold md:block">
              {NAV_ITEMS.find(
                n =>
                  n.to === location.pathname ||
                  (n.to !== '/' && location.pathname.startsWith(n.to)),
              )?.label ?? 'Home Fairy'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {system?.mode && (
              <span className="inline-flex items-center rounded-full bg-fairy-500/15 px-2.5 py-0.5 text-xs font-medium text-fairy-400">
                {system.mode}
              </span>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 md:py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="chrome fixed inset-x-0 bottom-0 z-40 border-t md:hidden">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fairy-500',
                  isActive
                    ? 'text-fairy-400'
                    : 'text-[var(--text-muted)] active:text-[var(--text-secondary)]',
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <ToastContainer />
    </div>
  )
}
