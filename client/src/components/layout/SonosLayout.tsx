import React from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Home, Play, Search, Heart, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import ToastContainer from '@/components/ui/Toast'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'

const SONOS_NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/sonos/playing', icon: Play, label: 'Playing', end: false },
  { to: '/sonos/browse', icon: Search, label: 'Browse', end: false },
  { to: '/sonos/favourites', icon: Heart, label: 'Favourites', end: false },
  { to: '/sonos/insights', icon: BarChart3, label: 'Insights', end: false },
] as const

/** Check if a nav item should appear active for the current path */
function isItemActive(itemTo: string, pathname: string, isRouterActive: boolean): boolean {
  // "Playing" should also be active on the bare /sonos path
  if (itemTo === '/sonos/playing' && pathname === '/sonos') return true
  return isRouterActive
}

export default function SonosLayout() {
  const location = useLocation()
  useScrollRestoration()

  // Derive current page title from nav items (skip Home since it exits Sonos)
  const currentLabel =
    SONOS_NAV_ITEMS.find(
      n => n.to !== '/' && (location.pathname.startsWith(n.to) || (n.to === '/sonos/playing' && location.pathname === '/sonos')),
    )?.label ?? 'Sonos'

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="sidebar hidden w-56 shrink-0 border-r md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <h1 className="text-heading text-lg font-semibold">Sonos</h1>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {SONOS_NAV_ITEMS.map(({ to, icon: Icon, label, end }, index) => (
            <React.Fragment key={to}>
              {index === 1 && (
                <hr className="my-1 border-[var(--border-primary)]" aria-hidden="true" />
              )}
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => {
                  const active = isItemActive(to, location.pathname, isActive)
                  return cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    active
                      ? 'bg-fairy-500/15 text-fairy-400'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
                  )
                }}
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            </React.Fragment>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-22 md:pb-0">
        {/* Header */}
        <header className="chrome sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 md:px-6 md:py-4">
          <h2 className="text-heading text-lg font-semibold">{currentLabel}</h2>
        </header>

        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 md:py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="chrome fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-stretch justify-evenly">
          {SONOS_NAV_ITEMS.map(({ to, icon: Icon, label, end }, index) => (
            <React.Fragment key={to}>
              {index === 1 && (
                <div className="my-3 w-px bg-[var(--border-primary)]" aria-hidden="true" />
              )}
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => {
                  const active = isItemActive(to, location.pathname, isActive)
                  return cn(
                    'flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fairy-500',
                    active
                      ? 'text-fairy-400'
                      : 'text-[var(--text-muted)] active:text-[var(--text-secondary)]',
                  )
                }}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-normal">{label}</span>
              </NavLink>
            </React.Fragment>
          ))}
        </div>
        <div className="text-center pb-1">
          <span className="text-[10px] font-medium text-[var(--text-muted)]">Sonos</span>
        </div>
      </nav>

      <ToastContainer />
    </div>
  )
}
