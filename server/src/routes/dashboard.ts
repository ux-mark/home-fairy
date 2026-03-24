import { Router, Request, Response } from 'express'
import { getAll, getOne, run, db } from '../db/index.js'
import { getCurrentWeather } from '../lib/weather-client.js'
import { getSunTimes, getCurrentSunPhase } from '../lib/sun-tracker.js'
import { sunModeScheduler } from '../lib/sun-mode-scheduler.js'
import { motionHandler } from '../lib/motion-handler.js'
import { getHistoryStats } from '../lib/history-collector.js'
import { computeInsights } from '../lib/insights-engine.js'

const router = Router()

interface CurrentStateRow {
  key: string
  value: string
}

interface RoomRow {
  name: string
  temperature: number | null
  lux: number | null
  current_scene: string | null
  last_active: string | null
  auto: number
}

interface BatteryDeviceRow {
  id: number
  label: string
  device_type: string
  battery: string | null
  updated_at: string
}

interface PowerDeviceRow {
  id: number
  label: string
  room_name: string | null
  power: string | null
  energy: string | null
  switch_state: string | null
}

// GET /summary — aggregate dashboard data in a single request
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    // Mode
    const modeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'mode'",
    )
    const allModesRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'all_modes'",
    )
    const mode = modeRow?.value || 'Morning'
    const allModes: string[] = allModesRow?.value
      ? JSON.parse(allModesRow.value)
      : []

    // Rooms with sensor data
    const rooms = getAll<RoomRow>(
      'SELECT name, temperature, lux, current_scene, last_active, auto FROM rooms ORDER BY display_order',
    )

    // Battery devices
    const batteryDevices = getAll<BatteryDeviceRow>(
      "SELECT id, label, device_type, json_extract(attributes, '$.battery') as battery, updated_at FROM hub_devices WHERE json_extract(attributes, '$.battery') IS NOT NULL",
    )
    const battery = batteryDevices
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

    // Power-reporting devices
    const powerDevices = getAll<PowerDeviceRow>(
      `SELECT h.id, h.label,
              COALESCE(dr.room_name, h.room_name) as room_name,
              json_extract(h.attributes, '$.power') as power,
              json_extract(h.attributes, '$.energy') as energy,
              json_extract(h.attributes, '$.switch') as switch_state
       FROM hub_devices h
       LEFT JOIN device_rooms dr ON CAST(h.id AS TEXT) = dr.device_id
       WHERE json_extract(h.attributes, '$.power') IS NOT NULL`,
    )
    const power = powerDevices.map((d) => ({
      id: d.id,
      label: d.label,
      room_name: d.room_name,
      power: d.power !== null ? Number(d.power) : 0,
      energy: d.energy !== null ? Number(d.energy) : null,
      switch: (d.switch_state as 'on' | 'off') || 'off',
    }))

    // Sun schedule and phase
    let sunSchedule: unknown[] = []
    let sunPhase = ''
    let sunTimes: unknown = {}
    try {
      sunSchedule = sunModeScheduler.getSchedule()
      sunPhase = getCurrentSunPhase()
      sunTimes = getSunTimes()
    } catch {
      // Sun calculations may fail without lat/lon
    }

    // Weather (cached, won't make extra API call)
    let weather: unknown = null
    try {
      weather = await getCurrentWeather()
    } catch {
      // Weather may be unavailable
    }

    // Night status
    const lockedRooms = motionHandler.getLockedRooms()
    const wakeModeRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_night_wake_mode'",
    )
    const nightStatus = {
      active: lockedRooms.length > 0,
      lockedRooms,
      wakeMode: wakeModeRow?.value || 'Morning',
    }

    // Energy rate preference
    const energyRateRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_energy_rate'",
    )
    const energyRate = energyRateRow?.value ? Number(energyRateRow.value) : 0.30

    const currencyRow = getOne<CurrentStateRow>(
      "SELECT value FROM current_state WHERE key = 'pref_currency_symbol'",
    )
    const currencySymbol = currencyRow?.value || '$'

    // Compute insights from current state + historical data
    const insights = computeInsights({
      power,
      rooms: rooms as Array<{ name: string; temperature: number | null; lux: number | null }>,
      battery,
      weather: weather as { temp: number; humidity: number } | null,
      energyRate,
    })

    res.json({
      mode,
      allModes,
      rooms,
      battery,
      power,
      sunSchedule,
      sunPhase,
      sunTimes,
      weather,
      nightStatus,
      currencySymbol,
      insights,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /history/:source/:sourceId — time-series data with period aggregation
router.get('/history/:source/:sourceId', (req: Request, res: Response) => {
  try {
    const { source, sourceId } = req.params
    const period = (req.query.period as string) || '24h'

    let cutoff: string
    let aggregate = false

    switch (period) {
      case '24h':
        cutoff = "datetime('now', '-1 day')"
        break
      case '7d':
        cutoff = "datetime('now', '-7 days')"
        aggregate = true
        break
      case '30d':
        cutoff = "datetime('now', '-30 days')"
        aggregate = true
        break
      case '1y':
        cutoff = "datetime('now', '-1 year')"
        aggregate = true
        break
      case 'all':
        cutoff = "'1970-01-01'"
        aggregate = true
        break
      default:
        cutoff = "datetime('now', '-1 day')"
    }

    let data: unknown[]
    if (aggregate) {
      data = getAll(
        `SELECT AVG(value) as value, MIN(value) as min, MAX(value) as max,
                strftime('%Y-%m-%d %H:00:00', recorded_at, 'localtime') as recorded_at
         FROM device_history
         WHERE source = ? AND source_id = ? AND recorded_at > ${cutoff}
         GROUP BY strftime('%Y-%m-%d %H', recorded_at, 'localtime')
         ORDER BY recorded_at`,
        [source, sourceId],
      )
    } else {
      data = getAll(
        `SELECT value, recorded_at
         FROM device_history
         WHERE source = ? AND source_id = ? AND recorded_at > ${cutoff}
         ORDER BY recorded_at`,
        [source, sourceId],
      )
    }

    const countResult = db
      .prepare(
        `SELECT COUNT(*) as count FROM device_history WHERE source = ? AND source_id = ? AND recorded_at > ${cutoff}`,
      )
      .get(source, sourceId) as { count: number }

    res.json({ data, count: countResult.count, period })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /stats — database size and history statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getHistoryStats()

    // Get database file size via PRAGMA
    const pageCount = db.pragma('page_count', { simple: true }) as number
    const pageSize = db.pragma('page_size', { simple: true }) as number
    const dbSizeBytes = pageCount * pageSize

    res.json({
      totalRows: stats.totalRows,
      oldestRecord: stats.oldestRecord,
      sources: stats.sources,
      dbSizeBytes,
      dbSizeMB: Math.round((dbSizeBytes / (1024 * 1024)) * 100) / 100,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// DELETE /history — delete historical data with flexible criteria
router.delete('/history', (req: Request, res: Response) => {
  try {
    const { olderThan, source, all } = req.body as {
      olderThan?: string
      source?: string
      all?: boolean
    }

    let deleted = 0

    if (all) {
      const result = run('DELETE FROM device_history')
      deleted = result.changes
    } else if (olderThan && source) {
      const result = run(
        'DELETE FROM device_history WHERE source = ? AND recorded_at < datetime(?)',
        [source, olderThan],
      )
      deleted = result.changes
    } else if (olderThan) {
      const result = run(
        'DELETE FROM device_history WHERE recorded_at < datetime(?)',
        [olderThan],
      )
      deleted = result.changes
    } else if (source) {
      const result = run(
        'DELETE FROM device_history WHERE source = ?',
        [source],
      )
      deleted = result.changes
    } else {
      res.status(400).json({ error: 'Provide at least one of: all, olderThan, source' })
      return
    }

    // Reclaim disk space
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')

    res.json({ deleted })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /device/:id/context — device room and scene context
router.get('/device/:id/context', (req: Request, res: Response) => {
  try {
    const deviceId = req.params.id

    // Room assignments
    const rooms = getAll<{ room_name: string; config: string }>(
      'SELECT room_name, config FROM device_rooms WHERE device_id = ?',
      [deviceId],
    )

    // Scene usage — find scenes whose commands reference this device
    const allScenes = getAll<{ name: string; commands: string }>(
      'SELECT name, commands FROM scenes',
    )
    const scenesUsing = allScenes
      .filter((s) => {
        const cmds = JSON.parse(s.commands) as Array<{ device_id?: string | number }>
        return cmds.some((c) => String(c.device_id) === String(deviceId))
      })
      .map((s) => s.name)

    // Last event from hub_devices
    const device = getOne<{ last_event: string | null; updated_at: string }>(
      'SELECT last_event, updated_at FROM hub_devices WHERE id = ?',
      [Number(deviceId)],
    )

    // Available history sources for this device
    const label = getOne<{ label: string }>(
      'SELECT label FROM hub_devices WHERE id = ?',
      [Number(deviceId)],
    )
    const historySources = label
      ? getAll<{ source: string; count: number }>(
          'SELECT source, COUNT(*) as count FROM device_history WHERE source_id = ? GROUP BY source',
          [label.label],
        )
      : []

    res.json({
      rooms: rooms.map((r) => ({
        room_name: r.room_name,
        config: JSON.parse(r.config || '{}'),
      })),
      scenes: scenesUsing,
      lastEvent: device?.last_event || null,
      updatedAt: device?.updated_at || null,
      historySources,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /room/:name — room intelligence (environment, energy, activity, battery health)
router.get('/room/:name', (req: Request, res: Response) => {
  try {
    const roomName = decodeURIComponent(String(req.params.name))

    const room = getOne<{ temperature: number | null; lux: number | null; last_active: string | null }>(
      'SELECT temperature, lux, last_active FROM rooms WHERE name = ?',
      [roomName],
    )

    const temperatureHistory = getAll<{ value: number; recorded_at: string }>(
      `SELECT value, recorded_at FROM device_history
       WHERE source = 'temperature' AND source_id = ? AND recorded_at > datetime('now', '-1 day')
       ORDER BY recorded_at`,
      [roomName],
    )

    const roomDevices = getAll<{
      id: number; label: string; device_type: string;
      power: string | null; energy: string | null; battery: string | null
    }>(
      `SELECT h.id, h.label, dr.device_type,
              json_extract(h.attributes, '$.power') as power,
              json_extract(h.attributes, '$.energy') as energy,
              json_extract(h.attributes, '$.battery') as battery
       FROM device_rooms dr
       JOIN hub_devices h ON CAST(h.id AS TEXT) = dr.device_id
       WHERE dr.room_name = ?`,
      [roomName],
    )

    const totalWatts = roomDevices.reduce((sum, d) => sum + (d.power ? Number(d.power) : 0), 0)
    const devices = roomDevices.map((d) => ({
      id: d.id, label: d.label, device_type: d.device_type,
      power: d.power ? Number(d.power) : 0,
      energy: d.energy ? Number(d.energy) : null,
      battery: d.battery ? Number(d.battery) : null,
    }))

    const events24h = (db.prepare(
      `SELECT COUNT(*) as count FROM room_activity
       WHERE room_name = ? AND event_type = 'motion_active' AND recorded_at > datetime('now', '-1 day')`,
    ).get(roomName) as { count: number })?.count || 0

    const hourlyRaw = getAll<{ hour: number; count: number }>(
      `SELECT CAST(strftime('%H', recorded_at, 'localtime') AS INTEGER) as hour, COUNT(*) as count
       FROM room_activity WHERE room_name = ? AND event_type = 'motion_active'
         AND recorded_at > datetime('now', '-7 days')
       GROUP BY strftime('%H', recorded_at, 'localtime') ORDER BY hour`,
      [roomName],
    )
    const hourlyPattern = Array.from({ length: 24 }, (_, i) => ({
      hour: i, count: hourlyRaw.find((h) => h.hour === i)?.count || 0,
    }))

    const batteryDevices = devices.filter((d) => d.battery !== null).map((d) => {
      const drain = db.prepare(
        `SELECT MAX(value) as mx, MIN(value) as mn,
                (julianday(MAX(recorded_at)) - julianday(MIN(recorded_at))) as days
         FROM device_history WHERE source = 'battery' AND source_id = ? AND recorded_at > datetime('now', '-14 days')`,
      ).get(d.label) as { mx: number; mn: number; days: number } | undefined
      const drainPerDay = drain && drain.days > 1 ? Math.round(((drain.mx - drain.mn) / drain.days) * 100) / 100 : null
      let status: 'ok' | 'low' | 'critical' = 'ok'
      if (d.battery! < 5) status = 'critical'
      else if (d.battery! < 15) status = 'low'
      return {
        id: d.id, label: d.label, battery: d.battery!, status,
        drainPerDay,
        predictedDaysRemaining: drainPerDay && drainPerDay > 0 ? Math.round(d.battery! / drainPerDay) : null,
      }
    })

    res.json({
      temperature: room?.temperature ?? null, lux: room?.lux ?? null,
      lastActive: room?.last_active ?? null, temperatureHistory,
      totalWatts, devices, events24h, hourlyPattern, batteryDevices,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /device/:id/insights — device-specific computed insights
router.get('/device/:id/insights', (req: Request, res: Response) => {
  try {
    const deviceId = String(req.params.id)
    const device = getOne<{ label: string; attributes: string }>(
      'SELECT label, attributes FROM hub_devices WHERE id = ?', [Number(deviceId)],
    )
    if (!device) { res.status(404).json({ error: 'Device not found' }); return }

    const attrs = JSON.parse(device.attributes || '{}')
    const label = device.label

    const rateRow = getOne<CurrentStateRow>("SELECT value FROM current_state WHERE key = 'pref_energy_rate'")
    const energyRate = rateRow?.value ? Number(rateRow.value) : 0.30
    const curRow = getOne<CurrentStateRow>("SELECT value FROM current_state WHERE key = 'pref_currency_symbol'")
    const currencySymbol = curRow?.value || '$'

    let powerIns = null
    if (attrs.power !== undefined) {
      const cw = Number(attrs.power)
      const avg = db.prepare(
        `SELECT AVG(value) as v FROM device_history WHERE source = 'power' AND source_id = ? AND recorded_at > datetime('now', '-7 days')`,
      ).get(label) as { v: number | null } | undefined
      const avg7d = avg?.v != null ? Math.round(avg.v * 10) / 10 : null
      const total = (db.prepare(
        `SELECT SUM(CAST(json_extract(attributes, '$.power') AS REAL)) as t FROM hub_devices WHERE json_extract(attributes, '$.power') IS NOT NULL`,
      ).get() as { t: number | null })?.t || 1
      powerIns = {
        currentWatts: cw, averageWatts7d: avg7d,
        overUnderPercent: avg7d && avg7d > 0 ? Math.round(((cw - avg7d) / avg7d) * 100) : null,
        percentOfTotal: Math.round((cw / total) * 100),
        dailyCostImpact: energyRate > 0 ? Math.round(((cw * 24) / 1000) * energyRate * 100) / 100 : null,
        currencySymbol,
      }
    }

    let batteryIns = null
    if (attrs.battery !== undefined) {
      const drain = db.prepare(
        `SELECT MAX(value) as mx, MIN(value) as mn, (julianday(MAX(recorded_at)) - julianday(MIN(recorded_at))) as days
         FROM device_history WHERE source = 'battery' AND source_id = ? AND recorded_at > datetime('now', '-14 days')`,
      ).get(label) as { mx: number; mn: number; days: number } | undefined
      const dpd = drain && drain.days > 1 ? Math.round(((drain.mx - drain.mn) / drain.days) * 100) / 100 : null
      batteryIns = {
        currentLevel: Number(attrs.battery), drainPerDay: dpd,
        predictedDaysRemaining: dpd && dpd > 0 ? Math.round(Number(attrs.battery) / dpd) : null,
      }
    }

    let tempIns = null
    if (attrs.temperature !== undefined) {
      const avg = db.prepare(
        `SELECT AVG(value) as v FROM device_history WHERE source = 'temperature' AND source_id = ? AND recorded_at > datetime('now', '-30 days')`,
      ).get(label) as { v: number | null } | undefined
      tempIns = { currentTemp: Number(attrs.temperature), avgTemp30d: avg?.v != null ? Math.round(avg.v * 100) / 100 : null }
    }

    const roomAssn = getOne<{ room_name: string }>('SELECT room_name FROM device_rooms WHERE device_id = ?', [deviceId])
    const roomDevices = roomAssn
      ? getAll<{ id: number; label: string; device_type: string }>(
          `SELECT h.id, h.label, dr.device_type FROM device_rooms dr JOIN hub_devices h ON CAST(h.id AS TEXT) = dr.device_id WHERE dr.room_name = ? AND dr.device_id != ?`,
          [roomAssn.room_name, deviceId],
        )
      : []

    res.json({ insights: { power: powerIns, battery: batteryIns, temperature: tempIns }, roomDevices, currencySymbol })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
