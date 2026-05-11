/**
 * /api/settings/:group — read + update user-facing settings stored in
 * the app_settings table (see settings-store.ts).
 *
 * Secret handling:
 *   GET responses redact sensitive fields. A secret that has a value is
 *   returned as the literal string '<set>'; an unset secret is returned
 *   as null. We never echo the real value back.
 *
 *   PUT requests:
 *     - omit a secret field entirely → leave it unchanged
 *     - send null → clear it
 *     - send a string → replace it with the new value
 *
 * Validation:
 *   Strict Zod schemas per group. Latitude/longitude ranges enforced;
 *   timezone validated by `new Intl.DateTimeFormat`, locale by
 *   `new Intl.Locale`. Invalid input → 400 and the DB is untouched.
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  getLocation, setLocation,
  getHubitat, setHubitat,
  getLifx, setLifx,
  getWeather, setWeather,
  getSpotify, setSpotify,
  type SettingsGroup,
} from '../lib/settings-store.js'
import SunCalc from 'suncalc'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

// ---------- Validators ----------

const timezoneSchema = z.string().min(1).refine((v) => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: v })
    return true
  } catch {
    return false
  }
}, { message: 'Invalid IANA timezone' })

const localeSchema = z.string().min(2).refine((v) => {
  try {
    new Intl.Locale(v)
    return true
  } catch {
    return false
  }
}, { message: 'Invalid BCP-47 locale' })

const locationPutSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  timezone: timezoneSchema,
  locale: localeSchema,
})

// For groups containing secrets, PUT bodies allow:
//   - omitting the secret field (undefined → preserve existing)
//   - sending null (clear)
//   - sending a string (replace)
const hubitatPutSchema = z.object({
  baseUrl: z.string().url().nullable().optional(),
  token: z.string().nullable().optional(),
  webhookSecret: z.string().nullable().optional(),
})

const lifxPutSchema = z.object({
  token: z.string().nullable().optional(),
})

const weatherPutSchema = z.object({
  apiKey: z.string().nullable().optional(),
})

const spotifyPutSchema = z.object({
  clientId: z.string().nullable().optional(),
  clientSecret: z.string().nullable().optional(),
  redirectUri: z.string().url().nullable().optional(),
})

// ---------- Secret redaction helper ----------

function redact(value: string | null): string | null {
  return value === null || value === '' ? null : '<set>'
}

// ---------- Group serialisers (GET) ----------

function serialiseGroup(group: SettingsGroup): unknown {
  switch (group) {
    case 'location':
      // No secrets — return as-is.
      return getLocation()
    case 'hubitat': {
      const v = getHubitat()
      return {
        baseUrl: v.baseUrl,
        token: redact(v.token),
        webhookSecret: redact(v.webhookSecret),
      }
    }
    case 'lifx': {
      const v = getLifx()
      return { token: redact(v.token) }
    }
    case 'weather': {
      const v = getWeather()
      return { apiKey: redact(v.apiKey) }
    }
    case 'spotify': {
      const v = getSpotify()
      return {
        clientId: v.clientId,
        clientSecret: redact(v.clientSecret),
        redirectUri: v.redirectUri,
      }
    }
  }
}

// ---------- Routes ----------

const KNOWN_GROUPS: ReadonlyArray<SettingsGroup> = [
  'location', 'hubitat', 'lifx', 'weather', 'spotify',
]

function isKnownGroup(g: string): g is SettingsGroup {
  return (KNOWN_GROUPS as readonly string[]).includes(g)
}

router.get('/:group', (req: Request, res: Response) => {
  try {
    const group = String(req.params.group)
    if (!isKnownGroup(group)) {
      res.status(404).json({ error: `Unknown settings group: ${group}` })
      return
    }
    res.json(serialiseGroup(group))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

router.put('/:group', (req: Request, res: Response) => {
  try {
    const group = String(req.params.group)
    if (!isKnownGroup(group)) {
      res.status(404).json({ error: `Unknown settings group: ${group}` })
      return
    }

    switch (group) {
      case 'location': {
        const parsed = locationPutSchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid location', details: parsed.error.issues })
          return
        }
        setLocation(parsed.data)
        break
      }
      case 'hubitat': {
        const parsed = hubitatPutSchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid hubitat', details: parsed.error.issues })
          return
        }
        const current = getHubitat()
        setHubitat({
          baseUrl: parsed.data.baseUrl === undefined ? current.baseUrl : parsed.data.baseUrl,
          token: parsed.data.token === undefined ? current.token : parsed.data.token,
          webhookSecret: parsed.data.webhookSecret === undefined ? current.webhookSecret : parsed.data.webhookSecret,
        })
        break
      }
      case 'lifx': {
        const parsed = lifxPutSchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid lifx', details: parsed.error.issues })
          return
        }
        const current = getLifx()
        setLifx({
          token: parsed.data.token === undefined ? current.token : parsed.data.token,
        })
        break
      }
      case 'weather': {
        const parsed = weatherPutSchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid weather', details: parsed.error.issues })
          return
        }
        const current = getWeather()
        setWeather({
          apiKey: parsed.data.apiKey === undefined ? current.apiKey : parsed.data.apiKey,
        })
        break
      }
      case 'spotify': {
        const parsed = spotifyPutSchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid spotify', details: parsed.error.issues })
          return
        }
        const current = getSpotify()
        setSpotify({
          clientId: parsed.data.clientId === undefined ? current.clientId : parsed.data.clientId,
          clientSecret: parsed.data.clientSecret === undefined ? current.clientSecret : parsed.data.clientSecret,
          redirectUri: parsed.data.redirectUri === undefined ? current.redirectUri : parsed.data.redirectUri,
        })
        break
      }
    }

    res.json(serialiseGroup(group))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// ---------- Test endpoints ----------
//
// Each POST /api/settings/:group/test accepts the same body shape as the PUT
// for that group, runs a small upstream probe against the *form values*
// (resolving '<set>' for secrets to the persisted value first), and returns
// { ok: boolean, ...details } — never echoing the real secret.
//
// All upstream calls are capped at TEST_TIMEOUT_MS via AbortController; a
// timeout returns { ok: false, error: 'Timed out' }.

const TEST_TIMEOUT_MS = 5000

const SET_PLACEHOLDER = '<set>'

/**
 * Resolve a secret field for a test call:
 *   - undefined or '<set>' → use the value already in the store
 *   - any other string (including '') → use the value from the form
 *   - null → treated as unset (will fail the test if required)
 */
function resolveSecret(submitted: string | null | undefined, stored: string | null): string | null {
  if (submitted === undefined || submitted === SET_PLACEHOLDER) return stored
  return submitted
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<globalThis.Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'Timed out'
    return err.message
  }
  return String(err)
}

// Validate the *test-call* body: latitude/longitude must be real numbers,
// because the upstream probes (SunCalc, OpenWeather) need them.
const locationTestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: timezoneSchema,
  locale: localeSchema,
})

router.post('/location/test', (req: Request, res: Response) => {
  const parsed = locationTestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid location', details: parsed.error.issues })
    return
  }
  const { latitude, longitude, timezone } = parsed.data

  try {
    const now = new Date()
    const sun = SunCalc.getTimes(now, latitude, longitude)
    const fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    })
    res.json({
      ok: true,
      sunrise: fmt.format(sun.sunrise),
      sunset: fmt.format(sun.sunset),
      now: fmt.format(now),
      timezone,
    })
  } catch (err) {
    res.json({ ok: false, error: describeError(err) })
  }
})

router.post('/hubitat/test', async (req: Request, res: Response) => {
  const parsed = hubitatPutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid hubitat', details: parsed.error.issues })
    return
  }
  const stored = getHubitat()
  const baseUrl = parsed.data.baseUrl === undefined || parsed.data.baseUrl === SET_PLACEHOLDER
    ? stored.baseUrl
    : parsed.data.baseUrl
  const token = resolveSecret(parsed.data.token ?? undefined, stored.token)

  if (!baseUrl) { res.json({ ok: false, error: 'Set Base URL first' }); return }
  if (!token) { res.json({ ok: false, error: 'Set API token first' }); return }

  // The Hubitat Maker API list-devices endpoint is just GET on the configured
  // base URL with access_token. Same path that hubitat-client.listDevices uses.
  const url = new URL(baseUrl)
  url.searchParams.set('access_token', token)
  try {
    const resp = await fetchWithTimeout(url.toString(), { method: 'GET' }, TEST_TIMEOUT_MS)
    if (!resp.ok) {
      res.json({ ok: false, error: `Hub returned ${resp.status}` })
      return
    }
    const body = await resp.json().catch(() => null)
    const devicesCount = Array.isArray(body) ? body.length : 0
    res.json({ ok: true, devicesCount })
  } catch (err) {
    res.json({ ok: false, error: describeError(err) })
  }
})

router.post('/lifx/test', async (req: Request, res: Response) => {
  const parsed = lifxPutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid lifx', details: parsed.error.issues })
    return
  }
  const stored = getLifx()
  const token = resolveSecret(parsed.data.token ?? undefined, stored.token)
  if (!token) { res.json({ ok: false, error: 'Set LIFX token first' }); return }

  try {
    const resp = await fetchWithTimeout(
      'https://api.lifx.com/v1/lights/all',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      TEST_TIMEOUT_MS,
    )
    if (!resp.ok) {
      res.json({ ok: false, error: `LIFX returned ${resp.status}` })
      return
    }
    const body = await resp.json().catch(() => null)
    const lightsCount = Array.isArray(body) ? body.length : 0
    res.json({ ok: true, lightsCount })
  } catch (err) {
    res.json({ ok: false, error: describeError(err) })
  }
})

router.post('/weather/test', async (req: Request, res: Response) => {
  const parsed = weatherPutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid weather', details: parsed.error.issues })
    return
  }
  const stored = getWeather()
  const apiKey = resolveSecret(parsed.data.apiKey ?? undefined, stored.apiKey)
  if (!apiKey) { res.json({ ok: false, error: 'Set API key first' }); return }

  const { latitude, longitude } = getLocation()
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.json({ ok: false, error: 'Set Location first' })
    return
  }

  try {
    const url = new URL('https://api.openweathermap.org/data/2.5/weather')
    url.searchParams.set('lat', String(latitude))
    url.searchParams.set('lon', String(longitude))
    url.searchParams.set('appid', apiKey)
    url.searchParams.set('units', 'metric')
    const resp = await fetchWithTimeout(url.toString(), { method: 'GET' }, TEST_TIMEOUT_MS)
    if (!resp.ok) {
      res.json({ ok: false, error: `OpenWeather returned ${resp.status}` })
      return
    }
    const body = await resp.json().catch(() => null) as
      | { weather?: Array<{ main?: string }>; main?: { temp?: number } }
      | null
    const condition = body?.weather?.[0]?.main ?? 'Unknown'
    const temp = body?.main?.temp
    const sample = typeof temp === 'number'
      ? `${condition}, ${Math.round(temp)}°C`
      : condition
    res.json({ ok: true, sample })
  } catch (err) {
    res.json({ ok: false, error: describeError(err) })
  }
})

router.post('/spotify/test', async (req: Request, res: Response) => {
  const parsed = spotifyPutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid spotify', details: parsed.error.issues })
    return
  }
  const stored = getSpotify()
  const clientId = parsed.data.clientId === undefined || parsed.data.clientId === SET_PLACEHOLDER
    ? stored.clientId
    : parsed.data.clientId
  const clientSecret = resolveSecret(parsed.data.clientSecret ?? undefined, stored.clientSecret)

  if (!clientId) { res.json({ ok: false, error: 'Set Client ID first' }); return }
  if (!clientSecret) { res.json({ ok: false, error: 'Set Client secret first' }); return }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  try {
    const resp = await fetchWithTimeout(
      'https://accounts.spotify.com/api/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      },
      TEST_TIMEOUT_MS,
    )
    if (!resp.ok) {
      const body = await resp.json().catch(() => null) as { error_description?: string } | null
      res.json({ ok: false, error: body?.error_description ?? `Spotify returned ${resp.status}` })
      return
    }
    // Success — explicitly do not return the access_token in the response.
    res.json({ ok: true })
  } catch (err) {
    res.json({ ok: false, error: describeError(err) })
  }
})

export default router
