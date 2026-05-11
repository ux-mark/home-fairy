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

export default router
