import { getSunTimes, type SunTimes } from './sun-tracker.js'
import { getOne, getAll, run } from '../db/index.js'
import type { Server as SocketServer } from 'socket.io'
import { motionHandler } from './motion-handler.js'

interface SunModeMapping {
  sunPhase: string
  mode: string
  time: Date
}

class SunModeScheduler {
  private timers: ReturnType<typeof setTimeout>[] = []
  private io: SocketServer | null = null

  init(socketIo?: SocketServer) {
    this.io = socketIo ?? null
    this.scheduleToday()
    this.scheduleMidnightRefresh()
  }

  scheduleToday() {
    this.clearTimers()

    const sunTimes = getSunTimes()
    const now = new Date()
    const mappings = this.getMappings(sunTimes)
    const sleepMode = this.getSleepModeName()

    // Find what the current mode SHOULD be based on which transitions have passed
    let currentShouldBe: SunModeMapping | null = null
    for (const mapping of mappings) {
      if (mapping.time.getTime() <= now.getTime()) {
        currentShouldBe = mapping  // latest past transition = current mode
      }
    }

    // If the current mode doesn't match, set it now — but never overwrite the configured sleep mode
    // (sleep mode is set manually by nighttime/guest-night and should persist until wake mode)
    if (currentShouldBe) {
      const currentModeRow = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'mode'",
      )
      const currentMode = currentModeRow?.value
      if (sleepMode && currentMode === sleepMode) {
        // Don't overwrite — sleep mode persists until the configured wake mode is reached
      } else if (currentMode !== currentShouldBe.mode) {
        this.transitionMode(currentShouldBe.mode, currentShouldBe.sunPhase + ' (catch-up)')
      }
    }

    // Schedule future transitions
    for (const mapping of mappings) {
      const delay = mapping.time.getTime() - now.getTime()
      if (delay > 0) {
        const timer = setTimeout(() => {
          // Check mode at transition time — don't overwrite the configured sleep mode
          const modeRow = getOne<{ value: string }>(
            "SELECT value FROM current_state WHERE key = 'mode'",
          )
          const sleepModeName = this.getSleepModeName()
          if (sleepModeName && modeRow?.value === sleepModeName) return
          this.transitionMode(mapping.mode, mapping.sunPhase)
        }, delay)
        this.timers.push(timer)
      }
    }

    this.logSchedule(mappings)
  }

  refreshFromDb() {
    this.scheduleToday()
  }

  private getMappings(sunTimes: SunTimes): SunModeMapping[] {
    const triggers = getAll<{ mode_name: string; sun_event: string }>(
      "SELECT mode_name, sun_event FROM mode_triggers WHERE trigger_type = 'sun' AND enabled = 1"
    )
    const mappings: SunModeMapping[] = []
    const timesRecord: Record<string, string> = { ...sunTimes }
    for (const trigger of triggers) {
      const iso = timesRecord[trigger.sun_event]
      if (!iso) continue
      const time = new Date(iso)
      if (!isNaN(time.getTime())) {
        mappings.push({ sunPhase: trigger.sun_event, mode: trigger.mode_name, time })
      }
    }
    return mappings.sort((a, b) => a.time.getTime() - b.time.getTime())
  }

  private getSleepModeName(): string | null {
    const row = getOne<{ value: string }>(
      "SELECT value FROM current_state WHERE key = 'sleep_mode_name'"
    )
    return row?.value || null
  }

  private transitionMode(mode: string, sunPhase: string) {
    try {
      run(
        `INSERT INTO current_state (key, value, updated_at) VALUES ('mode', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [mode],
      )
      run(
        'INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Auto mode transition: ${mode} (triggered by ${sunPhase})`, 'system'],
      )

      // Check if this mode is the configured wake mode — unlock rooms if so
      const wakeModeRow = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
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
        this.io.emit('mode_changed', { mode, trigger: sunPhase, auto: true })
      }
    } catch (err) {
      console.error('Failed to transition mode:', err)
    }
  }

  private scheduleMidnightRefresh() {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 30, 0) // 00:00:30 to avoid exact midnight edge cases

    const delay = tomorrow.getTime() - now.getTime()
    const timer = setTimeout(() => {
      this.scheduleToday()
      this.scheduleMidnightRefresh()
    }, delay)
    this.timers.push(timer)
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }

  getSchedule(): { sunPhase: string; mode: string; time: string; isPast: boolean }[] {
    const sunTimes = getSunTimes()
    const now = new Date()
    return this.getMappings(sunTimes).map(m => ({
      sunPhase: m.sunPhase,
      mode: m.mode,
      time: m.time.toISOString(),
      isPast: m.time.getTime() < now.getTime(),
    }))
  }

  private logSchedule(mappings: SunModeMapping[]) {
    const schedule = mappings
      .map(m => `${m.sunPhase} -> ${m.mode} at ${m.time.toLocaleTimeString()}`)
      .join(', ')
    try {
      run(
        'INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Sun mode schedule: ${schedule}`, 'system'],
      )
    } catch {
      // ignore logging failures
    }
  }
}

export const sunModeScheduler = new SunModeScheduler()
