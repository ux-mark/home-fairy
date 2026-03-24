import { getAll, run, db } from '../db/index.js'
import { getCurrentWeather } from './weather-client.js'

const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

interface RoomReading {
  name: string
  temperature: number | null
  lux: number | null
}

interface BatteryReading {
  label: string
  battery: string | null
}

let intervalId: ReturnType<typeof setInterval> | null = null

async function collectSnapshot(): Promise<void> {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)

  try {
    const insert = db.prepare(
      'INSERT INTO device_history (source, source_id, value, recorded_at) VALUES (?, ?, ?, ?)',
    )

    const transaction = db.transaction(() => {
      // Room temperatures and lux
      const rooms = getAll<RoomReading>(
        'SELECT name, temperature, lux FROM rooms WHERE temperature IS NOT NULL OR lux IS NOT NULL',
      )
      for (const room of rooms) {
        if (room.temperature !== null) {
          insert.run('temperature', room.name, room.temperature, timestamp)
        }
        if (room.lux !== null) {
          insert.run('lux', room.name, room.lux, timestamp)
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
  } catch (err) {
    console.error('[history] Snapshot failed:', err instanceof Error ? err.message : err)
  }
}

export function startHistoryCollector(): void {
  if (intervalId) return
  console.log('[history] Starting collector (10-minute interval)')
  // Take initial snapshot after a short delay (let server finish starting)
  setTimeout(() => {
    collectSnapshot()
    intervalId = setInterval(collectSnapshot, SNAPSHOT_INTERVAL_MS)
  }, 30_000)
}

export function stopHistoryCollector(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[history] Collector stopped')
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
