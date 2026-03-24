import { useEffect, useRef } from 'react'
import { X, Bell, CheckCheck, Trash2, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications, useMarkRead, useMarkAllRead, useDismiss, useDismissAll } from '@/hooks/useNotifications'
import type { AppNotification } from '@/lib/api'

interface NotificationPanelProps {
  open: boolean
  onClose: () => void
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr + 'Z') // UTC from SQLite
  const diffMs = now.getTime() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const SEVERITY_CONFIG = {
  critical: {
    Icon: AlertTriangle,
    iconClass: 'text-red-400',
    borderClass: 'border-l-red-500',
    label: 'Critical',
  },
  warning: {
    Icon: AlertCircle,
    iconClass: 'text-amber-400',
    borderClass: 'border-l-amber-500',
    label: 'Warning',
  },
  info: {
    Icon: Info,
    iconClass: 'text-blue-400',
    borderClass: 'border-l-blue-500',
    label: 'Information',
  },
}

function NotificationItem({
  notification,
  onMarkRead,
  onDismiss,
}: {
  notification: AppNotification
  onMarkRead: (id: number) => void
  onDismiss: (id: number) => void
}) {
  const config = SEVERITY_CONFIG[notification.severity]
  const { Icon } = config
  const isUnread = notification.read === 0

  return (
    <li
      role={notification.severity === 'critical' ? 'alert' : 'status'}
      aria-label={`${config.label}: ${notification.title}`}
      className={cn(
        'relative rounded-lg border-l-4 p-3 transition-colors',
        config.borderClass,
        isUnread
          ? 'bg-[var(--bg-secondary)]'
          : 'bg-[var(--bg-primary)] opacity-75',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconClass)}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn(
              'text-sm leading-snug',
              isUnread ? 'text-[var(--text-heading)] font-medium' : 'text-[var(--text-body)]',
            )}>
              {notification.title}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(notification.id)}
              aria-label={`Dismiss notification: ${notification.title}`}
              className={cn(
                'shrink-0 rounded p-1 transition-colors',
                'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                'hover:bg-[var(--bg-tertiary)]',
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
            {notification.message}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <span>{timeAgo(notification.last_occurred_at)}</span>
            {notification.occurrence_count > 1 && (
              <span className="rounded-full bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                {notification.occurrence_count} times
              </span>
            )}
            {isUnread && (
              <button
                type="button"
                onClick={() => onMarkRead(notification.id)}
                className="text-fairy-400 hover:text-fairy-300 transition-colors"
              >
                Mark as read
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

export default function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { data: notifications, isLoading } = useNotifications()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()
  const dismiss = useDismiss()
  const dismissAll = useDismissAll()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid catching the click that opened the panel
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, onClose])

  // Focus trap: focus the panel when opened
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus()
    }
  }, [open])

  if (!open) return null

  const hasUnread = notifications?.some(n => n.read === 0)
  const hasAny = notifications && notifications.length > 0

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      tabIndex={-1}
      className={cn(
        'absolute right-0 top-full z-50 mt-2',
        'w-[360px] max-w-[calc(100vw-2rem)]',
        'card rounded-xl border shadow-lg',
        'max-h-[70vh] flex flex-col',
        'focus:outline-none',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-heading)]">Notifications</h3>
        <div className="flex items-center gap-1">
          {hasUnread && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              aria-label="Mark all notifications as read"
              className={cn(
                'rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                'text-fairy-400 hover:bg-fairy-500/10',
              )}
            >
              <CheckCheck className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Mark all read
            </button>
          )}
          {hasAny && (
            <button
              type="button"
              onClick={() => dismissAll.mutate()}
              aria-label="Dismiss all notifications"
              className={cn(
                'rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]',
              )}
            >
              <Trash2 className="inline-block h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
            ))}
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="h-8 w-8 text-[var(--text-muted)] mb-2" aria-hidden="true" />
            <p className="text-sm text-[var(--text-body)]">No notifications</p>
            <p className="text-xs mt-0.5 text-[var(--text-muted)]">Everything is running smoothly</p>
          </div>
        ) : (
          <ul role="list" className="space-y-1.5">
            {notifications!.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={(id) => markRead.mutate(id)}
                onDismiss={(id) => dismiss.mutate(id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
