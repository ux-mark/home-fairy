import { lifxClient } from './lifx-client.js'
import { getCurrentWeather } from './weather-client.js'
import { getOne, run } from '../db/index.js'

export const WEATHER_COLORS: Record<string, { color: string; name: string; hex: string }> = {
  // Group 2xx: Thunderstorm
  thunderstorm: { color: 'hue:280 saturation:0.8', name: 'Thunderstorm', hex: '#7c3aed' },

  // Group 3xx: Drizzle
  drizzle: { color: 'hue:190 saturation:0.5', name: 'Drizzle', hex: '#22d3ee' },

  // Group 5xx: Rain
  rain: { color: 'hue:230 saturation:1.0', name: 'Rain', hex: '#2563eb' },

  // Group 6xx: Snow
  snow: { color: 'hue:160 saturation:0.4', name: 'Snow', hex: '#2dd4bf' },

  // Group 7xx: Atmosphere (mist, fog, haze)
  atmosphere: { color: 'hue:280 saturation:0.2', name: 'Mist / Fog', hex: '#a78bfa' },

  // Group 800: Clear
  clear: { color: 'hue:45 saturation:0.8', name: 'Clear', hex: '#fbbf24' },

  // Group 801-802: Few/Scattered clouds
  some_clouds: { color: 'hue:50 saturation:0.4', name: 'Some Clouds', hex: '#a3a23a' },

  // Group 803-804: Broken/Overcast clouds
  overcast: { color: 'hue:30 saturation:0.1', name: 'Very Cloudy', hex: '#9ca3af' },
}

function getWeatherColorKey(main: string, id?: number): string {
  switch (main) {
    case 'Thunderstorm': return 'thunderstorm'
    case 'Drizzle': return 'drizzle'
    case 'Rain': return 'rain'
    case 'Snow': return 'snow'
    case 'Mist': case 'Smoke': case 'Haze': case 'Dust':
    case 'Fog': case 'Sand': case 'Ash': case 'Squall': case 'Tornado':
      return 'atmosphere'
    case 'Clear': return 'clear'
    case 'Clouds':
      if (id && id <= 802) return 'some_clouds'
      return 'overcast'
    default: return 'clear'
  }
}

export interface WeatherIndicatorConfig {
  enabled: boolean
  lightId: string
  lightLabel: string
  intervalMinutes: number  // how often to check (default 15)
  mode: 'always' | 'sensor'  // always on, or only when sensor triggers
  sensorName?: string  // if mode is 'sensor'
  brightness: number  // 0-1, how bright the weather light should be
}

class WeatherIndicator {
  private timer: NodeJS.Timeout | null = null
  private currentCondition: string | null = null

  start(): void {
    const config = this.getConfig()
    if (!config.enabled) return

    // Do an initial check
    this.checkAndUpdate()

    // Schedule periodic checks if in 'always' mode
    if (config.mode === 'always') {
      this.timer = setInterval(
        () => this.checkAndUpdate(),
        (config.intervalMinutes || 15) * 60 * 1000,
      )
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  restart(): void {
    this.stop()
    this.currentCondition = null
    this.start()
  }

  getConfig(): WeatherIndicatorConfig {
    const row = getOne<{ value: string }>(
      "SELECT value FROM current_state WHERE key = 'pref_weather_indicator'",
    )
    const defaults: WeatherIndicatorConfig = {
      enabled: false,
      lightId: '',
      lightLabel: '',
      intervalMinutes: 15,
      mode: 'always',
      brightness: 0.5,
    }
    try {
      return row?.value ? { ...defaults, ...JSON.parse(row.value) } : defaults
    } catch {
      return defaults
    }
  }

  async checkAndUpdate(): Promise<{ condition: string; color: string } | null> {
    const config = this.getConfig()
    if (!config.enabled || !config.lightId) return null

    try {
      const weather = await getCurrentWeather()
      if (!weather) return null

      const conditionKey = getWeatherColorKey(weather.main || weather.description, weather.id)
      const colorInfo = WEATHER_COLORS[conditionKey] || WEATHER_COLORS.clear

      // Only update if condition changed (to avoid unnecessary API calls)
      if (conditionKey !== this.currentCondition) {
        this.currentCondition = conditionKey

        await lifxClient.setState(`id:${config.lightId}`, {
          power: 'on',
          color: colorInfo.color,
          brightness: config.brightness,
          duration: 2,  // slow transition
        })

        run(
          'INSERT INTO logs (message, category) VALUES (?, ?)',
          [`Weather indicator: ${colorInfo.name} (${conditionKey})`, 'weather'],
        )
      }

      return { condition: conditionKey, color: colorInfo.hex }
    } catch (err) {
      console.error('Weather indicator error:', err)
      return null
    }
  }

  // For sensor-triggered mode
  async triggerOnce(): Promise<{ condition: string; color: string } | null> {
    this.currentCondition = null  // Force update
    return this.checkAndUpdate()
  }
}

export const weatherIndicator = new WeatherIndicator()
