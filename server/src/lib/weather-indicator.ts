import { lifxClient } from './lifx-client.js'
import { getCurrentWeather } from './weather-client.js'
import { getOne, run } from '../db/index.js'

/**
 * Weather condition → light colour mapping
 *
 * All colours are light-friendly: high saturation, no grey (grey = no brightness on a light).
 * Overcast uses a cool steel blue instead of grey. Clear/sunny is warm golden.
 *
 * Maps to OpenWeather condition groups (2xx-8xx):
 * https://openweathermap.org/weather-conditions
 */
export const WEATHER_COLORS: Record<string, { color: string; name: string; hex: string; description: string }> = {
  // Clear sky (800) — warm golden yellow (sunny!)
  clear: { color: 'hue:50 saturation:0.9 brightness:1.0', name: 'Clear / Sunny', hex: '#ffd919', description: 'Clear sky' },

  // Few/scattered clouds (801-802) — olive/warm yellow (user's original)
  few_clouds: { color: 'hue:50 saturation:0.6 brightness:0.7', name: 'Some Clouds', hex: '#b3a147', description: '11-50% cloud cover' },

  // Broken/overcast clouds (803-804) — cool steel blue (NOT grey)
  overcast: { color: 'hue:210 saturation:0.45 brightness:0.65', name: 'Very Cloudy', hex: '#5b80a6', description: '51-100% cloud cover' },

  // Drizzle (3xx) — teal (user's original)
  drizzle: { color: 'hue:190 saturation:0.6 brightness:0.85', name: 'Drizzle', hex: '#57c3d9', description: 'Light drizzle or shower' },

  // Rain (5xx light-moderate) — vivid blue (user's original)
  rain: { color: 'hue:225 saturation:0.9 brightness:0.9', name: 'Rain', hex: '#1745e6', description: 'Light to moderate rain' },

  // Heavy rain (502-504, 522) — deep blue (brighter than before)
  heavy_rain: { color: 'hue:230 saturation:0.9 brightness:0.7', name: 'Heavy Rain', hex: '#1230b3', description: 'Heavy or extreme rain' },

  // Freezing rain (511) — ice blue
  freezing_rain: { color: 'hue:195 saturation:0.7 brightness:0.9', name: 'Freezing Rain', hex: '#45bde6', description: 'Freezing rain or sleet' },

  // Thunderstorm (2xx) — vivid purple (user's original)
  thunderstorm: { color: 'hue:275 saturation:0.8 brightness:0.8', name: 'Thunderstorm', hex: '#7033cc', description: 'Thunderstorms, possibly with rain' },

  // Snow (6xx) — teal-green (user's original)
  snow: { color: 'hue:160 saturation:0.6 brightness:0.85', name: 'Snow', hex: '#57d9ad', description: 'Snow, sleet, or shower snow' },

  // Mist / Fog (701, 741) — soft lavender/mauve (user's Atmosphere colour)
  mist: { color: 'hue:280 saturation:0.25 brightness:0.75', name: 'Mist / Fog', hex: '#af8fbf', description: 'Mist, fog, or haze' },

  // Haze / Smoke / Dust (711, 721, 731, 751, 761) — warm muted amber
  haze: { color: 'hue:30 saturation:0.6 brightness:0.7', name: 'Haze / Smoke', hex: '#b37d47', description: 'Haze, smoke, dust, or sand' },

  // Squall / Tornado (771, 781) — intense red-orange (urgent/danger)
  severe: { color: 'hue:5 saturation:1.0 brightness:1.0', name: 'Severe Weather', hex: '#ff1500', description: 'Squalls, tornado, or volcanic ash' },
}

/**
 * Map OpenWeather condition to our colour key
 * Uses both the main group and specific ID for precise matching
 */
function getWeatherColorKey(main: string, id?: number): string {
  switch (main) {
    case 'Thunderstorm':
      return 'thunderstorm'

    case 'Drizzle':
      return 'drizzle'

    case 'Rain':
      if (id && (id >= 502 && id <= 504 || id === 522)) return 'heavy_rain'
      if (id === 511) return 'freezing_rain'
      return 'rain'

    case 'Snow':
      if (id && (id === 611 || id === 612 || id === 613)) return 'freezing_rain' // sleet
      return 'snow'

    case 'Mist':
    case 'Fog':
      return 'mist'

    case 'Haze':
    case 'Smoke':
    case 'Dust':
    case 'Sand':
      return 'haze'

    case 'Ash':
    case 'Squall':
    case 'Tornado':
      return 'severe'

    case 'Clear':
      return 'clear'

    case 'Clouds':
      if (id && id <= 802) return 'few_clouds'
      return 'overcast'

    default:
      return 'clear'
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

  // Check if the indicator light's room blocks activation
  // (room has auto disabled, manual scene override, or system is in Night/Guest Night mode)
  private isLightRoomBlocked(lightId: string): boolean {
    const lightRoom = getOne<{ room_name: string }>(
      'SELECT room_name FROM light_rooms WHERE light_id = ?',
      [lightId],
    )
    if (!lightRoom) return false // light not assigned to a room — allow

    const room = getOne<{ auto: number; scene_manual: number }>(
      'SELECT auto, scene_manual FROM rooms WHERE name = ?',
      [lightRoom.room_name],
    )
    if (!room) return false

    if (!room.auto) {
      run('INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Weather indicator skipped: room "${lightRoom.room_name}" has automation disabled`, 'weather'])
      return true
    }
    if (room.scene_manual) {
      run('INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Weather indicator skipped: room "${lightRoom.room_name}" has manual scene override`, 'weather'])
      return true
    }

    // Check if current mode is Night or Guest Night (rooms would be locked)
    const modeRow = getOne<{ value: string }>("SELECT value FROM current_state WHERE key = 'mode'")
    const mode = modeRow?.value ?? ''
    if (mode === 'Night' || mode === 'Guest Night') {
      run('INSERT INTO logs (message, category) VALUES (?, ?)',
        [`Weather indicator skipped: system is in ${mode} mode`, 'weather'])
      return true
    }

    return false
  }

  async checkAndUpdate(): Promise<{ condition: string; color: string } | null> {
    const config = this.getConfig()
    if (!config.enabled || !config.lightId) return null

    // Skip if the light's room is blocked
    if (this.isLightRoomBlocked(config.lightId)) return null

    try {
      const weather = await getCurrentWeather()
      if (!weather) return null

      const conditionKey = getWeatherColorKey(weather.main || weather.description, weather.id)
      const defaultColorInfo = WEATHER_COLORS[conditionKey] || WEATHER_COLORS.clear

      // Check for custom colour overrides
      const customRow = getOne<{ value: string }>("SELECT value FROM current_state WHERE key = 'pref_weather_custom_colors'")
      let customColors: Record<string, { color: string; hex: string }> = {}
      try { customColors = customRow?.value ? JSON.parse(customRow.value) : {} } catch { /* ignore */ }
      const customColor = customColors[conditionKey]

      const colorInfo = {
        ...defaultColorInfo,
        color: customColor?.color ?? defaultColorInfo.color,
        hex: customColor?.hex ?? defaultColorInfo.hex,
      }

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
