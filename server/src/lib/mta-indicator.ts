// MTA subway indicator light manager
// Manages periodic light updates after a motion trigger, updating every 30s
// for the full decision window (walkTime + maxWaitMinutes), then reverts.

import { getOne, run } from '../db/index.js'
import { lifxClient } from './lifx-client.js'
import { mtaClient } from './mta-client.js'

interface CurrentStateRow {
  key: string
  value: string
  updated_at: string
}

interface ConfiguredStop {
  stopId: string
  name: string
  direction: string
  routes: string[]
  feedGroup: string
  walkTime: number
  enabled: boolean
}

interface MtaIndicatorConfig {
  enabled: boolean
  lightId: string
  lightLabel: string
  sensorName: string
}

const STATUS_COLORS: Record<string, string> = {
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  none: '#6b7280',
}

const STATUS_PRIORITY: Record<string, number> = { green: 3, orange: 2, red: 1, none: 0 }

const UPDATE_INTERVAL_MS = 30_000 // 30 seconds — matches MTA feed refresh rate

function log(message: string): void {
  try {
    run('INSERT INTO logs (message, category) VALUES (?, ?)', [message, 'mta-indicator'])
  } catch {
    console.log(`[mta-indicator] ${message}`)
  }
}

class MtaIndicatorManager {
  private updateTimer: NodeJS.Timeout | null = null
  private windowTimer: NodeJS.Timeout | null = null
  private isActive = false
  private currentLightId: string | null = null

  /**
   * Trigger the indicator cycle. Cancels any existing cycle, saves the light's
   * current state, then updates every 30s for the full decision window.
   */
  async trigger(): Promise<{ status: string; color: string; windowMinutes: number }> {
    // Read config
    const config = this.readIndicatorConfig()
    if (!config.lightId) {
      throw new Error('No indicator light configured')
    }

    const { enabledStops, maxWaitMinutes } = this.readStopsConfig()
    if (enabledStops.length === 0) {
      throw new Error('No subway stops configured')
    }

    // Cancel existing cycle if running
    if (this.isActive) {
      this.clearTimers()
    }

    this.isActive = true
    this.currentLightId = config.lightId

    // Compute window: max walk time across all stops + platform wait tolerance
    const maxWalkTime = Math.max(...enabledStops.map(s => s.walkTime))
    const windowMinutes = maxWalkTime + maxWaitMinutes
    const windowMs = windowMinutes * 60 * 1000

    // Run first update immediately
    const initialStatus = await this.updateLight()

    // Schedule periodic updates every 30s
    this.updateTimer = setInterval(async () => {
      if (!this.isActive) return
      try {
        await this.updateLight()
      } catch (err) {
        log(`Update error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, UPDATE_INTERVAL_MS)

    // Schedule revert after the full decision window
    this.windowTimer = setTimeout(() => {
      this.stop()
    }, windowMs)

    log(`Indicator started: ${initialStatus} for ${windowMinutes} min window (walk ${maxWalkTime} + wait ${maxWaitMinutes})`)

    return {
      status: initialStatus,
      color: STATUS_COLORS[initialStatus] || STATUS_COLORS.none,
      windowMinutes,
    }
  }

  /**
   * Fetch current status from all configured stops and update the light.
   */
  private async updateLight(): Promise<string> {
    if (!this.isActive || !this.currentLightId) return 'none'

    const { enabledStops, maxWaitMinutes } = this.readStopsConfig()
    if (enabledStops.length === 0) {
      return 'none'
    }

    // Fetch status for each stop, find the best
    let bestStatus = 'none'
    let failedCount = 0
    for (const stop of enabledStops) {
      try {
        const result = await mtaClient.getStatus(
          stop.stopId, stop.direction, stop.routes,
          stop.feedGroup, stop.walkTime, maxWaitMinutes,
        )
        if (STATUS_PRIORITY[result.status] > STATUS_PRIORITY[bestStatus]) {
          bestStatus = result.status
        }
      } catch (err) {
        failedCount++
      }
    }
    if (failedCount > 0 && failedCount === enabledStops.length) {
      log(`All ${failedCount} MTA stops failed to fetch`)
    }

    const color = STATUS_COLORS[bestStatus] || STATUS_COLORS.none
    const selector = `id:${this.currentLightId}`

    // Set the light colour
    await lifxClient.setState(selector, {
      power: 'on',
      color,
      brightness: 1,
      duration: 0.5,
    })

    // For orange/red, add a breathe effect for urgency
    if (bestStatus === 'orange' || bestStatus === 'red') {
      await lifxClient.breathe(selector, {
        color,
        period: bestStatus === 'red' ? 1 : 2,
        cycles: bestStatus === 'red' ? 10 : 5,
        persist: false,
        power_on: true,
      })
    }

    log(`Light updated: ${bestStatus}`)
    return bestStatus
  }

  /**
   * Stop the update cycle and turn the light off.
   */
  stop(): void {
    if (!this.isActive) return

    this.clearTimers()
    this.isActive = false

    // Turn the light off (best effort, async fire-and-forget)
    if (this.currentLightId) {
      const selector = `id:${this.currentLightId}`

      ;(async () => {
        try {
          await lifxClient.setState(selector, { power: 'off', duration: 1 })
          log('Indicator light turned off')
        } catch (err) {
          log(`Turn off error: ${err instanceof Error ? err.message : String(err)}`)
        }
      })()
    }

    this.currentLightId = null
  }

  get active(): boolean {
    return this.isActive
  }

  private clearTimers(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = null
    }
    if (this.windowTimer) {
      clearTimeout(this.windowTimer)
      this.windowTimer = null
    }
  }


  private readIndicatorConfig(): MtaIndicatorConfig {
    const row = getOne<CurrentStateRow>("SELECT * FROM current_state WHERE key = 'pref_mta_indicator'")
    try {
      return row?.value ? JSON.parse(row.value) : { enabled: false, lightId: '', lightLabel: '', sensorName: '' }
    } catch {
      return { enabled: false, lightId: '', lightLabel: '', sensorName: '' }
    }
  }

  private readStopsConfig(): { enabledStops: ConfiguredStop[]; maxWaitMinutes: number } {
    const stopsRow = getOne<CurrentStateRow>("SELECT * FROM current_state WHERE key = 'pref_mta_stops'")
    let stops: ConfiguredStop[] = []
    try { stops = stopsRow?.value ? JSON.parse(stopsRow.value) : [] } catch { stops = [] }

    const maxWaitRow = getOne<CurrentStateRow>("SELECT * FROM current_state WHERE key = 'pref_mta_max_wait'")
    const maxWaitMinutes = maxWaitRow?.value ? Number(maxWaitRow.value) : 6

    return {
      enabledStops: stops.filter(s => s.enabled),
      maxWaitMinutes,
    }
  }
}

export const mtaIndicator = new MtaIndicatorManager()
