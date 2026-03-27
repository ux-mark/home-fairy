import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Home, DoorOpen, Sparkles, LayoutGrid, Settings, BarChart3 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useDashboardSocket } from '@/hooks/useSocket'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import ToastContainer from '@/components/ui/Toast'
import NotificationBell from '@/components/notifications/NotificationBell'

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
  { to: '/dashboard', icon: BarChart3, label: 'Insights' },
  { to: '/settings', icon: Settings, label: 'Settings' },
] as const

const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter(item => item.to !== '/settings')

export default function AppLayout() {
  const location = useLocation()
  useDashboardSocket()
  useScrollRestoration()

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
      <main className="flex-1 pb-22 md:pb-0">
        {/* Header */}
        <header className="chrome sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 md:px-6 md:py-4">
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
            <NotificationBell />
            <NavLink
              to="/settings"
              aria-label="Settings"
              className={({ isActive }) =>
                cn(
                  'rounded-lg p-2 transition-colors md:hidden',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isActive
                    ? 'text-fairy-400'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
                )
              }
            >
              <Settings className="h-5 w-5" />
            </NavLink>
            {system?.mode && (
              <span className="inline-flex items-center rounded-full bg-fairy-500/15 px-2.5 py-0.5 text-xs font-medium text-fairy-400 md:hidden">
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
      <nav className="chrome fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-stretch justify-evenly">
          {BOTTOM_NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fairy-500',
                  isActive
                    ? 'text-fairy-400'
                    : 'text-[var(--text-muted)] active:text-[var(--text-secondary)]',
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="leading-normal">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <ToastContainer />
    </div>
  )
}
