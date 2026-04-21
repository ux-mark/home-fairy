import React, { useCallback, useEffect, useRef } from 'react'
import { Outlet, NavLink, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Home, DoorOpen, Sparkles, LayoutGrid, Settings, BarChart3, User, Play, Search, Heart } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useDashboardSocket } from '@/hooks/useSocket'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import {
  useTrackSonosBrowsePath,
  getSonosBrowseEntryPath,
} from '@/hooks/useSonosBrowseMemory'
import ToastContainer from '@/components/ui/Toast'
import NotificationBell from '@/components/notifications/NotificationBell'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { authClient } from '@/lib/auth-client'

function HomeFairyIcon({ className }: { className?: string }) {
  return (
    <img src="/home-fairy-icon.svg" alt="" aria-hidden="true" className={className} />
  )
}

const HOME_NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/rooms', icon: DoorOpen, label: 'Rooms' },
  { to: '/scenes', icon: Sparkles, label: 'Scenes' },
  { to: '/devices', icon: LayoutGrid, label: 'Devices' },
  { to: '/dashboard', icon: BarChart3, label: 'Insights' },
] as const

const SONOS_NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/sonos/playing', icon: Play, label: 'Playing' },
  { to: '/sonos/browse', icon: Search, label: 'Browse' },
  { to: '/sonos/favourites', icon: Heart, label: 'Favourites' },
  { to: '/sonos/insights', icon: BarChart3, label: 'Insights' },
] as const

/** Check if a nav item should appear active for the current path */
function isNavActive(itemTo: string, pathname: string, isRouterActive: boolean): boolean {
  // "Playing" should also be active on the bare /sonos path
  if (itemTo === '/sonos/playing' && pathname === '/sonos') return true
  return isRouterActive
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  useDashboardSocket()
  useScrollRestoration()
  useTrackSonosBrowsePath()

  // Skip /sonos/playing when the user presses Back from a /sonos/browse*
  // page. Pressing Back after "Change music" or the Browse nav should keep
  // the user inside their browse history rather than bouncing through Now
  // Playing. We detect a POP that lands on Playing coming from Browse and
  // immediately call navigate(-1) again.
  const prevPathnameRef = useRef<string>(location.pathname)
  useEffect(() => {
    const prev = prevPathnameRef.current
    prevPathnameRef.current = location.pathname
    if (
      navigationType === 'POP' &&
      location.pathname === '/sonos/playing' &&
      prev.startsWith('/sonos/browse')
    ) {
      navigate(-1)
    }
  }, [location.pathname, navigationType, navigate])

  // Sonos nav (Playing / Browse / Favourites / Insights) behaves like a tab
  // bar: switching between sections while already inside Sonos should not
  // accumulate history entries. That way, pressing Back from a resumed
  // browse location returns to the prior *browse* step rather than the Now
  // Playing page the user had briefly peeked at.
  const isSonosPath = location.pathname.startsWith('/sonos')

  // Clicking "Browse" in the Sonos nav resumes at the last-visited browse
  // location within this session (e.g. the playlist/album the user was last
  // inside). Falls back to `/sonos/browse` on a fresh session.
  const handleBrowseNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented) return
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = getSonosBrowseEntryPath()
      if (target === location.pathname + location.search) return
      e.preventDefault()
      navigate(target, { replace: isSonosPath })
    },
    [navigate, location.pathname, location.search, isSonosPath],
  )

  // For the other Sonos nav items, switch tab-style: replace when already
  // inside Sonos so that browser Back skips the intra-Sonos switch.
  const handleSonosTabNavClick = useCallback(
    (to: string) =>
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (e.defaultPrevented) return
        if (e.button !== 0) return
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (!isSonosPath) return
        if (to === location.pathname) return
        e.preventDefault()
        navigate(to, { replace: true })
      },
    [navigate, location.pathname, isSonosPath],
  )

  const { data: session } = authClient.useSession()
  const role = session?.user?.role

  const { data: system } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  // Detect Sonos context
  const isSonosContext = location.pathname.startsWith('/sonos')
  const activeNavItems = isSonosContext ? SONOS_NAV_ITEMS : HOME_NAV_ITEMS

  // Pick the correct click handler for a Sonos-nav item. `/` (Home) is a
  // real exit from Sonos so we leave it alone; the other items swap like
  // tabs when the user is already inside Sonos.
  function sonosNavOnClick(to: string) {
    if (to === '/sonos/browse') return handleBrowseNavClick
    if (to === '/') return undefined
    if (SONOS_NAV_ITEMS.some(n => n.to === to)) return handleSonosTabNavClick(to)
    return undefined
  }

  // Build nav items based on role (home context only)
  const navItems: { to: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string }[] = [
    ...activeNavItems,
    ...(!isSonosContext && role === 'admin'
      ? [{ to: '/settings', icon: Settings, label: 'Settings' }]
      : !isSonosContext && role === 'user'
        ? [{ to: '/account', icon: User, label: 'Account' }]
        : []),
  ]

  // Bottom nav: for admin, exclude settings (it's in the header icon area on mobile)
  // For user, include account in bottom nav
  const bottomNavItems = !isSonosContext && role === 'admin'
    ? navItems.filter(item => item.to !== '/settings')
    : navItems

  // Derive page title
  const pageTitle = navItems.find(
    n =>
      n.to === location.pathname ||
      (n.to !== '/' && location.pathname.startsWith(n.to)),
  )?.label ?? (isSonosContext ? 'Sonos' : 'Home Fairy')

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
            <span className="inline-flex items-center gap-1 rounded-full bg-fairy-500/15 px-2.5 py-0.5 text-xs font-medium text-fairy-400">
              <LucideIcon name={system.mode_icons?.[system.mode] ?? null} className="h-3.5 w-3.5" aria-hidden="true" />
              {system.mode}
            </span>
          </div>
        )}
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(({ to, icon: Icon, label }, index) => (
            <React.Fragment key={to}>
              {isSonosContext && index === 1 && (
                <hr className="my-1 border-[var(--border-primary)]" aria-hidden="true" />
              )}
              <NavLink
                to={to}
                end={to === '/'}
                onClick={sonosNavOnClick(to)}
                className={({ isActive }) => {
                  const active = isNavActive(to, location.pathname, isActive)
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
          <div className="flex items-center gap-2">
            <HomeFairyIcon className="h-6 w-6 md:hidden" />
            <h1 className="text-heading text-lg font-semibold md:hidden">
              Home Fairy
            </h1>
            <h2 className="text-heading hidden text-lg font-semibold md:block">
              {pageTitle}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {system?.mode && (
              <span className="inline-flex items-center gap-1 rounded-full bg-fairy-500/15 px-2.5 py-0.5 text-xs font-medium text-fairy-400 md:hidden">
                <LucideIcon name={system.mode_icons?.[system.mode] ?? null} className="h-3.5 w-3.5" aria-hidden="true" />
                {system.mode}
              </span>
            )}
            <NotificationBell />
            {role === 'admin' && (
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
            )}
            {role === 'user' && (
              <NavLink
                to="/account"
                aria-label="Account"
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
                <User className="h-5 w-5" />
              </NavLink>
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
          {bottomNavItems.map(({ to, icon: Icon, label }, index) => (
            <React.Fragment key={to}>
              {isSonosContext && index === 1 && (
                <div className="my-3 w-px bg-[var(--border-primary)]" aria-hidden="true" />
              )}
              <NavLink
                to={to}
                end={to === '/'}
                onClick={sonosNavOnClick(to)}
                className={({ isActive }) => {
                  const active = isNavActive(to, location.pathname, isActive)
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
        {isSonosContext && (
          <div className="text-center pb-1">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">Sonos</span>
          </div>
        )}
      </nav>

      <ToastContainer />
    </div>
  )
}
