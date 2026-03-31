import { Outlet } from 'react-router-dom'
import { ArrowLeft, Speaker } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import ToastContainer from '@/components/ui/Toast'

export default function SonosLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      {/* Sticky header */}
      <header className="chrome sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3">
        <Link
          to="/"
          aria-label="Back to Home"
          className={cn(
            'rounded-lg p-2 transition-colors',
            'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-2">
          <Speaker className="h-5 w-5 text-fairy-400" aria-hidden="true" />
          <h1 className="text-heading text-lg font-semibold">Sonos</h1>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  )
}
