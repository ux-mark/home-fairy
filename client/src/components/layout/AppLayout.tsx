import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Home, DoorOpen, Sparkles, Lightbulb } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import ToastContainer from '@/components/ui/Toast'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/rooms', icon: DoorOpen, label: 'Rooms' },
  { to: '/scenes', icon: Sparkles, label: 'Scenes' },
  { to: '/lights', icon: Lightbulb, label: 'Lights' },
] as const

export default function AppLayout() {
  const location = useLocation()
  const { data: system } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-slate-800 bg-slate-900/50 md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
          <Sparkles className="h-5 w-5 text-fairy-400" />
          <h1 className="text-lg font-semibold text-slate-100">The Fairies</h1>
        </div>
        {system?.mode && (
          <div className="border-b border-slate-800 px-5 py-3">
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
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
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
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3 backdrop-blur-sm md:px-6 md:py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-fairy-400 md:hidden" />
            <h1 className="text-lg font-semibold text-slate-100 md:hidden">
              The Fairies
            </h1>
            <h2 className="hidden text-lg font-semibold text-slate-100 md:block">
              {NAV_ITEMS.find(
                n =>
                  n.to === location.pathname ||
                  (n.to !== '/' && location.pathname.startsWith(n.to)),
              )?.label ?? 'The Fairies'}
            </h2>
          </div>
          {system?.mode && (
            <span className="inline-flex items-center rounded-full bg-fairy-500/15 px-2.5 py-0.5 text-xs font-medium text-fairy-400">
              {system.mode}
            </span>
          )}
        </header>

        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 md:py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm md:hidden">
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
                    : 'text-slate-500 active:text-slate-300',
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
