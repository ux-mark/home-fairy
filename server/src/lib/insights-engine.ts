import { getAll, getOne, db } from '../db/index.js'
import { notificationService } from './notification-service.js'
import { kasaClient } from './kasa-client.js'

// ── Types ────────────────────────────────────────────────────────────────────

interface PowerDevice {
  id: number | string
  label: string
  room_name: string | null
  power: number
  energy: number | null
  switch: 'on' | 'off'
  source?: 'hub' | 'kasa'
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
  /** @deprecated Use projectedDailyCost. Kept for backwards compatibility. */
  dailyCostEstimate: number | null
  projectedDailyCost: number | null
  actualDailyCost: number | null
  monthToDateCost: number | null
  lastMonthCost: number | null
  monthOverMonthPercent: number | null
  dailyOverUnderPercent: number | null
  deviceCostRanking: Array<{
    deviceId: string
    label: string
    monthlyKwh: number
    monthlyCost: number
    dailyAvgCost: number
  }>
  roomCostRanking: Array<{
    roomName: string
    dailyCost: number
    monthToDateCost: number
    deviceCount: number
  }>
  energyRate: number
  dailyKwhHistory: Array<{ day: string; totalKwh: number }>
  peakHours: Array<{ hour: number; avgWatts: number }>
  deviceAnomalies: Array<{
    deviceId: number | string
    label: string
    currentWatts: number
    averageWatts: number
    percentAbove: number
    source: 'hub' | 'kasa'
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

export interface ActivityInsights {
  roomRanking: Array<{ room: string; events24h: number; peakHours: string }>
  dailyTrend: Array<{ day: string; totalEvents: number }>
  hourlyPattern: Array<{ hour: number; avgEvents: number }>
  hourlyByRoom: Array<{ room: string; data: Array<{ hour: number; avgEvents: number }> }>
  dailyByRoom: Array<{ room: string; data: Array<{ day: string; totalEvents: number }> }>
  roomIcons: Record<string, string | null>
  mostActiveRoom: { room: string; events24h: number } | null
  quietestRoom: { room: string; events24h: number } | null
}

export interface AttentionItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  category: 'battery' | 'energy' | 'temperature' | 'device_error' | 'scene' | 'device_unreachable' | 'device_online'
  title: string
  description: string
  deviceId: number | string | null
  deviceLabel: string | null
  deviceSource: 'hub' | 'kasa' | 'lifx' | null
  /** Optional action hint for the frontend (e.g. deactivate/reactivate buttons) */
  action?: 'deactivate' | 'reactivate'
  /** Device type extracted from the notification dedup key */
  deviceType?: string | null
}

export interface InsightsData {
  energy: EnergyInsights | null
  temperature: TemperatureInsights | null
  lux: LuxInsights | null
  battery: BatteryInsights | null
  activity: ActivityInsights | null
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

// ── Kasa emeter device helpers ───────────────────────────────────────────────

interface EmeterDevice {
  id: string
  label: string
}

/** Fetch daily Wh stats for a single device; returns null on failure. */
async function fetchDailyStats(
  device: EmeterDevice,
  year: number,
  month: number,
): Promise<{ deviceId: string; label: string; data: Record<number, number> } | null> {
  try {
    const stats = await kasaClient.getDailyStats(device.id, year, month)
    return { deviceId: device.id, label: device.label, data: stats.data }
  } catch {
    return null
  }
}

/** Fetch monthly Wh stats for a single device; returns null on failure. */
async function fetchMonthlyStats(
  device: EmeterDevice,
  year: number,
): Promise<{ deviceId: string; label: string; data: Record<number, number> } | null> {
  try {
    const stats = await kasaClient.getMonthlyStats(device.id, year)
    return { deviceId: device.id, label: device.label, data: stats.data }
  } catch {
    return null
  }
}

// ── Energy insights ─────────────────────────────────────────────────────────

async function computeEnergyInsights(power: PowerDevice[], energyRate: number): Promise<EnergyInsights | null> {
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
          AND CAST(strftime('%H', recorded_at, 'localtime') AS INTEGER) = CAST(strftime('%H', 'now', 'localtime') AS INTEGER)
          AND recorded_at > datetime('now', '-7 days')
        GROUP BY strftime('%Y-%m-%d %H', recorded_at, 'localtime')
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
         AND CAST(strftime('%H', recorded_at, 'localtime') AS INTEGER) = CAST(strftime('%H', 'now', 'localtime') AS INTEGER)
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
          source: device.source ?? 'hub',
        })
      }
    }
  }

  // Daily kWh history (7 days)
  const dailyKwhHistory = getAll<{ day: string; total_kwh: number }>(
    `SELECT day, SUM(daily_kwh) as total_kwh FROM (
       SELECT source_id,
              date(recorded_at, 'localtime') as day,
              MAX(value) - MIN(value) as daily_kwh
       FROM device_history
       WHERE source = 'energy'
         AND recorded_at > datetime('now', '-7 days')
       GROUP BY source_id, date(recorded_at, 'localtime')
     ) GROUP BY day ORDER BY day`,
  ).map((r) => ({ day: r.day, totalKwh: Math.round(r.total_kwh * 100) / 100 }))

  // Peak usage hours (top 3)
  const peakHours = getAll<{ hour: number; avg_watts: number }>(
    `SELECT CAST(strftime('%H', recorded_at, 'localtime') AS INTEGER) as hour,
            AVG(value) as avg_watts
     FROM device_history
     WHERE source = 'power'
       AND recorded_at > datetime('now', '-7 days')
     GROUP BY strftime('%H', recorded_at, 'localtime')
     ORDER BY avg_watts DESC LIMIT 3`,
  ).map((r) => ({ hour: r.hour, avgWatts: Math.round(r.avg_watts * 10) / 10 }))

  // ── Cost intelligence from Kasa hardware memory ──────────────────────────

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-indexed
  const currentDay = now.getDate()
  const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate()

  // Emeter-capable devices
  const emeterDevices = getAll<EmeterDevice>(
    `SELECT id, label FROM kasa_devices WHERE has_emeter = 1`,
  )

  // Room mappings for room cost aggregation
  const roomMappings = db.prepare(`
    SELECT dr.device_id, dr.room_name, kd.label
    FROM device_rooms dr
    JOIN kasa_devices kd ON dr.device_id = kd.id
    WHERE dr.device_type LIKE 'kasa_%' AND kd.has_emeter = 1
  `).all() as Array<{ device_id: string; room_name: string; label: string }>

  let actualDailyCost: number | null = null
  const projectedDailyCost = dailyCostEstimate
  let monthToDateCost: number | null = null
  let lastMonthCost: number | null = null
  let monthOverMonthPercent: number | null = null
  let dailyOverUnderPercent: number | null = null
  const deviceCostRanking: EnergyInsights['deviceCostRanking'] = []
  const roomCostRanking: EnergyInsights['roomCostRanking'] = []

  if (emeterDevices.length > 0 && energyRate > 0) {
    // Fetch daily stats (today) in parallel — for actualDailyCost and dailyOverUnderPercent
    const dailyResults = await Promise.allSettled(
      emeterDevices.map((d) => fetchDailyStats(d, currentYear, currentMonth)),
    )

    // Determine the day-of-month for "same day last week" (may cross into prior month)
    const lastWeekDate = new Date(now)
    lastWeekDate.setDate(currentDay - 7)
    const lastWeekYear = lastWeekDate.getFullYear()
    const lastWeekMonth = lastWeekDate.getMonth() + 1
    const lastWeekDay = lastWeekDate.getDate()

    // Fetch last week's daily stats if they fall in a different month
    let lastWeekResults: PromiseSettledResult<{ deviceId: string; label: string; data: Record<number, number> } | null>[] | null = null
    if (lastWeekMonth !== currentMonth || lastWeekYear !== currentYear) {
      lastWeekResults = await Promise.allSettled(
        emeterDevices.map((d) => fetchDailyStats(d, lastWeekYear, lastWeekMonth)),
      )
    }

    let totalTodayWh = 0
    let totalLastWeekDayWh = 0
    let hasTodayData = false
    let hasLastWeekData = false

    for (let i = 0; i < dailyResults.length; i++) {
      const result = dailyResults[i]
      if (result.status !== 'fulfilled' || result.value === null) continue
      const { data } = result.value

      const todayWh = data[currentDay] ?? 0
      totalTodayWh += todayWh
      hasTodayData = true

      // Same-day last week — may come from different month fetch
      if (lastWeekMonth === currentMonth && lastWeekYear === currentYear) {
        // Same month: use same daily stats result
        const lastWeekWh = data[lastWeekDay] ?? 0
        totalLastWeekDayWh += lastWeekWh
        if (lastWeekWh > 0) hasLastWeekData = true
      } else if (lastWeekResults) {
        const lwResult = lastWeekResults[i]
        if (lwResult.status === 'fulfilled' && lwResult.value !== null) {
          const lwWh = lwResult.value.data[lastWeekDay] ?? 0
          totalLastWeekDayWh += lwWh
          if (lwWh > 0) hasLastWeekData = true
        }
      }
    }

    if (hasTodayData) {
      actualDailyCost = Math.round((totalTodayWh / 1000) * energyRate * 100) / 100
    }

    if (hasTodayData && hasLastWeekData && totalLastWeekDayWh > 0) {
      dailyOverUnderPercent = Math.round(
        ((totalTodayWh - totalLastWeekDayWh) / totalLastWeekDayWh) * 100,
      )
    }

    // Fetch monthly stats in parallel — for monthToDateCost, lastMonthCost, device ranking
    const monthlyResults = await Promise.allSettled(
      emeterDevices.map((d) => fetchMonthlyStats(d, currentYear)),
    )

    // Determine previous month
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear

    // If previous month is in a prior year we need a separate fetch
    let prevYearMonthlyResults: PromiseSettledResult<{ deviceId: string; label: string; data: Record<number, number> } | null>[] | null = null
    if (prevMonthYear !== currentYear) {
      prevYearMonthlyResults = await Promise.allSettled(
        emeterDevices.map((d) => fetchMonthlyStats(d, prevMonthYear)),
      )
    }

    let totalCurrentMonthWh = 0
    let totalPrevMonthWh = 0
    let hasCurrentMonthData = false
    let hasPrevMonthData = false

    const deviceMonthlyKwh = new Map<string, { label: string; kwh: number }>()

    for (let i = 0; i < monthlyResults.length; i++) {
      const result = monthlyResults[i]
      if (result.status !== 'fulfilled' || result.value === null) continue
      const { deviceId, label, data } = result.value

      const currentMonthWh = data[currentMonth] ?? 0
      totalCurrentMonthWh += currentMonthWh
      hasCurrentMonthData = true

      deviceMonthlyKwh.set(deviceId, { label, kwh: (deviceMonthlyKwh.get(deviceId)?.kwh ?? 0) + currentMonthWh / 1000 })

      // Previous month from same yearly result (if prev month is in current year)
      if (prevMonthYear === currentYear) {
        const prevMonthWh = data[prevMonth] ?? 0
        totalPrevMonthWh += prevMonthWh
        if (prevMonthWh > 0) hasPrevMonthData = true
      } else if (prevYearMonthlyResults) {
        const pvResult = prevYearMonthlyResults[i]
        if (pvResult.status === 'fulfilled' && pvResult.value !== null) {
          const pvWh = pvResult.value.data[prevMonth] ?? 0
          totalPrevMonthWh += pvWh
          if (pvWh > 0) hasPrevMonthData = true
        }
      }
    }

    if (hasCurrentMonthData) {
      monthToDateCost = Math.round((totalCurrentMonthWh / 1000) * energyRate * 100) / 100
    }

    if (hasPrevMonthData) {
      lastMonthCost = Math.round((totalPrevMonthWh / 1000) * energyRate * 100) / 100
    }

    // Month-over-month: project current month to full month, compare to last month
    if (hasCurrentMonthData && hasPrevMonthData && totalPrevMonthWh > 0 && currentDay > 0) {
      const projectedCurrentMonthWh = (totalCurrentMonthWh / currentDay) * daysInCurrentMonth
      monthOverMonthPercent = Math.round(
        ((projectedCurrentMonthWh - totalPrevMonthWh) / totalPrevMonthWh) * 100,
      )
    }

    // Per-device cost ranking
    for (const [deviceId, { label, kwh }] of deviceMonthlyKwh.entries()) {
      const monthlyCost = Math.round(kwh * energyRate * 100) / 100
      const daysInMonth = daysInCurrentMonth
      deviceCostRanking.push({
        deviceId,
        label,
        monthlyKwh: Math.round(kwh * 1000) / 1000,
        monthlyCost,
        dailyAvgCost: Math.round((monthlyCost / daysInMonth) * 1000) / 1000,
      })
    }
    deviceCostRanking.sort((a, b) => b.monthlyCost - a.monthlyCost)

    // Per-room cost aggregation
    const roomMap = new Map<string, { dailyCost: number; monthToDateCost: number; deviceCount: number; deviceIds: Set<string> }>()

    for (const mapping of roomMappings) {
      if (!roomMap.has(mapping.room_name)) {
        roomMap.set(mapping.room_name, { dailyCost: 0, monthToDateCost: 0, deviceCount: 0, deviceIds: new Set() })
      }
      const room = roomMap.get(mapping.room_name)!
      if (!room.deviceIds.has(mapping.device_id)) {
        room.deviceIds.add(mapping.device_id)
        room.deviceCount++

        // Find this device's costs from previously computed data
        const deviceDailyIdx = emeterDevices.findIndex((d) => d.id === mapping.device_id)
        if (deviceDailyIdx >= 0) {
          const dailyResult = dailyResults[deviceDailyIdx]
          if (dailyResult.status === 'fulfilled' && dailyResult.value !== null) {
            const todayWh = dailyResult.value.data[currentDay] ?? 0
            room.dailyCost += (todayWh / 1000) * energyRate
          }

          const deviceKwh = deviceMonthlyKwh.get(mapping.device_id)?.kwh ?? 0
          room.monthToDateCost += deviceKwh * energyRate
        }
      }
    }

    for (const [roomName, data] of roomMap.entries()) {
      roomCostRanking.push({
        roomName,
        dailyCost: Math.round(data.dailyCost * 100) / 100,
        monthToDateCost: Math.round(data.monthToDateCost * 100) / 100,
        deviceCount: data.deviceCount,
      })
    }
    roomCostRanking.sort((a, b) => b.monthToDateCost - a.monthToDateCost)
  }

  return {
    totalWatts,
    averageWattsThisHour:
      averageWattsThisHour !== null
        ? Math.round(averageWattsThisHour * 10) / 10
        : null,
    overUnderPercent,
    dailyCostEstimate,
    projectedDailyCost,
    actualDailyCost,
    monthToDateCost,
    lastMonthCost,
    monthOverMonthPercent,
    dailyOverUnderPercent,
    deviceCostRanking,
    roomCostRanking,
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
        AND CAST(strftime('%H', recorded_at, 'localtime') AS INTEGER) = CAST(strftime('%H', 'now', 'localtime') AS INTEGER)
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

// ── Activity insights ────────────────────────────────────────────────────────

function formatHourRange(hour: number): string {
  const h = hour % 12 || 12
  const suffix = hour < 12 ? 'am' : 'pm'
  const nextHour = (hour + 1) % 12 || 12
  const nextSuffix = hour + 1 < 12 || hour + 1 === 24 ? 'am' : 'pm'
  return `${h}${suffix}\u2013${nextHour}${nextSuffix}`
}

function computeActivityInsights(): ActivityInsights | null {
  // Room ranking: events in last 24h per room
  const roomRows = getAll<{ room_name: string; event_count: number }>(
    `SELECT room_name, COUNT(*) as event_count
     FROM room_activity
     WHERE event_type = 'motion_active'
       AND recorded_at > datetime('now', '-1 day')
     GROUP BY room_name
     ORDER BY event_count DESC`,
    [],
  )

  if (roomRows.length === 0) return null

  // Peak hours per room (7-day window, top 2 hours) — single query to avoid N+1
  const peakRows = getAll<{ room_name: string; hour: number; count: number }>(
    `SELECT room_name, CAST(strftime('%H', recorded_at, 'localtime') AS INTEGER) as hour, COUNT(*) as count
     FROM room_activity
     WHERE event_type = 'motion_active'
       AND recorded_at > datetime('now', '-7 days')
     GROUP BY room_name, strftime('%H', recorded_at, 'localtime')
     ORDER BY room_name, count DESC`,
    [],
  )

  // Build a map of room -> top 2 peak hours
  const peakMap = new Map<string, string>()
  const roomPeakCounts = new Map<string, number>()
  for (const row of peakRows) {
    const count = roomPeakCounts.get(row.room_name) ?? 0
    if (count < 2) {
      const existing = peakMap.get(row.room_name)
      const formatted = formatHourRange(row.hour)
      peakMap.set(row.room_name, existing ? `${existing}, ${formatted}` : formatted)
      roomPeakCounts.set(row.room_name, count + 1)
    }
  }

  const roomRanking = roomRows.map((r) => ({
    room: r.room_name,
    events24h: r.event_count,
    peakHours: peakMap.get(r.room_name) ?? '',
  }))

  // Daily trend: last 7 days
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const trendRows = getAll<{ day: string; total_events: number }>(
    `SELECT date(recorded_at, 'localtime') as day, COUNT(*) as total_events
     FROM room_activity
     WHERE event_type = 'motion_active'
       AND recorded_at > datetime('now', '-7 days')
     GROUP BY date(recorded_at, 'localtime')
     ORDER BY day`,
    [],
  )
  const dailyTrend = trendRows.map((r) => {
    const d = new Date(r.day + 'T00:00:00')
    return { day: dayNames[d.getDay()], totalEvents: r.total_events }
  })

  // Hourly pattern: 7-day average events per hour of day (house-wide)
  const daysOfData = getOne<{ days: number }>(
    `SELECT MAX(1, CAST(julianday('now') - julianday(MIN(recorded_at)) AS INTEGER)) as days
     FROM room_activity
     WHERE event_type = 'motion_active' AND recorded_at > datetime('now', '-7 days')`,
    [],
  )?.days ?? 7
  const hourlyRows = getAll<{ hour: number; total: number }>(
    `SELECT CAST(strftime('%H', recorded_at, 'localtime') AS INTEGER) as hour, COUNT(*) as total
     FROM room_activity
     WHERE event_type = 'motion_active'
       AND recorded_at > datetime('now', '-7 days')
     GROUP BY strftime('%H', recorded_at, 'localtime')
     ORDER BY hour`,
    [],
  )
  const hourlyMap = new Map(hourlyRows.map((r) => [r.hour, r.total]))
  const hourlyPattern = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    avgEvents: Math.round((hourlyMap.get(h) ?? 0) / daysOfData),
  }))

  // Per-room hourly breakdown (reuse peakRows which has room_name + hour + count)
  const roomNames = roomRows.map((r) => r.room_name)
  const hourlyByRoomMap = new Map<string, Map<number, number>>()
  for (const row of peakRows) {
    let roomMap = hourlyByRoomMap.get(row.room_name)
    if (!roomMap) {
      roomMap = new Map()
      hourlyByRoomMap.set(row.room_name, roomMap)
    }
    roomMap.set(row.hour, row.count)
  }
  const hourlyByRoom = roomNames.map((room) => {
    const roomMap = hourlyByRoomMap.get(room) ?? new Map()
    return {
      room,
      data: Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        avgEvents: Math.round((roomMap.get(h) ?? 0) / daysOfData),
      })),
    }
  })

  // Per-room daily breakdown
  const dailyByRoomRows = getAll<{ room_name: string; day: string; total_events: number }>(
    `SELECT room_name, date(recorded_at, 'localtime') as day, COUNT(*) as total_events
     FROM room_activity
     WHERE event_type = 'motion_active'
       AND recorded_at > datetime('now', '-7 days')
     GROUP BY room_name, date(recorded_at, 'localtime')
     ORDER BY room_name, day`,
    [],
  )
  // Get the set of all days from the house-wide trend
  const allDays = dailyTrend.map((d) => d.day)
  const allDayDates = trendRows.map((r) => r.day)
  const dailyByRoomMap = new Map<string, Map<string, number>>()
  for (const row of dailyByRoomRows) {
    let roomMap = dailyByRoomMap.get(row.room_name)
    if (!roomMap) {
      roomMap = new Map()
      dailyByRoomMap.set(row.room_name, roomMap)
    }
    roomMap.set(row.day, row.total_events)
  }
  const dailyByRoom = roomNames.map((room) => {
    const roomMap = dailyByRoomMap.get(room) ?? new Map()
    return {
      room,
      data: allDayDates.map((dateStr, i) => ({
        day: allDays[i],
        totalEvents: roomMap.get(dateStr) ?? 0,
      })),
    }
  })

  // Room icons
  const iconRows = getAll<{ name: string; icon: string | null }>(
    'SELECT name, icon FROM rooms',
    [],
  )
  const roomIcons: Record<string, string | null> = {}
  for (const row of iconRows) roomIcons[row.name] = row.icon

  // Most active / quietest
  const mostActiveRoom = { room: roomRanking[0].room, events24h: roomRanking[0].events24h }
  const quietestRoom =
    roomRanking.length > 1
      ? {
          room: roomRanking[roomRanking.length - 1].room,
          events24h: roomRanking[roomRanking.length - 1].events24h,
        }
      : null

  return { roomRanking, dailyTrend, hourlyPattern, hourlyByRoom, dailyByRoom, roomIcons, mostActiveRoom, quietestRoom }
}

// ── Device label resolver (fallback for notifications with null source_label) ─

function resolveDeviceLabel(deviceType: string, deviceId: string): string | null {
  if (deviceType === 'hub') {
    const row = getOne<{ label: string }>('SELECT label FROM hub_devices WHERE id = ?', [deviceId])
    return row?.label ?? null
  }
  if (deviceType === 'kasa') {
    const row = getOne<{ label: string }>('SELECT label FROM kasa_devices WHERE id = ?', [deviceId])
    return row?.label ?? null
  }
  if (deviceType === 'lifx') {
    const row = getOne<{ light_label: string }>(
      'SELECT light_label FROM light_rooms WHERE light_id = ? LIMIT 1',
      [deviceId],
    )
    return row?.light_label ?? null
  }

  return null
}

function mapDeviceSource(deviceType: string): 'hub' | 'kasa' | 'lifx' | null {
  if (deviceType === 'kasa') return 'kasa'
  if (deviceType === 'hub') return 'hub'
  if (deviceType === 'lifx') return 'lifx'
  return null
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
      deviceSource: 'hub',
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
      deviceSource: 'hub',
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
        deviceSource: anomaly.source,
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
        deviceSource: null,
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
        deviceSource: 'hub',
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
      deviceSource: null,
    })
  }

  // Recent device errors from notification system
  try {
    const deviceErrors = notificationService.getRecentDeviceErrors(60)
    for (const err of deviceErrors) {
      items.push({
        id: `device-error-${err.id}`,
        severity: err.severity as AttentionItem['severity'],
        category: 'device_error',
        title: err.title,
        description: err.occurrence_count > 1
          ? `${err.message} (${err.occurrence_count} occurrences)`
          : err.message,
        deviceId: null,
        deviceLabel: err.source_label,
        deviceSource: null,
      })
    }
  } catch {
    // Ignore notification query errors
  }

  // Device unreachable notifications (last 24 hours)
  try {
    const unreachableNotifs = notificationService.getRecentByCategory('device_unreachable', 1440)
    for (const notif of unreachableNotifs) {
      const dedupParts = notif.dedup_key?.split(':') ?? []
      const deviceType = dedupParts[1] ?? null
      const deviceId = dedupParts[2] ?? notif.source_id ?? null

      // Fall back to DB lookup when source_label was not set at notification creation time
      const deviceLabel = notif.source_label
        ?? (deviceType && deviceId ? resolveDeviceLabel(deviceType, deviceId) : null)

      // Skip notifications for devices that no longer exist
      if (!deviceLabel) continue

      items.push({
        id: `device-unreachable-${notif.id}`,
        severity: notif.severity as AttentionItem['severity'],
        category: 'device_unreachable',
        title: notif.title,
        description: notif.occurrence_count > 1
          ? `${notif.message} (${notif.occurrence_count} occurrences)`
          : notif.message,
        deviceId,
        deviceLabel,
        deviceSource: deviceType ? mapDeviceSource(deviceType) : null,
        action: 'deactivate',
        deviceType,
      })
    }
  } catch {
    // Ignore notification query errors
  }

  // Device online notifications — deactivated devices that came back (last 24 hours)
  try {
    const onlineNotifs = notificationService.getRecentByCategory('device_online', 1440)
    for (const notif of onlineNotifs) {
      const dedupParts = notif.dedup_key?.split(':') ?? []
      const deviceType = dedupParts[1] ?? null
      const deviceId = dedupParts[2] ?? notif.source_id ?? null

      const deviceLabel = notif.source_label
        ?? (deviceType && deviceId ? resolveDeviceLabel(deviceType, deviceId) : null)

      // Skip notifications for devices that no longer exist
      if (!deviceLabel) continue

      items.push({
        id: `device-online-${notif.id}`,
        severity: notif.severity as AttentionItem['severity'],
        category: 'device_online',
        title: notif.title,
        description: notif.occurrence_count > 1
          ? `${notif.message} (${notif.occurrence_count} occurrences)`
          : notif.message,
        deviceId,
        deviceLabel,
        deviceSource: deviceType ? mapDeviceSource(deviceType) : null,
        action: 'reactivate',
        deviceType,
      })
    }
  } catch {
    // Ignore notification query errors
  }

  return items
}

// ── Main export ─────────────────────────────────────────────────────────────

export function invalidateInsightsCache(): void {
  cachedInsights = null
  cacheTimestamp = 0
}

/** Returns the most recent cached insights without triggering a recompute. */
export function getCachedInsights(): InsightsData | null {
  return cachedInsights
}

export async function computeInsights(state: CurrentState): Promise<InsightsData> {
  const now = Date.now()
  if (cachedInsights && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedInsights
  }

  const energy = await computeEnergyInsights(state.power, state.energyRate)
  const temperature = computeTemperatureInsights(state.rooms, state.weather)
  const lux = computeLuxInsights(state.rooms)
  const battery = computeBatteryInsights(state.battery)
  const activity = computeActivityInsights()
  const attention = computeAttentionItems(
    state.battery,
    battery,
    energy,
    temperature,
  )

  const insights: InsightsData = { energy, temperature, lux, battery, activity, attention }
  cachedInsights = insights
  cacheTimestamp = now

  return insights
}
