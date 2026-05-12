/**
 * settings-store tests.
 *
 * One shared SQLite file under the OS temp dir for the whole suite (the db
 * module reads FAIRY_DB_PATH once at module-init). Each test wipes the
 * app_settings table + relevant env vars and resets the in-process cache
 * via the store's test-only reset helper.
 */

import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

// Imports must come AFTER FAIRY_DB_PATH is set — db/index.ts captures it
// at module-init time.
const { initDb, db } = await import('../db/index.js')
const store = await import('../lib/settings-store.js')

const ENV_KEYS_TO_RESET = [
  'LATITUDE', 'LONGITUDE', 'HUB_BASE_URL', 'HUBITAT_TOKEN', 'HUBITAT_WEBHOOK_SECRET',
  'LIFX_TOKEN', 'OPENWEATHER_API', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REDIRECT_URI',
] as const

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS_TO_RESET) delete process.env[k]
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

function wipeAppSettings(): void {
  db.prepare('DELETE FROM app_settings').run()
}

before(() => {
  initDb()
})

beforeEach(() => {
  wipeAppSettings()
  setEnv({})
  store._resetForTests()
})

describe('settings-store: seed-from-env', () => {
  test('fresh DB + populated env → all six groups seeded from env', () => {
    setEnv({
      LATITUDE: '53.34',
      LONGITUDE: '-6.27',
      HUB_BASE_URL: 'http://hub.local/api',
      HUBITAT_TOKEN: 'hub-tok',
      HUBITAT_WEBHOOK_SECRET: 'whs',
      LIFX_TOKEN: 'lifx-tok',
      OPENWEATHER_API: 'ow-key',
      SPOTIFY_CLIENT_ID: 'sp-id',
      SPOTIFY_CLIENT_SECRET: 'sp-sec',
      SPOTIFY_REDIRECT_URI: 'https://example/cb',
    })
    store.hydrate()
    store.seedFromEnvIfMissing()

    assert.deepEqual(store.getLocation(), {
      latitude: 53.34,
      longitude: -6.27,
      timezone: 'Europe/Dublin',
      locale: 'en-IE',
    })
    assert.deepEqual(store.getHubitat(), {
      baseUrl: 'http://hub.local/api',
      token: 'hub-tok',
      webhookSecret: 'whs',
    })
    assert.deepEqual(store.getLifx(), { token: 'lifx-tok' })
    assert.deepEqual(store.getWeather(), { apiKey: 'ow-key' })
    assert.deepEqual(store.getSpotify(), {
      clientId: 'sp-id',
      clientSecret: 'sp-sec',
      redirectUri: 'https://example/cb',
      publicBaseUrl: null,
    })
  })

  test('missing env vars → nulls + defaults applied', () => {
    store.hydrate()
    store.seedFromEnvIfMissing()

    assert.deepEqual(store.getLocation(), {
      latitude: null,
      longitude: null,
      timezone: 'Europe/Dublin',
      locale: 'en-IE',
    })
    assert.deepEqual(store.getHubitat(), {
      baseUrl: null,
      token: null,
      webhookSecret: null,
    })
    assert.equal(store.getLifx().token, null)
    assert.equal(store.getWeather().apiKey, null)
  })

  test('existing DB rows are NOT overwritten by env on next seed call', () => {
    setEnv({ LIFX_TOKEN: 'env-token' })
    store.hydrate()
    store.seedFromEnvIfMissing()
    assert.equal(store.getLifx().token, 'env-token')

    // User updates via the store
    store.setLifx({ token: 'user-updated' })
    assert.equal(store.getLifx().token, 'user-updated')

    // Process restart simulation: same DB, env still set → seed must not overwrite
    store._resetForTests()
    store.hydrate()
    store.seedFromEnvIfMissing()
    assert.equal(store.getLifx().token, 'user-updated')
  })
})

describe('settings-store: generic accessors', () => {
  test('getSetting / setSetting roundtrip JSON values', () => {
    store.hydrate()

    store.setSetting('custom.thing', { a: 1, b: ['x', 'y'] })
    const back = store.getSetting('custom.thing')
    assert.deepEqual(back, { a: 1, b: ['x', 'y'] })

    store.setSetting('custom.scalar', 42)
    assert.equal(store.getSetting('custom.scalar'), 42)

    assert.equal(store.getSetting('custom.never-set'), null)
  })
})

describe('settings-store: group accessors', () => {
  test('setLocation → getLocation round-trip', () => {
    store.hydrate()

    store.setLocation({
      latitude: 53.34,
      longitude: -6.27,
      timezone: 'Europe/Dublin',
      locale: 'en-IE',
    })

    assert.deepEqual(store.getLocation(), {
      latitude: 53.34,
      longitude: -6.27,
      timezone: 'Europe/Dublin',
      locale: 'en-IE',
    })
  })

  test('write immediately reflected by cache, and persists across hydrate', () => {
    store.hydrate()

    store.setHubitat({ baseUrl: 'http://a', token: 't', webhookSecret: null })
    assert.deepEqual(store.getHubitat(), {
      baseUrl: 'http://a',
      token: 't',
      webhookSecret: null,
    })

    // Verify DB persistence by re-hydrating from disk
    store._resetForTests()
    store.hydrate()
    assert.deepEqual(store.getHubitat(), {
      baseUrl: 'http://a',
      token: 't',
      webhookSecret: null,
    })
  })

  test('reads before hydrate throw', () => {
    // _resetForTests already ran in beforeEach
    assert.throws(() => store.getLocation(), /not hydrated/)
  })
})

describe('settings-store: ensureHubitatWebhookSecret', () => {
  test('generates + persists a UUID when secret is null', () => {
    store.hydrate()
    store.seedFromEnvIfMissing()
    assert.equal(store.getHubitat().webhookSecret, null)

    const secret = store.ensureHubitatWebhookSecret()
    assert.equal(typeof secret, 'string')
    // RFC-4122 v4 UUID shape: 8-4-4-4-12 hex
    assert.match(secret, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    assert.equal(store.getHubitat().webhookSecret, secret)

    // Persistence: a fresh hydrate must surface the same value.
    store._resetForTests()
    store.hydrate()
    assert.equal(store.getHubitat().webhookSecret, secret)
  })

  test('leaves an existing secret untouched', () => {
    setEnv({ HUBITAT_WEBHOOK_SECRET: 'pre-existing-secret' })
    store.hydrate()
    store.seedFromEnvIfMissing()
    assert.equal(store.getHubitat().webhookSecret, 'pre-existing-secret')

    const returned = store.ensureHubitatWebhookSecret()
    assert.equal(returned, 'pre-existing-secret')
    assert.equal(store.getHubitat().webhookSecret, 'pre-existing-secret')
  })

  test('treats empty string as missing and generates a fresh UUID', () => {
    store.hydrate()
    store.setSetting('hubitat.webhookSecret', '')
    const secret = store.ensureHubitatWebhookSecret()
    assert.ok(secret.length > 0)
    assert.notEqual(secret, '')
  })

  test('regenerate produces a new UUID and replaces the existing one', () => {
    store.hydrate()
    store.seedFromEnvIfMissing()
    const first = store.ensureHubitatWebhookSecret()
    const second = store.regenerateHubitatWebhookSecret()
    assert.notEqual(first, second)
    assert.match(second, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    assert.equal(store.getHubitat().webhookSecret, second)
  })
})

describe('settings-store: Spotify publicBaseUrl', () => {
  test('getSpotify() includes publicBaseUrl (null by default)', () => {
    store.hydrate()
    store.seedFromEnvIfMissing()
    assert.deepEqual(store.getSpotify(), {
      clientId: null,
      clientSecret: null,
      redirectUri: null,
      publicBaseUrl: null,
    })
  })

  test('setSpotify({...publicBaseUrl}) round-trips through hydrate', () => {
    store.hydrate()
    store.setSpotify({
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: null,
      publicBaseUrl: 'https://home.example.com',
    })

    assert.deepEqual(store.getSpotify(), {
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: null,
      publicBaseUrl: 'https://home.example.com',
    })

    store._resetForTests()
    store.hydrate()
    assert.equal(store.getSpotify().publicBaseUrl, 'https://home.example.com')
  })
})

describe('settings-store: migrateSpotifyPublicBaseUrl', () => {
  test('extracts host from a well-formed legacy redirectUri', () => {
    // Mirrors the existing-user case: SPOTIFY_REDIRECT_URI=https://home.thefairies.ie/api/spotify/callback
    setEnv({ SPOTIFY_REDIRECT_URI: 'https://home.thefairies.ie/api/spotify/callback' })
    store.hydrate()
    store.seedFromEnvIfMissing()
    assert.equal(store.getSpotify().publicBaseUrl, null)

    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, 'https://home.thefairies.ie')
    // The legacy redirectUri stays put — it remains accepted for back-compat.
    assert.equal(store.getSpotify().redirectUri, 'https://home.thefairies.ie/api/spotify/callback')
  })

  test('http + port redirect URI extracts the full prefix', () => {
    store.hydrate()
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: 'http://localhost:3001/api/spotify/callback',
      publicBaseUrl: null,
    })
    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, 'http://localhost:3001')
  })

  test('idempotent — second run is a no-op', () => {
    store.hydrate()
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: 'https://example.com/api/spotify/callback',
      publicBaseUrl: null,
    })
    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, 'https://example.com')

    // Second run must not overwrite a deliberately changed value.
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: 'https://example.com/api/spotify/callback',
      publicBaseUrl: 'https://something-else.example.org',
    })
    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, 'https://something-else.example.org')
  })

  test('does not touch an already-set publicBaseUrl', () => {
    store.hydrate()
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: 'https://example.com/api/spotify/callback',
      publicBaseUrl: 'https://manually-set.example.org',
    })
    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, 'https://manually-set.example.org')
  })

  test('ignores malformed redirectUri (no scheme, wrong path, trailing slash)', () => {
    store.hydrate()

    // No scheme
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: 'example.com/api/spotify/callback',
      publicBaseUrl: null,
    })
    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, null)

    // Wrong path
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: 'https://example.com/some/other/path',
      publicBaseUrl: null,
    })
    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, null)

    // Trailing slash
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: 'https://example.com/api/spotify/callback/',
      publicBaseUrl: null,
    })
    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, null)
  })

  test('no-op when redirectUri is null', () => {
    store.hydrate()
    store.setSpotify({
      clientId: null,
      clientSecret: null,
      redirectUri: null,
      publicBaseUrl: null,
    })
    store.migrateSpotifyPublicBaseUrl()
    assert.equal(store.getSpotify().publicBaseUrl, null)
  })
})
