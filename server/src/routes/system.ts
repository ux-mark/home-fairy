import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run, db } from '../db/index.js'
import { getCurrentWeather } from '../lib/weather-client.js'
import { getSunTimes, getCurrentSunPhase } from '../lib/sun-tracker.js'
import { timerManager } from '../lib/timer-manager.js'
import { sunModeScheduler } from '../lib/sun-mode-scheduler.js'
import { lifxClient } from '../lib/lifx-client.js'
import { hubitatClient } from '../lib/hubitat-client.js'
import { twinklyClient } from '../lib/twinkly-client.js'
import { fairyDeviceClient } from '../lib/fairy-device-client.js'
import { mtaClient } from '../lib/mta-client.js'

const router = Router()

interface CurrentStateRow {
  key: string
  value: string
  updated_at: string
}

interface LogRow {
  id: number
  parent_id: number | null
  seq: number
  message: string
  debug: string | null
  category: string | null
  created_at: string
}

const modeSchema = z.object({
  mode: z.string().min(1),
})

// GET /current — get current mode and all available modes
router.get('/current', (_req: Request, res: Response) => {
  try {
    const modeRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'mode'",
    )
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }

    res.json({
      mode: modeRow?.value ?? 'Evening',
      all_modes: allModes,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /preferences — get user preferences
router.get('/preferences', (_req: Request, res: Response) => {
  try {
    const rows = getAll<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key LIKE 'pref_%'",
    )
    const prefs: Record<string, string> = {}
    for (const row of rows) {
      prefs[row.key.replace('pref_', '')] = row.value
    }
    res.json(prefs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /preferences — set a user preference
router.put('/preferences', (req: Request, res: Response) => {
  try {
    const { key, value } = req.body
    if (!key || value === undefined) {
      res.status(400).json({ error: 'key and value required' })
      return
    }
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [`pref_${key}`, String(value)],
    )
    res.json({ key, value })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /mode — update current mode
router.put('/mode', (req: Request, res: Response) => {
  try {
    const body = modeSchema.parse(req.body)
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('mode', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [body.mode],
    )
    res.json({ mode: body.mode })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /health — health check
router.get('/health', (_req: Request, res: Response) => {
  try {
    // Quick DB check
    const dbOk = (() => {
      try {
        db.prepare('SELECT 1').get()
        return true
      } catch {
        return false
      }
    })()

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      db: dbOk ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /logs — get recent logs with pagination and optional category filter
router.get('/logs', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const category = req.query.category as string | undefined

    let rows: LogRow[]
    if (category) {
      rows = getAll<LogRow>(
        'SELECT * FROM logs WHERE category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [category, limit, offset],
      )
    } else {
      rows = getAll<LogRow>(
        'SELECT * FROM logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
      )
    }
    res.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /weather — current weather from OpenWeather
router.get('/weather', async (_req: Request, res: Response) => {
  try {
    const weather = await getCurrentWeather()
    res.json(weather)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /sun — sun times from suncalc
router.get('/sun', (_req: Request, res: Response) => {
  try {
    const times = getSunTimes()
    const phase = getCurrentSunPhase()
    res.json({ ...times, phase })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /sun-schedule — today's automatic mode transition schedule
router.get('/sun-schedule', (_req: Request, res: Response) => {
  try {
    const schedule = sunModeScheduler.getSchedule()
    res.json(schedule)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /timers — active scene timers
router.get('/timers', (_req: Request, res: Response) => {
  try {
    res.json(timerManager.getStatus())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /timers/cancel/:id — cancel a timer
router.post('/timers/cancel/:id', (req: Request, res: Response) => {
  try {
    const cancelled = timerManager.cancelTimer(String(req.params.id))
    if (!cancelled) {
      res.status(404).json({ error: 'Timer not found' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /timers/cancel-all — cancel all timers
router.post('/timers/cancel-all', (_req: Request, res: Response) => {
  try {
    timerManager.cancelAll()
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /modes — get all modes
router.get('/modes', (_req: Request, res: Response) => {
  try {
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }
    res.json(allModes)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /modes — add a mode
router.post('/modes', (req: Request, res: Response) => {
  try {
    const body = modeSchema.parse(req.body)
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }

    if (allModes.includes(body.mode)) {
      res.status(409).json({ error: 'Mode already exists' })
      return
    }

    allModes.push(body.mode)
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('all_modes', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(allModes)],
    )
    res.json(allModes)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// DELETE /modes/:mode — remove a mode
router.delete('/modes/:mode', (req: Request, res: Response) => {
  try {
    const modeName = decodeURIComponent(String(req.params.mode))
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }

    const idx = allModes.indexOf(modeName)
    if (idx === -1) {
      res.status(404).json({ error: 'Mode not found' })
      return
    }

    allModes.splice(idx, 1)
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('all_modes', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(allModes)],
    )
    res.json(allModes)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /battery — get battery status for all battery-powered devices
router.get('/battery', (_req: Request, res: Response) => {
  try {
    interface BatteryDeviceRow {
      id: number
      label: string
      device_type: string
      battery: string | null
      updated_at: string
    }
    const devices = getAll<BatteryDeviceRow>(
      'SELECT id, label, device_type, json_extract(attributes, \'$.battery\') as battery, updated_at FROM hub_devices WHERE json_extract(attributes, \'$.battery\') IS NOT NULL',
    )
    const result = devices
      .map((d) => {
        const level = d.battery !== null ? Number(d.battery) : null
        let status: 'ok' | 'low' | 'critical' = 'ok'
        if (level !== null && level < 5) status = 'critical'
        else if (level !== null && level < 15) status = 'low'
        return {
          id: d.id,
          label: d.label,
          device_type: d.device_type,
          battery: level,
          status,
          updated_at: d.updated_at,
        }
      })
      .sort((a, b) => (a.battery ?? 100) - (b.battery ?? 100))
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /mta/arrivals — get subway arrivals
router.get('/mta/arrivals', async (req: Request, res: Response) => {
  try {
    const station = (req.query.station as string) || '103'
    const direction = (req.query.direction as string) || 'both'
    const arrivals = await mtaClient.getArrivals(station, direction)
    res.json(arrivals)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /backup — download database as JSON export
router.get('/backup', (_req: Request, res: Response) => {
  try {
    const rooms = getAll('SELECT * FROM rooms')
    const scenes = getAll('SELECT * FROM scenes')
    const lightRooms = getAll('SELECT * FROM light_rooms')
    const deviceRooms = getAll('SELECT * FROM device_rooms')
    const currentState = getAll('SELECT * FROM current_state')
    const hubDevices = getAll('SELECT * FROM hub_devices')

    const backup = {
      version: '3.0.0',
      exported_at: new Date().toISOString(),
      rooms,
      scenes,
      light_rooms: lightRooms,
      device_rooms: deviceRooms,
      current_state: currentState,
      hub_devices: hubDevices,
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=thefairies-backup-${new Date().toISOString().split('T')[0]}.json`,
    )
    res.json(backup)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /restore — restore from JSON backup
router.post('/restore', (req: Request, res: Response) => {
  try {
    const backup = req.body
    if (!backup || !backup.version || !backup.exported_at) {
      res.status(400).json({ error: 'Invalid backup format: missing version or exported_at' })
      return
    }

    const tables = ['rooms', 'scenes', 'light_rooms', 'device_rooms', 'current_state', 'hub_devices']
    const backupKeys: Record<string, string> = {
      rooms: 'rooms',
      scenes: 'scenes',
      light_rooms: 'light_rooms',
      device_rooms: 'device_rooms',
      current_state: 'current_state',
      hub_devices: 'hub_devices',
    }

    // Validate that at least some data is present
    const presentTables = tables.filter((t) => Array.isArray(backup[backupKeys[t]]))
    if (presentTables.length === 0) {
      res.status(400).json({ error: 'No valid table data found in backup' })
      return
    }

    // Use a transaction for atomicity
    const transaction = db.transaction(() => {
      for (const table of presentTables) {
        const rows = backup[backupKeys[table]] as Record<string, unknown>[]
        if (rows.length === 0) continue

        // Clear existing data
        db.prepare(`DELETE FROM ${table}`).run()

        // Insert each row
        const columns = Object.keys(rows[0])
        const placeholders = columns.map(() => '?').join(', ')
        const stmt = db.prepare(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
        )
        for (const row of rows) {
          stmt.run(...columns.map((c) => row[c] ?? null))
        }
      }
    })

    transaction()

    res.json({
      success: true,
      restored_tables: presentTables,
      backup_version: backup.version,
      backup_date: backup.exported_at,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// ── Helper: turn off devices, respecting exclusions ─────────────────────────

interface DeviceRoomRow {
  id: number
  device_id: string
  device_label: string
  device_type: string
  room_name: string
  config: string
}

async function runAllOff(excludeRooms: string[] = []): Promise<string[]> {
  const actions: string[] = []

  // 1. Turn off all LIFX lights
  try {
    await lifxClient.setState('all', { power: 'off', duration: 1 })
    actions.push('LIFX: all lights off')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    actions.push(`LIFX error: ${msg}`)
  }

  // 2. Get all device_rooms assignments
  const deviceRows = getAll<DeviceRoomRow>(
    'SELECT * FROM device_rooms ORDER BY room_name',
  )

  // 3. For each switch/dimmer NOT excluded, send 'off' command
  for (const row of deviceRows) {
    // Skip if room is excluded
    if (excludeRooms.includes(row.room_name)) continue

    // Skip if device is individually excluded from all-off
    let config: Record<string, unknown> = {}
    try { config = JSON.parse(row.config) } catch { config = {} }
    if (config.exclude_from_all_off) continue

    const type = row.device_type
    if (type === 'switch' || type === 'dimmer') {
      try {
        await hubitatClient.sendCommand(row.device_id, 'off')
        actions.push(`Hub device off: ${row.device_label}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        actions.push(`Hub error (${row.device_label}): ${msg}`)
      }
    } else if (type === 'twinkly') {
      try {
        const dev = getOne<{ ip: string | null }>(
          "SELECT json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE id = ?",
          [row.device_id],
        )
        if (dev?.ip) {
          await twinklyClient.turnOff(dev.ip)
          actions.push(`Twinkly off: ${row.device_label}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        actions.push(`Twinkly error (${row.device_label}): ${msg}`)
      }
    } else if (type === 'fairy') {
      try {
        const dev = getOne<{ ip: string | null }>(
          "SELECT json_extract(attributes, '$.IPAddress') as ip FROM hub_devices WHERE id = ?",
          [row.device_id],
        )
        if (dev?.ip) {
          await fairyDeviceClient.turnOff(dev.ip)
          actions.push(`Fairy off: ${row.device_label}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        actions.push(`Fairy error (${row.device_label}): ${msg}`)
      }
    }
  }

  // 4. Clear all room scenes
  const roomsToClear = excludeRooms.length > 0
    ? `UPDATE rooms SET current_scene = NULL WHERE name NOT IN (${excludeRooms.map(() => '?').join(',')})`
    : 'UPDATE rooms SET current_scene = NULL'
  run(roomsToClear, excludeRooms.length > 0 ? excludeRooms : [])
  actions.push('Cleared room scenes')

  return actions
}

// POST /all-off — turn off everything except excluded devices
router.post('/all-off', async (_req: Request, res: Response) => {
  try {
    const actions = await runAllOff()

    // Log the action
    run(
      "INSERT INTO logs (message, category, created_at) VALUES (?, 'system', datetime('now'))",
      [`All Off executed: ${actions.length} actions`],
    )

    res.json({ success: true, actions })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /nighttime — Sleep Time mode + all off with bedroom exclusion
router.post('/nighttime', async (_req: Request, res: Response) => {
  try {
    // Set mode to Sleep Time
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('mode', 'Sleep Time', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )

    // Get excluded rooms from preferences
    const prefRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'pref_night_exclude_rooms'",
    )
    let excludeRooms: string[] = ['Bedroom']
    try {
      if (prefRow?.value) excludeRooms = JSON.parse(prefRow.value)
    } catch { /* keep default */ }

    const actions = await runAllOff(excludeRooms)

    run(
      "INSERT INTO logs (message, category, created_at) VALUES (?, 'system', datetime('now'))",
      [`Nighttime executed: excluded rooms [${excludeRooms.join(', ')}], ${actions.length} actions`],
    )

    res.json({ success: true, mode: 'Sleep Time', excludeRooms, actions })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /guest-night — Sleep Time mode + all off with guest room exclusions
router.post('/guest-night', async (_req: Request, res: Response) => {
  try {
    // Set mode to Sleep Time
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('mode', 'Sleep Time', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )

    // Get excluded rooms from preferences
    const prefRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'pref_guest_night_exclude_rooms'",
    )
    let excludeRooms: string[] = ['Bedroom']
    try {
      if (prefRow?.value) {
        excludeRooms = JSON.parse(prefRow.value)
      } else {
        // Default: Bedroom + rooms tagged 'guest'
        const guestRooms = getAll<{ name: string }>(
          "SELECT name FROM rooms WHERE tags LIKE '%guest%'",
        )
        excludeRooms = ['Bedroom', ...guestRooms.map(r => r.name)]
      }
    } catch { /* keep default */ }

    const actions = await runAllOff(excludeRooms)

    run(
      "INSERT INTO logs (message, category, created_at) VALUES (?, 'system', datetime('now'))",
      [`Guest Night executed: excluded rooms [${excludeRooms.join(', ')}], ${actions.length} actions`],
    )

    res.json({ success: true, mode: 'Sleep Time', excludeRooms, actions })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
