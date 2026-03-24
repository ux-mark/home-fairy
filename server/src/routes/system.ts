import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run, db } from '../db/index.js'
import { notificationService } from '../lib/notification-service.js'
import { getCurrentWeather } from '../lib/weather-client.js'
import { getSunTimes, getCurrentSunPhase } from '../lib/sun-tracker.js'
import { timerManager } from '../lib/timer-manager.js'
import { sunModeScheduler } from '../lib/sun-mode-scheduler.js'
import { lifxClient } from '../lib/lifx-client.js'
import { hubitatClient } from '../lib/hubitat-client.js'
import { twinklyClient } from '../lib/twinkly-client.js'
import { fairyDeviceClient } from '../lib/fairy-device-client.js'
import { mtaClient } from '../lib/mta-client.js'
import { MTA_STOPS, searchStops } from '../lib/mta-stops.js'
import { mtaIndicator } from '../lib/mta-indicator.js'
import { weatherIndicator, WEATHER_COLORS } from '../lib/weather-indicator.js'
import { motionHandler } from '../lib/motion-handler.js'

const router = Router()

// Lazy-load time-trigger-scheduler once it exists
import { timeTriggerScheduler } from '../lib/time-trigger-scheduler.js'

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

    // Check if this triggers wake unlock
    const wakeModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
    )
    const wakeMode = wakeModeRow?.value || 'Morning'
    if (body.mode === wakeMode && motionHandler.getLockedRooms().length > 0) {
      motionHandler.unlockAllRooms()
      run(
        "INSERT INTO logs (message, category, created_at) VALUES (?, 'system', datetime('now'))",
        [`Wake mode reached (${body.mode}) — all rooms unlocked`],
      )
    }

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

interface ModeTriggerRow {
  id: number
  mode_name: string
  trigger_type: 'sun' | 'time'
  sun_event: string | null
  trigger_time: string | null
  trigger_days: string | null
  priority: number
  enabled: number
}

interface SceneRow {
  name: string
  icon: string
  modes: string
}

const modeRenameSchema = z.object({
  name: z.string().min(1).max(50),
})

const triggerSchema = z.object({
  type: z.enum(['sun', 'time']),
  sunEvent: z.string().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  days: z.array(z.number().min(0).max(6)).min(1, 'At least one day is required').optional(),
  priority: z.number().optional(),
  enabled: z.boolean().optional(),
})

function upsertState(key: string, value: string): void {
  run(
    `INSERT INTO current_state (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value],
  )
}

function parseTrigger(row: ModeTriggerRow) {
  return {
    id: row.id,
    type: row.trigger_type,
    ...(row.sun_event ? { sunEvent: row.sun_event } : {}),
    ...(row.trigger_time ? { time: row.trigger_time } : {}),
    days: (() => {
      try { return row.trigger_days ? JSON.parse(row.trigger_days) : undefined } catch { return undefined }
    })(),
    priority: row.priority,
    enabled: row.enabled === 1,
  }
}

// GET /modes — get all modes with their triggers
router.get('/modes', (_req: Request, res: Response) => {
  try {
    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    const sleepRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'sleep_mode_name'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }
    const sleepModeName = sleepRow?.value ?? null

    const triggers = getAll<ModeTriggerRow>('SELECT * FROM mode_triggers ORDER BY priority DESC')
    const triggersByMode: Record<string, ModeTriggerRow[]> = {}
    for (const t of triggers) {
      if (!triggersByMode[t.mode_name]) triggersByMode[t.mode_name] = []
      triggersByMode[t.mode_name].push(t)
    }

    const result = allModes.map(name => ({
      name,
      triggers: (triggersByMode[name] ?? []).map(parseTrigger),
      isSleepMode: name === sleepModeName,
    }))

    res.json(result)
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
    upsertState('all_modes', JSON.stringify(allModes))
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

// PUT /modes/:mode — rename a mode
router.put('/modes/:mode', (req: Request, res: Response) => {
  try {
    const oldName = decodeURIComponent(String(req.params.mode))
    const body = modeRenameSchema.parse(req.body)
    const newName = body.name

    if (oldName === newName) {
      res.status(400).json({ error: 'New name is the same as current name' })
      return
    }

    const modesRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try {
      allModes = modesRow?.value ? JSON.parse(modesRow.value) : []
    } catch { allModes = [] }

    if (!allModes.includes(oldName)) {
      res.status(404).json({ error: 'Mode not found' })
      return
    }
    if (allModes.includes(newName)) {
      res.status(409).json({ error: 'A mode with that name already exists' })
      return
    }

    let updatedScenes = 0

    const renameTransaction = db.transaction(() => {
      // 1. Update all_modes array
      const updatedModes = allModes.map(m => m === oldName ? newName : m)
      upsertState('all_modes', JSON.stringify(updatedModes))

      // 2. Update scenes — replace old mode name in modes JSON arrays
      const scenes = getAll<SceneRow>('SELECT name, icon, modes FROM scenes')
      for (const scene of scenes) {
        let sceneModes: string[] = []
        try { sceneModes = scene.modes ? JSON.parse(scene.modes) : [] } catch { sceneModes = [] }
        if (sceneModes.includes(oldName)) {
          const newModes = sceneModes.map(m => m === oldName ? newName : m)
          run(
            `UPDATE scenes SET modes = ?, updated_at = datetime('now') WHERE name = ?`,
            [JSON.stringify(newModes), scene.name],
          )
          updatedScenes++
        }
      }

      // 3. If current mode matches old name, update it
      const currentModeRow = getOne<CurrentStateRow>(
        "SELECT value FROM current_state WHERE key = 'mode'",
      )
      if (currentModeRow?.value === oldName) {
        upsertState('mode', newName)
      }

      // 4. If pref_night_wake_mode matches, update it
      const wakeModeRow = getOne<CurrentStateRow>(
        "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
      )
      if (wakeModeRow?.value === oldName) {
        upsertState('pref_night_wake_mode', newName)
      }

      // 5. If sleep_mode_name matches, update it
      const sleepModeRow = getOne<CurrentStateRow>(
        "SELECT value FROM current_state WHERE key = 'sleep_mode_name'",
      )
      if (sleepModeRow?.value === oldName) {
        upsertState('sleep_mode_name', newName)
      }

      // 6. Update mode_triggers
      run('UPDATE mode_triggers SET mode_name = ? WHERE mode_name = ?', [newName, oldName])
    })

    renameTransaction()

    res.json({ name: newName, updatedScenes })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// DELETE /modes/:mode — remove a mode with cascade
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

    let affectedScenes = 0

    const deleteTransaction = db.transaction(() => {
      // 1. Remove from all_modes
      const remaining = allModes.filter(m => m !== modeName)
      upsertState('all_modes', JSON.stringify(remaining))

      // 2. Remove mode from all scenes
      const scenes = getAll<SceneRow>('SELECT name, icon, modes FROM scenes')
      for (const scene of scenes) {
        let sceneModes: string[] = []
        try { sceneModes = scene.modes ? JSON.parse(scene.modes) : [] } catch { sceneModes = [] }
        if (sceneModes.includes(modeName)) {
          const newModes = sceneModes.filter(m => m !== modeName)
          run(
            `UPDATE scenes SET modes = ?, updated_at = datetime('now') WHERE name = ?`,
            [JSON.stringify(newModes), scene.name],
          )
          affectedScenes++
        }
      }

      // 3. Delete associated triggers
      run('DELETE FROM mode_triggers WHERE mode_name = ?', [modeName])

      // 4. If current mode is the deleted one, switch to first remaining (or '')
      const currentModeRow = getOne<CurrentStateRow>(
        "SELECT value FROM current_state WHERE key = 'mode'",
      )
      if (currentModeRow?.value === modeName) {
        upsertState('mode', remaining[0] ?? '')
      }

      // 5. If pref_night_wake_mode matches, clear it
      const wakeModeRow = getOne<CurrentStateRow>(
        "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
      )
      if (wakeModeRow?.value === modeName) {
        run("DELETE FROM current_state WHERE key = 'pref_night_wake_mode'")
      }

      // 6. If sleep_mode_name matches, clear it
      const sleepModeRow = getOne<CurrentStateRow>(
        "SELECT value FROM current_state WHERE key = 'sleep_mode_name'",
      )
      if (sleepModeRow?.value === modeName) {
        run("DELETE FROM current_state WHERE key = 'sleep_mode_name'")
      }
    })

    deleteTransaction()

    const finalModesRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'all_modes'",
    )
    let finalModes: string[] = []
    try { finalModes = finalModesRow?.value ? JSON.parse(finalModesRow.value) : [] } catch { finalModes = [] }

    res.json({ modes: finalModes, affectedScenes })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /modes/:mode/dependencies — what depends on this mode
router.get('/modes/:mode/dependencies', (req: Request, res: Response) => {
  try {
    const modeName = decodeURIComponent(String(req.params.mode))

    const modesRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try { allModes = modesRow?.value ? JSON.parse(modesRow.value) : [] } catch { allModes = [] }
    if (!allModes.includes(modeName)) {
      res.status(404).json({ error: 'Mode not found' })
      return
    }

    // Find scenes whose modes JSON contains this mode name
    const matchingScenes = getAll<{ name: string; icon: string }>(
      `SELECT name, icon FROM scenes WHERE modes LIKE ?`,
      [`%${modeName}%`],
    ).filter(scene => {
      // Confirm it's actually in the parsed array (LIKE can give false positives)
      try {
        const m: string[] = JSON.parse(
          (getOne<{ modes: string }>('SELECT modes FROM scenes WHERE name = ?', [scene.name])?.modes) ?? '[]'
        )
        return m.includes(modeName)
      } catch { return false }
    })

    const currentModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'mode'",
    )
    const wakeModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
    )
    const sleepModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'sleep_mode_name'",
    )

    const triggerCountRow = db.prepare(
      'SELECT COUNT(*) as cnt FROM mode_triggers WHERE mode_name = ?'
    ).get(modeName) as { cnt: number }

    res.json({
      scenes: matchingScenes,
      isCurrentMode: currentModeRow?.value === modeName,
      isWakeMode: wakeModeRow?.value === modeName,
      isSleepMode: sleepModeRow?.value === modeName,
      triggerCount: triggerCountRow.cnt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /modes/:mode/triggers — add a trigger to a mode
router.post('/modes/:mode/triggers', (req: Request, res: Response) => {
  try {
    const modeName = decodeURIComponent(String(req.params.mode))

    const modesRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'all_modes'",
    )
    let allModes: string[] = []
    try { allModes = modesRow?.value ? JSON.parse(modesRow.value) : [] } catch { allModes = [] }
    if (!allModes.includes(modeName)) {
      res.status(404).json({ error: 'Mode not found' })
      return
    }

    const body = triggerSchema.parse(req.body)

    if (body.type === 'sun' && !body.sunEvent) {
      res.status(400).json({ error: 'sunEvent is required for sun triggers' })
      return
    }
    if (body.type === 'time' && !body.time) {
      res.status(400).json({ error: 'time is required for time triggers' })
      return
    }

    // For sun triggers, ensure the sun event isn't already claimed by another mode
    if (body.type === 'sun' && body.sunEvent) {
      const existing = getOne<ModeTriggerRow>(
        'SELECT * FROM mode_triggers WHERE trigger_type = ? AND sun_event = ?',
        ['sun', body.sunEvent],
      )
      if (existing && existing.mode_name !== modeName) {
        res.status(409).json({
          error: `Sun event "${body.sunEvent}" is already assigned to mode "${existing.mode_name}"`,
          conflictingMode: existing.mode_name,
        })
        return
      }
    }

    const priority = body.priority ?? 0
    const daysJson = body.days ? JSON.stringify(body.days) : null

    const insertResult = run(
      `INSERT INTO mode_triggers (mode_name, trigger_type, sun_event, trigger_time, trigger_days, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [modeName, body.type, body.sunEvent ?? null, body.time ?? null, daysJson, priority],
    )

    const created = getOne<ModeTriggerRow>(
      'SELECT * FROM mode_triggers WHERE id = ?',
      [insertResult.lastInsertRowid],
    )

    // Refresh schedulers
    sunModeScheduler.refreshFromDb()
    timeTriggerScheduler.refreshFromDb()

    res.status(201).json(created ? parseTrigger(created) : { id: insertResult.lastInsertRowid })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /modes/:mode/triggers/:id — update a trigger
router.put('/modes/:mode/triggers/:id', (req: Request, res: Response) => {
  try {
    const modeName = decodeURIComponent(String(req.params.mode))
    const triggerId = Number(req.params.id)

    const existing = getOne<ModeTriggerRow>(
      'SELECT * FROM mode_triggers WHERE id = ? AND mode_name = ?',
      [triggerId, modeName],
    )
    if (!existing) {
      res.status(404).json({ error: 'Trigger not found' })
      return
    }

    const body = triggerSchema.partial().parse(req.body)

    const updatedType = body.type ?? existing.trigger_type
    const updatedSunEvent = body.sunEvent !== undefined ? body.sunEvent : existing.sun_event
    const updatedTime = body.time !== undefined ? body.time : existing.trigger_time
    const updatedDays = body.days !== undefined ? JSON.stringify(body.days) : existing.trigger_days
    const updatedPriority = body.priority !== undefined ? body.priority : existing.priority
    const updatedEnabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled

    // Validate sun event uniqueness if changing sun_event
    if (updatedType === 'sun' && updatedSunEvent && updatedSunEvent !== existing.sun_event) {
      const conflict = getOne<ModeTriggerRow>(
        'SELECT * FROM mode_triggers WHERE trigger_type = ? AND sun_event = ? AND id != ?',
        ['sun', updatedSunEvent, triggerId],
      )
      if (conflict) {
        res.status(409).json({
          error: `Sun event "${updatedSunEvent}" is already assigned to mode "${conflict.mode_name}"`,
          conflictingMode: conflict.mode_name,
        })
        return
      }
    }

    run(
      `UPDATE mode_triggers
       SET trigger_type = ?, sun_event = ?, trigger_time = ?, trigger_days = ?, priority = ?, enabled = ?
       WHERE id = ?`,
      [updatedType, updatedSunEvent ?? null, updatedTime ?? null, updatedDays ?? null, updatedPriority, updatedEnabled, triggerId],
    )

    const updated = getOne<ModeTriggerRow>('SELECT * FROM mode_triggers WHERE id = ?', [triggerId])

    // Refresh schedulers
    sunModeScheduler.refreshFromDb()
    timeTriggerScheduler.refreshFromDb()

    res.json(updated ? parseTrigger(updated) : { id: triggerId })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// DELETE /modes/:mode/triggers/:id — remove a trigger
router.delete('/modes/:mode/triggers/:id', (req: Request, res: Response) => {
  try {
    const modeName = decodeURIComponent(String(req.params.mode))
    const triggerId = Number(req.params.id)

    const existing = getOne<ModeTriggerRow>(
      'SELECT * FROM mode_triggers WHERE id = ? AND mode_name = ?',
      [triggerId, modeName],
    )
    if (!existing) {
      res.status(404).json({ error: 'Trigger not found' })
      return
    }

    run('DELETE FROM mode_triggers WHERE id = ?', [triggerId])

    // Refresh schedulers
    sunModeScheduler.refreshFromDb()
    timeTriggerScheduler.refreshFromDb()

    res.json({ success: true })
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
    const station = (req.query.station as string) || '120'
    const direction = (req.query.direction as string) || 'both'
    const feed = (req.query.feed as string) || '123456S'
    const routesParam = req.query.routes as string | undefined
    const routes = routesParam ? routesParam.split(',') : undefined
    const arrivals = await mtaClient.getArrivals(station, direction, feed, 30, routes)
    res.json(arrivals.slice(0, Number(req.query.limit) || 10))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /mta/status — get subway status colour (walk-time aware)
router.get('/mta/status', async (req: Request, res: Response) => {
  try {
    const station = (req.query.station as string) || '120'
    const direction = (req.query.direction as string) || 'S'
    const feed = (req.query.feed as string) || '123456S'
    const routesParam = req.query.routes as string | undefined
    const routes = routesParam ? routesParam.split(',') : undefined
    const walkTime = Number(req.query.walkTime) || 5
    const maxWait = Number(req.query.maxWait) || 6
    const result = await mtaClient.getStatus(station, direction, routes, feed, walkTime, maxWait)
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /mta/stops — list available MTA stops, with optional search
router.get('/mta/stops', (req: Request, res: Response) => {
  try {
    const query = req.query.q as string | undefined
    const results = query ? searchStops(query) : MTA_STOPS
    res.json(results)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /mta/configured — get user's configured subway stops
router.get('/mta/configured', (_req: Request, res: Response) => {
  try {
    const row = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'pref_mta_stops'",
    )
    let stops: unknown[] = []
    try {
      stops = row?.value ? JSON.parse(row.value) : []
    } catch { stops = [] }
    res.json(stops)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /mta/combined-status — check ALL configured stops and return combined status
router.get('/mta/combined-status', async (_req: Request, res: Response) => {
  try {
    const row = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'pref_mta_stops'",
    )
    let configuredStops: Array<{
      stopId: string
      name: string
      direction: string
      routes: string[]
      feedGroup: string
      walkTime: number
      enabled: boolean
    }> = []
    try {
      configuredStops = row?.value ? JSON.parse(row.value) : []
    } catch { configuredStops = [] }

    // Get max wait threshold from preferences (default 6 min)
    const maxWaitRow = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'pref_mta_max_wait'",
    )
    const maxWaitMinutes = maxWaitRow?.value ? Number(maxWaitRow.value) : 6

    // Filter to enabled stops only
    const enabledStops = configuredStops.filter(s => s.enabled)

    if (enabledStops.length === 0) {
      res.json({
        overallStatus: 'none',
        overallMessage: 'No subway stops configured',
        stops: [],
      })
      return
    }

    // Fetch status for each configured stop in parallel
    const stopResults = await Promise.all(
      enabledStops.map(async (config) => {
        try {
          const result = await mtaClient.getStatus(
            config.stopId,
            config.direction,
            config.routes,
            config.feedGroup,
            config.walkTime,
            maxWaitMinutes,
          )
          return { config, ...result }
        } catch {
          return {
            config,
            status: 'none' as const,
            message: 'Unable to fetch data',
            nextArrival: null,
            arrivals: [],
          }
        }
      }),
    )

    // Determine overall status: best (most positive) across all stops
    // Priority: green > orange > red > none
    const statusPriority: Record<string, number> = { green: 3, orange: 2, red: 1, none: 0 }
    let bestStatus: 'green' | 'orange' | 'red' | 'none' = 'none'
    let bestMessage = 'No upcoming trains'
    for (const result of stopResults) {
      if (statusPriority[result.status] > statusPriority[bestStatus]) {
        bestStatus = result.status
        bestMessage = result.message
      }
    }

    // Generate overall message based on best status
    let overallMessage: string
    switch (bestStatus) {
      case 'green':
        overallMessage = 'Leave soon'
        break
      case 'orange':
        overallMessage = 'Leave now!'
        break
      case 'red':
        overallMessage = 'No good trains soon'
        break
      default:
        overallMessage = 'No upcoming trains'
    }

    res.json({
      overallStatus: bestStatus,
      overallMessage,
      stops: stopResults,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /mta/indicator — get indicator config
router.get('/mta/indicator', (_req: Request, res: Response) => {
  try {
    const row = getOne<CurrentStateRow>("SELECT * FROM current_state WHERE key = 'pref_mta_indicator'")
    let config = { enabled: false, lightId: '', lightLabel: '', sensorName: '', duration: 30 }
    try { config = row?.value ? JSON.parse(row.value) : config } catch { /* keep default */ }
    res.json(config)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /mta/indicator — save indicator config
router.put('/mta/indicator', (req: Request, res: Response) => {
  try {
    const config = req.body
    run(
      `INSERT INTO current_state (key, value, updated_at) VALUES ('pref_mta_indicator', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(config)],
    )
    res.json(config)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /mta/indicator/test — trigger the indicator manually (for testing)
router.post('/mta/indicator/test', async (_req: Request, res: Response) => {
  try {
    const result = await mtaIndicator.trigger()
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: msg })
  }
})

// GET /weather/indicator — get weather indicator config
router.get('/weather/indicator', (_req: Request, res: Response) => {
  try {
    res.json(weatherIndicator.getConfig())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /weather/indicator — save weather indicator config
router.put('/weather/indicator', (req: Request, res: Response) => {
  try {
    const config = req.body
    run(
      `INSERT INTO current_state (key, value, updated_at) VALUES ('pref_weather_indicator', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(config)],
    )
    // Restart the indicator with the new config
    weatherIndicator.restart()
    res.json(config)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /weather/indicator/test — trigger weather indicator manually
router.post('/weather/indicator/test', async (_req: Request, res: Response) => {
  try {
    const result = await weatherIndicator.triggerOnce()
    if (!result) {
      res.status(400).json({ error: 'Weather indicator not configured or weather data unavailable' })
      return
    }
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /weather/colors — return the colour mapping for the UI reference
router.get('/weather/colors', (_req: Request, res: Response) => {
  try {
    res.json(WEATHER_COLORS)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /weather/preview — preview a colour on the indicator light
router.post('/weather/preview', async (req: Request, res: Response) => {
  try {
    const { color, brightness } = req.body
    if (!color) {
      res.status(400).json({ error: 'color is required' })
      return
    }
    const config = weatherIndicator.getConfig()
    if (!config.lightId) {
      res.status(400).json({ error: 'No weather indicator light configured' })
      return
    }

    await lifxClient.setState(`id:${config.lightId}`, {
      power: 'on',
      color,
      brightness: brightness ?? config.brightness,
      duration: 0.3,
    })

    // Revert after 5 seconds
    setTimeout(async () => {
      try {
        await lifxClient.setState(`id:${config.lightId}`, { power: 'off', duration: 1 })
      } catch {
        // Ignore revert errors
      }
    }, 5000)

    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /weather/custom-colors — get user's custom colour overrides
router.get('/weather/custom-colors', (_req: Request, res: Response) => {
  try {
    const row = getOne<CurrentStateRow>("SELECT value FROM current_state WHERE key = 'pref_weather_custom_colors'")
    let customs: Record<string, { color: string; hex: string }> = {}
    try { customs = row?.value ? JSON.parse(row.value) : {} } catch { /* ignore parse errors */ }
    res.json(customs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /weather/custom-colors — save a custom colour for a weather condition
router.put('/weather/custom-colors', (req: Request, res: Response) => {
  try {
    const { condition, color, hex } = req.body
    if (!condition || !color || !hex) {
      res.status(400).json({ error: 'condition, color, and hex are required' })
      return
    }
    const row = getOne<CurrentStateRow>("SELECT value FROM current_state WHERE key = 'pref_weather_custom_colors'")
    let customs: Record<string, { color: string; hex: string }> = {}
    try { customs = row?.value ? JSON.parse(row.value) : {} } catch { /* ignore parse errors */ }
    customs[condition] = { color, hex }
    run(
      `INSERT INTO current_state (key, value, updated_at) VALUES ('pref_weather_custom_colors', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(customs)],
    )
    res.json(customs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// DELETE /weather/custom-colors — reset all custom colours to defaults
router.delete('/weather/custom-colors', (_req: Request, res: Response) => {
  try {
    run("DELETE FROM current_state WHERE key = 'pref_weather_custom_colors'")
    res.json({ success: true })
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

// POST /nighttime — Sleep Time mode + all off with bedroom exclusion + room lockout
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
    let excludeRooms: string[] = ['Loo']
    try {
      if (prefRow?.value) excludeRooms = JSON.parse(prefRow.value)
    } catch { /* keep default */ }

    const actions = await runAllOff(excludeRooms)

    // Lock rooms that were turned off (all rooms except excluded ones)
    const allRoomNames = getAll<{ name: string }>('SELECT name FROM rooms').map(r => r.name)
    const roomsToLock = allRoomNames.filter(r => !excludeRooms.includes(r))
    motionHandler.lockRooms(roomsToLock)

    // Get wake mode for response
    const wakeModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
    )
    const wakeMode = wakeModeRow?.value || 'Morning'

    run(
      "INSERT INTO logs (message, category, created_at) VALUES (?, 'system', datetime('now'))",
      [`Nighttime executed: excluded rooms [${excludeRooms.join(', ')}], locked ${roomsToLock.length} rooms, wake mode: ${wakeMode}, ${actions.length} actions`],
    )

    res.json({ success: true, mode: 'Sleep Time', excludeRooms, lockedRooms: roomsToLock, wakeMode, actions })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /guest-night — Sleep Time mode + all off with guest room exclusions + room lockout
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
    let excludeRooms: string[] = ['Bedroom', 'Loo']
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

    // Lock rooms that were turned off (all rooms except excluded ones)
    const allRoomNames = getAll<{ name: string }>('SELECT name FROM rooms').map(r => r.name)
    const roomsToLock = allRoomNames.filter(r => !excludeRooms.includes(r))
    motionHandler.lockRooms(roomsToLock)

    // Get wake mode for response
    const wakeModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
    )
    const wakeMode = wakeModeRow?.value || 'Morning'

    run(
      "INSERT INTO logs (message, category, created_at) VALUES (?, 'system', datetime('now'))",
      [`Guest Night executed: excluded rooms [${excludeRooms.join(', ')}], locked ${roomsToLock.length} rooms, wake mode: ${wakeMode}, ${actions.length} actions`],
    )

    res.json({ success: true, mode: 'Sleep Time', excludeRooms, lockedRooms: roomsToLock, wakeMode, actions })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /night/status — current lockout status
router.get('/night/status', (_req: Request, res: Response) => {
  try {
    const lockedRooms = motionHandler.getLockedRooms()
    const wakeModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
    )
    res.json({
      active: lockedRooms.length > 0,
      lockedRooms,
      wakeMode: wakeModeRow?.value || 'Morning',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /night/unlock — manually unlock all rooms (emergency override)
router.post('/night/unlock', (_req: Request, res: Response) => {
  try {
    motionHandler.unlockAllRooms()
    run(
      "INSERT INTO logs (message, category, created_at) VALUES (?, 'system', datetime('now'))",
      ['Manual night unlock: all rooms unlocked'],
    )
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// ── Notifications ─────────────────────────────────────────────────────────────

// GET /notifications — list notifications
router.get('/notifications', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
    const unreadOnly = req.query.unread_only === 'true'
    const category = req.query.category as string | undefined

    const notifications = notificationService.getAll({ limit, unreadOnly, category })
    res.json(notifications)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /notifications/count — unread count (lightweight, for badge)
router.get('/notifications/count', (_req: Request, res: Response) => {
  try {
    const count = notificationService.getUnreadCount()
    res.json({ count })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PATCH /notifications/:id/read — mark as read
router.patch('/notifications/:id/read', (req: Request, res: Response) => {
  try {
    notificationService.markRead(Number(req.params.id))
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /notifications/read-all — mark all as read
router.post('/notifications/read-all', (_req: Request, res: Response) => {
  try {
    notificationService.markAllRead()
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /notifications/:id/dismiss — dismiss single
router.post('/notifications/:id/dismiss', (req: Request, res: Response) => {
  try {
    notificationService.dismiss(Number(req.params.id))
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /notifications/dismiss-all — dismiss all
router.post('/notifications/dismiss-all', (_req: Request, res: Response) => {
  try {
    notificationService.dismissAll()
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
