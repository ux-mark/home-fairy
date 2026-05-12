import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { LocationSettingsDto } from '@/lib/api'

/**
 * Read the configured location (latitude, longitude, timezone, locale)
 * from the Settings UI / app_settings store.
 *
 * Phase 5 landing pad: this hook exists so future surfaces that need to
 * format date/time values can thread the configured `locale` + `timezone`
 * through `Intl.DateTimeFormat` (or `toLocaleString(locale, { timeZone })`)
 * rather than relying on the browser default.
 *
 * No prominent client surface (header clock, dashboard time, etc.) needs
 * this yet — the existing `toLocaleX` call sites are either deliberately
 * locale-neutral (HH:MM string formatting in the schedule UI) or already
 * follow the browser default. A future WI that introduces a clock should
 * import this hook instead of reading the browser locale.
 *
 * @example
 *   const { data: location } = useLocationSettings()
 *   const locale = location?.locale ?? undefined
 *   const tz = location?.timezone ?? undefined
 *   const label = new Date().toLocaleTimeString(locale, { timeZone: tz })
 */
export function useLocationSettings() {
  return useQuery({
    queryKey: ['settings', 'location'],
    queryFn: () => api.settings.getGroup<LocationSettingsDto>('location'),
    staleTime: 5 * 60 * 1000,
  })
}
