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
  lux: number | null
  scene_manual: number
}

interface SceneRow {
  name: string
  rooms: string
  modes: string
  commands: string
  tags: string
  auto_activate: number
  active_from: string | null
  active_to: string | null
}

interface RoomInfo {
  name: string
  priority: number
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
  // Checks both device_rooms table and rooms.sensors JSON column
  private findRoomForSensor(sensorName: string): DeviceRoomRow | undefined {
    // First check device_rooms table
    const fromDeviceRooms = getOne<DeviceRoomRow>(
      "SELECT * FROM device_rooms WHERE device_label = ? AND device_type IN ('motion', 'sensor')",
      [sensorName],
    )
    if (fromDeviceRooms) return fromDeviceRooms

    // Also check rooms.sensors JSON — legacy format stores sensors as [{name: "sensorLiving"}]
    const rooms = getAll<{ name: string; sensors: string }>('SELECT name, sensors FROM rooms')
    for (const room of rooms) {
      try {
        const sensors = JSON.parse(room.sensors || '[]')
        if (Array.isArray(sensors) && sensors.some((s: { name?: string }) => s.name === sensorName)) {
          return {
            id: 0,
            device_id: sensorName,
            device_label: sensorName,
            device_type: 'sensor',
            room_name: room.name,
            config: '{}',
            created_at: '',
          }
        }
      } catch { /* skip malformed JSON */ }
    }
    return undefined
  }

  // Find the highest-priority scene for a room in the current mode
  // Only considers scenes with auto_activate = true
  private findSceneForRoom(roomName: string): string | null {
    const mode = getCurrentMode()
    const scenes = getAll<SceneRow>('SELECT * FROM scenes WHERE auto_activate = 1')

    let bestScene: string | null = null
    let bestPriority = -1

    for (const scene of scenes) {
      let rooms: RoomInfo[]
      let modes: string[]
      try {
        rooms = JSON.parse(scene.rooms)
        modes = JSON.parse(scene.modes)
      } catch {
        continue
      }

      // Check seasonal date range
      if (scene.active_from && scene.active_to) {
        const now = new Date()
        const month = now.getMonth() + 1 // 1-12
        const day = now.getDate()
        const today = month * 100 + day // e.g. 1225 for Dec 25

        const [fromM, fromD] = scene.active_from.split('-').map(Number)
        const [toM, toD] = scene.active_to.split('-').map(Number)
        const from = fromM * 100 + fromD
        const to = toM * 100 + toD

        // Handle ranges that cross year boundary (e.g. Dec 1 -> Jan 6)
        const inRange = from <= to
          ? (today >= from && today <= to)
          : (today >= from || today <= to)

        if (!inRange) continue // Scene is out of season
      }

      // Check if this scene applies to the current mode
      if (modes.length > 0 && !modes.includes(mode)) continue

      // Check if this scene applies to this room
      const roomEntry = rooms.find((r) => r?.name === roomName)
      if (!roomEntry) continue

      const priority = Number(roomEntry.priority) || 0
      if (priority > bestPriority) {
        bestPriority = priority
        bestScene = scene.name
      }
    }

    return bestScene
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
      // The old system used priorityThreshold (0-100) for scene priority, NOT lux.
      // Lux threshold is configurable per room in the future.
      // For now, only skip if extremely bright (likely already lit or direct sun)
      const luxThresholdPref = getOne<{ value: string }>(
        "SELECT value FROM current_state WHERE key = 'pref_lux_threshold'",
      )
      const luxThreshold = luxThresholdPref?.value ? Number(luxThresholdPref.value) : 500
      if (room.lux !== null && room.lux > luxThreshold) {
        log(
          `Room ${roomName} lux ${room.lux} exceeds threshold ${luxThreshold}, skipping activation`,
        )
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

      // Find highest-priority scene for room + current mode
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

  async handleTemperatureEvent(
    sensorName: string,
    value: number,
  ): Promise<void> {
    const deviceRoom = this.findRoomForSensor(sensorName)
    if (!deviceRoom) return

    run(
      `UPDATE rooms SET temperature = ?, updated_at = datetime('now') WHERE name = ?`,
      [value, deviceRoom.room_name],
    )
    log(
      `Temperature update: ${sensorName} = ${value} in ${deviceRoom.room_name}`,
    )
  }

  async handleLuxEvent(sensorName: string, value: number): Promise<void> {
    // Lux sensors may not be typed as 'motion', search all sensor types
    const deviceRoom =
      this.findRoomForSensor(sensorName) ??
      getOne<DeviceRoomRow>(
        "SELECT * FROM device_rooms WHERE device_label = ? AND device_type = 'sensor'",
        [sensorName],
      )
    if (!deviceRoom) return

    run(
      `UPDATE rooms SET lux = ?, updated_at = datetime('now') WHERE name = ?`,
      [value, deviceRoom.room_name],
    )
    log(`Lux update: ${sensorName} = ${value} in ${deviceRoom.room_name}`)
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
