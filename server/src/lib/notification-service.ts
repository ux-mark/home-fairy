import { getOne, getAll, run } from '../db/index.js'

type Severity = 'info' | 'warning' | 'critical'

interface NotificationRow {
  id: number
  severity: Severity
  category: string
  title: string
  message: string
  source_type: string | null
  source_id: string | null
  source_label: string | null
  dedup_key: string | null
  occurrence_count: number
  first_occurred_at: string
  last_occurred_at: string
  read: number
  dismissed: number
  created_at: string
}

interface CreateNotificationParams {
  severity: Severity
  category: string
  title: string
  message: string
  sourceType?: string
  sourceId?: string
  sourceLabel?: string
  dedupKey?: string
}

// Socket.io emitter — wired up from index.ts after server starts
let emitNotification: ((event: string, data: unknown) => void) | null = null

export const notificationService = {
  /** Wire up socket.io for real-time push to clients */
  setEmitter(fn: (event: string, data: unknown) => void): void {
    emitNotification = fn
  },

  /** Create or deduplicate a notification */
  create(params: CreateNotificationParams): void {
    const { severity, category, title, message, sourceType, sourceId, sourceLabel, dedupKey } = params

    // Deduplication: if a non-dismissed notification with same dedupKey exists, update it
    if (dedupKey) {
      const existing = getOne<{ id: number; occurrence_count: number }>(
        'SELECT id, occurrence_count FROM notifications WHERE dedup_key = ? AND dismissed = 0',
        [dedupKey],
      )
      if (existing) {
        run(
          `UPDATE notifications
           SET occurrence_count = occurrence_count + 1,
               last_occurred_at = datetime('now'),
               read = 0,
               message = ?
           WHERE id = ?`,
          [message, existing.id],
        )
        if (emitNotification) {
          emitNotification('notification:update', {
            id: existing.id,
            occurrenceCount: existing.occurrence_count + 1,
          })
        }
        return
      }
    }

    const result = run(
      `INSERT INTO notifications (severity, category, title, message, source_type, source_id, source_label, dedup_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [severity, category, title, message, sourceType ?? null, sourceId ?? null, sourceLabel ?? null, dedupKey ?? null],
    )

    if (emitNotification) {
      emitNotification('notification:new', {
        id: result.lastInsertRowid,
        severity,
        category,
        title,
      })
    }
  },

  /** Get notifications list */
  getAll(options: { limit?: number; unreadOnly?: boolean; category?: string } = {}): NotificationRow[] {
    const { limit = 50, unreadOnly = false, category } = options
    const conditions = ['dismissed = 0']
    const params: unknown[] = []

    if (unreadOnly) {
      conditions.push('read = 0')
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }

    params.push(limit)

    return getAll<NotificationRow>(
      `SELECT * FROM notifications WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
      params,
    )
  },

  /** Get unread count */
  getUnreadCount(): number {
    const row = getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE read = 0 AND dismissed = 0',
    )
    return row?.count ?? 0
  },

  /** Mark a notification as read */
  markRead(id: number): void {
    run('UPDATE notifications SET read = 1 WHERE id = ?', [id])
  },

  /** Mark all as read */
  markAllRead(): void {
    run('UPDATE notifications SET read = 1 WHERE read = 0 AND dismissed = 0')
  },

  /** Dismiss a notification (hides it and resets dedup) */
  dismiss(id: number): void {
    run('UPDATE notifications SET dismissed = 1 WHERE id = ?', [id])
  },

  /** Dismiss all read notifications */
  dismissAll(): void {
    run('UPDATE notifications SET dismissed = 1 WHERE dismissed = 0')
  },

  /** Get recent device errors for insights engine integration */
  getRecentDeviceErrors(minutesBack = 60): NotificationRow[] {
    return getAll<NotificationRow>(
      `SELECT * FROM notifications
       WHERE category = 'device_error'
         AND dismissed = 0
         AND last_occurred_at > datetime('now', '-' || ? || ' minutes')
       ORDER BY last_occurred_at DESC`,
      [minutesBack],
    )
  },

  /** Get recent notifications by category for insights engine integration */
  getRecentByCategory(category: string, minutesBack = 60): NotificationRow[] {
    return getAll<NotificationRow>(
      `SELECT * FROM notifications
       WHERE category = ?
         AND dismissed = 0
         AND last_occurred_at > datetime('now', '-' || ? || ' minutes')
       ORDER BY last_occurred_at DESC`,
      [category, minutesBack],
    )
  },
}
