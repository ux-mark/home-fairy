/**
 * Settings route tests. We build a minimal Express app that mounts only the
 * settings router (no auth middleware, no other routes) and drive it via the
 * Node http client on a real loopback port. This keeps the test focused on
 * the route's validation + secret-redaction behaviour.
 */

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import { AddressInfo } from 'node:net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-routes-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

const { initDb, db } = await import('../db/index.js')
const store = await import('../lib/settings-store.js')
const { default: settingsRouter } = await import('../routes/settings.js')

const app = express()
app.use(express.json())
app.use('/api/settings', settingsRouter)

let server: http.Server
let baseUrl: string

interface FetchResponse {
  status: number
  body: unknown
}

async function fetchJson(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<FetchResponse> {
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

before(async () => {
  initDb()
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  db.prepare('DELETE FROM app_settings').run()
  store._resetForTests()
  store.hydrate()
  store.seedFromEnvIfMissing()
})

describe('settings routes: GET secrets are redacted', () => {
  test('hubitat GET returns "<set>" for token/webhookSecret when set; null when not', async () => {
    store.setHubitat({
      baseUrl: 'http://hub/api',
      token: 'real-secret-token',
      webhookSecret: null,
    })

    const res = await fetchJson('GET', '/api/settings/hubitat')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, {
      baseUrl: 'http://hub/api',
      token: '<set>',
      webhookSecret: null,
    })
    // Crucially: the real value must not appear anywhere in the response.
    assert.ok(!JSON.stringify(res.body).includes('real-secret-token'))
  })

  test('lifx GET redacts token', async () => {
    store.setLifx({ token: 'lifx-real' })
    const res = await fetchJson('GET', '/api/settings/lifx')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { token: '<set>' })
  })

  test('weather GET redacts apiKey', async () => {
    store.setWeather({ apiKey: 'ow-real' })
    const res = await fetchJson('GET', '/api/settings/weather')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { apiKey: '<set>' })
  })

  test('spotify GET redacts clientSecret only (clientId + redirectUri + publicBaseUrl visible)', async () => {
    store.setSpotify({
      clientId: 'sp-id',
      clientSecret: 'sp-real-secret',
      redirectUri: 'https://example/cb',
      publicBaseUrl: null,
    })
    const res = await fetchJson('GET', '/api/settings/spotify')
    assert.equal(res.status, 200)
    // Phase 7: when publicBaseUrl is null, the legacy `redirectUri` field
    // surfaces through unchanged so older installations keep working.
    assert.deepEqual(res.body, {
      clientId: 'sp-id',
      clientSecret: '<set>',
      redirectUri: 'https://example/cb',
      publicBaseUrl: null,
    })
    assert.ok(!JSON.stringify(res.body).includes('sp-real-secret'))
  })

  test('spotify GET derives redirectUri from publicBaseUrl when set', async () => {
    store.setSpotify({
      clientId: 'sp-id',
      clientSecret: null,
      redirectUri: null,
      publicBaseUrl: 'https://home.example.com',
    })
    const res = await fetchJson('GET', '/api/settings/spotify')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, {
      clientId: 'sp-id',
      clientSecret: null,
      redirectUri: 'https://home.example.com/api/spotify/callback',
      publicBaseUrl: 'https://home.example.com',
    })
  })

  test('location GET has no redaction (no secrets in group)', async () => {
    store.setLocation({
      latitude: 53.34, longitude: -6.27,
      timezone: 'Europe/Dublin', locale: 'en-IE',
    })
    const res = await fetchJson('GET', '/api/settings/location')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, {
      latitude: 53.34, longitude: -6.27,
      timezone: 'Europe/Dublin', locale: 'en-IE',
    })
  })
})

describe('settings routes: PUT validation', () => {
  test('bad latitude (999) → 400, DB unchanged', async () => {
    store.setLocation({
      latitude: 53.34, longitude: -6.27,
      timezone: 'Europe/Dublin', locale: 'en-IE',
    })

    const res = await fetchJson('PUT', '/api/settings/location', {
      latitude: 999,
      longitude: -6.27,
      timezone: 'Europe/Dublin',
      locale: 'en-IE',
    })
    assert.equal(res.status, 400)

    // DB unchanged
    assert.equal(store.getLocation().latitude, 53.34)
  })

  test('bad timezone string → 400', async () => {
    const res = await fetchJson('PUT', '/api/settings/location', {
      latitude: 53.34,
      longitude: -6.27,
      timezone: 'Not/A/Real/Zone',
      locale: 'en-IE',
    })
    assert.equal(res.status, 400)
  })

  test('bad locale string → 400', async () => {
    const res = await fetchJson('PUT', '/api/settings/location', {
      latitude: 53.34,
      longitude: -6.27,
      timezone: 'Europe/Dublin',
      locale: '!!!!',
    })
    assert.equal(res.status, 400)
  })

  test('valid PUT → 200, persisted, secrets still redacted in response', async () => {
    const res = await fetchJson('PUT', '/api/settings/hubitat', {
      baseUrl: 'http://newhub/api',
      token: 'new-token-value',
      webhookSecret: 'whs',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, {
      baseUrl: 'http://newhub/api',
      token: '<set>',
      webhookSecret: '<set>',
    })
    assert.equal(store.getHubitat().token, 'new-token-value')
  })

  test('PUT with omitted secret preserves existing value', async () => {
    store.setHubitat({
      baseUrl: 'http://hub/api',
      token: 'original-token',
      webhookSecret: 'original-whs',
    })

    const res = await fetchJson('PUT', '/api/settings/hubitat', {
      baseUrl: 'http://newhub/api',
      // token omitted on purpose
      // webhookSecret omitted on purpose
    })
    assert.equal(res.status, 200)
    assert.equal(store.getHubitat().token, 'original-token')
    assert.equal(store.getHubitat().webhookSecret, 'original-whs')
    assert.equal(store.getHubitat().baseUrl, 'http://newhub/api')
  })

  test('PUT with explicit null clears the secret', async () => {
    store.setLifx({ token: 'will-be-cleared' })
    const res = await fetchJson('PUT', '/api/settings/lifx', { token: null })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { token: null })
    assert.equal(store.getLifx().token, null)
  })

  test('unknown group → 404', async () => {
    const res = await fetchJson('GET', '/api/settings/nope')
    assert.equal(res.status, 404)
    const res2 = await fetchJson('PUT', '/api/settings/nope', {})
    assert.equal(res2.status, 404)
  })
})
