import { useState, useRef } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useNotificationCount } from '@/hooks/useNotifications'
import NotificationPanel from './NotificationPanel'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data } = useNotificationCount()
  const count = data?.count ?? 0
  const buttonRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()

  const handleNavigate = (path: string) => {
    navigate(path)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'relative rounded-lg p-2 transition-colors',
          'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
          'hover:bg-[var(--bg-tertiary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        )}
      >
        <Bell className="h-4.5 w-4.5" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center',
              'rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white',
            )}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <NotificationPanel open={open} onClose={() => setOpen(false)} returnFocusRef={buttonRef} onNavigate={handleNavigate} />
    </div>
  )
}
