import { getAll, getOne, run } from '../db/index.js'
import { activateScene, deactivateScene } from './scene-executor.js'
import { mtaIndicator } from './mta-indicator.js'
import { weatherIndicator } from './weather-indicator.js'

interface RoomTimer {
  timeout: NodeJS.Timeout
  roomName: string
  startedAt: number
  durationMs: number
}

interface DeviceRoomRow {
  id: number
  device_id: string
  device_label: string
  device_type: string
  room_name: string
  config: string
  created_at: string
}

interface RoomRow {
  name: string
  auto: number
  timer: number
  current_scene: string | null
  scene_manual: number
}

interface DefaultSceneRow {
  scene_name: string
  active_from: string | null
  active_to: string | null
}

function log(message: string, category = 'motion'): void {
  try {
    run('INSERT INTO logs (message, category) VALUES (?, ?)', [
      message,
      category,
    ])
  } catch {
    console.error('Failed to write log:', message)
  }
}

function getCurrentMode(): string {
  const row = getOne<{ value: string }>(
    "SELECT value FROM current_state WHERE key = 'mode'",
  )
  return row?.value ?? 'Evening'
}

interface MtaIndicatorConfig {
  enabled: boolean
  lightId: string
  lightLabel: string
  sensorName: string
}

export class MotionHandler {
  private roomTimers: Map<string, RoomTimer> = new Map()
  private sensorStates: Map<string, 'active' | 'inactive'> = new Map()
  private lockedRooms: Set<string> = new Set()

  constructor() {
    this.loadLockedRooms()
  }

  // Load persisted room locks from the database on startup
  private loadLockedRooms(): void {
    try {
      const row = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'locked_rooms'",
      )
      if (row?.value) {
        const rooms: string[] = JSON.parse(row.value)
        for (const name of rooms) {
          this.lockedRooms.add(name)
        }
        if (this.lockedRooms.size > 0) {
          log(`Restored ${this.lockedRooms.size} room locks from database`, 'system')
        }
      }
    } catch {
      // Ignore — first run or corrupt data
    }
  }

  // Persist current room locks to the database
  private persistLockedRooms(): void {
    try {
      const value = JSON.stringify([...this.lockedRooms])
      run(
        `INSERT INTO current_state (key, value, updated_at)
         VALUES ('locked_rooms', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [value],
      )
    } catch {
      console.error('Failed to persist room locks')
    }
  }

  // Lock rooms — called by nighttime/guest-night endpoints
  lockRooms(roomNames: string[]): void {
    for (const name of roomNames) {
      this.lockedRooms.add(name)
      log(`Room locked: ${name}`)
    }
    this.persistLockedRooms()
  }

  // Unlock all rooms — called when wake mode is reached
  unlockAllRooms(): void {
    if (this.lockedRooms.size > 0) {
      log(`Unlocking ${this.lockedRooms.size} rooms`)
      this.lockedRooms.clear()
      this.persistLockedRooms()
    }
  }

  // Check if a room is locked
  isRoomLocked(roomName: string): boolean {
    return this.lockedRooms.has(roomName)
  }

  // Get all locked rooms (for API/UI)
  getLockedRooms(): string[] {
    return [...this.lockedRooms]
  }

  // Check if an indicator light's room blocks activation
  // Returns true if the room is locked, has auto disabled, or has a manual scene override
  private isIndicatorLightBlocked(lightId: string, indicatorName: string): boolean {
    const lightRoom = getOne<{ room_name: string }>(
      'SELECT room_name FROM light_rooms WHERE light_id = ?',
      [lightId],
    )
    if (!lightRoom) return false // light not assigned to a room — allow

    const room = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [lightRoom.room_name])
    if (!room) return false

    if (this.isRoomLocked(lightRoom.room_name)) {
      log(`${indicatorName} indicator skipped: room "${lightRoom.room_name}" is locked (night mode)`)
      return true
    }
    if (!room.auto) {
      log(`${indicatorName} indicator skipped: room "${lightRoom.room_name}" has automation disabled`)
      return true
    }
    if (room.scene_manual) {
      log(`${indicatorName} indicator skipped: room "${lightRoom.room_name}" has manual scene override`)
      return true
    }
    return false
  }

  // Find which room a sensor belongs to by its label
  // Checks device_rooms table for sensor-to-room mapping
  private findRoomForSensor(sensorName: string): DeviceRoomRow | undefined {
    return getOne<DeviceRoomRow>(
      "SELECT * FROM device_rooms WHERE device_label = ? AND device_type IN ('motion', 'sensor')",
      [sensorName],
    )
  }

  // Find the default scene for a room in the current mode via room_default_scenes lookup
  private findSceneForRoom(roomName: string): string | null {
    const mode = getCurrentMode()

    // Direct lookup: what is the designated default scene for this room+mode?
    const row = getOne<DefaultSceneRow>(
      `SELECT rds.scene_name, s.active_from, s.active_to
       FROM room_default_scenes rds
       JOIN scenes s ON rds.scene_name = s.name
       WHERE rds.room_name = ? AND rds.mode_name = ?`,
      [roomName, mode],
    )

    if (!row) return null

    // Check seasonal date range
    if (row.active_from && row.active_to) {
      const now = new Date()
      const month = now.getMonth() + 1
      const day = now.getDate()
      const today = month * 100 + day

      const [fromM, fromD] = row.active_from.split('-').map(Number)
      const [toM, toD] = row.active_to.split('-').map(Number)
      const from = fromM * 100 + fromD
      const to = toM * 100 + toD

      const inRange = from <= to
        ? (today >= from && today <= to)
        : (today >= from || today <= to)

      if (!inRange) return null
    }

    return row.scene_name
  }

  async handleMotionEvent(
    sensorName: string,
    value: 'active' | 'inactive',
  ): Promise<void> {
    // Track sensor state
    this.sensorStates.set(sensorName, value)

    // Check if this sensor is the MTA indicator trigger
    try {
      const indicatorRow = getOne<{ value: string }>("SELECT value FROM current_state WHERE key = 'pref_mta_indicator'")
      if (indicatorRow?.value) {
        const indicator: MtaIndicatorConfig = JSON.parse(indicatorRow.value)
        if (indicator.enabled && indicator.sensorName === sensorName && value === 'active') {
          if (this.isIndicatorLightBlocked(indicator.lightId, 'MTA')) {
            // Room is locked, manual, or auto-off — skip
          } else {
            mtaIndicator.trigger().catch(() => { /* ignore indicator errors */ })
          }
        }
      }
    } catch { /* ignore indicator errors */ }

    // Check weather indicator sensor trigger
    try {
      const weatherConfig = weatherIndicator.getConfig()
      if (weatherConfig.enabled && weatherConfig.mode === 'sensor' && weatherConfig.sensorName === sensorName && value === 'active') {
        if (this.isIndicatorLightBlocked(weatherConfig.lightId, 'Weather')) {
          // Room is locked, manual, or auto-off — skip
        } else {
          weatherIndicator.triggerOnce()
        }
      }
    } catch { /* ignore weather indicator errors */ }

    // Find which room this sensor belongs to
    const deviceRoom = this.findRoomForSensor(sensorName)
    if (!deviceRoom) {
      log(`Motion sensor "${sensorName}" not assigned to any room`)
      return
    }

    const roomName = deviceRoom.room_name

    // Record activity for analytics
    try {
      run(
        'INSERT INTO room_activity (room_name, sensor_name, event_type) VALUES (?, ?, ?)',
        [roomName, sensorName, `motion_${value}`],
      )
    } catch { /* don't let activity tracking break motion handling */ }

    if (value === 'active') {
      log(`Motion active: ${sensorName} in ${roomName}`)

      // Cancel any existing timer for this room
      this.cancelRoomTimer(roomName)

      // Update room.last_active
      run(
        `UPDATE rooms SET last_active = datetime('now'), updated_at = datetime('now') WHERE name = ?`,
        [roomName],
      )

      // Check if room has auto mode enabled
      const room = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [
        roomName,
      ])
      if (!room) {
        log(`Room "${roomName}" not found in database`)
        return
      }
      if (!room.auto) {
        log(`Room ${roomName} has automation disabled, skipping`)
        return
      }

      // Check lux threshold — skip activation if room is very bright
      // Default 500 lux: a well-lit room is ~300-500, direct sunlight 1000+
      const luxThresholdPref = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'pref_lux_threshold'",
      )
      const luxThreshold = luxThresholdPref?.value ? Number(luxThresholdPref.value) : 500
      // Get current lux from the sensor's hub_devices attributes
      const luxReading = getOne<{ lux: number | null }>(
        `SELECT json_extract(h.attributes, '$.illuminance') as lux
         FROM device_rooms dr
         JOIN hub_devices h ON h.label = dr.device_label
         WHERE dr.room_name = ? AND dr.device_type IN ('motion', 'sensor')
         AND json_extract(h.attributes, '$.illuminance') IS NOT NULL
         LIMIT 1`,
        [roomName],
      )
      const roomLux = luxReading?.lux ?? null
      if (roomLux !== null && roomLux > luxThreshold) {
        log(`Room ${roomName} lux ${roomLux} exceeds threshold ${luxThreshold}, skipping activation`)
        return
      }

      // Check room lockout BEFORE scene activation
      if (this.isRoomLocked(roomName)) {
        log(`Motion in ${roomName} but room is locked (night mode) — skipping scene activation`)
        return
      }

      // Check for manual scene override — user explicitly activated a scene, skip auto
      if (room.scene_manual) {
        log(`Room ${roomName} has manual scene override (${room.current_scene}), skipping auto activation`)
        return
      }

      // Find auto scene for room + current mode
      const sceneName = this.findSceneForRoom(roomName)
      if (!sceneName) {
        log(`No scene found for room ${roomName} in current mode`)
        return
      }

      // Only activate if it differs from current scene
      if (sceneName !== room.current_scene) {
        log(`Activating scene "${sceneName}" for room ${roomName}`)
        try {
          await activateScene(sceneName)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log(`Error activating scene: ${msg}`)
        }
      }
    } else {
      // inactive
      log(`Motion inactive: ${sensorName} in ${roomName}`)

      // Check if ALL sensors in this room are inactive
      const roomSensors = getAll<DeviceRoomRow>(
        "SELECT * FROM device_rooms WHERE room_name = ? AND device_type = 'motion'",
        [roomName],
      )

      const allInactive = roomSensors.every((sensor) => {
        const state = this.sensorStates.get(sensor.device_label)
        return state === 'inactive'
      })

      if (!allInactive) {
        log(
          `Some sensors in ${roomName} still active, not starting timer`,
        )
        return
      }

      // Only start timer if there isn't one already running
      if (this.roomTimers.has(roomName)) {
        log(`Timer already running for ${roomName}`)
        return
      }

      // Get room timer duration
      const room = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [
        roomName,
      ])
      if (!room) return

      const durationMs = room.timer * 60 * 1000
      log(
        `All sensors inactive in ${roomName}, starting ${room.timer}min timer`,
      )

      const timeout = setTimeout(async () => {
        this.roomTimers.delete(roomName)
        log(`Timer expired for ${roomName}, deactivating scene`)

        const currentRoom = getOne<RoomRow>(
          'SELECT * FROM rooms WHERE name = ?',
          [roomName],
        )
        if (currentRoom?.current_scene) {
          try {
            await deactivateScene(currentRoom.current_scene)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            log(`Error deactivating scene: ${msg}`)
          }
        }
        // Clear manual override flag when room goes inactive
        run('UPDATE rooms SET scene_manual = 0 WHERE name = ?', [roomName])
      }, durationMs)

      this.roomTimers.set(roomName, {
        timeout,
        roomName,
        startedAt: Date.now(),
        durationMs,
      })
    }
  }

  cancelRoomTimer(roomName: string): void {
    const timer = this.roomTimers.get(roomName)
    if (timer) {
      clearTimeout(timer.timeout)
      this.roomTimers.delete(roomName)
      log(`Cancelled timer for ${roomName}`)
    }
  }

  getTimerStatus(): { roomName: string; remainingMs: number }[] {
    const now = Date.now()
    const result: { roomName: string; remainingMs: number }[] = []
    for (const [, timer] of this.roomTimers) {
      const elapsed = now - timer.startedAt
      const remaining = Math.max(timer.durationMs - elapsed, 0)
      result.push({ roomName: timer.roomName, remainingMs: remaining })
    }
    return result
  }

  getSensorStates(): Map<string, 'active' | 'inactive'> {
    return new Map(this.sensorStates)
  }
}

export const motionHandler = new MotionHandler()
