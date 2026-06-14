import { getAll } from '../db/index.js'

interface LogRow {
  id: number
  parent_id: number | null
  seq: number
  message: string
  debug: string | null
  category: string | null
  user_id: string | null
  user_name: string | null
  created_at: string
}

export interface ActivityNarrative {
  message: string
  type: string
  room: string | null
  isFairyQueen: boolean
}

function getRoomForScene(sceneName: string): string | null {
  const rows = getAll<{ room_name: string }>(
    'SELECT room_name FROM scene_rooms WHERE scene_name = ?',
    [sceneName],
  )
  if (rows.length === 1) return rows[0].room_name
  if (rows.length > 1) return rows.map(r => r.room_name).join(' & ')
  return null
}

function humanizeReason(reason: string): string {
  if (reason === 'sunset') return 'the sun has set'
  if (reason === 'sunrise') return 'the sun has risen'
  if (reason.startsWith('scheduled')) return 'schedule'
  if (reason === 'civil_dawn') return 'civil dawn'
  if (reason === 'civil_dusk') return 'civil dusk'
  return reason
}

export function narrate(parent: LogRow, children: LogRow[]): ActivityNarrative {
  const msg = parent.message
  const isFQ = parent.user_name === 'Fairy Queen'

  // Motion active → activating scene
  const motionActivate = msg.match(/^Motion active in (.+?) → activating (.+)$/)
  if (motionActivate) {
    const [, room, scene] = motionActivate
    return {
      message: `Fairy Queen activated ${scene} as there was movement in the ${room}.`,
      type: 'awakened',
      room,
      isFairyQueen: true,
    }
  }

  // Motion active (no scene activation — standalone)
  const motionActive = msg.match(/^Motion active in (.+?) \((.+?)\)$/)
  if (motionActive) {
    const [, room] = motionActive
    return {
      message: `Movement detected in the ${room} — automation is disabled, no scene activated.`,
      type: 'motion',
      room,
      isFairyQueen: false,
    }
  }

  // Timer expired → deactivating
  const timerExpired = msg.match(/^Timer expired for (.+?), deactivating scene$/)
  if (timerExpired) {
    const [, room] = timerExpired
    // Find the scene name from children
    const deactivateChild = children.find(c => c.message.includes('deactivated'))
    const sceneMatch = deactivateChild?.message.match(/deactivated (.+)$/)
    const scene = sceneMatch?.[1] ?? 'the scene'
    // Find timer duration from children
    const timerChild = children.find(c => c.message.includes('starting') && c.message.includes('timer'))
    const durationMatch = timerChild?.message.match(/(\d+)m timer/)
    const duration = durationMatch?.[1] ?? '?'
    return {
      message: `Fairy Queen turned off ${scene} after no motion in the ${room} for ${duration} minutes.`,
      type: 'hushed',
      room,
      isFairyQueen: true,
    }
  }

  // Motion inactive → starting timer
  const motionTimer = msg.match(/^Motion inactive in (.+?) → starting (\d+)m timer$/)
  if (motionTimer) {
    const [, room, minutes] = motionTimer
    return {
      message: `No motion detected in the ${room} — lights will turn off in ${minutes} minutes.`,
      type: 'no_motion',
      room,
      isFairyQueen: false,
    }
  }

  // Motion inactive (no timer)
  const motionInactive = msg.match(/^Motion inactive in (.+?) \((.+?)\)$/)
  if (motionInactive) {
    const [, room, sensor] = motionInactive
    return {
      message: `${sensor} went inactive in the ${room}.`,
      type: 'motion_inactive',
      room,
      isFairyQueen: false,
    }
  }

  // Scene activation (manual or auto)
  const sceneActivate = msg.match(/^(.+?) activated (.+?)( \((.+?)\))?$/)
  if (sceneActivate && parent.category === 'scene') {
    const [, userName, scene, , source] = sceneActivate
    const room = getRoomForScene(scene)
    const roomLabel = room ? ` in the ${room}` : ''

    if (source === 'auto' || userName === 'Fairy Queen') {
      return {
        message: `Fairy Queen activated ${scene}${roomLabel}.`,
        type: 'awakened',
        room,
        isFairyQueen: true,
      }
    }
    return {
      message: `${userName} activated ${scene}${roomLabel}.`,
      type: 'manual_on',
      room,
      isFairyQueen: false,
    }
  }

  // Scene deactivation
  const sceneDeactivate = msg.match(/^(.+?) deactivated (.+)$/)
  if (sceneDeactivate && parent.category === 'scene') {
    const [, userName, scene] = sceneDeactivate
    const room = getRoomForScene(scene)
    const roomLabel = room ? ` in the ${room}` : ''

    if (userName === 'Fairy Queen') {
      return {
        message: `Fairy Queen turned off ${scene}${roomLabel}.`,
        type: 'hushed',
        room,
        isFairyQueen: true,
      }
    }
    return {
      message: `${userName} turned off ${scene}${roomLabel}.`,
      type: 'manual_off',
      room,
      isFairyQueen: false,
    }
  }

  // Mode change (automatic — Fairy Queen with reason)
  const fqModeChange = msg.match(/^Fairy Queen changed mode to (.+?) \((.+?)\)$/)
  if (fqModeChange) {
    const [, mode, reason] = fqModeChange
    return {
      message: `Fairy Queen changed the home to ${mode} as ${humanizeReason(reason)}.`,
      type: 'mode_change',
      room: null,
      isFairyQueen: true,
    }
  }

  // Mode change (manual)
  const userModeChange = msg.match(/^(.+?) changed mode to (.+)$/)
  if (userModeChange) {
    const [, userName, mode] = userModeChange
    return {
      message: `${userName} changed the home to ${mode}.`,
      type: 'mode_change',
      room: null,
      isFairyQueen: false,
    }
  }

  // Nighttime activation
  const nighttime = msg.match(/^(.+?) activated Nighttime \(locked (\d+) rooms?, wake mode: (.+?)\)$/)
  if (nighttime) {
    const [, userName, count, wake] = nighttime
    return {
      message: `${userName} activated Nighttime — ${count} rooms locked, wake mode set to ${wake}.`,
      type: 'nighttime',
      room: null,
      isFairyQueen: false,
    }
  }

  // Guest Night activation
  const guestNight = msg.match(/^(.+?) activated Guest Night/)
  if (guestNight) {
    const [, userName] = guestNight
    return {
      message: `${userName} activated Guest Night.`,
      type: 'nighttime',
      room: null,
      isFairyQueen: false,
    }
  }

  // All Off
  const allOff = msg.match(/^(.+?) executed All Off \((\d+) actions?\)$/)
  if (allOff) {
    const [, userName, count] = allOff
    return {
      message: `${userName} turned off everything — ${count} scenes deactivated.`,
      type: 'all_off',
      room: null,
      isFairyQueen: false,
    }
  }

  // Critical battery
  const critBattery = msg.match(/^Critical battery: (.+?) at (\d+)%$/)
  if (critBattery) {
    const [, device, level] = critBattery
    return {
      message: `Fairy Queen noticed ${device} battery is at ${level}% — consider replacing soon.`,
      type: 'alert',
      room: null,
      isFairyQueen: true,
    }
  }

  // Low battery
  const lowBattery = msg.match(/^Low battery: (.+?) at (\d+)%$/)
  if (lowBattery) {
    const [, device, level] = lowBattery
    return {
      message: `Fairy Queen noticed ${device} battery is at ${level}%.`,
      type: 'alert',
      room: null,
      isFairyQueen: true,
    }
  }

  // Device errors
  const deviceError = msg.match(/^Error executing (?:Hubitat device|Kasa device|Twinkly|Fairy device) (.+?): (.+)$/)
  if (deviceError) {
    const [, device, error] = deviceError
    return {
      message: `Fairy Queen couldn't reach ${device} — ${error}.`,
      type: 'error',
      room: null,
      isFairyQueen: true,
    }
  }

  // Weather indicator
  const weather = msg.match(/^Weather indicator: (.+?) \((.+?)\)$/)
  if (weather) {
    const [, condition] = weather
    return {
      message: `Fairy Queen updated the weather light — ${condition.toLowerCase()} detected.`,
      type: 'weather',
      room: null,
      isFairyQueen: true,
    }
  }

  // Hubitat raw event
  const hubEvent = msg.match(/^Hubitat: (.+?) (.+?) = (.+)$/)
  if (hubEvent) {
    const [, device, event, value] = hubEvent
    return {
      message: `${device}: ${event} ${value}.`,
      type: 'device_event',
      room: null,
      isFairyQueen: false,
    }
  }

  // Wake mode reached
  const wakeMode = msg.match(/^Wake mode reached \((.+?)\) — all rooms unlocked$/)
  if (wakeMode) {
    const [, mode] = wakeMode
    return {
      message: `Fairy Queen unlocked all rooms — ${mode} mode reached.`,
      type: 'mode_change',
      room: null,
      isFairyQueen: true,
    }
  }

  // Hushing Home
  const hushOn = msg.match(/^(.+?) activated Hushing Home \(scene: (.+?)\)$/)
  if (hushOn) {
    const [, userName, scene] = hushOn
    return {
      message: `${userName} activated Hushing Home with ${scene}.`,
      type: 'hushed',
      room: null,
      isFairyQueen: false,
    }
  }

  const hushOff = msg.match(/^(.+?) deactivated Hushing Home$/)
  if (hushOff) {
    const [, userName] = hushOff
    return {
      message: `${userName} deactivated Hushing Home.`,
      type: 'manual_off',
      room: null,
      isFairyQueen: false,
    }
  }

  // Room lock/unlock
  if (msg.match(/^Unlocking \d+ rooms?$/)) {
    return {
      message: `Fairy Queen unlocked all rooms.`,
      type: 'mode_change',
      room: null,
      isFairyQueen: true,
    }
  }

  // Fallback: use raw message
  return {
    message: msg,
    type: 'system',
    room: null,
    isFairyQueen: isFQ,
  }
}
