import { getAll, getOne, run } from '../db/index.js'
import { activateScene, deactivateScene } from './scene-executor.js'
import { lifxClient } from './lifx-client.js'
import { mtaClient } from './mta-client.js'
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
}

interface SceneRow {
  name: string
  rooms: string
  modes: string
  commands: string
  tags: string
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
  duration: number
}

export class MotionHandler {
  private roomTimers: Map<string, RoomTimer> = new Map()
  private sensorStates: Map<string, 'active' | 'inactive'> = new Map()
  private indicatorRevertTimer: NodeJS.Timeout | null = null
  private indicatorPreviousState: { power: string; color: string; brightness: number } | null = null
  private lockedRooms: Set<string> = new Set()

  // Lock rooms — called by nighttime/guest-night endpoints
  lockRooms(roomNames: string[]): void {
    for (const name of roomNames) {
      this.lockedRooms.add(name)
      log(`Room locked: ${name}`)
    }
  }

  // Unlock all rooms — called when wake mode is reached
  unlockAllRooms(): void {
    if (this.lockedRooms.size > 0) {
      log(`Unlocking ${this.lockedRooms.size} rooms`)
      this.lockedRooms.clear()
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

  // Tags that mark a scene as manual-only (not triggered by motion sensors)
  private static EXCLUDED_TAGS = new Set(['key-scene', 'system', 'hide', 'Moving'])

  // Find the highest-priority scene for a room in the current mode
  // Excludes system/manual-only scenes (All Off, Nighttime, Cleaning, etc.)
  private findSceneForRoom(roomName: string): string | null {
    const mode = getCurrentMode()
    const scenes = getAll<SceneRow>('SELECT * FROM scenes')

    let bestScene: string | null = null
    let bestPriority = -1

    for (const scene of scenes) {
      let rooms: RoomInfo[]
      let modes: string[]
      let tags: string[]
      try {
        rooms = JSON.parse(scene.rooms)
        modes = JSON.parse(scene.modes)
        tags = JSON.parse(scene.tags)
      } catch {
        continue
      }

      // Skip scenes tagged as manual-only
      if (tags.some(t => MotionHandler.EXCLUDED_TAGS.has(t))) continue

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
          this.triggerMtaIndicator(indicator)
        }
      }
    } catch { /* ignore indicator errors */ }

    // Check weather indicator sensor trigger
    try {
      const weatherConfig = weatherIndicator.getConfig()
      if (weatherConfig.enabled && weatherConfig.mode === 'sensor' && weatherConfig.sensorName === sensorName && value === 'active') {
        weatherIndicator.triggerOnce()
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

  async triggerMtaIndicator(config: MtaIndicatorConfig): Promise<void> {
    try {
      // Cancel any existing revert timer
      if (this.indicatorRevertTimer) {
        clearTimeout(this.indicatorRevertTimer)
      }

      const selector = `id:${config.lightId}`

      // Save current light state (so we can revert)
      const lights = await lifxClient.listBySelector(selector)
      if (lights.length > 0) {
        const light = lights[0]
        this.indicatorPreviousState = {
          power: light.power,
          color: `hue:${light.color.hue} saturation:${light.color.saturation} kelvin:${light.color.kelvin}`,
          brightness: light.brightness,
        }
      }

      // Get configured stops
      const configuredRow = getOne<{ value: string }>("SELECT value FROM current_state WHERE key = 'pref_mta_stops'")
      let stops: Array<{
        stopId: string; direction: string; routes: string[];
        feedGroup: string; walkTime: number; enabled: boolean
      }> = []
      try { stops = configuredRow?.value ? JSON.parse(configuredRow.value) : [] } catch { stops = [] }

      const enabledStops = stops.filter(s => s.enabled)
      if (enabledStops.length === 0) return

      // Get max wait threshold
      const maxWaitRow = getOne<{ value: string }>("SELECT value FROM current_state WHERE key = 'pref_mta_max_wait'")
      const maxWaitMinutes = maxWaitRow?.value ? Number(maxWaitRow.value) : 6

      // Get status for each stop, find the best
      let bestStatus = 'none'
      const statusPriority: Record<string, number> = { green: 3, orange: 2, red: 1, none: 0 }

      for (const stop of enabledStops) {
        try {
          const result = await mtaClient.getStatus(stop.stopId, stop.direction, stop.routes, stop.feedGroup, stop.walkTime, maxWaitMinutes)
          if (statusPriority[result.status] > statusPriority[bestStatus]) {
            bestStatus = result.status
          }
        } catch { /* skip failed stop */ }
      }

      // Set light colour based on status
      const statusColors: Record<string, string> = {
        green: '#22c55e',
        orange: '#f97316',
        red: '#ef4444',
        none: '#6b7280',
      }

      const color = statusColors[bestStatus] || statusColors.red

      // Set the light
      await lifxClient.setState(selector, {
        power: 'on',
        color: color,
        brightness: 1,
        duration: 0.5,
      })

      // For orange/red, add a breathe effect for urgency
      if (bestStatus === 'orange' || bestStatus === 'red') {
        await lifxClient.breathe(selector, {
          color: color,
          period: bestStatus === 'red' ? 1 : 2,
          cycles: bestStatus === 'red' ? 10 : 5,
          persist: false,
          power_on: true,
        })
      }

      log(`MTA indicator: ${bestStatus} on light ${config.lightId}`)

      // Schedule revert after duration
      this.indicatorRevertTimer = setTimeout(async () => {
        try {
          if (this.indicatorPreviousState) {
            if (this.indicatorPreviousState.power === 'off') {
              await lifxClient.setState(selector, { power: 'off', duration: 1 })
            } else {
              await lifxClient.setState(selector, {
                power: 'on',
                color: this.indicatorPreviousState.color,
                brightness: this.indicatorPreviousState.brightness,
                duration: 1,
              })
            }
            log('MTA indicator reverted to previous state')
          }
        } catch (err) {
          log(`Error reverting MTA indicator: ${err}`)
        }
        this.indicatorPreviousState = null
        this.indicatorRevertTimer = null
      }, config.duration * 1000)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`MTA indicator error: ${msg}`)
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
