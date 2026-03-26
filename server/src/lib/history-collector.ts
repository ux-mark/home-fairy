import { getAll, run, db } from '../db/index.js'
import { getCurrentWeather } from './weather-client.js'
import { deviceHealthService } from './device-health-service.js'
import { lifxClient } from './lifx-client.js'

const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

interface BatteryReading {
  label: string
  battery: string | null
}

let intervalId: ReturnType<typeof setInterval> | null = null
let initTimeout: ReturnType<typeof setTimeout> | null = null
let pruneIntervalId: ReturnType<typeof setInterval> | null = null

async function collectSnapshot(): Promise<void> {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)

  try {
    const insert = db.prepare(
      'INSERT INTO device_history (source, source_id, value, recorded_at) VALUES (?, ?, ?, ?)',
    )

    const transaction = db.transaction(() => {
      // Room temperatures and lux (from sensor devices via hub_devices.attributes)
      const sensorReadings = getAll<{ room_name: string; temperature: number | null; lux: number | null }>(
        `SELECT dr.room_name,
          CAST(json_extract(h.attributes, '$.temperature') AS REAL) as temperature,
          CAST(json_extract(h.attributes, '$.illuminance') AS REAL) as lux
         FROM device_rooms dr
         JOIN hub_devices h ON h.label = dr.device_label
         WHERE dr.device_type IN ('motion', 'sensor')
         AND (json_extract(h.attributes, '$.temperature') IS NOT NULL
           OR json_extract(h.attributes, '$.illuminance') IS NOT NULL)`,
      )
      for (const reading of sensorReadings) {
        if (reading.temperature !== null) {
          insert.run('temperature', reading.room_name, reading.temperature, timestamp)
        }
        if (reading.lux !== null) {
          insert.run('lux', reading.room_name, reading.lux, timestamp)
        }
      }

      // Battery levels
      const batteries = getAll<BatteryReading>(
        "SELECT label, json_extract(attributes, '$.battery') as battery FROM hub_devices WHERE json_extract(attributes, '$.battery') IS NOT NULL",
      )
      for (const device of batteries) {
        if (device.battery !== null) {
          insert.run('battery', device.label, Number(device.battery), timestamp)
        }
      }

      // Kasa energy snapshots
      const kasaDevices = getAll<{ label: string; attributes: string }>(
        "SELECT label, attributes FROM kasa_devices WHERE has_emeter = 1",
      )
      for (const device of kasaDevices) {
        try {
          const attrs = JSON.parse(device.attributes)
          if (attrs.power != null) insert.run('power', device.label, attrs.power, timestamp)
          if (attrs.energy != null) insert.run('energy', device.label, attrs.energy, timestamp)
          if (attrs.voltage != null) insert.run('voltage', device.label, attrs.voltage, timestamp)
          if (attrs.current != null) insert.run('current', device.label, attrs.current, timestamp)
        } catch {
          // Skip devices with invalid attributes
        }
      }
    })

    transaction()

    // Weather (async, outside transaction)
    try {
      const weather = await getCurrentWeather()
      run(
        'INSERT INTO device_history (source, source_id, value, recorded_at) VALUES (?, ?, ?, ?)',
        ['weather_temp', 'outdoor', weather.temp, timestamp],
      )
      run(
        'INSERT INTO device_history (source, source_id, value, recorded_at) VALUES (?, ?, ?, ?)',
        ['weather_humidity', 'outdoor', weather.humidity, timestamp],
      )
    } catch {
      // Weather may fail (API down, no key) — don't block other snapshots
    }

    // LIFX health check
    try {
      const lifxApiLights = await lifxClient.listAll() as Array<{ id: string; connected: boolean }>
      const lifxApiById = new Map(lifxApiLights.map(l => [l.id, l]))

      const knownLights = getAll<{ light_id: string }>('SELECT light_id FROM light_rooms')
      for (const light of knownLights) {
        const apiLight = lifxApiById.get(light.light_id)
        if (!apiLight) {
          deviceHealthService.recordFailure('lifx', light.light_id, 'Light not found in LIFX API response')
        } else if (apiLight.connected) {
          deviceHealthService.recordSuccess('lifx', light.light_id)
        } else {
          deviceHealthService.recordFailure('lifx', light.light_id, 'LIFX cloud reports disconnected')
        }
      }
    } catch {
      // LIFX health check failure must not break the rest of the snapshot
    }
  } catch (err) {
    console.error('[history] Snapshot failed:', err instanceof Error ? err.message : err)
  }
}

function pruneOldLogs(): void {
  try {
    const result = run(
      "DELETE FROM logs WHERE created_at < datetime('now', '-30 days')"
    )
    if (result.changes > 0) {
      console.log(`[history] Pruned ${result.changes} log entries older than 30 days`)
    }
  } catch (err) {
    console.error('[history] Log pruning failed:', err instanceof Error ? err.message : err)
  }
}

export function startHistoryCollector(): void {
  if (intervalId) return
  console.log('[history] Starting collector (10-minute interval)')
  // Take initial snapshot after a short delay (let server finish starting)
  initTimeout = setTimeout(() => {
    initTimeout = null
    collectSnapshot()
    intervalId = setInterval(collectSnapshot, SNAPSHOT_INTERVAL_MS)
  }, 30_000)

  // Run log pruning once daily (check every hour, prune if needed)
  pruneIntervalId = setInterval(pruneOldLogs, 60 * 60 * 1000) // hourly check
  pruneOldLogs() // initial prune on startup
}

export function stopHistoryCollector(): void {
  if (initTimeout) {
    clearTimeout(initTimeout)
    initTimeout = null
  }
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[history] Collector stopped')
  }
  if (pruneIntervalId) {
    clearInterval(pruneIntervalId)
    pruneIntervalId = null
  }
}

export function getHistoryStats(): {
  totalRows: number
  oldestRecord: string | null
  sources: Array<{ source: string; count: number }>
} {
  const countResult = db
    .prepare('SELECT COUNT(*) as count FROM device_history')
    .get() as { count: number }

  const oldestResult = db
    .prepare('SELECT MIN(recorded_at) as oldest FROM device_history')
    .get() as { oldest: string | null }

  const sources = db
    .prepare(
      'SELECT source, COUNT(*) as count FROM device_history GROUP BY source ORDER BY count DESC',
    )
    .all() as Array<{ source: string; count: number }>

  return {
    totalRows: countResult.count,
    oldestRecord: oldestResult.oldest,
    sources,
  }
}
