import { lifxClient, BatchState, SetStatesResponse, getRateLimitStatus } from './lifx-client.js'
import { notificationService } from './notification-service.js'
import { hubitatClient } from './hubitat-client.js'
import { twinklyClient } from './twinkly-client.js'
import { fairyDeviceClient } from './fairy-device-client.js'
import { timerManager } from './timer-manager.js'
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

// lifx_scene type removed — all scenes migrated to per-light lifx_light commands

interface AllOffCommand {
  type: 'all_off'
  duration?: number
}

interface LightOffCommand {
  type: 'lifx_off'
  selector: string
  duration?: number
}

interface HubitatDeviceCommand {
  type: 'hubitat_device'
  device_id: number | string
  command: string
  value?: string | number
}

interface TwinklyCommand {
  type: 'twinkly'
  name: string
  command: 'on' | 'off'
}

interface FairyDeviceCommand {
  type: 'fairy_device'
  name: string
  command: string
  id?: string  // brightness as string (legacy format)
}

interface FairySceneCommand {
  type: 'fairy_scene'
  name: string  // scene name to chain-activate
  command?: string
}

interface SceneTimerCommand {
  type: 'scene_timer'
  name: string
  command: string  // target scene to activate after delay
  id?: string      // delay in seconds (legacy format)
  duration?: number
}

interface ModeUpdateCommand {
  type: 'mode_update'
  name: string  // mode name to switch to
  command?: string
}

interface LifxEffectCommand {
  type: 'lifx_effect'
  name: string
  selector: string
  effect: 'breathe' | 'pulse' | 'move'
  effect_params?: Record<string, unknown>
}

type Command =
  | LightCommand
  | AllOffCommand
  | LightOffCommand
  | HubitatDeviceCommand
  | TwinklyCommand
  | FairyDeviceCommand
  | FairySceneCommand
  | SceneTimerCommand
  | ModeUpdateCommand
  | LifxEffectCommand

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

/**
 * Inspect setStates response for failed lights and retry them individually.
 * Uses setState (single light) for retries to isolate failures.
 */
async function retryFailedLights(
  response: SetStatesResponse,
  originalStates: BatchState[],
  maxRetries = 2,
  delayMs = 2000,
): Promise<void> {
  // Build a map from light ID to original state for quick lookup
  const stateMap = new Map<string, BatchState>()
  for (const s of originalStates) {
    const id = s.selector.replace('id:', '')
    stateMap.set(id, s)
  }

  // Collect failed lights from all operation results
  let failed: { id: string; label: string; status: string; state: BatchState }[] = []

  for (const opResult of response.results) {
    if (!opResult.results) continue
    for (const lightResult of opResult.results) {
      if (lightResult.status !== 'ok') {
        const state = stateMap.get(lightResult.id)
        if (state) {
          failed.push({
            id: lightResult.id,
            label: lightResult.label,
            status: lightResult.status,
            state,
          })
        }
      }
    }
  }

  if (failed.length === 0) return

  log(`${failed.length} light(s) failed in batch: ${failed.map(f => `${f.label} (${f.status})`).join(', ')}`)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Rate limit guard — preserve budget for normal operations
    const rl = getRateLimitStatus()
    if (rl.remaining !== null && rl.remaining < 10) {
      log(`Skipping retry attempt ${attempt}: rate limit low (${rl.remaining} remaining)`, 'device_error')
      break
    }

    await new Promise(resolve => setTimeout(resolve, delayMs))

    const stillFailed: typeof failed = []
    for (const light of failed) {
      try {
        const { selector, ...stateWithoutSelector } = light.state
        await lifxClient.setState(selector, stateWithoutSelector)
        log(`Retry ${attempt} succeeded for ${light.label}`)
      } catch {
        stillFailed.push(light)
      }
    }

    if (stillFailed.length === 0) {
      log(`All failed light(s) recovered after retry ${attempt}`)
      return
    }

    failed = stillFailed
  }

  // Final failures — log and create notification
  for (const light of failed) {
    const msg = `Light "${light.label}" (${light.state.selector}) failed to respond after ${maxRetries + 1} attempts`
    log(msg, 'device_error')
    notificationService.create({
      severity: 'warning',
      category: 'device_error',
      title: `${light.label} did not respond`,
      message: msg,
      sourceType: 'lifx_light',
      sourceId: light.id,
      sourceLabel: light.label,
      dedupKey: `device_error:${light.state.selector}`,
    })
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

  // Collect lifx_light commands for batching
  const lightCommands: LightCommand[] = []
  const otherCommands: Command[] = []

  for (const cmd of commands) {
    if (cmd.type === 'lifx_light') {
      lightCommands.push(cmd)
    } else {
      otherCommands.push(cmd)
    }
  }

  // Batch all lifx_light commands into a single setStates call
  if (lightCommands.length > 0) {
    try {
      const states: BatchState[] = lightCommands.map((cmd) => {
        const state: BatchState = { selector: cmd.selector }
        if (cmd.power !== undefined) state.power = cmd.power
        if (cmd.color !== undefined) state.color = cmd.color
        if (cmd.brightness !== undefined) state.brightness = cmd.brightness
        if (cmd.duration !== undefined) state.duration = cmd.duration
        return state
      })
      const response = await lifxClient.setStates(states)
      log(`Batch set ${states.length} light(s) via setStates`)
      await retryFailedLights(response, states)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error in batch setStates: ${msg}`)
    }
  }

  // Execute remaining commands sequentially
  for (const cmd of otherCommands) {
    try {
      switch (cmd.type) {
        case 'all_off': {
          await lifxClient.setState('all', {
            power: 'off',
            duration: cmd.duration ?? 1,
          })
          // Also turn off Hubitat switches assigned to rooms in this scene
          for (const room of rooms) {
            const hubDevices = getAll<{ device_id: string }>(
              "SELECT device_id FROM device_rooms WHERE room_name = ? AND device_type IN ('switch', 'dimmer', 'light')",
              [room.name],
            )
            for (const dev of hubDevices) {
              try {
                await hubitatClient.sendCommand(dev.device_id, 'off')
              } catch {
                // best effort
              }
            }
          }
          log('Turned off all lights and Hubitat switches')
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

        case 'hubitat_device': {
          if (cmd.value !== undefined) {
            await hubitatClient.sendCommandWithValue(cmd.device_id, cmd.command, cmd.value)
          } else {
            await hubitatClient.sendCommand(cmd.device_id, cmd.command)
          }
          log(`Hubitat device ${cmd.device_id}: ${cmd.command}${cmd.value !== undefined ? ` ${cmd.value}` : ''}`)
          break
        }

        case 'twinkly': {
          // Look up Twinkly device IP from device_rooms or fairy_devices
          const twinklyDev = getOne<{ ip: string | null }>(
            "SELECT json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE label = ? AND device_type = 'twinkly'",
            [cmd.name],
          )
          if (twinklyDev?.ip) {
            if (cmd.command === 'on') {
              await twinklyClient.turnOn(twinklyDev.ip)
            } else {
              await twinklyClient.turnOff(twinklyDev.ip)
            }
            log(`Twinkly ${cmd.name}: ${cmd.command}`)
          } else {
            log(`Twinkly device not found: ${cmd.name}`)
          }
          break
        }

        case 'fairy_device': {
          const fairyDev = getOne<{ ip: string | null }>(
            "SELECT json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE label = ? AND device_type = 'fairy'",
            [cmd.name],
          )
          if (fairyDev?.ip) {
            const brightness = cmd.id ? parseInt(cmd.id, 10) : 100
            if (cmd.command.toLowerCase() === 'off') {
              await fairyDeviceClient.turnOff(fairyDev.ip)
            } else {
              await fairyDeviceClient.setBrightness(fairyDev.ip, Math.round(brightness * 2.55))
            }
            log(`Fairy device ${cmd.name}: ${cmd.command} (brightness: ${cmd.id || 'default'})`)
          } else {
            log(`Fairy device not found: ${cmd.name}`)
          }
          break
        }

        case 'fairy_scene': {
          // Chain: activate another scene
          try {
            await activateScene(cmd.name)
            log(`Chained scene activation: ${cmd.name}`)
          } catch (chainErr) {
            const chainMsg = chainErr instanceof Error ? chainErr.message : String(chainErr)
            log(`Error chaining scene ${cmd.name}: ${chainMsg}`)
          }
          break
        }

        case 'scene_timer': {
          const delaySec = cmd.duration || (cmd.id ? parseInt(cmd.id, 10) : 300)
          const targetScene = cmd.command || cmd.name
          timerManager.createTimer(sceneName, targetScene, delaySec)
          log(`Scene timer: activate "${targetScene}" in ${delaySec}s`)
          break
        }

        case 'mode_update': {
          const newMode = cmd.name || cmd.command || ''
          if (newMode) {
            run(
              `INSERT INTO current_state (key, value, updated_at)
               VALUES ('mode', ?, datetime('now'))
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              [newMode],
            )
            log(`Mode updated to: ${newMode}`)
          }
          break
        }

        case 'lifx_effect': {
          const effectMethod = cmd.effect === 'breathe' ? lifxClient.breathe
            : cmd.effect === 'pulse' ? lifxClient.pulse
            : cmd.effect === 'move' ? lifxClient.move
            : null
          if (effectMethod) {
            await effectMethod(cmd.selector, cmd.effect_params || {})
            log(`LIFX effect ${cmd.effect} on ${cmd.selector}`)
          }
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

  // Track when this scene was last activated
  run(
    `UPDATE scenes SET last_activated_at = datetime('now') WHERE name = ?`,
    [sceneName],
  )
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

  // Batch turn off all lifx_light commands
  const lightCommands = commands.filter(
    (cmd): cmd is LightCommand => cmd.type === 'lifx_light',
  )

  if (lightCommands.length > 0) {
    try {
      const states: BatchState[] = lightCommands.map((cmd) => ({
        selector: cmd.selector,
        power: 'off',
        duration: 1,
      }))
      const response = await lifxClient.setStates(states)
      log(`Batch turned off ${states.length} light(s)`)
      await retryFailedLights(response, states)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error in batch deactivate: ${msg}`)
    }
  }

  // Turn off Hubitat devices referenced in scene commands
  const hubitatCommands = commands.filter(
    (cmd): cmd is HubitatDeviceCommand => cmd.type === 'hubitat_device',
  )
  for (const cmd of hubitatCommands) {
    try {
      await hubitatClient.sendCommand(cmd.device_id, 'off')
      log(`Turned off Hubitat device ${cmd.device_id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error turning off Hubitat device: ${msg}`)
    }
  }

  // Turn off Twinkly devices
  const twinklyCommands = commands.filter(
    (cmd): cmd is TwinklyCommand => cmd.type === 'twinkly',
  )
  for (const cmd of twinklyCommands) {
    try {
      const dev = getOne<{ ip: string | null }>(
        "SELECT json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE label = ? AND device_type = 'twinkly'",
        [cmd.name],
      )
      if (dev?.ip) {
        await twinklyClient.turnOff(dev.ip)
        log(`Turned off Twinkly: ${cmd.name}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error turning off Twinkly: ${msg}`)
    }
  }

  // Turn off Fairy devices
  const fairyCommands = commands.filter(
    (cmd): cmd is FairyDeviceCommand => cmd.type === 'fairy_device',
  )
  for (const cmd of fairyCommands) {
    try {
      const dev = getOne<{ ip: string | null }>(
        "SELECT json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE label = ? AND device_type = 'fairy'",
        [cmd.name],
      )
      if (dev?.ip) {
        await fairyDeviceClient.turnOff(dev.ip)
        log(`Turned off Fairy device: ${cmd.name}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error turning off Fairy device: ${msg}`)
    }
  }

  // Stop LIFX effects
  const effectCommands = commands.filter(
    (cmd): cmd is LifxEffectCommand => cmd.type === 'lifx_effect',
  )
  for (const cmd of effectCommands) {
    try {
      await lifxClient.effectsOff(cmd.selector)
      log(`Stopped effects on: ${cmd.selector}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error stopping effects: ${msg}`)
    }
  }

  // Also turn off lights assigned to rooms in this scene (batched)
  const roomLightStates: BatchState[] = []
  for (const room of rooms) {
    const lights = getAll<{ light_selector: string }>(
      'SELECT light_selector FROM light_rooms WHERE room_name = ?',
      [room.name],
    )
    for (const light of lights) {
      roomLightStates.push({
        selector: light.light_selector,
        power: 'off',
        duration: 1,
      })
    }
  }

  if (roomLightStates.length > 0) {
    try {
      // setStates supports up to 50 per call, batch if needed
      for (let i = 0; i < roomLightStates.length; i += 50) {
        const batch = roomLightStates.slice(i, i + 50)
        const batchResponse = await lifxClient.setStates(batch)
        await retryFailedLights(batchResponse, batch)
      }
      log(`Batch turned off ${roomLightStates.length} room light(s)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error turning off room lights: ${msg}`)
    }
  }

  for (const room of rooms) {
    run(
      `UPDATE rooms SET current_scene = NULL, scene_manual = 0, updated_at = datetime('now') WHERE name = ?`,
      [room.name],
    )
  }
}
