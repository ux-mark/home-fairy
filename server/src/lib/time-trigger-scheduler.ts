import { getAll, getOne, run } from '../db/index.js'
import type { Server as SocketServer } from 'socket.io'
import { motionHandler } from './motion-handler.js'

interface TimeTrigger {
  id: number
  mode_name: string
  trigger_time: string  // HH:MM
  trigger_days: string | null  // JSON array of day numbers 0-6 (0=Mon, 6=Sun), null = every day
  priority: number
}

class TimeTriggerScheduler {
  private timers: ReturnType<typeof setTimeout>[] = []
  private io: SocketServer | null = null

  init(socketIo?: SocketServer) {
    this.io = socketIo ?? null
    this.scheduleToday()
    this.scheduleMidnightRefresh()
  }

  refreshFromDb() {
    this.scheduleToday()
  }

  scheduleToday() {
    this.clearTimers()

    const triggers = getAll<TimeTrigger>(
      "SELECT id, mode_name, trigger_time, trigger_days, priority FROM mode_triggers WHERE trigger_type = 'time' AND enabled = 1"
    )

    const now = new Date()
    const todayDow = (now.getDay() + 6) % 7  // Convert JS Sunday=0 to Monday=0

    for (const trigger of triggers) {
      // Check day-of-week filter
      if (trigger.trigger_days) {
        try {
          const days: number[] = JSON.parse(trigger.trigger_days)
          if (!days.includes(todayDow)) continue
        } catch { continue }
      }

      // Parse trigger time
      const [hours, minutes] = trigger.trigger_time.split(':').map(Number)
      const triggerDate = new Date(now)
      triggerDate.setHours(hours, minutes, 0, 0)

      const delay = triggerDate.getTime() - now.getTime()
      if (delay <= 0) continue  // Already passed today

      const timer = setTimeout(() => {
        this.transitionMode(trigger.mode_name, `scheduled time (${trigger.trigger_time})`)
      }, delay)
      this.timers.push(timer)
    }

    if (triggers.length > 0) {
      this.logSchedule(triggers, todayDow)
    }
  }

  private transitionMode(mode: string, trigger: string) {
    try {
      // Check if current mode is the sleep mode — don't override it
      const sleepRow = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'sleep_mode_name'"
      )
      const sleepMode = sleepRow?.value || null
      const currentModeRow = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'mode'"
      )
      if (sleepMode && currentModeRow?.value === sleepMode) return

      run(
        `INSERT INTO current_state (key, value, updated_at) VALUES ('mode', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [mode],
      )
      run(
        'INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Auto mode transition: ${mode} (triggered by ${trigger})`, 'system'],
      )

      // Check if this triggers wake unlock
      const wakeModeRow = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'"
      )
      const wakeMode = wakeModeRow?.value || 'Morning'
      if (mode === wakeMode && motionHandler.getLockedRooms().length > 0) {
        motionHandler.unlockAllRooms()
        run(
          'INSERT INTO logs (message, category) VALUES (?, ?)',
          [`Wake mode reached (${mode}) — all rooms unlocked`, 'system'],
        )
      }

      if (this.io) {
        this.io.emit('mode_changed', { mode, trigger, auto: true })
      }
    } catch (err) {
      console.error('Failed to transition mode (time trigger):', err)
    }
  }

  private scheduleMidnightRefresh() {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 30, 0)

    const delay = tomorrow.getTime() - now.getTime()
    const timer = setTimeout(() => {
      this.scheduleToday()
      this.scheduleMidnightRefresh()
    }, delay)
    this.timers.push(timer)
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }

  private logSchedule(triggers: TimeTrigger[], todayDow: number) {
    const active = triggers.filter(t => {
      if (!t.trigger_days) return true
      try { return JSON.parse(t.trigger_days).includes(todayDow) } catch { return false }
    })
    if (active.length === 0) return

    const schedule = active
      .sort((a, b) => a.trigger_time.localeCompare(b.trigger_time))
      .map(t => `${t.trigger_time} -> ${t.mode_name}`)
      .join(', ')
    try {
      run(
        'INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Time trigger schedule: ${schedule}`, 'system'],
      )
    } catch {
      // ignore logging failures
    }
  }
}

export const timeTriggerScheduler = new TimeTriggerScheduler()
