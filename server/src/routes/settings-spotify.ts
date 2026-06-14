/**
 * /api/settings/spotify/* — Spotify-specific endpoints that complement the
 * generic settings routes in `settings.ts`. Mirrors the shape of
 * `settings-hubitat.ts` for the same reason: keeping derived-URL assembly
 * out of the generic group handler.
 *
 * GET  /redirect-uri        → { redirectUri, publicBaseUrl }
 * PUT  /public-base-url     → { redirectUri, publicBaseUrl }
 *
 * The Spotify Redirect URI is not stored separately starting Phase 7
 * (WI #4); it is derived as `${publicBaseUrl}/api/spotify/callback` at
 * call time. The user supplies only the public base URL via PUT.
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { getSpotify, setSpotify } from '../lib/settings-store.js'
import { getDerivedRedirectUri } from '../lib/spotify-client.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

export interface SpotifyRedirectUriDto {
  /** The full redirect URI the user pastes into Spotify's developer console,
   *  or null when `publicBaseUrl` is not yet configured. */
  redirectUri: string | null
  /** The public-facing base URL (e.g. https://home.thefairies.ie) the user
   *  has configured for this server, or null. */
  publicBaseUrl: string | null
}

// Strict shape: scheme + host (with optional port), no trailing slash, no
// path. We reject anything more permissive because the redirect URI we
// derive from this value must match Spotify's registration exactly — a
// trailing slash or stray path would silently break OAuth at runtime.
const publicBaseUrlSchema = z
  .string()
  .regex(/^https?:\/\/[^/]+$/u, {
    message:
      'Public base URL must look like https://your-host (scheme + host, no trailing slash, no path)',
  })

const putBodySchema = z.object({
  publicBaseUrl: publicBaseUrlSchema.nullable(),
})

function buildResponse(): SpotifyRedirectUriDto {
  const { publicBaseUrl } = getSpotify()
  if (!publicBaseUrl) {
    // No `publicBaseUrl` — the user hasn't set it yet. We deliberately do
    // not surface the legacy `redirectUri` here: Phase 7 treats the field
    // below the UI as the only source of truth from the user's perspective.
    return { redirectUri: null, publicBaseUrl: null }
  }
  return { redirectUri: getDerivedRedirectUri(), publicBaseUrl }
}

router.get('/redirect-uri', (_req: Request, res: Response) => {
  try {
    res.json(buildResponse())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

router.put('/public-base-url', (req: Request, res: Response) => {
  try {
    const parsed = putBodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid publicBaseUrl',
        details: parsed.error.issues,
      })
      return
    }

    const current = getSpotify()
    setSpotify({
      clientId: current.clientId,
      clientSecret: current.clientSecret,
      redirectUri: current.redirectUri,
      publicBaseUrl: parsed.data.publicBaseUrl,
    })

    res.json(buildResponse())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
