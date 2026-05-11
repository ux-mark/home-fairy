import { lifxClient, BatchState, SetStatesResponse, getRateLimitStatus } from './lifx-client.js'
import { notificationService } from './notification-service.js'
import { hubitatClient } from './hubitat-client.js'
import { kasaClient } from './kasa-client.js'
import { twinklyClient } from './twinkly-client.js'
import { fairyDeviceClient } from './fairy-device-client.js'
import { timerManager } from './timer-manager.js'
import { getAll, getOne, run } from '../db/index.js'
import { emit } from './socket.js'
import { deviceHealthService } from './device-health-service.js'
import { FAIRY_QUEEN } from './constants.js'
import { logUserAction } from './user-action-logger.js'
import { log } from './logger.js'
import { isHushingActive } from './hushing.js'

interface LightCommand {
  type: 'lifx_light'
  light_id: string
  selector: string
  color?: string
  brightness?: number
  power?: string
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

interface HubitatDeviceCommand {
  type: 'hubitat_device'
  device_id: number | string
  command: string
  value?: string | number
}

interface KasaDeviceCommand {
  type: 'kasa_device'
  device_id: string
  name: string
  command: 'on' | 'off'
  brightness?: number
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
  brightness?: number
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
  | KasaDeviceCommand
  | TwinklyCommand
  | FairyDeviceCommand
  | FairySceneCommand
  | SceneTimerCommand
  | ModeUpdateCommand
  | LifxEffectCommand

interface SceneRow {
  name: string
  icon: string
  commands: string
  tags: string
}

interface RoomInfo {
  name: string
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
        deviceHealthService.recordSuccess('lifx', light.id)
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
    deviceHealthService.recordFailure('lifx', light.id, light.status)
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

export async function activateScene(
  sceneName: string,
  visitedScenes: Set<string> = new Set(),
  source: 'manual' | 'auto' | 'timer' | 'chain' = 'auto',
  user?: { id: string; name: string },
  parentLogId?: number,
): Promise<void> {
  if (visitedScenes.has(sceneName)) {
    log(`Scene cycle detected: ${sceneName} already in chain [${[...visitedScenes].join(' -> ')}]. Skipping.`)
    return
  }
  visitedScenes.add(sceneName)

  const actionUser = user ?? FAIRY_QUEEN

  const scene = getOne<SceneRow>(
    'SELECT * FROM scenes WHERE name = ?',
    [sceneName],
  )
  if (!scene) {
    throw new Error(`Scene not found: ${sceneName}`)
  }

  const commands: Command[] = JSON.parse(scene.commands)
  const rooms = getAll<{ room_name: string }>(
    'SELECT room_name FROM scene_rooms WHERE scene_name = ?',
    [sceneName],
  ).map(r => ({ name: r.room_name }))

  const sourceLabel = source === 'manual' ? '' : ` (${source})`
  log(`${actionUser.name} activated ${sceneName}${sourceLabel}`, 'scene', actionUser, undefined, parentLogId)

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
      const states: BatchState[] = []
      for (const cmd of lightCommands) {
        if (!deviceHealthService.isDeviceActive('lifx', cmd.light_id)) {
          log(`Skipping deactivated light: ${cmd.selector}`, undefined, undefined, undefined, parentLogId)
          continue
        }
        const state: BatchState = { selector: cmd.selector }
        if (cmd.power !== undefined) state.power = cmd.power
        if (cmd.color !== undefined) state.color = cmd.color
        if (cmd.brightness !== undefined) state.brightness = cmd.brightness
        if (cmd.duration !== undefined) state.duration = cmd.duration
        states.push(state)
      }
      if (states.length > 0) {
        const response = await lifxClient.setStates(states)
        log(`Batch set ${states.length} light(s) via setStates`, 'scene', actionUser, undefined, parentLogId)
        // Record success for lights that responded ok in the batch
        for (const opResult of response.results) {
          if (!opResult.results) continue
          for (const lightResult of opResult.results) {
            if (lightResult.status === 'ok') {
              deviceHealthService.recordSuccess('lifx', lightResult.id)
            }
          }
        }
        // Fire-and-forget: retryFailedLights sleeps 2 s before each attempt
        // and isn't on the user-visible critical path. Awaiting it added up
        // to 4 s of pure setTimeout delay between motion and light response.
        void retryFailedLights(response, states).catch(err => {
          const msg = err instanceof Error ? err.message : String(err)
          log(`retryFailedLights threw: ${msg}`, undefined, undefined, undefined, parentLogId)
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error in batch setStates: ${msg}`, undefined, undefined, undefined, parentLogId)
    }
  }

  // Execute remaining commands sequentially
  for (const cmd of otherCommands) {
    try {
      switch (cmd.type) {
        case 'all_off': {
          // Turn off LIFX lights in scene rooms only (not ALL lights)
          const lightStates: BatchState[] = []
          for (const room of rooms) {
            const roomLights = getAll<{ light_selector: string }>(
              'SELECT light_selector FROM light_rooms WHERE room_name = ? AND active = 1',
              [room.name],
            )
            for (const light of roomLights) {
              lightStates.push({
                selector: light.light_selector,
                power: 'off',
                duration: cmd.duration ?? 1,
              })
            }
          }
          if (lightStates.length > 0) {
            for (let i = 0; i < lightStates.length; i += 50) {
              const batch = lightStates.slice(i, i + 50)
              try {
                await lifxClient.setStates(batch)
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                log(`Error turning off LIFX lights in scene rooms: ${msg}`, undefined, undefined, undefined, parentLogId)
              }
            }
          }
          // Also turn off Hubitat switches and Kasa devices assigned to rooms
          // in this scene — fired in parallel so one offline device can't park
          // the whole scene behind its 10 s timeout.
          const allOffTargets: { id: string; isKasa: boolean }[] = []
          for (const room of rooms) {
            const hubDevices = getAll<{ device_id: string; device_type: string }>(
              "SELECT device_id, device_type FROM device_rooms WHERE room_name = ? AND device_type IN ('switch', 'dimmer', 'light', 'kasa_plug', 'kasa_strip', 'kasa_outlet', 'kasa_switch', 'kasa_dimmer')",
              [room.name],
            )
            for (const dev of hubDevices) {
              const isKasa = dev.device_type.startsWith('kasa_')
              const healthType = isKasa ? 'kasa' : 'hub'
              if (!deviceHealthService.isDeviceActive(healthType, dev.device_id)) continue
              allOffTargets.push({ id: dev.device_id, isKasa })
            }
          }
          await Promise.allSettled(
            allOffTargets.map(t =>
              t.isKasa
                ? kasaClient.sendCommand(t.id, 'off')
                : hubitatClient.sendCommand(t.id, 'off'),
            ),
          )
          log('Turned off lights in scene rooms, Hubitat switches, and Kasa devices', undefined, undefined, undefined, parentLogId)
          break
        }

        case 'lifx_off': {
          await lifxClient.setState(cmd.selector, {
            power: 'off',
            duration: cmd.duration ?? 1,
          })
          log(`Turned off light: ${cmd.selector}`, undefined, undefined, undefined, parentLogId)
          break
        }

        case 'hubitat_device': {
          if (!deviceHealthService.isDeviceActive('hub', String(cmd.device_id))) {
            log(`Skipping deactivated device: ${cmd.device_id}`, undefined, undefined, undefined, parentLogId)
            break
          }
          try {
            if (cmd.value !== undefined) {
              await hubitatClient.sendCommandWithValue(cmd.device_id, cmd.command, cmd.value)
            } else {
              await hubitatClient.sendCommand(cmd.device_id, cmd.command)
            }
            log(`Hubitat device ${cmd.device_id}: ${cmd.command}${cmd.value !== undefined ? ` ${cmd.value}` : ''}`, undefined, undefined, undefined, parentLogId)
            deviceHealthService.recordSuccess('hub', String(cmd.device_id))
          } catch (hubErr) {
            const hubMsg = hubErr instanceof Error ? hubErr.message : String(hubErr)
            log(`Error executing Hubitat device ${cmd.device_id}: ${hubMsg}`, 'device_error', undefined, undefined, parentLogId)
            deviceHealthService.recordFailure('hub', String(cmd.device_id), hubMsg)
            throw hubErr
          }
          break
        }

        case 'kasa_device': {
          if (!deviceHealthService.isDeviceActive('kasa', cmd.device_id)) {
            log(`Skipping deactivated device: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
            break
          }
          try {
            if (cmd.command === 'on' && cmd.brightness !== undefined) {
              // set_brightness implicitly turns the device on, avoiding a momentary
              // full-brightness flash from sending on + set_brightness separately
              await kasaClient.sendCommand(cmd.device_id, 'set_brightness', cmd.brightness)
            } else {
              await kasaClient.sendCommand(cmd.device_id, cmd.command)
            }
            log(`Kasa device ${cmd.name}: ${cmd.command}${cmd.brightness !== undefined ? ` (brightness: ${cmd.brightness})` : ''}`, undefined, undefined, undefined, parentLogId)
            deviceHealthService.recordSuccess('kasa', cmd.device_id)
          } catch (kasaErr) {
            const kasaMsg = kasaErr instanceof Error ? kasaErr.message : String(kasaErr)
            log(`Error executing Kasa device ${cmd.name}: ${kasaMsg}`, 'device_error', undefined, undefined, parentLogId)
            deviceHealthService.recordFailure('kasa', cmd.device_id, kasaMsg)
            throw kasaErr
          }
          break
        }

        case 'twinkly': {
          // Look up Twinkly device IP from device_rooms or fairy_devices
          const twinklyDev = getOne<{ id: string; ip: string | null }>(
            "SELECT id, json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE label = ? AND device_type = 'twinkly'",
            [cmd.name],
          )
          if (twinklyDev?.ip) {
            if (!deviceHealthService.isDeviceActive('hub', String(twinklyDev.id))) {
              log(`Skipping deactivated device: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
              break
            }
            try {
              if (cmd.command === 'on') {
                await twinklyClient.turnOn(twinklyDev.ip)
              } else {
                await twinklyClient.turnOff(twinklyDev.ip)
              }
              log(`Twinkly ${cmd.name}: ${cmd.command}`, undefined, undefined, undefined, parentLogId)
              deviceHealthService.recordSuccess('hub', String(twinklyDev.id))
            } catch (twinklyErr) {
              const twinklyMsg = twinklyErr instanceof Error ? twinklyErr.message : String(twinklyErr)
              log(`Error executing Twinkly ${cmd.name}: ${twinklyMsg}`, 'device_error', undefined, undefined, parentLogId)
              deviceHealthService.recordFailure('hub', String(twinklyDev.id), twinklyMsg)
              throw twinklyErr
            }
          } else {
            log(`Twinkly device not found: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
          }
          break
        }

        case 'fairy_device': {
          const fairyDev = getOne<{ id: string; ip: string | null }>(
            "SELECT id, json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE label = ? AND device_type = 'fairy'",
            [cmd.name],
          )
          if (fairyDev?.ip) {
            if (!deviceHealthService.isDeviceActive('hub', String(fairyDev.id))) {
              log(`Skipping deactivated device: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
              break
            }
            try {
              const brightness = cmd.brightness ?? 100
              if (cmd.command.toLowerCase() === 'off') {
                await fairyDeviceClient.turnOff(fairyDev.ip)
              } else {
                await fairyDeviceClient.setBrightness(fairyDev.ip, Math.round(brightness * 2.55))
              }
              log(`Fairy device ${cmd.name}: ${cmd.command} (brightness: ${brightness})`, undefined, undefined, undefined, parentLogId)
              deviceHealthService.recordSuccess('hub', String(fairyDev.id))
            } catch (fairyErr) {
              const fairyMsg = fairyErr instanceof Error ? fairyErr.message : String(fairyErr)
              log(`Error executing Fairy device ${cmd.name}: ${fairyMsg}`, 'device_error', undefined, undefined, parentLogId)
              deviceHealthService.recordFailure('hub', String(fairyDev.id), fairyMsg)
              throw fairyErr
            }
          } else {
            log(`Fairy device not found: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
          }
          break
        }

        case 'fairy_scene': {
          // Chain: activate another scene (respecting seasonal ranges)
          try {
            const targetScene = getOne<{ active_from: string | null; active_to: string | null }>(
              'SELECT active_from, active_to FROM scenes WHERE name = ?',
              [cmd.name],
            )
            if (targetScene?.active_from && targetScene?.active_to) {
              const now = new Date()
              const month = now.getMonth() + 1
              const day = now.getDate()
              const today = month * 100 + day
              const [fromM, fromD] = targetScene.active_from.split('-').map(Number)
              const [toM, toD] = targetScene.active_to.split('-').map(Number)
              const from = fromM * 100 + fromD
              const to = toM * 100 + toD
              const inRange = from <= to
                ? (today >= from && today <= to)
                : (today >= from || today <= to)
              if (!inRange) {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                log(`Skipping chained scene "${cmd.name}": out of season (${fromD} ${monthNames[fromM - 1]} to ${toD} ${monthNames[toM - 1]})`, undefined, undefined, undefined, parentLogId)
                break
              }
            }
            await activateScene(cmd.name, visitedScenes, 'chain', user, parentLogId)
            log(`Chained scene activation: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
          } catch (chainErr) {
            const chainMsg = chainErr instanceof Error ? chainErr.message : String(chainErr)
            log(`Error chaining scene ${cmd.name}: ${chainMsg}`, undefined, undefined, undefined, parentLogId)
          }
          break
        }

        case 'scene_timer': {
          if (isHushingActive()) {
            log(`Hushing Home active — suppressing scene_timer command (would activate "${cmd.command || cmd.name}")`, undefined, undefined, undefined, parentLogId)
            break
          }
          const delaySec = cmd.duration ?? 300
          const targetScene = cmd.command || cmd.name
          timerManager.createTimer(sceneName, targetScene, delaySec)
          log(`Scene timer: activate "${targetScene}" in ${delaySec}s`, undefined, undefined, undefined, parentLogId)
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
            log(`Mode updated to: ${newMode}`, undefined, undefined, undefined, parentLogId)
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
            log(`LIFX effect ${cmd.effect} on ${cmd.selector}`, undefined, undefined, undefined, parentLogId)
          }
          break
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error executing command ${cmd.type}: ${msg}`, undefined, undefined, undefined, parentLogId)
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
    `UPDATE scenes SET last_activated_at = datetime('now'), last_activated_by = ?, updated_by = ? WHERE name = ?`,
    [actionUser.id, actionUser.id, sceneName],
  )

  logUserAction(actionUser.id, actionUser.name, 'activate', 'scene', sceneName, { source })

  emit('scene:change', { scene: sceneName, action: 'activated', rooms: rooms.map(r => r.name) })
}

export async function deactivateScene(sceneName: string, user?: { id: string; name: string }, parentLogId?: number): Promise<void> {
  const scene = getOne<SceneRow>(
    'SELECT * FROM scenes WHERE name = ?',
    [sceneName],
  )
  if (!scene) {
    throw new Error(`Scene not found: ${sceneName}`)
  }

  const actionUser = user ?? FAIRY_QUEEN

  const rooms = getAll<{ room_name: string }>(
    'SELECT room_name FROM scene_rooms WHERE scene_name = ?',
    [sceneName],
  ).map(r => ({ name: r.room_name }))
  const commands: Command[] = JSON.parse(scene.commands)

  log(`${actionUser.name} deactivated ${sceneName}`, 'scene', actionUser, undefined, parentLogId)

  // Batch turn off all lifx_light commands
  const lightCommands = commands.filter(
    (cmd): cmd is LightCommand => cmd.type === 'lifx_light',
  )

  if (lightCommands.length > 0) {
    try {
      const states: BatchState[] = []
      for (const cmd of lightCommands) {
        if (!deviceHealthService.isDeviceActive('lifx', cmd.light_id)) {
          log(`Skipping deactivated light: ${cmd.selector}`, undefined, undefined, undefined, parentLogId)
          continue
        }
        states.push({ selector: cmd.selector, power: 'off', duration: 1 })
      }
      if (states.length > 0) {
        const response = await lifxClient.setStates(states)
        log(`Batch turned off ${states.length} light(s)`, undefined, undefined, undefined, parentLogId)
        // Record success for lights that responded ok
        for (const opResult of response.results) {
          if (!opResult.results) continue
          for (const lightResult of opResult.results) {
            if (lightResult.status === 'ok') {
              deviceHealthService.recordSuccess('lifx', lightResult.id)
            }
          }
        }
        // Fire-and-forget: retryFailedLights sleeps 2 s before each attempt
        // and isn't on the user-visible critical path. Awaiting it added up
        // to 4 s of pure setTimeout delay between motion and light response.
        void retryFailedLights(response, states).catch(err => {
          const msg = err instanceof Error ? err.message : String(err)
          log(`retryFailedLights threw: ${msg}`, undefined, undefined, undefined, parentLogId)
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error in batch deactivate: ${msg}`, undefined, undefined, undefined, parentLogId)
    }
  }

  // Turn off Hubitat devices referenced in scene commands. Fired in parallel
  // so one offline device can't park the whole deactivation behind its 10 s
  // timeout — same pattern applied to Kasa, Twinkly, Fairy, and effects below.
  const hubitatCommands = commands.filter(
    (cmd): cmd is HubitatDeviceCommand => cmd.type === 'hubitat_device',
  )
  const hubitatActive = hubitatCommands.filter(cmd => {
    if (!deviceHealthService.isDeviceActive('hub', String(cmd.device_id))) {
      log(`Skipping deactivated device: ${cmd.device_id}`, undefined, undefined, undefined, parentLogId)
      return false
    }
    return true
  })
  await Promise.allSettled(
    hubitatActive.map(async cmd => {
      try {
        await hubitatClient.sendCommand(cmd.device_id, 'off')
        log(`Turned off Hubitat device ${cmd.device_id}`, undefined, undefined, undefined, parentLogId)
        deviceHealthService.recordSuccess('hub', String(cmd.device_id))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Error turning off Hubitat device: ${msg}`, undefined, undefined, undefined, parentLogId)
        deviceHealthService.recordFailure('hub', String(cmd.device_id), msg)
      }
    }),
  )

  // Turn off Kasa devices referenced in scene commands
  const kasaCommands = commands.filter(
    (cmd): cmd is KasaDeviceCommand => cmd.type === 'kasa_device',
  )
  const kasaActive = kasaCommands.filter(cmd => {
    if (!deviceHealthService.isDeviceActive('kasa', cmd.device_id)) {
      log(`Skipping deactivated device: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
      return false
    }
    return true
  })
  await Promise.allSettled(
    kasaActive.map(async cmd => {
      try {
        await kasaClient.sendCommand(cmd.device_id, 'off')
        log(`Turned off Kasa device: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
        deviceHealthService.recordSuccess('kasa', cmd.device_id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Error turning off Kasa device: ${msg}`, undefined, undefined, undefined, parentLogId)
        deviceHealthService.recordFailure('kasa', cmd.device_id, msg)
      }
    }),
  )

  // Turn off Twinkly devices
  const twinklyCommands = commands.filter(
    (cmd): cmd is TwinklyCommand => cmd.type === 'twinkly',
  )
  await Promise.allSettled(
    twinklyCommands.map(async cmd => {
      try {
        const dev = getOne<{ id: string; ip: string | null }>(
          "SELECT id, json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE label = ? AND device_type = 'twinkly'",
          [cmd.name],
        )
        if (!dev?.ip) return
        if (!deviceHealthService.isDeviceActive('hub', String(dev.id))) {
          log(`Skipping deactivated device: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
          return
        }
        await twinklyClient.turnOff(dev.ip)
        log(`Turned off Twinkly: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
        deviceHealthService.recordSuccess('hub', String(dev.id))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Error turning off Twinkly: ${msg}`, undefined, undefined, undefined, parentLogId)
      }
    }),
  )

  // Turn off Fairy devices
  const fairyCommands = commands.filter(
    (cmd): cmd is FairyDeviceCommand => cmd.type === 'fairy_device',
  )
  await Promise.allSettled(
    fairyCommands.map(async cmd => {
      try {
        const dev = getOne<{ id: string; ip: string | null }>(
          "SELECT id, json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE label = ? AND device_type = 'fairy'",
          [cmd.name],
        )
        if (!dev?.ip) return
        if (!deviceHealthService.isDeviceActive('hub', String(dev.id))) {
          log(`Skipping deactivated device: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
          return
        }
        await fairyDeviceClient.turnOff(dev.ip)
        log(`Turned off Fairy device: ${cmd.name}`, undefined, undefined, undefined, parentLogId)
        deviceHealthService.recordSuccess('hub', String(dev.id))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Error turning off Fairy device: ${msg}`, undefined, undefined, undefined, parentLogId)
      }
    }),
  )

  // Stop LIFX effects
  const effectCommands = commands.filter(
    (cmd): cmd is LifxEffectCommand => cmd.type === 'lifx_effect',
  )
  await Promise.allSettled(
    effectCommands.map(async cmd => {
      try {
        await lifxClient.effectsOff(cmd.selector)
        log(`Stopped effects on: ${cmd.selector}`, undefined, undefined, undefined, parentLogId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Error stopping effects: ${msg}`, undefined, undefined, undefined, parentLogId)
      }
    }),
  )

  // Also turn off lights assigned to rooms in this scene (batched)
  const roomLightStates: BatchState[] = []
  for (const room of rooms) {
    const lights = getAll<{ light_id: string; light_selector: string }>(
      'SELECT light_id, light_selector FROM light_rooms WHERE room_name = ? AND active = 1',
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
        // Record success for room lights that responded ok
        for (const opResult of batchResponse.results) {
          if (!opResult.results) continue
          for (const lightResult of opResult.results) {
            if (lightResult.status === 'ok') {
              deviceHealthService.recordSuccess('lifx', lightResult.id)
            }
          }
        }
        // Fire-and-forget — see comment at the activateScene call site.
        void retryFailedLights(batchResponse, batch).catch(err => {
          const msg = err instanceof Error ? err.message : String(err)
          log(`retryFailedLights threw: ${msg}`, undefined, undefined, undefined, parentLogId)
        })
      }
      log(`Batch turned off ${roomLightStates.length} room light(s)`, undefined, undefined, undefined, parentLogId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Error turning off room lights: ${msg}`, undefined, undefined, undefined, parentLogId)
    }
  }

  for (const room of rooms) {
    run(
      `UPDATE rooms SET current_scene = NULL, scene_manual = 0, updated_at = datetime('now') WHERE name = ?`,
      [room.name],
    )
  }

  logUserAction(actionUser.id, actionUser.name, 'deactivate', 'scene', sceneName)

  emit('scene:change', { scene: sceneName, action: 'deactivated', rooms: rooms.map(r => r.name) })
}
