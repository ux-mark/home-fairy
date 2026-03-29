import { useEffect, useRef } from 'react'
import { X, Bell, CheckCheck, Trash2, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { useNotifications, useMarkRead, useMarkAllRead, useDismiss, useDismissAll } from '@/hooks/useNotifications'
import type { AppNotification } from '@/lib/api'

interface NotificationPanelProps {
  open: boolean
  onClose: () => void
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>
  onNavigate: (path: string) => void
}

/**
 * Derive the best navigation target from a notification's dedup_key.
 * Format: `category:deviceType:deviceId` e.g. `device_unreachable:kasa:ABC123`
 */
function getNotificationRoute(notification: AppNotification): string {
  const parts = notification.dedup_key?.split(':') ?? []
  const deviceType = parts[1]
  const deviceId = parts[2]
  if (deviceType && deviceId) {
    if (deviceType === 'kasa') return `/devices/kasa/${deviceId}`
    if (deviceType === 'lifx') return `/lights/${deviceId}`
    return `/devices/${deviceId}`
  }
  return '/devices'
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
  onNavigate,
}: {
  notification: AppNotification
  onMarkRead: (id: number) => void
  onDismiss: (id: number) => void
  onNavigate: (path: string) => void
}) {
  const config = SEVERITY_CONFIG[notification.severity]
  const { Icon } = config
  const isUnread = notification.read === 0

  return (
    <li
      role={notification.severity === 'critical' ? 'alert' : 'status'}
      aria-label={`${config.label}: ${notification.title}`}
      className={cn(
        'relative rounded-lg border-l-4 transition-colors',
        config.borderClass,
        isUnread
          ? 'bg-[var(--bg-secondary)]'
          : 'bg-[var(--bg-primary)] opacity-75',
      )}
    >
      <button
        type="button"
        onClick={() => onNavigate(getNotificationRoute(notification))}
        className={cn(
          'w-full text-left p-3 cursor-pointer rounded-lg',
          'hover:bg-white/5 transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        )}
        aria-label={`View ${notification.source_label ?? 'device'} — ${notification.title}`}
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
              {/* Stop propagation so dismissing doesn't also navigate */}
              <span
                role="presentation"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              >
                <button
                  type="button"
                  onClick={() => onDismiss(notification.id)}
                  aria-label={`Dismiss notification: ${notification.title}`}
                  className={cn(
                    'rounded p-1 transition-colors',
                    'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                    'hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
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
                <span
                  role="presentation"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onMarkRead(notification.id)}
                    className="text-fairy-400 hover:text-fairy-300 transition-colors"
                  >
                    Mark as read
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}

export default function NotificationPanel({ open, onClose, returnFocusRef, onNavigate }: NotificationPanelProps) {
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

  // Return focus to the trigger button when the panel closes
  useEffect(() => {
    if (!open) {
      returnFocusRef?.current?.focus()
    }
  }, [open, returnFocusRef])

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
        // Mobile: fixed, full-width with margin, below the header
        'fixed left-4 right-4 top-[60px] z-50',
        // Desktop (md+): switch back to absolute, right-aligned dropdown
        'md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-[360px]',
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
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
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
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
