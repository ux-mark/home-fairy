/**
 * Tests for POST /api/settings/:group/test endpoints.
 *
 * Each endpoint runs a small upstream probe against the form values, resolves
 * '<set>' secrets from the store, and returns { ok, ...details } without ever
 * echoing the real secret. We mock the global `fetch` so we can exercise:
 *   - success path
 *   - upstream non-2xx
 *   - timeout (AbortError)
 *   - '<set>' secret resolution from the persisted store
 *   - Zod validation rejection
 */

import { test, describe, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import { AddressInfo } from 'node:net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-routes-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

const { initDb, db } = await import('../db/index.js')
const store = await import('../lib/settings-store.js')
const { default: settingsRouter } = await import('../routes/settings.js')

const app = express()
app.use(express.json())
app.use('/api/settings', settingsRouter)

let server: http.Server
let baseUrl: string
const originalFetch = globalThis.fetch

interface FetchResponse { status: number; body: unknown }

async function fetchJson(method: string, pathname: string, body?: unknown): Promise<FetchResponse> {
  const url = new URL(pathname, baseUrl)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: { 'content-type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          let parsed: unknown = null
          try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
          resolve({ status: res.statusCode ?? 0, body: parsed })
        })
      },
    )
    req.on('error', reject)
    if (body !== undefined) req.write(JSON.stringify(body))
    req.end()
  })
}

/**
 * Build a mock Response object for the global fetch. status>=200 && <300 → ok.
 */
function makeResponse(body: unknown, status = 200): globalThis.Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as globalThis.Response
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<globalThis.Response>): void {
  globalThis.fetch = mock.fn(impl as unknown as typeof fetch) as unknown as typeof fetch
}

before(async () => {
  initDb()
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

after(async () => {
  globalThis.fetch = originalFetch
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  db.prepare('DELETE FROM app_settings').run()
  store._resetForTests()
  store.hydrate()
  store.seedFromEnvIfMissing()
  globalThis.fetch = originalFetch
})

// ── /location/test ───────────────────────────────────────────────────────────

describe('POST /api/settings/location/test', () => {
  test('returns sunrise/sunset/now for valid coords + tz', async () => {
    const res = await fetchJson('POST', '/api/settings/location/test', {
      latitude: 53.34, longitude: -6.27,
      timezone: 'Europe/Dublin', locale: 'en-IE',
    })
    assert.equal(res.status, 200)
    const body = res.body as { ok: boolean; sunrise: string; sunset: string; now: string; timezone: string }
    assert.equal(body.ok, true)
    assert.match(body.sunrise, /^\d{2}:\d{2}$/)
    assert.match(body.sunset, /^\d{2}:\d{2}$/)
    assert.match(body.now, /^\d{2}:\d{2}$/)
    assert.equal(body.timezone, 'Europe/Dublin')
  })

  test('rejects bad latitude with 400', async () => {
    const res = await fetchJson('POST', '/api/settings/location/test', {
      latitude: 999, longitude: 0,
      timezone: 'Europe/Dublin', locale: 'en-IE',
    })
    assert.equal(res.status, 400)
  })

  test('rejects bad timezone with 400', async () => {
    const res = await fetchJson('POST', '/api/settings/location/test', {
      latitude: 0, longitude: 0,
      timezone: 'Not/Real', locale: 'en-IE',
    })
    assert.equal(res.status, 400)
  })
})

// ── /hubitat/test ────────────────────────────────────────────────────────────

describe('POST /api/settings/hubitat/test', () => {
  test('success: returns devicesCount from upstream array length', async () => {
    stubFetch(async () => makeResponse([{ id: 1 }, { id: 2 }, { id: 3 }]))
    const res = await fetchJson('POST', '/api/settings/hubitat/test', {
      baseUrl: 'http://hub.local/api/devices',
      token: 'tk',
      webhookSecret: 'whs',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true, devicesCount: 3 })
  })

  test("'<set>' token is resolved from the store", async () => {
    store.setHubitat({
      baseUrl: 'http://hub.local/api/devices',
      token: 'stored-tk',
      webhookSecret: null,
    })
    let capturedUrl = ''
    stubFetch(async (url) => {
      capturedUrl = url
      return makeResponse([])
    })
    const res = await fetchJson('POST', '/api/settings/hubitat/test', {
      baseUrl: 'http://hub.local/api/devices',
      token: '<set>',
    })
    assert.equal(res.status, 200)
    assert.equal((res.body as { ok: boolean }).ok, true)
    assert.ok(capturedUrl.includes('access_token=stored-tk'),
      `expected stored token in upstream URL, got: ${capturedUrl}`)
  })

  test('upstream 401 → ok:false with status in error', async () => {
    stubFetch(async () => makeResponse({ error: 'nope' }, 401))
    const res = await fetchJson('POST', '/api/settings/hubitat/test', {
      baseUrl: 'http://hub.local/api/devices',
      token: 'bad',
    })
    assert.equal(res.status, 200)
    const body = res.body as { ok: boolean; error: string }
    assert.equal(body.ok, false)
    assert.match(body.error, /401/)
  })

  test('timeout → ok:false, error:"Timed out"', async () => {
    stubFetch(async () => {
      const e = new Error('aborted')
      ;(e as Error & { name: string }).name = 'AbortError'
      throw e
    })
    const res = await fetchJson('POST', '/api/settings/hubitat/test', {
      baseUrl: 'http://hub.local/api/devices',
      token: 'tk',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: false, error: 'Timed out' })
  })

  test('no baseUrl in form or store → ok:false', async () => {
    const res = await fetchJson('POST', '/api/settings/hubitat/test', { token: 'tk' })
    assert.equal(res.status, 200)
    const body = res.body as { ok: boolean; error: string }
    assert.equal(body.ok, false)
    assert.match(body.error, /Base URL/)
  })
})

// ── /lifx/test ───────────────────────────────────────────────────────────────

describe('POST /api/settings/lifx/test', () => {
  test('success: returns lightsCount', async () => {
    stubFetch(async () => makeResponse([{ id: 'a' }, { id: 'b' }]))
    const res = await fetchJson('POST', '/api/settings/lifx/test', { token: 'tk' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true, lightsCount: 2 })
  })

  test("'<set>' token resolves from store + sends Bearer", async () => {
    store.setLifx({ token: 'stored-lifx' })
    let authHeader = ''
    stubFetch(async (_url, init) => {
      authHeader = String((init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? '')
      return makeResponse([])
    })
    const res = await fetchJson('POST', '/api/settings/lifx/test', { token: '<set>' })
    assert.equal(res.status, 200)
    assert.equal((res.body as { ok: boolean }).ok, true)
    assert.equal(authHeader, 'Bearer stored-lifx')
  })

  test('upstream 403 → ok:false', async () => {
    stubFetch(async () => makeResponse({}, 403))
    const res = await fetchJson('POST', '/api/settings/lifx/test', { token: 'bad' })
    assert.equal((res.body as { ok: boolean }).ok, false)
  })

  test('no token → ok:false', async () => {
    const res = await fetchJson('POST', '/api/settings/lifx/test', {})
    assert.equal((res.body as { ok: boolean }).ok, false)
    assert.match((res.body as { error: string }).error, /token/)
  })
})

// ── /weather/test ────────────────────────────────────────────────────────────

describe('POST /api/settings/weather/test', () => {
  test('success: returns "Clouds, 12°C"-style sample', async () => {
    store.setLocation({
      latitude: 53.34, longitude: -6.27,
      timezone: 'Europe/Dublin', locale: 'en-IE',
    })
    stubFetch(async () => makeResponse({
      weather: [{ main: 'Clouds' }],
      main: { temp: 12.4 },
    }))
    const res = await fetchJson('POST', '/api/settings/weather/test', { apiKey: 'k' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true, sample: 'Clouds, 12°C' })
  })

  test('lat/lon unset → ok:false "Set Location first"', async () => {
    // Default store has lat/lon = null
    const res = await fetchJson('POST', '/api/settings/weather/test', { apiKey: 'k' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: false, error: 'Set Location first' })
  })

  test("'<set>' apiKey resolves from store", async () => {
    store.setLocation({
      latitude: 1, longitude: 2,
      timezone: 'UTC', locale: 'en-IE',
    })
    store.setWeather({ apiKey: 'stored-key' })
    let capturedUrl = ''
    stubFetch(async (url) => {
      capturedUrl = url
      return makeResponse({ weather: [{ main: 'Clear' }], main: { temp: 20 } })
    })
    const res = await fetchJson('POST', '/api/settings/weather/test', { apiKey: '<set>' })
    assert.equal((res.body as { ok: boolean }).ok, true)
    assert.ok(capturedUrl.includes('appid=stored-key'))
  })

  test('upstream 401 → ok:false', async () => {
    store.setLocation({ latitude: 0, longitude: 0, timezone: 'UTC', locale: 'en-IE' })
    stubFetch(async () => makeResponse({}, 401))
    const res = await fetchJson('POST', '/api/settings/weather/test', { apiKey: 'bad' })
    assert.equal((res.body as { ok: boolean }).ok, false)
  })

  test('timeout → ok:false "Timed out"', async () => {
    store.setLocation({ latitude: 0, longitude: 0, timezone: 'UTC', locale: 'en-IE' })
    stubFetch(async () => {
      const e = new Error('aborted'); (e as Error & { name: string }).name = 'AbortError'
      throw e
    })
    const res = await fetchJson('POST', '/api/settings/weather/test', { apiKey: 'k' })
    assert.deepEqual(res.body, { ok: false, error: 'Timed out' })
  })
})

// ── /spotify/test ────────────────────────────────────────────────────────────

describe('POST /api/settings/spotify/test', () => {
  test('success: returns ok:true, no token in body', async () => {
    stubFetch(async () => makeResponse({ access_token: 'should-not-leak', expires_in: 3600 }))
    const res = await fetchJson('POST', '/api/settings/spotify/test', {
      clientId: 'cid',
      clientSecret: 'csec',
      redirectUri: 'https://app/cb',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true })
    assert.ok(!JSON.stringify(res.body).includes('should-not-leak'))
  })

  test("'<set>' clientSecret resolves from store + Basic auth header", async () => {
    store.setSpotify({
      clientId: 'cid-store',
      clientSecret: 'sec-store',
      redirectUri: 'https://app/cb',
      publicBaseUrl: null,
    })
    let authHeader = ''
    stubFetch(async (_url, init) => {
      authHeader = String((init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? '')
      return makeResponse({ access_token: 't', expires_in: 1 })
    })
    const res = await fetchJson('POST', '/api/settings/spotify/test', {
      clientId: '<set>',
      clientSecret: '<set>',
    })
    assert.equal((res.body as { ok: boolean }).ok, true)
    const expected = 'Basic ' + Buffer.from('cid-store:sec-store').toString('base64')
    assert.equal(authHeader, expected)
  })

  test('upstream 400 with error_description surfaces the message', async () => {
    stubFetch(async () => makeResponse({ error: 'invalid_client', error_description: 'Invalid client' }, 400))
    const res = await fetchJson('POST', '/api/settings/spotify/test', {
      clientId: 'cid',
      clientSecret: 'bad',
    })
    const body = res.body as { ok: boolean; error: string }
    assert.equal(body.ok, false)
    assert.equal(body.error, 'Invalid client')
  })

  test('missing clientId → ok:false', async () => {
    const res = await fetchJson('POST', '/api/settings/spotify/test', { clientSecret: 'x' })
    const body = res.body as { ok: boolean; error: string }
    assert.equal(body.ok, false)
    assert.match(body.error, /Client ID/)
  })
})
