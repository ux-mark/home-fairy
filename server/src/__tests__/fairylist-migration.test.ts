/**
 * Tests for the startup migration that normalises fairylist_items rows saved
 * with Sonos-encoded Spotify URIs (x-sonos-spotify:… stored as source='nas').
 * Re-running initDb() exercises the migration against rows seeded after the
 * first run — proving it is idempotent and dedupe-safe.
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fairylist-migration-test-'))
process.env.FAIRY_DB_PATH = path.join(tmpDir, 'test.sqlite')

const { initDb, db } = await import('../db/index.js')

interface ItemRow {
  id: number
  source: string
  source_uri: string
  title: string
}

function allItems(fairylistId: number): ItemRow[] {
  return db
    .prepare('SELECT id, source, source_uri, title FROM fairylist_items WHERE fairylist_id = ? ORDER BY sort_order')
    .all(fairylistId) as ItemRow[]
}

before(() => {
  initDb()
  db.prepare("INSERT INTO fairylists (id, name, created_by) VALUES (1, 'Migrate Me', 'tester')").run()
  const insert = db.prepare(
    'INSERT INTO fairylist_items (fairylist_id, source, source_uri, title, sort_order, added_by) VALUES (1, ?, ?, ?, ?, ?)',
  )
  // Bad row whose canonical twin already exists → must be deleted, not collide
  insert.run('spotify', 'spotify:track:AAA', 'Track A (canonical)', 0, 'tester')
  insert.run('nas', 'x-sonos-spotify:spotify%3atrack%3aAAA?sid=12&flags=8232&sn=4', 'Track A (encoded dupe)', 1, 'tester')
  // Bad row with no twin → must be normalised in place
  insert.run('nas', 'x-sonos-spotify:spotify%3atrack%3aBBB?sid=12&flags=8232&sn=4', 'Track B', 2, 'tester')
  // Undecodable row → must be left untouched (not provably classifiable)
  insert.run('nas', 'x-sonos-spotify:%ZZbroken', 'Track C (malformed)', 3, 'tester')
  // Genuine NAS row → untouched
  insert.run('nas', 'x-file-cifs://nas/d.flac', 'Track D', 4, 'tester')

  // Re-run initDb — the migration sweep runs against the seeded rows.
  initDb()
})

describe('fairylist_items spotify URI migration', () => {
  test('normalises provably-spotify rows to canonical source + uri', () => {
    const items = allItems(1)
    const trackB = items.find(i => i.title === 'Track B')
    assert.ok(trackB)
    assert.equal(trackB.source, 'spotify')
    assert.equal(trackB.source_uri, 'spotify:track:BBB')
  })

  test('deletes encoded duplicates whose canonical row already exists', () => {
    const items = allItems(1)
    assert.equal(items.filter(i => i.source_uri === 'spotify:track:AAA').length, 1)
    assert.ok(!items.some(i => i.title === 'Track A (encoded dupe)'))
  })

  test('leaves undecodable and genuine NAS rows untouched', () => {
    const items = allItems(1)
    const malformed = items.find(i => i.title === 'Track C (malformed)')
    assert.ok(malformed)
    assert.equal(malformed.source, 'nas')
    assert.equal(malformed.source_uri, 'x-sonos-spotify:%ZZbroken')
    const nas = items.find(i => i.title === 'Track D')
    assert.ok(nas)
    assert.equal(nas.source_uri, 'x-file-cifs://nas/d.flac')
  })

  test('is idempotent — a third run changes nothing', () => {
    const beforeRows = JSON.stringify(allItems(1))
    initDb()
    assert.equal(JSON.stringify(allItems(1)), beforeRows)
  })
})
