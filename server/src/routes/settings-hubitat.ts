/**
 * /api/settings/hubitat/* — Hubitat-specific endpoints that complement the
 * generic settings routes in `settings.ts`. Split into their own router so
 * the webhook-URL assembly logic doesn't sprawl into the group handler.
 *
 * GET  /webhook-url        → { url, baseUrl, port, secretConfigured }
 * POST /regenerate-secret  → same shape, but with a freshly-minted secret
 *
 * Auth: mounted under the same `requireAuth` wrapper as `settings.ts` in
 * `index.ts`. The webhook secret itself is never returned as a field of its
 * own — only embedded in `url`. `secretConfigured` is for the UI.
 */

import { Router, type Request, type Response } from 'express'
import {
  ensureHubitatWebhookSecret,
  regenerateHubitatWebhookSecret,
} from '../lib/settings-store.js'
import { getServerLanBaseUrl } from '../lib/server-url.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

export interface HubitatWebhookUrlDto {
  /** Full webhook URL the user copies into Hubitat, or null if the LAN
   *  base URL couldn't be detected. */
  url: string | null
  /** The detected LAN base URL (without the `/hubitat?token=` suffix), or
   *  null. Surfaced so the UI can offer a helpful hint when null. */
  baseUrl: string | null
  /** Port portion of the base URL, for the UI's diagnostic copy. */
  port: number
  /** True iff a secret is currently persisted. Always true after this
   *  endpoint has been called (we auto-generate on the fly). */
  secretConfigured: boolean
}

function buildResponse(): HubitatWebhookUrlDto {
  const secret = ensureHubitatWebhookSecret()
  const baseUrl = getServerLanBaseUrl()
  const portFromEnv = Number(process.env.PORT)
  const port = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : 3001
  const url = baseUrl
    ? `${baseUrl}/hubitat?token=${encodeURIComponent(secret)}`
    : null
  return {
    url,
    baseUrl,
    port,
    secretConfigured: true,
  }
}

router.get('/webhook-url', (_req: Request, res: Response) => {
  try {
    res.json(buildResponse())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

router.post('/regenerate-secret', (_req: Request, res: Response) => {
  try {
    const newSecret = regenerateHubitatWebhookSecret()
    const baseUrl = getServerLanBaseUrl()
    const portFromEnv = Number(process.env.PORT)
    const port = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : 3001
    const url = baseUrl
      ? `${baseUrl}/hubitat?token=${encodeURIComponent(newSecret)}`
      : null
    res.json({
      url,
      baseUrl,
      port,
      secretConfigured: true,
    } satisfies HubitatWebhookUrlDto)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
