/**
 * Tests for /api/settings/spotify/redirect-uri and
 * /api/settings/spotify/public-base-url.
 *
 * Mounts only the settings-spotify router on a loopback Express app — no
 * auth middleware. Each test wipes app_settings + resets the in-process
 * cache so we can assert against a clean store.
 */

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import { AddressInfo } from 'node:net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-spotify-redirect-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

const { initDb, db } = await import('../db/index.js')
const store = await import('../lib/settings-store.js')
const { default: settingsSpotifyRouter } = await import('../routes/settings-spotify.js')

const app = express()
app.use(express.json())
app.use('/api/settings/spotify', settingsSpotifyRouter)

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
})

describe('GET /api/settings/spotify/redirect-uri', () => {
  test('returns nulls when publicBaseUrl is not set', async () => {
    const res = await fetchJson('GET', '/api/settings/spotify/redirect-uri')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { redirectUri: null, publicBaseUrl: null })
  })

  test('returns derived redirectUri + publicBaseUrl when set', async () => {
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: null,
      publicBaseUrl: 'https://home.example.com',
    })

    const res = await fetchJson('GET', '/api/settings/spotify/redirect-uri')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, {
      redirectUri: 'https://home.example.com/api/spotify/callback',
      publicBaseUrl: 'https://home.example.com',
    })
  })

  test('never returns secrets', async () => {
    store.setSpotify({
      clientId: 'cid',
      clientSecret: 'super-secret-do-not-leak',
      redirectUri: null,
      publicBaseUrl: 'https://home.example.com',
    })
    const res = await fetchJson('GET', '/api/settings/spotify/redirect-uri')
    assert.equal(res.status, 200)
    const serialised = JSON.stringify(res.body)
    assert.equal(serialised.includes('super-secret-do-not-leak'), false)
    assert.equal(serialised.includes('cid'), false)
  })
})

describe('PUT /api/settings/spotify/public-base-url', () => {
  test('valid URL persists and returns the new derived redirect URI', async () => {
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {
      publicBaseUrl: 'https://home.thefairies.ie',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, {
      redirectUri: 'https://home.thefairies.ie/api/spotify/callback',
      publicBaseUrl: 'https://home.thefairies.ie',
    })

    // And it round-trips through GET.
    const get = await fetchJson('GET', '/api/settings/spotify/redirect-uri')
    assert.deepEqual(get.body, res.body)

    // And it's persisted in the store.
    assert.equal(store.getSpotify().publicBaseUrl, 'https://home.thefairies.ie')
  })

  test('http with port is accepted', async () => {
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {
      publicBaseUrl: 'http://localhost:3001',
    })
    assert.equal(res.status, 200)
    const body = res.body as { redirectUri: string; publicBaseUrl: string }
    assert.equal(body.publicBaseUrl, 'http://localhost:3001')
    assert.equal(body.redirectUri, 'http://localhost:3001/api/spotify/callback')
  })

  test('null clears the stored publicBaseUrl', async () => {
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: null,
      publicBaseUrl: 'https://home.example.com',
    })
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {
      publicBaseUrl: null,
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { redirectUri: null, publicBaseUrl: null })
    assert.equal(store.getSpotify().publicBaseUrl, null)
  })

  test('rejects trailing slash with 400', async () => {
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {
      publicBaseUrl: 'https://home.example.com/',
    })
    assert.equal(res.status, 400)
    const body = res.body as { error: string }
    assert.match(body.error, /no trailing slash|host/i)
  })

  test('rejects extra path with 400', async () => {
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {
      publicBaseUrl: 'https://home.example.com/some/path',
    })
    assert.equal(res.status, 400)
  })

  test('rejects URL without scheme with 400', async () => {
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {
      publicBaseUrl: 'home.example.com',
    })
    assert.equal(res.status, 400)
  })

  test('rejects scheme other than http/https with 400', async () => {
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {
      publicBaseUrl: 'ftp://home.example.com',
    })
    assert.equal(res.status, 400)
  })

  test('rejects missing publicBaseUrl field with 400', async () => {
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {})
    assert.equal(res.status, 400)
  })

  test('preserves other Spotify fields when only publicBaseUrl changes', async () => {
    store.setSpotify({
      clientId: 'keep-me',
      clientSecret: 'keep-me-too',
      redirectUri: 'https://legacy.example.com/api/spotify/callback',
      publicBaseUrl: null,
    })
    const res = await fetchJson('PUT', '/api/settings/spotify/public-base-url', {
      publicBaseUrl: 'https://new.example.com',
    })
    assert.equal(res.status, 200)
    const after = store.getSpotify()
    assert.equal(after.clientId, 'keep-me')
    assert.equal(after.clientSecret, 'keep-me-too')
    assert.equal(after.redirectUri, 'https://legacy.example.com/api/spotify/callback')
    assert.equal(after.publicBaseUrl, 'https://new.example.com')
  })
})
