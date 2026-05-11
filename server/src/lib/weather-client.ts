import axios from 'axios'
import { getOne } from '../db/index.js'
import { getLocation, getWeather } from './settings-store.js'

interface WeatherData {
  temp: number
  description: string
  main: string      // condition group e.g. "Rain", "Clear", "Clouds"
  id: number        // specific condition code e.g. 801, 500
  icon: string
  humidity: number
  wind_speed: number
}

interface WeatherCache {
  data: WeatherData
  fetchedAt: number
}

// Floor on the cache budget. Even if the user sets the indicator to 1 minute
// for some reason, never hit OpenWeather more than once every 5 minutes.
const MIN_BUDGET_MS = 5 * 60 * 1000
const DEFAULT_INTERVAL_MIN = 15
let cache: WeatherCache | null = null

/**
 * Read the user's "Check every X min" setting (from the Weather Indicator
 * preferences) and turn it into a cache budget in ms. This is the budget
 * background callers (indicator timer, history-collector) use by default,
 * so the user-facing dial actually governs OpenWeather hit rate.
 */
function getConfiguredCacheBudgetMs(): number {
  try {
    const row = getOne<{ value: string }>(
      "SELECT value FROM current_state WHERE key = 'pref_weather_indicator'",
    )
    if (!row?.value) return Math.max(MIN_BUDGET_MS, DEFAULT_INTERVAL_MIN * 60_000)
    const cfg = JSON.parse(row.value) as { intervalMinutes?: number }
    const minutes = typeof cfg.intervalMinutes === 'number' && cfg.intervalMinutes > 0
      ? cfg.intervalMinutes
      : DEFAULT_INTERVAL_MIN
    return Math.max(MIN_BUDGET_MS, minutes * 60_000)
  } catch {
    return Math.max(MIN_BUDGET_MS, DEFAULT_INTERVAL_MIN * 60_000)
  }
}

/**
 * Fetch (or return cached) current weather. `maxAgeMs` is the staleness
 * budget the *caller* will accept — pass an explicit value when a caller
 * needs fresher data than the user's background setting allows (e.g. the
 * UI route uses a fixed 5 min so opening the home page doesn't show
 * 60-min-old weather even when the user has the indicator dialled high).
 *
 * Without an argument, the budget defaults to the user-configured
 * indicator interval, which is what every scheduled background caller
 * wants.
 */
export async function getCurrentWeather(maxAgeMs?: number): Promise<WeatherData> {
  const budget = maxAgeMs ?? getConfiguredCacheBudgetMs()
  if (cache && Date.now() - cache.fetchedAt < budget) {
    return cache.data
  }

  const { apiKey } = getWeather()
  const { latitude, longitude } = getLocation()

  if (!apiKey) {
    throw new Error('OpenWeather API key not configured — set it in Settings')
  }
  if (
    typeof latitude !== 'number' || !Number.isFinite(latitude) ||
    typeof longitude !== 'number' || !Number.isFinite(longitude)
  ) {
    throw new Error('Location not configured — set Latitude and Longitude in Settings')
  }

  try {
    const res = await axios.get(
      'https://api.openweathermap.org/data/3.0/onecall',
      {
        params: {
          lat: latitude,
          lon: longitude,
          appid: apiKey,
          units: 'metric',
        },
        timeout: 10000,
      },
    )

    const current = res.data.current
    const weather: WeatherData = {
      temp: current.temp,
      description: current.weather?.[0]?.description ?? '',
      main: current.weather?.[0]?.main ?? '',
      id: current.weather?.[0]?.id ?? 0,
      icon: current.weather?.[0]?.icon ?? '',
      humidity: current.humidity,
      wind_speed: current.wind_speed,
    }

    cache = { data: weather, fetchedAt: Date.now() }
    return weather
  } catch (err) {
    // Return stale cache on network errors instead of failing
    if (cache) {
      console.warn('Weather API failed, returning stale cache:', err instanceof Error ? err.message : String(err))
      return cache.data
    }
    throw err
  }
}
