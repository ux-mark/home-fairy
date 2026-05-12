/**
 * Tests for /api/settings/hubitat/webhook-url and
 * /api/settings/hubitat/regenerate-secret.
 *
 * Mounts only the settings-hubitat router on a loopback Express app — no
 * auth, no socket. FAIRY_PUBLIC_HOST is set before the server-url module is
 * loaded so the LAN-base-URL detection is deterministic across test hosts.
 */

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import { AddressInfo } from 'node:net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-hubitat-webhook-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')
process.env.FAIRY_PUBLIC_HOST = '192.168.10.201'
process.env.PORT = '3001'

const { initDb, db } = await import('../db/index.js')
const store = await import('../lib/settings-store.js')
const { default: settingsHubitatRouter } = await import('../routes/settings-hubitat.js')

const app = express()
app.use(express.json())
app.use('/api/settings/hubitat', settingsHubitatRouter)

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
  // Don't seed env here — we want each test to start with no secret unless
  // it explicitly sets one.
})

describe('GET /api/settings/hubitat/webhook-url', () => {
  test('assembles URL using LAN base URL + the persisted secret', async () => {
    store.setHubitat({ baseUrl: null, token: null, webhookSecret: 'known-test-secret' })

    const res = await fetchJson('GET', '/api/settings/hubitat/webhook-url')
    assert.equal(res.status, 200)
    const body = res.body as {
      url: string | null
      baseUrl: string | null
      port: number
      secretConfigured: boolean
    }
    assert.equal(body.url, 'http://192.168.10.201:3001/hubitat?token=known-test-secret')
    assert.equal(body.baseUrl, 'http://192.168.10.201:3001')
    assert.equal(body.port, 3001)
    assert.equal(body.secretConfigured, true)
  })

  test('never returns the secret in any field of its own', async () => {
    store.setHubitat({ baseUrl: null, token: null, webhookSecret: 'leakable-secret-value' })

    const res = await fetchJson('GET', '/api/settings/hubitat/webhook-url')
    assert.equal(res.status, 200)
    const body = res.body as Record<string, unknown>
    // The secret may appear inside `url`, but not as its own field.
    assert.equal('secret' in body, false)
    assert.equal('webhookSecret' in body, false)
    assert.equal('token' in body, false)
    // And the only place it should show up at all is the URL.
    const serialised = JSON.stringify(body)
    const occurrences = serialised.split('leakable-secret-value').length - 1
    assert.equal(occurrences, 1, 'secret should appear exactly once, embedded in the URL')
  })

  test('auto-generates a secret when one is not yet set', async () => {
    // No setHubitat call — store starts with nothing.
    assert.equal(store.getHubitat().webhookSecret, null)

    const res = await fetchJson('GET', '/api/settings/hubitat/webhook-url')
    assert.equal(res.status, 200)
    const body = res.body as { url: string | null; secretConfigured: boolean }
    assert.equal(body.secretConfigured, true)
    assert.ok(body.url, 'url should be assembled')
    // The store should now have a persisted secret.
    const stored = store.getHubitat().webhookSecret
    assert.ok(stored && stored.length > 0)
    // And the URL should embed exactly that secret.
    assert.ok(body.url!.endsWith(`?token=${stored}`))
  })
})

describe('POST /api/settings/hubitat/regenerate-secret', () => {
  test('returns a new URL with a new secret', async () => {
    store.setHubitat({ baseUrl: null, token: null, webhookSecret: 'old-secret' })

    const before = await fetchJson('GET', '/api/settings/hubitat/webhook-url')
    const beforeUrl = (before.body as { url: string }).url

    const res = await fetchJson('POST', '/api/settings/hubitat/regenerate-secret')
    assert.equal(res.status, 200)
    const body = res.body as { url: string; secretConfigured: boolean }
    assert.equal(body.secretConfigured, true)
    assert.notEqual(body.url, beforeUrl)
    // The store now holds the new secret, not the old one.
    const stored = store.getHubitat().webhookSecret
    assert.ok(stored && stored !== 'old-secret')
    // And the URL embeds it.
    assert.ok(body.url.endsWith(`?token=${stored}`))
  })

  test('regenerate is idempotent in shape but always produces a different value', async () => {
    const first = await fetchJson('POST', '/api/settings/hubitat/regenerate-secret')
    const second = await fetchJson('POST', '/api/settings/hubitat/regenerate-secret')
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    const firstUrl = (first.body as { url: string }).url
    const secondUrl = (second.body as { url: string }).url
    assert.notEqual(firstUrl, secondUrl)
  })
})

describe('LAN base URL detection edge cases', () => {
  test('GET handles FAIRY_PUBLIC_HOST unset by falling back to interface scan', async () => {
    // Save + clear the override so the picker walks os.networkInterfaces().
    const savedHost = process.env.FAIRY_PUBLIC_HOST
    delete process.env.FAIRY_PUBLIC_HOST
    try {
      store.setHubitat({ baseUrl: null, token: null, webhookSecret: 'fallback-secret' })
      const res = await fetchJson('GET', '/api/settings/hubitat/webhook-url')
      assert.equal(res.status, 200)
      const body = res.body as { url: string | null; baseUrl: string | null }
      // We can't assert exact host on an arbitrary CI box, but the shape is
      // always defined: url is either null or contains the secret.
      if (body.url !== null) {
        assert.ok(body.url.endsWith('?token=fallback-secret'))
        assert.ok(body.baseUrl !== null)
      } else {
        assert.equal(body.baseUrl, null)
      }
    } finally {
      if (savedHost !== undefined) process.env.FAIRY_PUBLIC_HOST = savedHost
    }
  })
})
