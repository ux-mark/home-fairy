import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { LocationSettingsDto, SettingsTestResult } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Section } from './Section'
import { TestResultBadge } from './TestResultBadge'

const TZ_FALLBACK = [
  'Europe/Dublin',
  'Europe/London',
  'America/New_York',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
]

const LOCALE_SUGGESTIONS = ['en-IE', 'en-GB', 'en-US', 'fr-FR', 'de-DE', 'es-ES']

function supportedTimezones(): string[] {
  // Safari ≥ 16.4 supports Intl.supportedValuesOf, older Safari throws.
  type IntlWithSupported = typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }
  const intl = Intl as IntlWithSupported
  try {
    if (typeof intl.supportedValuesOf === 'function') {
      return intl.supportedValuesOf('timeZone')
    }
  } catch { /* fall through */ }
  return TZ_FALLBACK
}

export function LocationLocaleSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'location'],
    queryFn: () => api.settings.getGroup<LocationSettingsDto>('location'),
  })

  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [tz, setTz] = useState('')
  const [locale, setLocale] = useState('')
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null)

  useEffect(() => {
    if (!data) return
    setLat(data.latitude === null ? '' : String(data.latitude))
    setLon(data.longitude === null ? '' : String(data.longitude))
    setTz(data.timezone)
    setLocale(data.locale)
  }, [data])

  const tzOptions = useMemo(supportedTimezones, [])

  const latError = useMemo(() => {
    if (lat === '') return null
    const n = Number(lat)
    if (!Number.isFinite(n)) return 'Must be a number'
    if (n < -90 || n > 90) return 'Must be between -90 and 90'
    return null
  }, [lat])

  const lonError = useMemo(() => {
    if (lon === '') return null
    const n = Number(lon)
    if (!Number.isFinite(n)) return 'Must be a number'
    if (n < -180 || n > 180) return 'Must be between -180 and 180'
    return null
  }, [lon])

  const isDirty = useMemo(() => {
    if (!data) return false
    return (
      lat !== (data.latitude === null ? '' : String(data.latitude)) ||
      lon !== (data.longitude === null ? '' : String(data.longitude)) ||
      tz !== data.timezone ||
      locale !== data.locale
    )
  }, [data, lat, lon, tz, locale])

  const canSubmit = !latError && !lonError && tz && locale && isDirty

  const buildBody = (): LocationSettingsDto => ({
    latitude: lat === '' ? null : Number(lat),
    longitude: lon === '' ? null : Number(lon),
    timezone: tz,
    locale,
  })

  const saveMutation = useMutation({
    mutationFn: () => api.settings.putGroup<LocationSettingsDto>('location', buildBody()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'location'] })
      setTestResult(null)
      toast({ message: 'Settings saved' })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast({ message: `Couldn't save: ${msg}`, type: 'error' })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => api.settings.test<SettingsTestResult>('location', buildBody()),
    onSuccess: (result) => setTestResult(result),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setTestResult({ ok: false, error: msg })
    },
  })

  const canTest = !latError && !lonError && lat !== '' && lon !== '' && tz && locale

  const resetTestOnChange = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setTestResult(null)
  }

  return (
    <Section title="Location and locale">
      <p className="text-caption text-xs mb-4">
        Sets sunrise/sunset, weather, and date/time formatting throughout the app.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit && !saveMutation.isPending) saveMutation.mutate() }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="loc-lat" className="text-heading text-sm mb-1.5 block">Latitude</label>
            <input
              id="loc-lat"
              type="number"
              inputMode="decimal"
              step="any"
              min={-90}
              max={90}
              value={lat}
              onChange={(e) => resetTestOnChange(setLat)(e.target.value)}
              aria-invalid={!!latError}
              aria-describedby={latError ? 'loc-lat-err' : 'loc-lat-hint'}
              disabled={isLoading}
              className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
            />
            {latError ? (
              <p id="loc-lat-err" className="text-red-400 text-xs mt-1">{latError}</p>
            ) : (
              <p id="loc-lat-hint" className="text-caption text-xs mt-1">-90 to 90</p>
            )}
          </div>
          <div>
            <label htmlFor="loc-lon" className="text-heading text-sm mb-1.5 block">Longitude</label>
            <input
              id="loc-lon"
              type="number"
              inputMode="decimal"
              step="any"
              min={-180}
              max={180}
              value={lon}
              onChange={(e) => resetTestOnChange(setLon)(e.target.value)}
              aria-invalid={!!lonError}
              aria-describedby={lonError ? 'loc-lon-err' : 'loc-lon-hint'}
              disabled={isLoading}
              className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
            />
            {lonError ? (
              <p id="loc-lon-err" className="text-red-400 text-xs mt-1">{lonError}</p>
            ) : (
              <p id="loc-lon-hint" className="text-caption text-xs mt-1">-180 to 180</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="loc-tz" className="text-heading text-sm mb-1.5 block">Timezone</label>
          <input
            id="loc-tz"
            type="text"
            list="loc-tz-list"
            value={tz}
            onChange={(e) => resetTestOnChange(setTz)(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            placeholder="Europe/Dublin"
            className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
          />
          <datalist id="loc-tz-list">
            {tzOptions.map((z) => <option key={z} value={z} />)}
          </datalist>
        </div>

        <div>
          <label htmlFor="loc-locale" className="text-heading text-sm mb-1.5 block">Locale</label>
          <input
            id="loc-locale"
            type="text"
            list="loc-locale-list"
            value={locale}
            onChange={(e) => resetTestOnChange(setLocale)(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            placeholder="en-IE"
            className="input-field h-11 w-full rounded-lg border px-3 text-sm focus:border-fairy-500 focus:outline-none"
          />
          <datalist id="loc-locale-list">
            {LOCALE_SUGGESTIONS.map((l) => <option key={l} value={l} />)}
          </datalist>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={!canSubmit || saveMutation.isPending}
            className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={!canTest || testMutation.isPending}
            className="rounded-lg px-4 py-2 min-h-[44px] surface border border-[var(--border-secondary)] text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {testMutation.isPending ? 'Testing…' : 'Test'}
          </button>
          <TestResultBadge
            result={testResult}
            loading={testMutation.isPending}
            renderOk={(r) =>
              r.sunrise && r.sunset && r.now
                ? `Sunrise ${r.sunrise}, sunset ${r.sunset} (now ${r.now} in ${r.timezone ?? ''})`
                : 'OK'
            }
          />
        </div>
      </form>
    </Section>
  )
}
