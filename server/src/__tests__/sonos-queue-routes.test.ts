/**
 * Tests for source-aware queueing: the queueItemOnSpeaker dispatch helper and
 * the sonos router's /queue/:speaker/{add,playnext,restore,save-as-fairylist}
 * endpoints. The sonos-client singleton and SpeakerRegistry are monkeypatched
 * so no Sonos hardware or node-sonos-http-api is needed.
 */

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import { AddressInfo } from 'node:net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonos-queue-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

const { initDb, db } = await import('../db/index.js')
const { sonosClient } = await import('../lib/sonos-client.js')
const { speakerRegistry } = await import('../lib/speaker-registry.js')
const { queueItemOnSpeaker } = await import('../lib/sonos-queue.js')
const { default: sonosRouter } = await import('../routes/sonos.js')
type SonosQueueItem = Awaited<ReturnType<typeof sonosClient.getQueue>>[number]

const SPEAKER_INFO = {
  uuid: 'RINCON_TEST00000000001400',
  ip: '127.0.0.1',
  room: 'Living Room',
  model: 'Test Speaker',
  lastSeen: Date.now(),
}

// Call log shared by all mocks — each entry is a readable action string.
let calls: string[] = []
let queueContents: SonosQueueItem[] = []
let containerTracks: Array<{ title: string; artist: string; album: string; albumArtUri: string; uri: string }> = []

speakerRegistry.resolveByRoom = async () => SPEAKER_INFO
speakerRegistry.getByUuid = () => SPEAKER_INFO

sonosClient.playSpotifyUri = async (speaker, uri, action) => {
  calls.push(`spotify:${action}:${uri}`)
}
sonosClient.addToQueueSOAP = async (_ip, uri) => {
  calls.push(`soap-add:${uri}`)
}
sonosClient.playNextSOAP = async (_ip, uri) => {
  calls.push(`soap-next:${uri}`)
}
sonosClient.clearQueue = async () => {
  calls.push('clear')
}
sonosClient.getQueue = async () => queueContents
sonosClient.getGenreAlbumTracks = async (objectId) => {
  calls.push(`browse:${objectId}`)
  return containerTracks
}

const app = express()
app.use(express.json())
app.use('/api/sonos', sonosRouter)

let server: http.Server
let baseUrl: string

async function fetchJson(method: string, pathname: string, body?: unknown): Promise<{ status: number; body: any }> {
  const url = new URL(pathname, baseUrl)
  return new Promise((resolve, reject) => {
    const req = http.request(
      { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { 'content-type': 'application/json' } },
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
  calls = []
  queueContents = []
  containerTracks = []
})

describe('queueItemOnSpeaker dispatch', () => {
  test('spotify URI routes through the spotify action (append → queue)', async () => {
    const result = await queueItemOnSpeaker('Living Room', 'spotify:track:abc', 'append')
    assert.deepEqual(result, { queued: 1 })
    assert.deepEqual(calls, ['spotify:queue:spotify:track:abc'])
  })

  test('spotify URI in next mode uses the spotify next action', async () => {
    await queueItemOnSpeaker('Living Room', 'spotify:track:abc', 'next')
    assert.deepEqual(calls, ['spotify:next:spotify:track:abc'])
  })

  test('x-sonos-spotify queue URI is normalised before dispatch', async () => {
    await queueItemOnSpeaker('Living Room', 'x-sonos-spotify:spotify%3atrack%3aabc?sid=12&flags=8232&sn=4', 'append')
    assert.deepEqual(calls, ['spotify:queue:spotify:track:abc'])
  })

  test('radio URI is skipped with a reason and touches nothing', async () => {
    const result = await queueItemOnSpeaker('Living Room', 'x-sonosapi-stream:s123?sid=254', 'append')
    assert.equal(result.queued, 0)
    assert.match(result.skippedReason ?? '', /Radio stations/)
    assert.deepEqual(calls, [])
  })

  test('NAS file goes through SOAP add (append) and SOAP next (next)', async () => {
    await queueItemOnSpeaker('Living Room', 'x-file-cifs://nas/a.flac', 'append')
    await queueItemOnSpeaker('Living Room', 'x-file-cifs://nas/a.flac', 'next')
    assert.deepEqual(calls, ['soap-add:x-file-cifs://nas/a.flac', 'soap-next:x-file-cifs://nas/a.flac'])
  })

  test('NAS container expands to tracks, queued in order on append', async () => {
    containerTracks = [
      { title: 't1', artist: '', album: '', albumArtUri: '', uri: 'x-file-cifs://nas/1.flac' },
      { title: 't2', artist: '', album: '', albumArtUri: '', uri: 'x-file-cifs://nas/2.flac' },
    ]
    const result = await queueItemOnSpeaker('Living Room', 'A:ALBUM/Test', 'append')
    assert.equal(result.queued, 2)
    assert.deepEqual(calls, ['browse:A:ALBUM/Test', 'soap-add:x-file-cifs://nas/1.flac', 'soap-add:x-file-cifs://nas/2.flac'])
  })

  test('NAS container in next mode inserts tracks in reverse so they play in order', async () => {
    containerTracks = [
      { title: 't1', artist: '', album: '', albumArtUri: '', uri: 'x-file-cifs://nas/1.flac' },
      { title: 't2', artist: '', album: '', albumArtUri: '', uri: 'x-file-cifs://nas/2.flac' },
    ]
    await queueItemOnSpeaker('Living Room', 'A:ALBUM/Test', 'next')
    assert.deepEqual(calls, ['browse:A:ALBUM/Test', 'soap-next:x-file-cifs://nas/2.flac', 'soap-next:x-file-cifs://nas/1.flac'])
  })

  test('empty NAS container is skipped with a reason', async () => {
    const result = await queueItemOnSpeaker('Living Room', 'A:ALBUM/Empty', 'append')
    assert.equal(result.queued, 0)
    assert.match(result.skippedReason ?? '', /No tracks/)
  })

  test('unknown URI shape passes through the SOAP path', async () => {
    await queueItemOnSpeaker('Living Room', 'weird://thing', 'append')
    assert.deepEqual(calls, ['soap-add:weird://thing'])
  })
})

describe('POST /queue/:speaker/add and /playnext', () => {
  test('spotify URI dispatches via spotify action and emits 200 with shape preserved', async () => {
    const res = await fetchJson('POST', '/api/sonos/queue/Living%20Room/add', { uri: 'spotify:track:abc' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { speaker: 'Living Room', action: 'add-to-queue' })
    assert.deepEqual(calls, ['spotify:queue:spotify:track:abc'])
  })

  test('x-sonos-spotify URI normalised on playnext', async () => {
    const res = await fetchJson('POST', '/api/sonos/queue/Living%20Room/playnext', {
      uri: 'x-sonos-spotify:spotify%3atrack%3aabc?sid=12&flags=8232&sn=4',
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { speaker: 'Living Room', action: 'play-next' })
    assert.deepEqual(calls, ['spotify:next:spotify:track:abc'])
  })

  test('NAS file URI keeps the SOAP path', async () => {
    const res = await fetchJson('POST', '/api/sonos/queue/Living%20Room/add', { uri: 'x-file-cifs://nas/a.flac' })
    assert.equal(res.status, 200)
    assert.deepEqual(calls, ['soap-add:x-file-cifs://nas/a.flac'])
  })

  test('radio URI is rejected with 400 and a clear message', async () => {
    const res = await fetchJson('POST', '/api/sonos/queue/Living%20Room/add', { uri: 'x-rincon-mp3radio://stream/live' })
    assert.equal(res.status, 400)
    assert.match(res.body.error, /Radio stations/)
    assert.deepEqual(calls, [])
  })

  test('missing uri is a 400', async () => {
    const res = await fetchJson('POST', '/api/sonos/queue/Living%20Room/add', {})
    assert.equal(res.status, 400)
  })
})

describe('POST /queue/:speaker/restore', () => {
  test('spotify URIs survive restore; radio URIs count as failures', async () => {
    const res = await fetchJson('POST', '/api/sonos/queue/Living%20Room/restore', {
      uris: [
        'x-sonos-spotify:spotify%3atrack%3aabc?sid=12&flags=8232&sn=4',
        'x-file-cifs://nas/a.flac',
        'x-sonosapi-stream:s123?sid=254',
      ],
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.added, 2)
    assert.equal(res.body.failedCount, 1)
    assert.deepEqual(calls, ['spotify:queue:spotify:track:abc', 'soap-add:x-file-cifs://nas/a.flac'])
  })
})

describe('POST /queue/:speaker/save-as-fairylist', () => {
  test('classifies queue URIs and stores canonical source + uri', async () => {
    db.prepare("INSERT INTO fairylists (id, name, created_by) VALUES (101, 'Test', 'tester')").run()
    queueContents = [
      { title: 'Spot Track', artist: 'A', album: '', albumArtUri: '', uri: 'x-sonos-spotify:spotify%3atrack%3aabc?sid=12&flags=8232&sn=4' },
      { title: 'Nas Track', artist: 'B', album: '', albumArtUri: '', uri: 'x-file-cifs://nas/a.flac' },
    ]
    const res = await fetchJson('POST', '/api/sonos/queue/Living%20Room/save-as-fairylist', { fairylistId: 101 })
    assert.equal(res.status, 200)
    const rows = db.prepare('SELECT source, source_uri, title, added_by FROM fairylist_items WHERE fairylist_id = 101 ORDER BY sort_order').all() as Array<{ source: string; source_uri: string; title: string; added_by: string }>
    assert.equal(rows.length, 2)
    assert.equal(rows[0].source, 'spotify')
    assert.equal(rows[0].source_uri, 'spotify:track:abc')
    assert.equal(rows[1].source, 'nas')
    assert.equal(rows[1].source_uri, 'x-file-cifs://nas/a.flac')
    // added_by must be set — INSERT OR IGNORE used to silently drop rows without it
    assert.ok(rows[0].added_by)
  })
})
