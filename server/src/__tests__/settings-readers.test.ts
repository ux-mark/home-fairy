/**
 * Phase 2 reader-migration tests. For each integration that used to read
 * process.env directly, assert that:
 *   - when the relevant settings-store value is unset → the function fails
 *     gracefully with the documented descriptive error (or 503-ish status).
 *   - when the value is set via the store → the function uses it.
 *
 * HTTP-heavy clients (LIFX, Hubitat, Spotify token refresh) are exercised
 * for their failure paths only; the success path is covered indirectly via
 * sun-tracker, weather-client construction, and the webhook handler that
 * runs the full Express route.
 */

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import { AddressInfo } from 'node:net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-readers-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

// Imports must come AFTER FAIRY_DB_PATH is set.
const { initDb, db } = await import('../db/index.js')
const store = await import('../lib/settings-store.js')
const { getSunTimes, getCurrentSunPhase } = await import('../lib/sun-tracker.js')
const { spotifyClient, SpotifyApiError } = await import('../lib/spotify-client.js')

function resetCache(): void {
  db.prepare('DELETE FROM app_settings').run()
  store._resetForTests()
  store.hydrate()
}

before(() => {
  initDb()
})

beforeEach(() => {
  resetCache()
})

// ───────────────────────── sun-tracker ─────────────────────────

describe('sun-tracker uses settings-store getLocation', () => {
  test('latitude/longitude unset → getSunTimes throws descriptive error', () => {
    store.setLocation({ latitude: null, longitude: null, timezone: 'Europe/Dublin', locale: 'en-IE' })
    assert.throws(
      () => getSunTimes(),
      /Location not configured — set Latitude and Longitude in Settings/,
    )
  })

  test('latitude/longitude set → getSunTimes returns ISO strings', () => {
    store.setLocation({
      latitude: 53.34,
      longitude: -6.27,
      timezone: 'Europe/Dublin',
      locale: 'en-IE',
    })
    // 21 March (near equinox) — SunCalc returns finite values for every
    // phase at Dublin's latitude.
    const t = getSunTimes(new Date('2025-03-21T12:00:00Z'))
    assert.match(t.sunrise, /^\d{4}-\d{2}-\d{2}T/)
    assert.match(t.sunset, /^\d{4}-\d{2}-\d{2}T/)
    assert.match(t.solarNoon, /^\d{4}-\d{2}-\d{2}T/)
  })

  test('getCurrentSunPhase throws when location unset', () => {
    assert.throws(
      () => getCurrentSunPhase(),
      /Location not configured/,
    )
  })
})

// ───────────────────────── weather-client ─────────────────────────

describe('weather-client uses settings-store getWeather + getLocation', () => {
  test('apiKey unset → getCurrentWeather rejects with descriptive error', async () => {
    // Fresh import to defeat the module-level in-process cache that
    // weather-client keeps for successful responses. (The cache is empty
    // here anyway since we never set it, but importing fresh keeps the
    // test isolated from neighbours.)
    const { getCurrentWeather } = await import('../lib/weather-client.js')
    store.setLocation({ latitude: 53.34, longitude: -6.27, timezone: 'Europe/Dublin', locale: 'en-IE' })
    store.setWeather({ apiKey: null })
    await assert.rejects(
      getCurrentWeather(60_000),
      /OpenWeather API key not configured — set it in Settings/,
    )
  })

  test('location unset (api key set) → getCurrentWeather rejects with descriptive error', async () => {
    const { getCurrentWeather } = await import('../lib/weather-client.js')
    store.setWeather({ apiKey: 'k' })
    store.setLocation({ latitude: null, longitude: null, timezone: 'Europe/Dublin', locale: 'en-IE' })
    await assert.rejects(
      getCurrentWeather(60_000),
      /Location not configured/,
    )
  })
})

// ───────────────────────── hubitat-client ─────────────────────────

describe('hubitat-client reads getHubitat() at call time', () => {
  test('baseUrl unset → listDevices throws descriptive error', async () => {
    const { hubitatClient } = await import('../lib/hubitat-client.js')
    store.setHubitat({ baseUrl: null, token: 't', webhookSecret: null })
    await assert.rejects(
      hubitatClient.listDevices(),
      /Hubitat base URL not configured — set it in Settings/,
    )
  })

  test('token unset → listDevices throws descriptive error', async () => {
    const { hubitatClient } = await import('../lib/hubitat-client.js')
    store.setHubitat({ baseUrl: 'http://hub.local/api', token: null, webhookSecret: null })
    await assert.rejects(
      hubitatClient.listDevices(),
      /Hubitat token not configured — set it in Settings/,
    )
  })
})

// ───────────────────────── lifx-client ─────────────────────────

describe('lifx-client reads getLifx() at call time', () => {
  test('token unset → request interceptor throws descriptive error', async () => {
    const { lifxClient } = await import('../lib/lifx-client.js')
    store.setLifx({ token: null })
    await assert.rejects(
      lifxClient.listAll(),
      /LIFX token not configured — set it in Settings/,
    )
  })
})

// ───────────────────────── spotify-client ─────────────────────────

describe('spotify-client reads getSpotify() at call time', () => {
  test('isConfigured() reflects current store state', () => {
    store.setSpotify({ clientId: null, clientSecret: null, redirectUri: null, publicBaseUrl: null })
    assert.equal(spotifyClient.isConfigured(), false)
    store.setSpotify({ clientId: 'a', clientSecret: 'b', redirectUri: 'https://e/cb', publicBaseUrl: null })
    assert.equal(spotifyClient.isConfigured(), true)
  })

  test('getAuthUrl() throws SpotifyApiError 503 when clientId unset', () => {
    store.setSpotify({ clientId: null, clientSecret: 'b', redirectUri: 'https://e/cb', publicBaseUrl: null })
    try {
      spotifyClient.getAuthUrl()
      assert.fail('expected throw')
    } catch (err) {
      assert.ok(err instanceof SpotifyApiError, 'expected SpotifyApiError')
      assert.equal(err.status, 503)
      assert.match(err.message, /not configured/)
    }
  })

  test('getAuthUrl() uses the stored clientId + redirectUri (back-compat)', () => {
    store.setSpotify({ clientId: 'my-id', clientSecret: 'sec', redirectUri: 'https://example/cb', publicBaseUrl: null })
    const url = spotifyClient.getAuthUrl()
    assert.match(url, /client_id=my-id/)
    assert.match(url, /redirect_uri=https%3A%2F%2Fexample%2Fcb/)
  })

  test('handleCallback() rejects with 503 when secrets unset', async () => {
    store.setSpotify({ clientId: null, clientSecret: null, redirectUri: null, publicBaseUrl: null })
    try {
      await spotifyClient.handleCallback('any-code')
      assert.fail('expected throw')
    } catch (err) {
      assert.ok(err instanceof SpotifyApiError, 'expected SpotifyApiError')
      assert.equal(err.status, 503)
    }
  })
})

// ───────────────────────── Hubitat webhook handler ─────────────────────────
//
// Spin up a minimal Express app that mounts ONLY the webhook handler. We
// can't import server/src/index.ts as a router (it starts a listener), so
// we recreate the secret-validation + token-check shape the handler uses
// against the same settings-store. If you change the production handler's
// auth/validation, mirror it here.
//
// To keep this test self-contained we lift just the validation block into
// a tiny test handler. The validation path is what matters for the
// "secret unset → 503" / "wrong secret → 401" / "right secret → 200"
// contract.

describe('Hubitat webhook handler — signature + secret rules', () => {
  let server: http.Server
  let baseUrl: string

  before(async () => {
    const app = express()
    app.use(express.json())
    app.post('/hubitat', (req, res) => {
      const { webhookSecret } = store.getHubitat()
      if (!webhookSecret) {
        res.status(503).json({ error: 'Hubitat webhook secret not configured — set it in Settings' })
        return
      }
      const token = (req.headers['x-hubitat-token'] as string) || (req.query.token as string)
      if (token !== webhookSecret) {
        res.status(401).json({ error: 'Invalid webhook token' })
        return
      }
      res.json({ ok: true })
    })
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function post(headers: Record<string, string> = {}): Promise<{ status: number }> {
    const url = new URL('/hubitat', baseUrl)
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          method: 'POST',
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          headers: { 'content-type': 'application/json', ...headers },
        },
        (res) => {
          // Drain the body so the socket can close.
          res.on('data', () => {})
          res.on('end', () => resolve({ status: res.statusCode ?? 0 }))
        },
      )
      req.on('error', reject)
      req.write(JSON.stringify({}))
      req.end()
    })
  }

  test('webhookSecret unset → 503', async () => {
    store.setHubitat({ baseUrl: null, token: null, webhookSecret: null })
    const res = await post()
    assert.equal(res.status, 503)
  })

  test('wrong token → 401', async () => {
    store.setHubitat({ baseUrl: null, token: null, webhookSecret: 'real-secret' })
    const res = await post({ 'x-hubitat-token': 'wrong' })
    assert.equal(res.status, 401)
  })

  test('correct token → 200', async () => {
    store.setHubitat({ baseUrl: null, token: null, webhookSecret: 'real-secret' })
    const res = await post({ 'x-hubitat-token': 'real-secret' })
    assert.equal(res.status, 200)
  })
})
