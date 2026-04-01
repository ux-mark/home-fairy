import { useQuery } from '@tanstack/react-query'
import { Cloud, Droplets, Wind } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/Skeleton'

export function WeatherCard() {
  const { data: weather, isError, isLoading } = useQuery({
    queryKey: ['system', 'weather'],
    queryFn: api.system.getWeather,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  if (isLoading) {
    return (
      <div className="card mb-6 flex items-center gap-4 rounded-xl border px-4 py-3">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="card mb-6 rounded-xl border px-4 py-3">
        <p className="text-caption text-sm">Weather unavailable</p>
      </div>
    )
  }

  if (!weather) return null

  const useFahrenheit = prefs?.temp_unit === 'F'
  const displayTemp = useFahrenheit
    ? Math.round(weather.temp * 9 / 5 + 32)
    : Math.round(weather.temp)
  const unit = useFahrenheit ? 'F' : 'C'

  return (
    <div className="card mb-6 flex items-center gap-4 rounded-xl border px-4 py-3">
      {weather.icon ? (
        <img
          src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
          alt={weather.description}
          className="h-12 w-12"
        />
      ) : (
        <Cloud className="text-body h-8 w-8" />
      )}
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-heading text-2xl font-semibold">
            {displayTemp}&deg;{unit}
          </span>
          <span className="text-body text-sm capitalize">
            {weather.description}
          </span>
        </div>
        <div className="text-caption mt-1 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <Droplets className="h-3 w-3" />
            {weather.humidity}%
          </span>
          <span className="flex items-center gap-1">
            <Wind className="h-3 w-3" />
            {Math.round(weather.wind_speed)} m/s
          </span>
        </div>
      </div>
    </div>
  )
}
