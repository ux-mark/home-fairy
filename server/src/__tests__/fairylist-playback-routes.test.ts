/**
 * Tests for the rewritten fairylist playback endpoints:
 *   POST /api/fairylists/:id/play/:speaker  — clear queue, queue all items, play
 *   POST /api/fairylists/:id/queue/:speaker — append/next without clearing
 * sonos-client and SpeakerRegistry are monkeypatched; no hardware needed.
 */

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import { AddressInfo } from 'node:net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairylist-play-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

const { initDb, db } = await import('../db/index.js')
const { sonosClient } = await import('../lib/sonos-client.js')
const { speakerRegistry } = await import('../lib/speaker-registry.js')
const { default: fairylistsRouter } = await import('../routes/fairylists.js')

const SPEAKER_INFO = {
  uuid: 'RINCON_TEST00000000001400',
  ip: '127.0.0.1',
  room: 'Living Room',
  model: 'Test Speaker',
  lastSeen: Date.now(),
}

let calls: string[] = []

speakerRegistry.resolveByRoom = async () => SPEAKER_INFO
speakerRegistry.getByUuid = () => SPEAKER_INFO

sonosClient.playSpotifyUri = async (_speaker, uri, action) => {
  calls.push(`spotify:${action}:${uri}`)
}
sonosClient.addToQueueSOAP = async (_ip, uri) => {
  calls.push(`soap-add:${uri}`)
}
sonosClient.playNextSOAP = async (_ip, uri) => {
  calls.push(`soap-next:${uri}`)
}
sonosClient.getSpotifyService = async () => ({ sid: 12, serviceType: 3079 })
sonosClient.clearQueue = async () => {
  calls.push('clear')
}
sonosClient.getQueue = async () => []
sonosClient.playQueueFromStart = async () => {
  calls.push('play-from-start')
}

const app = express()
app.use(express.json())
app.use('/api/fairylists', fairylistsRouter)

let server: http.Server
let baseUrl: string

async function fetchJson(method: string, pathname: string, body?: unknown): Promise<{ status: number; body: any }> {
  const url = new URL(pathname, baseUrl)
  return new Promise((resolve, reject) => {
    const req = http.request(
      { method, hostname: url.hostname, port: url.port, path: url.pathname, headers: { 'content-type': 'application/json' } },
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

function seedFairylist(id: number, items: Array<{ source: string; uri: string; title: string }>): void {
  db.prepare('INSERT INTO fairylists (id, name, created_by) VALUES (?, ?, ?)').run(id, `List ${id}`, 'tester')
  const insert = db.prepare(
    'INSERT INTO fairylist_items (fairylist_id, source, source_uri, title, sort_order, added_by) VALUES (?, ?, ?, ?, ?, ?)',
  )
  items.forEach((item, i) => insert.run(id, item.source, item.uri, item.title, i, 'tester'))
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
  calls = []
  db.prepare('DELETE FROM fairylist_items').run()
  db.prepare('DELETE FROM fairylists').run()
})

describe('POST /api/fairylists/:id/play/:speaker', () => {
  test('clears queue, queues mixed sources in order, skips radio, then plays', async () => {
    seedFairylist(1, [
      { source: 'spotify', uri: 'spotify:track:abc', title: 'Spot Song' },
      { source: 'nas', uri: 'x-file-cifs://nas/a.flac', title: 'Nas Song' },
      { source: 'radio', uri: 'x-sonosapi-stream:s123?sid=254', title: 'FM Station' },
    ])
    const res = await fetchJson('POST', '/api/fairylists/1/play/Living%20Room')
    assert.equal(res.status, 200)
    assert.equal(res.body.success, true)
    assert.equal(res.body.queued, 2)
    assert.deepEqual(res.body.skipped, [{ title: 'FM Station', reason: "Radio stations can't be added to the queue" }])
    assert.deepEqual(calls, [
      'clear',
      'spotify:queue:spotify:track:abc',
      'soap-add:x-file-cifs://nas/a.flac',
      'play-from-start',
    ])
  })

  test('legacy Sonos-encoded spotify rows still play (normalised at dispatch)', async () => {
    seedFairylist(2, [
      { source: 'nas', uri: 'x-sonos-spotify:spotify%3atrack%3aabc?sid=12&flags=8232&sn=4', title: 'Mislabelled' },
    ])
    const res = await fetchJson('POST', '/api/fairylists/2/play/Living%20Room')
    assert.equal(res.status, 200)
    assert.deepEqual(calls, ['clear', 'spotify:queue:spotify:track:abc', 'play-from-start'])
  })

  test('empty fairylist is a 400; unknown fairylist is a 404', async () => {
    seedFairylist(3, [])
    const empty = await fetchJson('POST', '/api/fairylists/3/play/Living%20Room')
    assert.equal(empty.status, 400)
    const missing = await fetchJson('POST', '/api/fairylists/999/play/Living%20Room')
    assert.equal(missing.status, 404)
    assert.deepEqual(calls, [])
  })

  test('all items unqueueable → 424 and no play', async () => {
    seedFairylist(4, [{ source: 'radio', uri: 'x-sonosapi-stream:s1?sid=254', title: 'FM' }])
    const res = await fetchJson('POST', '/api/fairylists/4/play/Living%20Room')
    assert.equal(res.status, 424)
    assert.equal(res.body.queued, 0)
    assert.equal(res.body.skipped.length, 1)
    assert.ok(!calls.includes('play-from-start'))
  })
})

describe('POST /api/fairylists/:id/queue/:speaker', () => {
  test('mode append queues in list order without clearing', async () => {
    seedFairylist(5, [
      { source: 'spotify', uri: 'spotify:track:one', title: 'One' },
      { source: 'nas', uri: 'x-file-cifs://nas/two.flac', title: 'Two' },
    ])
    const res = await fetchJson('POST', '/api/fairylists/5/queue/Living%20Room', { mode: 'append' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { success: true, queued: 2, skipped: [] })
    assert.deepEqual(calls, ['spotify:queue:spotify:track:one', 'soap-add:x-file-cifs://nas/two.flac'])
  })

  test('mode next inserts in reverse so items play in list order', async () => {
    seedFairylist(6, [
      { source: 'spotify', uri: 'spotify:track:one', title: 'One' },
      { source: 'nas', uri: 'x-file-cifs://nas/two.flac', title: 'Two' },
      { source: 'spotify', uri: 'spotify:track:three', title: 'Three' },
    ])
    const res = await fetchJson('POST', '/api/fairylists/6/queue/Living%20Room', { mode: 'next' })
    assert.equal(res.status, 200)
    assert.equal(res.body.queued, 3)
    assert.deepEqual(calls, [
      'soap-next:x-sonos-spotify:spotify%3Atrack%3Athree?sid=12&flags=32&sn=1',
      'soap-next:x-file-cifs://nas/two.flac',
      'soap-next:x-sonos-spotify:spotify%3Atrack%3Aone?sid=12&flags=32&sn=1',
    ])
    assert.ok(!calls.includes('clear'))
  })

  test('radio items are skipped with reason, in list order, without failing the request', async () => {
    seedFairylist(7, [
      { source: 'radio', uri: 'x-sonosapi-stream:s1?sid=254', title: 'FM One' },
      { source: 'spotify', uri: 'spotify:track:abc', title: 'Song' },
      { source: 'radio', uri: 'x-rincon-mp3radio://stream/live', title: 'FM Two' },
    ])
    const res = await fetchJson('POST', '/api/fairylists/7/queue/Living%20Room', { mode: 'next' })
    assert.equal(res.status, 200)
    assert.equal(res.body.queued, 1)
    assert.deepEqual(res.body.skipped.map((s: { title: string }) => s.title), ['FM One', 'FM Two'])
  })

  test('invalid or missing mode is a 400', async () => {
    seedFairylist(8, [{ source: 'spotify', uri: 'spotify:track:abc', title: 'Song' }])
    const bad = await fetchJson('POST', '/api/fairylists/8/queue/Living%20Room', { mode: 'shuffle' })
    assert.equal(bad.status, 400)
    const missing = await fetchJson('POST', '/api/fairylists/8/queue/Living%20Room', {})
    assert.equal(missing.status, 400)
    assert.deepEqual(calls, [])
  })

  test('per-item failure is skipped with a reason; the rest still queue', async () => {
    seedFairylist(9, [
      { source: 'spotify', uri: 'spotify:track:bad', title: 'Broken' },
      { source: 'spotify', uri: 'spotify:track:good', title: 'Fine' },
    ])
    const original = sonosClient.playSpotifyUri
    sonosClient.playSpotifyUri = async (_speaker, uri, action) => {
      if (uri.endsWith(':bad')) throw new Error('upstream 502')
      calls.push(`spotify:${action}:${uri}`)
    }
    try {
      const res = await fetchJson('POST', '/api/fairylists/9/queue/Living%20Room', { mode: 'append' })
      assert.equal(res.status, 200)
      assert.equal(res.body.queued, 1)
      assert.equal(res.body.skipped.length, 1)
      assert.equal(res.body.skipped[0].title, 'Broken')
    } finally {
      sonosClient.playSpotifyUri = original
    }
  })
})
