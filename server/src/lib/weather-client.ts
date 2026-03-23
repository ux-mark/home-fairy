import axios from 'axios'

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

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let cache: WeatherCache | null = null

export async function getCurrentWeather(): Promise<WeatherData> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data
  }

  const apiKey = process.env.OPENWEATHER_API
  const lat = process.env.LATITUDE
  const lon = process.env.LONGITUDE

  if (!apiKey || !lat || !lon) {
    throw new Error('Missing OPENWEATHER_API, LATITUDE, or LONGITUDE env vars')
  }

  try {
    const res = await axios.get(
      'https://api.openweathermap.org/data/3.0/onecall',
      {
        params: {
          lat,
          lon,
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
