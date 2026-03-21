import { getAll, getOne, run } from '../db/index.js'
import { activateScene, deactivateScene } from './scene-executor.js'

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

export class MotionHandler {
  private roomTimers: Map<string, RoomTimer> = new Map()
  private sensorStates: Map<string, 'active' | 'inactive'> = new Map()

  // Find which room a sensor belongs to by its label
  private findRoomForSensor(sensorName: string): DeviceRoomRow | undefined {
    return getOne<DeviceRoomRow>(
      "SELECT * FROM device_rooms WHERE device_label = ? AND device_type = 'motion'",
      [sensorName],
    )
  }

  // Find the highest-priority scene for a room in the current mode
  private findSceneForRoom(roomName: string): string | null {
    const mode = getCurrentMode()
    const scenes = getAll<SceneRow>('SELECT * FROM scenes')

    let bestScene: string | null = null
    let bestPriority = -1

    for (const scene of scenes) {
      const rooms: RoomInfo[] = JSON.parse(scene.rooms)
      const modes: string[] = JSON.parse(scene.modes)

      // Check if this scene applies to the current mode (or has no mode restriction)
      if (modes.length > 0 && !modes.includes(mode)) continue

      // Check if this scene applies to this room
      const roomEntry = rooms.find((r) => r.name === roomName)
      if (!roomEntry) continue

      if (roomEntry.priority > bestPriority) {
        bestPriority = roomEntry.priority
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
      if (!room || !room.auto) return

      // Check lux threshold — skip activation if room is bright
      const config: { lux_threshold?: number } = JSON.parse(
        deviceRoom.config || '{}',
      )
      const luxThreshold = config.lux_threshold ?? 50
      if (room.lux !== null && room.lux > luxThreshold) {
        log(
          `Room ${roomName} lux ${room.lux} exceeds threshold ${luxThreshold}, skipping activation`,
        )
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
