import { getSunTimes, type SunTimes } from './sun-tracker.js'
import { getOne, run } from '../db/index.js'
import type { Server as SocketServer } from 'socket.io'
import { motionHandler } from './motion-handler.js'

interface SunModeMapping {
  sunPhase: string
  mode: string
  time: Date
}

// Default mappings -- these can be overridden via settings
const DEFAULT_SUN_MODE_MAP: Record<string, string> = {
  nightEnd: 'Early Morning',     // ~5:30am astronomical dawn
  dawn: 'Morning',               // civil dawn
  solarNoon: 'Afternoon',        // midday
  goldenHour: 'Evening',         // ~1hr before sunset
  dusk: 'Late Evening',          // civil dusk
  night: 'Night',                // astronomical night
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

    // Find what the current mode SHOULD be based on which transitions have passed
    let currentShouldBe: SunModeMapping | null = null
    for (const mapping of mappings) {
      if (mapping.time.getTime() <= now.getTime()) {
        currentShouldBe = mapping  // latest past transition = current mode
      }
    }

    // If the current mode doesn't match, set it now — but never overwrite Sleep Time
    // (Sleep Time is set manually by nighttime/guest-night and should persist until wake mode)
    if (currentShouldBe) {
      const currentModeRow = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'mode'",
      )
      const currentMode = currentModeRow?.value
      if (currentMode === 'Sleep Time') {
        // Don't overwrite — Sleep Time persists until the configured wake mode is reached
      } else if (currentMode !== currentShouldBe.mode) {
        this.transitionMode(currentShouldBe.mode, currentShouldBe.sunPhase + ' (catch-up)')
      }
    }

    // Schedule future transitions
    for (const mapping of mappings) {
      const delay = mapping.time.getTime() - now.getTime()
      if (delay > 0) {
        const timer = setTimeout(() => {
          // Check mode at transition time — don't overwrite Sleep Time
          const modeRow = getOne<{ value: string }>(
            "SELECT value FROM current_state WHERE key = 'mode'",
          )
          if (modeRow?.value === 'Sleep Time') return
          this.transitionMode(mapping.mode, mapping.sunPhase)
        }, delay)
        this.timers.push(timer)
      }
    }

    this.logSchedule(mappings)
  }

  private getMappings(sunTimes: SunTimes): SunModeMapping[] {
    const mappings: SunModeMapping[] = []
    const timesRecord: Record<string, string> = { ...sunTimes }
    for (const [phase, mode] of Object.entries(DEFAULT_SUN_MODE_MAP)) {
      const iso = timesRecord[phase]
      if (!iso) continue
      const time = new Date(iso)
      if (!isNaN(time.getTime())) {
        mappings.push({ sunPhase: phase, mode, time })
      }
    }
    return mappings.sort((a, b) => a.time.getTime() - b.time.getTime())
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
