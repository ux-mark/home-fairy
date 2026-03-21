import { lifxClient } from './lifx-client.js'
import { getAll, getOne, run } from '../db/index.js'

interface LightCommand {
  type: 'lifx_light'
  light_id: string
  selector: string
  color?: string
  brightness?: number
  power?: string
  duration?: number
}

interface SceneCommand {
  type: 'lifx_scene'
  scene_name: string
  duration?: number
}

interface AllOffCommand {
  type: 'all_off'
  duration?: number
}

interface LightOffCommand {
  type: 'lifx_off'
  selector: string
  duration?: number
}

type Command = LightCommand | SceneCommand | AllOffCommand | LightOffCommand

interface SceneRow {
  name: string
  icon: string
  rooms: string
  modes: string
  commands: string
  tags: string
}

interface RoomInfo {
  name: string
  priority: number
}

function log(message: string, category = 'scene'): void {
  try {
    run(
      'INSERT INTO logs (message, category) VALUES (?, ?)',
      [message, category],
    )
  } catch {
    console.error('Failed to write log:', message)
  }
}

export async function activateScene(sceneName: string): Promise<void> {
  const scene = getOne<SceneRow>(
    'SELECT * FROM scenes WHERE name = ?',
    [sceneName],
  )
  if (!scene) {
    throw new Error(`Scene not found: ${sceneName}`)
  }

  const commands: Command[] = JSON.parse(scene.commands)
  const rooms: RoomInfo[] = JSON.parse(scene.rooms)

  log(`Activating scene: ${sceneName}`)

  for (const cmd of commands) {
    try {
      switch (cmd.type) {
        case 'lifx_scene': {
          const scenes = await lifxClient.listScenes()
          const target = scenes.find(
            (s: { name: string }) => s.name === cmd.scene_name,
          )
          if (target) {
            await lifxClient.activateScene(target.uuid, cmd.duration ?? 1)
            log(`Activated LIFX scene: ${cmd.scene_name}`)
          } else {
            log(`LIFX scene not found: ${cmd.scene_name}`)
          }
          break
        }

        case 'lifx_light': {
          const state: Record<string, unknown> = {}
          if (cmd.power !== undefined) state.power = cmd.power
          if (cmd.color !== undefined) state.color = cmd.color
          if (cmd.brightness !== undefined) state.brightness = cmd.brightness
          if (cmd.duration !== undefined) state.duration = cmd.duration
          await lifxClient.setState(cmd.selector, state)
          log(`Set light ${cmd.selector} state`)
          break
        }

        case 'all_off': {
          await lifxClient.setState('all', {
            power: 'off',
            duration: cmd.duration ?? 1,
          })
          log('Turned off all lights')
          break
        }

        case 'lifx_off': {
          await lifxClient.setState(cmd.selector, {
            power: 'off',
            duration: cmd.duration ?? 1,
          })
          log(`Turned off light: ${cmd.selector}`)
          break
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error executing command ${cmd.type}: ${msg}`)
    }
  }

  // Update current_scene for each room in the scene
  for (const room of rooms) {
    run(
      `UPDATE rooms SET current_scene = ?, updated_at = datetime('now') WHERE name = ?`,
      [sceneName, room.name],
    )
  }
}

export async function deactivateScene(sceneName: string): Promise<void> {
  const scene = getOne<SceneRow>(
    'SELECT * FROM scenes WHERE name = ?',
    [sceneName],
  )
  if (!scene) {
    throw new Error(`Scene not found: ${sceneName}`)
  }

  const rooms: RoomInfo[] = JSON.parse(scene.rooms)
  const commands: Command[] = JSON.parse(scene.commands)

  log(`Deactivating scene: ${sceneName}`)

  // Turn off all lights referenced in the scene's commands
  for (const cmd of commands) {
    try {
      if (cmd.type === 'lifx_light') {
        await lifxClient.setState(cmd.selector, {
          power: 'off',
          duration: 1,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error deactivating light: ${msg}`)
    }
  }

  // Also turn off lights assigned to rooms in this scene
  for (const room of rooms) {
    const lights = getAll<{ light_selector: string }>(
      'SELECT light_selector FROM light_rooms WHERE room_name = ?',
      [room.name],
    )
    for (const light of lights) {
      try {
        await lifxClient.setState(light.light_selector, {
          power: 'off',
          duration: 1,
        })
      } catch {
        // best effort
      }
    }
    run(
      `UPDATE rooms SET current_scene = NULL, updated_at = datetime('now') WHERE name = ?`,
      [room.name],
    )
  }
}
