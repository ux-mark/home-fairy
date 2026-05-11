/**
 * settings-store — in-process cache + DB-backed persistence for user-facing
 * settings that used to live in process.env.
 *
 * Phase 1 (WI #4): introduces the store and seeds from env on first boot.
 * Phase 2 will migrate the actual readers (sun-tracker, weather-client,
 * Hubitat/LIFX/Spotify clients) onto these accessors.
 *
 * Conventions:
 *   - One row per setting in `app_settings`, key = `<group>.<field>`.
 *   - Values are JSON-encoded so we round-trip scalars and objects faithfully.
 *   - The cache is hydrated synchronously at boot. Reads are sync after that.
 *   - Writes update the DB then the cache slot in the same call.
 */

import { db, run, getAll } from '../db/index.js'

// ---------- Group shapes ----------

export interface LocationSettings {
  latitude: number | null
  longitude: number | null
  timezone: string
  locale: string
}

export interface HubitatSettings {
  baseUrl: string | null
  token: string | null
  webhookSecret: string | null
}

export interface LifxSettings {
  token: string | null
}

export interface WeatherSettings {
  apiKey: string | null
}

export interface SpotifySettings {
  clientId: string | null
  clientSecret: string | null
  redirectUri: string | null
}

export type SettingsGroup =
  | 'location'
  | 'hubitat'
  | 'lifx'
  | 'weather'
  | 'spotify'

// ---------- Defaults + env source map ----------

const LOCATION_DEFAULTS: LocationSettings = {
  latitude: null,
  longitude: null,
  timezone: 'Europe/Dublin',
  locale: 'en-IE',
}

// Each entry maps `<group>.<field>` to the env var it should seed from
// (null = no env source; default applies). Order matters only for log output.
const ENV_SEED_MAP: ReadonlyArray<{
  key: string
  envVar: string | null
  parse?: (raw: string) => unknown
  defaultValue?: unknown
}> = [
  { key: 'location.latitude', envVar: 'LATITUDE', parse: (v) => Number(v), defaultValue: null },
  { key: 'location.longitude', envVar: 'LONGITUDE', parse: (v) => Number(v), defaultValue: null },
  { key: 'location.timezone', envVar: null, defaultValue: LOCATION_DEFAULTS.timezone },
  { key: 'location.locale', envVar: null, defaultValue: LOCATION_DEFAULTS.locale },
  { key: 'hubitat.baseUrl', envVar: 'HUB_BASE_URL', defaultValue: null },
  { key: 'hubitat.token', envVar: 'HUBITAT_TOKEN', defaultValue: null },
  { key: 'hubitat.webhookSecret', envVar: 'HUBITAT_WEBHOOK_SECRET', defaultValue: null },
  { key: 'lifx.token', envVar: 'LIFX_TOKEN', defaultValue: null },
  { key: 'weather.apiKey', envVar: 'OPENWEATHER_API', defaultValue: null },
  { key: 'spotify.clientId', envVar: 'SPOTIFY_CLIENT_ID', defaultValue: null },
  { key: 'spotify.clientSecret', envVar: 'SPOTIFY_CLIENT_SECRET', defaultValue: null },
  { key: 'spotify.redirectUri', envVar: 'SPOTIFY_REDIRECT_URI', defaultValue: null },
]

// ---------- In-process cache ----------

const cache = new Map<string, unknown>()
let hydrated = false

function assertHydrated(): void {
  if (!hydrated) {
    throw new Error('[settings-store] not hydrated — call hydrate() at boot before reads')
  }
}

// ---------- Hydrate + seed ----------

/**
 * Load every row from app_settings into the in-process cache. Must run
 * exactly once at boot, before HTTP starts listening.
 */
export function hydrate(): void {
  const rows = getAll<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings',
  )
  cache.clear()
  for (const row of rows) {
    try {
      cache.set(row.key, JSON.parse(row.value))
    } catch {
      // Corrupt JSON — log and skip; better than crashing the boot.
      console.warn(`[settings-store] dropping corrupt value for key="${row.key}"`)
    }
  }
  hydrated = true
}

/**
 * For each entry in ENV_SEED_MAP, if the DB row is missing, write a seeded
 * value (env var if present, else the declared default). Existing rows are
 * not overwritten — re-running this on later boots is a no-op for any key
 * the user has already set.
 */
export function seedFromEnvIfMissing(): void {
  assertHydrated()

  const seeded: string[] = []
  for (const entry of ENV_SEED_MAP) {
    if (cache.has(entry.key)) continue

    let value: unknown
    const envValue = entry.envVar ? process.env[entry.envVar] : undefined
    if (envValue !== undefined && envValue !== '') {
      value = entry.parse ? entry.parse(envValue) : envValue
      // Guard against NaN from numeric parses
      if (typeof value === 'number' && !Number.isFinite(value)) {
        value = entry.defaultValue ?? null
      }
    } else {
      value = entry.defaultValue ?? null
    }

    setSetting(entry.key, value)
    seeded.push(entry.key)
  }

  if (seeded.length > 0) {
    console.log(`[settings-store] seeded ${seeded.length} keys: ${seeded.join(', ')}`)
  }
}

// ---------- Generic accessors ----------

export function getSetting<T>(key: string): T | null {
  assertHydrated()
  const raw = cache.get(key)
  return (raw === undefined ? null : raw) as T | null
}

export function setSetting(key: string, value: unknown): void {
  const encoded = JSON.stringify(value ?? null)
  run(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, encoded],
  )
  cache.set(key, value ?? null)
}

// ---------- Group accessors ----------

export function getLocation(): LocationSettings {
  assertHydrated()
  return {
    latitude: (cache.get('location.latitude') as number | null) ?? null,
    longitude: (cache.get('location.longitude') as number | null) ?? null,
    timezone: (cache.get('location.timezone') as string | null) ?? LOCATION_DEFAULTS.timezone,
    locale: (cache.get('location.locale') as string | null) ?? LOCATION_DEFAULTS.locale,
  }
}

export function setLocation(v: LocationSettings): void {
  setSetting('location.latitude', v.latitude)
  setSetting('location.longitude', v.longitude)
  setSetting('location.timezone', v.timezone)
  setSetting('location.locale', v.locale)
}

export function getHubitat(): HubitatSettings {
  assertHydrated()
  return {
    baseUrl: (cache.get('hubitat.baseUrl') as string | null) ?? null,
    token: (cache.get('hubitat.token') as string | null) ?? null,
    webhookSecret: (cache.get('hubitat.webhookSecret') as string | null) ?? null,
  }
}

export function setHubitat(v: HubitatSettings): void {
  setSetting('hubitat.baseUrl', v.baseUrl)
  setSetting('hubitat.token', v.token)
  setSetting('hubitat.webhookSecret', v.webhookSecret)
}

export function getLifx(): LifxSettings {
  assertHydrated()
  return {
    token: (cache.get('lifx.token') as string | null) ?? null,
  }
}

export function setLifx(v: LifxSettings): void {
  setSetting('lifx.token', v.token)
}

export function getWeather(): WeatherSettings {
  assertHydrated()
  return {
    apiKey: (cache.get('weather.apiKey') as string | null) ?? null,
  }
}

export function setWeather(v: WeatherSettings): void {
  setSetting('weather.apiKey', v.apiKey)
}

export function getSpotify(): SpotifySettings {
  assertHydrated()
  return {
    clientId: (cache.get('spotify.clientId') as string | null) ?? null,
    clientSecret: (cache.get('spotify.clientSecret') as string | null) ?? null,
    redirectUri: (cache.get('spotify.redirectUri') as string | null) ?? null,
  }
}

export function setSpotify(v: SpotifySettings): void {
  setSetting('spotify.clientId', v.clientId)
  setSetting('spotify.clientSecret', v.clientSecret)
  setSetting('spotify.redirectUri', v.redirectUri)
}

// ---------- Test-only helpers ----------

/**
 * Reset the in-process cache and hydration state. Intended for unit tests
 * only; do not call from runtime code. Does NOT touch the DB.
 */
export function _resetForTests(): void {
  cache.clear()
  hydrated = false
}

// Re-export the underlying db handle for tests that need to seed rows
// directly. Keeps the import surface narrow for production callers.
export { db as _db }
