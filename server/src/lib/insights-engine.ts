import { getAll, db } from '../db/index.js'

// ── Types ────────────────────────────────────────────────────────────────────

interface PowerDevice {
  id: number
  label: string
  room_name: string | null
  power: number
  energy: number | null
  switch: 'on' | 'off'
}

interface BatteryDevice {
  id: number
  label: string
  device_type: string
  battery: number | null
  status: 'ok' | 'low' | 'critical'
}

interface RoomData {
  name: string
  temperature: number | null
  lux: number | null
}

interface WeatherData {
  temp: number
  humidity: number
}

interface CurrentState {
  power: PowerDevice[]
  rooms: RoomData[]
  battery: BatteryDevice[]
  weather: WeatherData | null
  energyRate: number
}

export interface EnergyInsights {
  totalWatts: number
  averageWattsThisHour: number | null
  overUnderPercent: number | null
  dailyCostEstimate: number | null
  energyRate: number
  dailyKwhHistory: Array<{ day: string; totalKwh: number }>
  peakHours: Array<{ hour: number; avgWatts: number }>
  deviceAnomalies: Array<{
    deviceId: number
    label: string
    currentWatts: number
    averageWatts: number
    percentAbove: number
  }>
}

export interface TemperatureInsights {
  houseAvgTemp: number
  houseAvgTemp30d: number | null
  overUnderTemp: number | null
  trend: 'warming' | 'cooling' | 'stable'
  roomOutliers: Array<{ room: string; temp: number; deviation: number }>
  indoorOutdoorDelta: number | null
}

export interface LuxInsights {
  houseAvgLux: number
  houseAvgLuxThisHour: number | null
  overUnderLuxPercent: number | null
  brightnessLevel: 'dark' | 'dim' | 'moderate' | 'bright' | 'very bright'
  roomRanking: Array<{ room: string; lux: number }>
}

export interface BatteryInsights {
  fleetHealth: { healthy: number; low: number; critical: number; total: number }
  deviceDrainRates: Array<{
    deviceId: number
    label: string
    drainPerDay: number | null
    predictedDaysRemaining: number | null
    isAnomalous: boolean
  }>
  worstDevice: { label: string; predictedDaysRemaining: number | null } | null
}

export interface AttentionItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  category: 'battery' | 'energy' | 'temperature'
  title: string
  description: string
  deviceId: number | null
  deviceLabel: string | null
}

export interface InsightsData {
  energy: EnergyInsights | null
  temperature: TemperatureInsights | null
  lux: LuxInsights | null
  battery: BatteryInsights | null
  attention: AttentionItem[]
}

// ── Cache ────────────────────────────────────────────────────────────────────

let cachedInsights: InsightsData | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// ── Helper: check if we have sufficient history ─────────────────────────────

function hasHistoryData(source: string, minRows = 3): boolean {
  const result = db
    .prepare('SELECT COUNT(*) as count FROM device_history WHERE source = ?')
    .get(source) as { count: number }
  return result.count >= minRows
}

// ── Energy insights ─────────────────────────────────────────────────────────

function computeEnergyInsights(power: PowerDevice[], energyRate: number): EnergyInsights | null {
  if (power.length === 0) return null

  const totalWatts = power.reduce((sum, d) => sum + d.power, 0)

  let averageWattsThisHour: number | null = null
  let overUnderPercent: number | null = null
  let dailyCostEstimate: number | null = null
  const deviceAnomalies: EnergyInsights['deviceAnomalies'] = []

  if (hasHistoryData('power', 6)) {
    // 7-day average total watts for current hour
    const avgResult = db.prepare(`
      SELECT AVG(hourly_total) as avg_watts FROM (
        SELECT SUM(value) as hourly_total
        FROM device_history
        WHERE source = 'power'
          AND CAST(strftime('%H', recorded_at) AS INTEGER) = CAST(strftime('%H', 'now') AS INTEGER)
          AND recorded_at > datetime('now', '-7 days')
        GROUP BY strftime('%Y-%m-%d %H', recorded_at)
      )
    `).get() as { avg_watts: number | null } | undefined

    averageWattsThisHour = avgResult?.avg_watts ?? null

    if (averageWattsThisHour !== null && averageWattsThisHour > 0) {
      overUnderPercent = Math.round(
        ((totalWatts - averageWattsThisHour) / averageWattsThisHour) * 100,
      )
    }

    // Daily cost estimate: total current watts * 24h / 1000 * rate
    dailyCostEstimate =
      energyRate > 0
        ? Math.round(((totalWatts * 24) / 1000) * energyRate * 100) / 100
        : null

    // Per-device anomaly detection: current watts vs 7-day hourly average
    const perDeviceAvg = getAll<{ source_id: string; avg_watts: number }>(
      `SELECT source_id, AVG(value) as avg_watts
       FROM device_history
       WHERE source = 'power'
         AND CAST(strftime('%H', recorded_at) AS INTEGER) = CAST(strftime('%H', 'now') AS INTEGER)
         AND recorded_at > datetime('now', '-7 days')
       GROUP BY source_id`,
    )
    const avgMap = new Map(perDeviceAvg.map((d) => [d.source_id, d.avg_watts]))

    for (const device of power) {
      const avg = avgMap.get(device.label)
      if (avg !== undefined && avg > 1 && device.power > avg * 2) {
        deviceAnomalies.push({
          deviceId: device.id,
          label: device.label,
          currentWatts: device.power,
          averageWatts: Math.round(avg * 10) / 10,
          percentAbove: Math.round(((device.power - avg) / avg) * 100),
        })
      }
    }
  }

  // Daily kWh history (7 days)
  const dailyKwhHistory = getAll<{ day: string; total_kwh: number }>(
    `SELECT day, SUM(daily_kwh) as total_kwh FROM (
       SELECT source_id,
              date(recorded_at) as day,
              MAX(value) - MIN(value) as daily_kwh
       FROM device_history
       WHERE source = 'energy'
         AND recorded_at > datetime('now', '-7 days')
       GROUP BY source_id, date(recorded_at)
     ) GROUP BY day ORDER BY day`,
  ).map((r) => ({ day: r.day, totalKwh: Math.round(r.total_kwh * 100) / 100 }))

  // Peak usage hours (top 3)
  const peakHours = getAll<{ hour: number; avg_watts: number }>(
    `SELECT CAST(strftime('%H', recorded_at) AS INTEGER) as hour,
            AVG(value) as avg_watts
     FROM device_history
     WHERE source = 'power'
       AND recorded_at > datetime('now', '-7 days')
     GROUP BY strftime('%H', recorded_at)
     ORDER BY avg_watts DESC LIMIT 3`,
  ).map((r) => ({ hour: r.hour, avgWatts: Math.round(r.avg_watts * 10) / 10 }))

  return {
    totalWatts,
    averageWattsThisHour:
      averageWattsThisHour !== null
        ? Math.round(averageWattsThisHour * 10) / 10
        : null,
    overUnderPercent,
    dailyCostEstimate,
    energyRate,
    dailyKwhHistory,
    peakHours,
    deviceAnomalies,
  }
}

// ── Temperature insights ────────────────────────────────────────────────────

function computeTemperatureInsights(
  rooms: RoomData[],
  weather: WeatherData | null,
): TemperatureInsights | null {
  const roomsWithTemp = rooms.filter((r) => r.temperature !== null)
  if (roomsWithTemp.length === 0) return null

  const houseAvgTemp =
    Math.round(
      (roomsWithTemp.reduce((sum, r) => sum + r.temperature!, 0) /
        roomsWithTemp.length) *
        100,
    ) / 100

  let houseAvgTemp30d: number | null = null
  let overUnderTemp: number | null = null

  if (hasHistoryData('temperature', 12)) {
    const avg30d = db.prepare(`
      SELECT AVG(value) as avg_temp
      FROM device_history
      WHERE source = 'temperature'
        AND recorded_at > datetime('now', '-30 days')
    `).get() as { avg_temp: number | null } | undefined

    houseAvgTemp30d =
      avg30d?.avg_temp !== null && avg30d?.avg_temp !== undefined
        ? Math.round(avg30d.avg_temp * 100) / 100
        : null

    if (houseAvgTemp30d !== null) {
      overUnderTemp = Math.round((houseAvgTemp - houseAvgTemp30d) * 10) / 10
    }
  }

  // Trend: compare last 2 hours vs 4-6 hours ago
  let trend: 'warming' | 'cooling' | 'stable' = 'stable'
  if (hasHistoryData('temperature', 6)) {
    const recent = db.prepare(`
      SELECT AVG(value) as avg FROM device_history
      WHERE source = 'temperature' AND recorded_at > datetime('now', '-2 hours')
    `).get() as { avg: number | null } | undefined

    const earlier = db.prepare(`
      SELECT AVG(value) as avg FROM device_history
      WHERE source = 'temperature'
        AND recorded_at BETWEEN datetime('now', '-6 hours') AND datetime('now', '-4 hours')
    `).get() as { avg: number | null } | undefined

    if (recent?.avg != null && earlier?.avg != null) {
      const diff = recent.avg - earlier.avg
      if (diff > 0.5) trend = 'warming'
      else if (diff < -0.5) trend = 'cooling'
    }
  }

  // Room outliers: rooms deviating >2° from house average
  const roomOutliers = roomsWithTemp
    .map((r) => ({
      room: r.name,
      temp: r.temperature!,
      deviation: Math.round((r.temperature! - houseAvgTemp) * 10) / 10,
    }))
    .filter((r) => Math.abs(r.deviation) > 2)
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))

  // Indoor/outdoor delta
  const indoorOutdoorDelta =
    weather !== null
      ? Math.round((houseAvgTemp - weather.temp) * 10) / 10
      : null

  return {
    houseAvgTemp,
    houseAvgTemp30d,
    overUnderTemp,
    trend,
    roomOutliers,
    indoorOutdoorDelta,
  }
}

// ── Lux insights ────────────────────────────────────────────────────────────

function computeLuxInsights(rooms: RoomData[]): LuxInsights | null {
  const roomsWithLux = rooms.filter((r) => r.lux !== null)
  if (roomsWithLux.length === 0) return null

  const houseAvgLux = Math.round(
    roomsWithLux.reduce((sum, r) => sum + r.lux!, 0) / roomsWithLux.length,
  )

  let houseAvgLuxThisHour: number | null = null
  let overUnderLuxPercent: number | null = null

  if (hasHistoryData('lux', 6)) {
    const avgResult = db.prepare(`
      SELECT AVG(value) as avg_lux
      FROM device_history
      WHERE source = 'lux'
        AND CAST(strftime('%H', recorded_at) AS INTEGER) = CAST(strftime('%H', 'now') AS INTEGER)
        AND recorded_at > datetime('now', '-7 days')
    `).get() as { avg_lux: number | null } | undefined

    houseAvgLuxThisHour =
      avgResult?.avg_lux !== null && avgResult?.avg_lux !== undefined
        ? Math.round(avgResult.avg_lux)
        : null

    if (houseAvgLuxThisHour !== null && houseAvgLuxThisHour > 0) {
      overUnderLuxPercent = Math.round(
        ((houseAvgLux - houseAvgLuxThisHour) / houseAvgLuxThisHour) * 100,
      )
    }
  }

  let brightnessLevel: LuxInsights['brightnessLevel']
  if (houseAvgLux < 10) brightnessLevel = 'dark'
  else if (houseAvgLux < 50) brightnessLevel = 'dim'
  else if (houseAvgLux < 200) brightnessLevel = 'moderate'
  else if (houseAvgLux < 500) brightnessLevel = 'bright'
  else brightnessLevel = 'very bright'

  const roomRanking = roomsWithLux
    .map((r) => ({ room: r.name, lux: r.lux! }))
    .sort((a, b) => b.lux - a.lux)

  return {
    houseAvgLux,
    houseAvgLuxThisHour,
    overUnderLuxPercent,
    brightnessLevel,
    roomRanking,
  }
}

// ── Battery insights ────────────────────────────────────────────────────────

function computeBatteryInsights(battery: BatteryDevice[]): BatteryInsights | null {
  if (battery.length === 0) return null

  const fleetHealth = {
    healthy: battery.filter((d) => d.status === 'ok').length,
    low: battery.filter((d) => d.status === 'low').length,
    critical: battery.filter((d) => d.status === 'critical').length,
    total: battery.length,
  }

  // Drain rates from 14-day history
  const drainData = getAll<{
    source_id: string
    max_val: number
    min_val: number
    days_span: number
  }>(
    `SELECT source_id,
            MAX(value) as max_val,
            MIN(value) as min_val,
            (julianday(MAX(recorded_at)) - julianday(MIN(recorded_at))) as days_span
     FROM device_history
     WHERE source = 'battery'
       AND recorded_at > datetime('now', '-14 days')
     GROUP BY source_id
     HAVING days_span > 1`,
  )

  const drainMap = new Map(
    drainData.map((d) => {
      const drain = d.days_span > 0 ? (d.max_val - d.min_val) / d.days_span : 0
      return [d.source_id, Math.round(drain * 100) / 100]
    }),
  )

  // Fleet average drain rate for anomaly detection
  const drainValues = [...drainMap.values()].filter((v) => v > 0)
  const avgDrainRate =
    drainValues.length > 0
      ? drainValues.reduce((a, b) => a + b, 0) / drainValues.length
      : 0

  const deviceDrainRates = battery.map((device) => {
    const drainPerDay = drainMap.get(device.label) ?? null
    const predictedDaysRemaining =
      drainPerDay !== null && drainPerDay > 0 && device.battery !== null
        ? Math.round(device.battery / drainPerDay)
        : null
    const isAnomalous =
      drainPerDay !== null && avgDrainRate > 0 && drainPerDay > avgDrainRate * 2

    return {
      deviceId: device.id,
      label: device.label,
      drainPerDay,
      predictedDaysRemaining,
      isAnomalous,
    }
  })

  // Worst device: lowest predicted days remaining
  const devicesWithPrediction = deviceDrainRates.filter(
    (d) => d.predictedDaysRemaining !== null,
  )
  const worstDevice =
    devicesWithPrediction.length > 0
      ? devicesWithPrediction.sort(
          (a, b) => a.predictedDaysRemaining! - b.predictedDaysRemaining!,
        )[0]
      : null

  return {
    fleetHealth,
    deviceDrainRates,
    worstDevice: worstDevice
      ? {
          label: worstDevice.label,
          predictedDaysRemaining: worstDevice.predictedDaysRemaining,
        }
      : null,
  }
}

// ── Attention items ─────────────────────────────────────────────────────────

function computeAttentionItems(
  battery: BatteryDevice[],
  batteryInsights: BatteryInsights | null,
  energyInsights: EnergyInsights | null,
  tempInsights: TemperatureInsights | null,
): AttentionItem[] {
  const items: AttentionItem[] = []

  // Critical batteries
  for (const device of battery.filter((d) => d.status === 'critical')) {
    const drainInfo = batteryInsights?.deviceDrainRates.find(
      (r) => r.deviceId === device.id,
    )
    const daysLeft = drainInfo?.predictedDaysRemaining
    items.push({
      id: `battery-critical-${device.id}`,
      severity: 'critical',
      category: 'battery',
      title: `${device.label} battery critical`,
      description:
        `${device.battery}% remaining` +
        (daysLeft !== null && daysLeft !== undefined
          ? ` — estimated ${daysLeft} day${daysLeft !== 1 ? 's' : ''} until replacement`
          : ''),
      deviceId: device.id,
      deviceLabel: device.label,
    })
  }

  // Low batteries
  for (const device of battery.filter((d) => d.status === 'low')) {
    items.push({
      id: `battery-low-${device.id}`,
      severity: 'warning',
      category: 'battery',
      title: `${device.label} battery low`,
      description: `${device.battery}% remaining`,
      deviceId: device.id,
      deviceLabel: device.label,
    })
  }

  // Energy device anomalies (>2x normal)
  if (energyInsights) {
    for (const anomaly of energyInsights.deviceAnomalies) {
      items.push({
        id: `energy-anomaly-${anomaly.deviceId}`,
        severity: 'warning',
        category: 'energy',
        title: `${anomaly.label} using ${anomaly.percentAbove}% more power than normal`,
        description: `Currently ${anomaly.currentWatts}W — 7-day average for this hour is ${anomaly.averageWatts}W`,
        deviceId: anomaly.deviceId,
        deviceLabel: anomaly.label,
      })
    }
  }

  // Temperature room outliers (>3° deviation)
  if (tempInsights) {
    for (const outlier of tempInsights.roomOutliers.filter(
      (r) => Math.abs(r.deviation) > 3,
    )) {
      const direction = outlier.deviation > 0 ? 'warmer' : 'cooler'
      items.push({
        id: `temp-outlier-${outlier.room}`,
        severity: 'info',
        category: 'temperature',
        title: `${outlier.room} is ${Math.abs(outlier.deviation)}° ${direction} than average`,
        description: `Currently ${outlier.temp}° — house average is ${tempInsights.houseAvgTemp}°`,
        deviceId: null,
        deviceLabel: null,
      })
    }
  }

  // Anomalous battery drain
  if (batteryInsights) {
    for (const device of batteryInsights.deviceDrainRates.filter(
      (d) => d.isAnomalous && d.drainPerDay !== null,
    )) {
      // Skip if already flagged as critical/low battery
      if (items.some((i) => i.id.startsWith(`battery-`) && i.deviceId === device.deviceId)) {
        continue
      }
      items.push({
        id: `battery-drain-${device.deviceId}`,
        severity: 'warning',
        category: 'battery',
        title: `${device.label} draining faster than normal`,
        description: `Losing ${device.drainPerDay}% per day` +
          (device.predictedDaysRemaining !== null
            ? ` — estimated ${device.predictedDaysRemaining} days remaining`
            : ''),
        deviceId: device.deviceId,
        deviceLabel: device.label,
      })
    }
  }

  // Energy significantly above normal (>30%)
  if (
    energyInsights?.overUnderPercent !== null &&
    energyInsights?.overUnderPercent !== undefined &&
    energyInsights.overUnderPercent > 30
  ) {
    items.push({
      id: 'energy-above-normal',
      severity: 'info',
      category: 'energy',
      title: `Energy usage ${energyInsights.overUnderPercent}% above normal`,
      description: `Currently ${energyInsights.totalWatts}W — typical for this hour is ${energyInsights.averageWattsThisHour}W`,
      deviceId: null,
      deviceLabel: null,
    })
  }

  return items
}

// ── Main export ─────────────────────────────────────────────────────────────

export function computeInsights(state: CurrentState): InsightsData {
  const now = Date.now()
  if (cachedInsights && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedInsights
  }

  const energy = computeEnergyInsights(state.power, state.energyRate)
  const temperature = computeTemperatureInsights(state.rooms, state.weather)
  const lux = computeLuxInsights(state.rooms)
  const battery = computeBatteryInsights(state.battery)
  const attention = computeAttentionItems(
    state.battery,
    battery,
    energy,
    temperature,
  )

  const insights: InsightsData = { energy, temperature, lux, battery, attention }
  cachedInsights = insights
  cacheTimestamp = now

  return insights
}
