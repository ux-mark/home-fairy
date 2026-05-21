/**
 * Phase 4 — auto-play schedule gating tests.
 *
 * Covers:
 *   - DB migration adds the three nullable columns and leaves existing rows
 *     untouched.
 *   - passesSchedule() — day-of-week gate, time-window gate, wrap-around,
 *     inclusive-start / exclusive-end, settings-store-driven TZ.
 *   - withinWindow() / nowIn() pure helpers.
 *   - /api/sonos/auto-play Zod validation: empty days_of_week, bad HH:MM,
 *     time-pair half-set, valid round-trip.
 */

import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import { AddressInfo } from 'node:net'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-play-schedule-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

// Imports must come AFTER FAIRY_DB_PATH is set — db/index.ts captures it
// at module-init time.
const { initDb, db } = await import('../db/index.js')
const store = await import('../lib/settings-store.js')
const { passesSchedule } = await import('../lib/sonos-manager.js')
const { withinWindow, nowIn } = await import('../lib/schedule-window.js')
const sonosRoutes = (await import('../routes/sonos.js')).default

function resetState(): void {
  db.prepare('DELETE FROM sonos_auto_play').run()
  db.prepare('DELETE FROM app_settings').run()
  store._resetForTests()
  store.hydrate()
  // Reset to Europe/Dublin so each test starts from a known TZ.
  store.setLocation({ latitude: 53.34, longitude: -6.27, timezone: 'Europe/Dublin', locale: 'en-IE' })
}

before(() => {
  // Seed a "Morning" mode so the FK on sonos_auto_play.mode_name is satisfied.
  initDb()
  db.prepare("INSERT OR IGNORE INTO modes (name, display_order) VALUES ('Morning', 1)").run()
})

beforeEach(() => {
  resetState()
})

// ───────────────────────── DB migration ─────────────────────────

describe('DB migration', () => {
  test('sonos_auto_play has the three new nullable columns', () => {
    const cols = db.prepare("PRAGMA table_info('sonos_auto_play')").all() as { name: string; notnull: number; dflt_value: string | null }[]
    const byName = new Map(cols.map(c => [c.name, c]))
    for (const col of ['days_of_week', 'time_start', 'time_end']) {
      const c = byName.get(col)
      assert.ok(c, `column ${col} should exist`)
      assert.equal(c!.notnull, 0, `column ${col} should be nullable`)
      assert.equal(c!.dflt_value, 'NULL', `column ${col} should default to NULL`)
    }
  })

  test('an existing row with NULL schedule columns is preserved across re-init', () => {
    db.prepare(
      `INSERT INTO sonos_auto_play (room_name, mode_name, favourite_name, trigger_type)
       VALUES ('Kitchen', 'Morning', 'Radio 4', 'mode_change')`,
    ).run()
    initDb() // re-run migrations — should be idempotent
    const row = db.prepare("SELECT * FROM sonos_auto_play WHERE favourite_name = 'Radio 4'").get() as {
      days_of_week: string | null
      time_start: string | null
      time_end: string | null
      favourite_name: string
    }
    assert.equal(row.favourite_name, 'Radio 4')
    assert.equal(row.days_of_week, null)
    assert.equal(row.time_start, null)
    assert.equal(row.time_end, null)
  })
})

// ───────────────────────── withinWindow pure helper ─────────────────────────

describe('withinWindow', () => {
  test('standard same-day window: inside is true', () => {
    assert.equal(withinWindow('12:00', '07:00', '22:00'), true)
  })
  test('standard same-day: before start is false', () => {
    assert.equal(withinWindow('06:59', '07:00', '22:00'), false)
  })
  test('standard same-day: at start is true (inclusive)', () => {
    assert.equal(withinWindow('07:00', '07:00', '22:00'), true)
  })
  test('standard same-day: at end is false (exclusive)', () => {
    assert.equal(withinWindow('22:00', '07:00', '22:00'), false)
  })
  test('wrap-around: 23:00 in 22:00→06:00 is true', () => {
    assert.equal(withinWindow('23:00', '22:00', '06:00'), true)
  })
  test('wrap-around: 02:00 in 22:00→06:00 is true', () => {
    assert.equal(withinWindow('02:00', '22:00', '06:00'), true)
  })
  test('wrap-around: 12:00 in 22:00→06:00 is false', () => {
    assert.equal(withinWindow('12:00', '22:00', '06:00'), false)
  })
  test('wrap-around: at start is true', () => {
    assert.equal(withinWindow('22:00', '22:00', '06:00'), true)
  })
  test('wrap-around: at end is false (exclusive)', () => {
    assert.equal(withinWindow('06:00', '22:00', '06:00'), false)
  })
})

// ───────────────────────── nowIn ─────────────────────────

describe('nowIn', () => {
  test('returns ISO day Mon=1 for a known Monday UTC instant', () => {
    // 2024-01-08T12:00:00Z was a Monday.
    const { isoDay, hhmm } = nowIn('UTC', new Date('2024-01-08T12:00:00Z'))
    assert.equal(isoDay, 1)
    assert.equal(hhmm, '12:00')
  })
  test('returns ISO day Sun=7 for a known Sunday UTC instant', () => {
    const { isoDay } = nowIn('UTC', new Date('2024-01-07T12:00:00Z'))
    assert.equal(isoDay, 7)
  })
  test('respects the requested timezone', () => {
    // 2024-06-15T03:30:00Z is 2024-06-15 04:30 in Europe/Dublin (BST/IST)
    const { hhmm: dublin } = nowIn('Europe/Dublin', new Date('2024-06-15T03:30:00Z'))
    assert.equal(dublin, '04:30')
    // Same instant in America/New_York: 2024-06-14 23:30 EDT
    const { hhmm: ny, isoDay: nyDay } = nowIn('America/New_York', new Date('2024-06-15T03:30:00Z'))
    assert.equal(ny, '23:30')
    assert.equal(nyDay, 5) // Friday
  })
})

// ───────────────────────── passesSchedule ─────────────────────────

describe('passesSchedule', () => {
  test('rule with all schedule columns NULL passes always (regression)', () => {
    const rule = { days_of_week: null, time_start: null, time_end: null }
    // Pick any date — should still pass.
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T12:00:00Z')), true)
    assert.equal(passesSchedule(rule, null, new Date('2024-06-01T03:00:00Z')), true)
  })

  test('weekdays only: Monday → fire, Saturday → skip', () => {
    const rule = { days_of_week: JSON.stringify([1, 2, 3, 4, 5]), time_start: null, time_end: null }
    // 2024-01-08 is Monday, 2024-01-13 is Saturday.
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T12:00:00Z')), true)
    assert.equal(passesSchedule(rule, null, new Date('2024-01-13T12:00:00Z')), false)
  })

  test('07:00–22:00 window: noon fires, 06:59 skips, 22:00 skips (exclusive)', () => {
    const rule = { days_of_week: null, time_start: '07:00', time_end: '22:00' }
    // We're in Europe/Dublin. In January Dublin is UTC+0, so UTC = local time.
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T12:00:00Z')), true)
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T06:59:00Z')), false)
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T22:00:00Z')), false)
  })

  test('wrap-around 22:00–06:00: 23:00 fires, 02:00 fires, 12:00 skips', () => {
    const rule = { days_of_week: null, time_start: '22:00', time_end: '06:00' }
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T23:00:00Z')), true)
    assert.equal(passesSchedule(rule, null, new Date('2024-01-09T02:00:00Z')), true)
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T12:00:00Z')), false)
  })

  test('settings-store TZ flips the answer for the same UTC instant', () => {
    // Rule: weekdays only, 07:00–22:00.
    const rule = { days_of_week: JSON.stringify([1, 2, 3, 4, 5]), time_start: '07:00', time_end: '22:00' }
    // 2024-06-15T03:30:00Z is Friday in Dublin (04:30 local) → out of window.
    // Same instant in America/New_York is Thursday 23:30 → also out of window
    // and additionally a different ISO day. Pick an instant where both filters
    // flip: 2024-06-15T05:00:00Z = Dublin Sat 06:00 (wrong day + before 07:00),
    // and NY Fri 01:00 (right day but before 07:00). Try
    // 2024-06-14T11:00:00Z = Dublin Fri 12:00 (PASS), NY Fri 07:00 (PASS, at boundary).
    // 2024-06-15T03:00:00Z = Dublin Sat 04:00 (FAIL — Saturday + early), NY Thu 23:00 (FAIL — Thursday).
    // Use an instant that flips the TIME-window only: 2024-06-15T05:30:00Z
    //   Dublin: Sat 06:30 — out (day filter)
    //   NY:     Fri 01:30 — out (time filter)
    // Both out. We need an instant that passes one TZ and fails the other.
    // 2024-06-14T22:30:00Z:
    //   Dublin: Fri 23:30 — passes day filter, fails time filter (>22:00).
    //   NY:     Fri 18:30 — passes day filter AND time filter.
    const moment = new Date('2024-06-14T22:30:00Z')

    store.setLocation({ latitude: 53.34, longitude: -6.27, timezone: 'Europe/Dublin', locale: 'en-IE' })
    assert.equal(passesSchedule(rule, null, moment), false, 'Dublin: out of time window')

    store.setLocation({ latitude: 40.71, longitude: -74.0, timezone: 'America/New_York', locale: 'en-US' })
    assert.equal(passesSchedule(rule, null, moment), true, 'NY: in time window')
  })

  test('malformed days_of_week JSON skips rather than throws', () => {
    const rule = { days_of_week: 'not-json', time_start: null, time_end: null }
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T12:00:00Z')), false)
  })
})

// ───────────────────────── Route validation ─────────────────────────

async function startTestServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express()
  app.use(express.json())
  app.use('/api/sonos', sonosRoutes)
  const server = http.createServer(app)
  await new Promise<void>(r => server.listen(0, () => r()))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => server.close(() => r())),
  }
}

interface RawErrorIssue { message: string; path?: (string | number)[] }
interface ErrorBody { error?: RawErrorIssue[] | string }

describe('POST /api/sonos/auto-play validation', () => {
  test('time-window rule (no mode) round-trips with parsed days + HH:MM', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          room_name: null,
          // No mode_name → time-window basis.
          favourite_name: 'Wake-up Radio',
          trigger_type: 'if_not_playing',
          days_of_week: [1, 2, 3, 4, 5],
          time_start: '07:00',
          time_end: '09:30',
        }),
      })
      assert.equal(res.status, 201)
      const body = await res.json() as {
        id: number
        mode_name: string | null
        days_of_week: number[] | null
        time_start: string | null
        time_end: string | null
      }
      assert.equal(body.mode_name, null)
      assert.deepEqual(body.days_of_week, [1, 2, 3, 4, 5])
      assert.equal(body.time_start, '07:00')
      assert.equal(body.time_end, '09:30')

      // GET returns it parsed too.
      const list = await fetch(`${url}/api/sonos/auto-play`)
      const rules = await list.json() as Array<{ id: number; days_of_week: number[] | null }>
      const created = rules.find(r => r.id === body.id)
      assert.ok(created)
      assert.deepEqual(created!.days_of_week, [1, 2, 3, 4, 5])
    } finally {
      await close()
    }
  })

  test('mode rule (no times) round-trips', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
        }),
      })
      assert.equal(res.status, 201)
      const body = await res.json() as { mode_name: string | null; time_start: string | null }
      assert.equal(body.mode_name, 'Morning')
      assert.equal(body.time_start, null)
    } finally {
      await close()
    }
  })

  test('mode AND time-window together → 400 (XOR)', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'if_not_playing',
          time_start: '07:00',
          time_end: '09:00',
        }),
      })
      assert.equal(res.status, 400)
    } finally {
      await close()
    }
  })

  test('neither mode nor time-window → 400', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          favourite_name: 'X',
          trigger_type: 'if_not_playing',
          days_of_week: [1, 2, 3],
        }),
      })
      assert.equal(res.status, 400)
    } finally {
      await close()
    }
  })

  test('empty days_of_week → 400', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
          days_of_week: [],
        }),
      })
      assert.equal(res.status, 400)
      const body = await res.json() as ErrorBody
      assert.ok(Array.isArray(body.error))
    } finally {
      await close()
    }
  })

  test('duplicate days_of_week → 400', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
          days_of_week: [1, 1, 2],
        }),
      })
      assert.equal(res.status, 400)
    } finally {
      await close()
    }
  })

  test('bad HH:MM → 400', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
          time_start: '25:00',
          time_end: '09:00',
        }),
      })
      assert.equal(res.status, 400)
    } finally {
      await close()
    }
  })

  test('only one of start/end → 400', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
          time_start: '07:00',
        }),
      })
      assert.equal(res.status, 400)
    } finally {
      await close()
    }
  })

  test('all schedule fields omitted → 201, all-null persists', async () => {
    const { url, close } = await startTestServer()
    try {
      const res = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
        }),
      })
      assert.equal(res.status, 201)
      const body = await res.json() as { days_of_week: number[] | null; time_start: string | null; time_end: string | null }
      assert.equal(body.days_of_week, null)
      assert.equal(body.time_start, null)
      assert.equal(body.time_end, null)
    } finally {
      await close()
    }
  })
})

describe('PUT /api/sonos/auto-play/:id validation', () => {
  test('partial update clears day filter with explicit null on a mode rule', async () => {
    const { url, close } = await startTestServer()
    try {
      // Create a mode rule with a day filter.
      const createRes = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
          days_of_week: [1, 2],
        }),
      })
      const created = await createRes.json() as { id: number }

      // Clear the day filter.
      const putRes = await fetch(`${url}/api/sonos/auto-play/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days_of_week: null }),
      })
      assert.equal(putRes.status, 200)
      const body = await putRes.json() as { days_of_week: number[] | null; mode_name: string | null }
      assert.equal(body.days_of_week, null)
      assert.equal(body.mode_name, 'Morning')
    } finally {
      await close()
    }
  })

  test('updating only one of start/end → 400', async () => {
    const { url, close } = await startTestServer()
    try {
      const createRes = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
        }),
      })
      const created = await createRes.json() as { id: number }
      const putRes = await fetch(`${url}/api/sonos/auto-play/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ time_start: '07:00' }),
      })
      assert.equal(putRes.status, 400)
    } finally {
      await close()
    }
  })

  test('PUT that would leave the rule with mode AND time set → 400 (XOR enforced on merged shape)', async () => {
    const { url, close } = await startTestServer()
    try {
      // Existing mode rule.
      const createRes = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
        }),
      })
      const created = await createRes.json() as { id: number }
      // Try to add a time window without clearing the mode → should be rejected.
      const putRes = await fetch(`${url}/api/sonos/auto-play/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ time_start: '07:00', time_end: '09:00' }),
      })
      assert.equal(putRes.status, 400)
    } finally {
      await close()
    }
  })

  test('switch a rule from mode to time-window in one PUT (atomic XOR flip)', async () => {
    const { url, close } = await startTestServer()
    try {
      const createRes = await fetch(`${url}/api/sonos/auto-play`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: 'Morning',
          favourite_name: 'X',
          trigger_type: 'mode_change',
        }),
      })
      const created = await createRes.json() as { id: number }
      const putRes = await fetch(`${url}/api/sonos/auto-play/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode_name: null,
          time_start: '07:00',
          time_end: '09:00',
        }),
      })
      assert.equal(putRes.status, 200)
      const body = await putRes.json() as { mode_name: string | null; time_start: string | null }
      assert.equal(body.mode_name, null)
      assert.equal(body.time_start, '07:00')
    } finally {
      await close()
    }
  })
})

// ───────────────────────── Mode-match gating ─────────────────────────

describe('passesSchedule mode gating', () => {
  test('mode-bound rule fires only when current mode matches', () => {
    const rule = {
      mode_name: 'Morning',
      days_of_week: null,
      time_start: null,
      time_end: null,
    }
    assert.equal(passesSchedule(rule, 'Morning', new Date('2024-01-08T12:00:00Z')), true)
    assert.equal(passesSchedule(rule, 'Evening', new Date('2024-01-08T12:00:00Z')), false)
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T12:00:00Z')), false)
  })

  test('time-window rule ignores current mode', () => {
    const rule = {
      mode_name: null,
      days_of_week: null,
      time_start: '07:00',
      time_end: '22:00',
    }
    // Same UTC instant, any mode — only the window matters.
    assert.equal(passesSchedule(rule, 'Morning', new Date('2024-01-08T12:00:00Z')), true)
    assert.equal(passesSchedule(rule, 'Sleep Time', new Date('2024-01-08T12:00:00Z')), true)
    assert.equal(passesSchedule(rule, null, new Date('2024-01-08T23:30:00Z')), false)
  })
})
