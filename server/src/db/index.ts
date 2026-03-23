import Database, { type Database as DatabaseType } from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const dbPath = process.env.FAIRY_DB_PATH || './data/thefairies.sqlite'
const dbDir = path.dirname(dbPath)

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db: DatabaseType = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      name TEXT PRIMARY KEY,
      display_order INTEGER DEFAULT 0,
      parent_room TEXT,
      auto INTEGER DEFAULT 1,
      timer INTEGER DEFAULT 15,
      sensors TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      current_scene TEXT,
      last_active TEXT,
      temperature REAL,
      lux REAL,
      mode_changed INTEGER DEFAULT 0,
      scene_manual INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenes (
      name TEXT PRIMARY KEY,
      icon TEXT DEFAULT '',
      rooms TEXT DEFAULT '[]',
      modes TEXT DEFAULT '[]',
      commands TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS light_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      light_id TEXT NOT NULL,
      light_label TEXT NOT NULL,
      light_selector TEXT NOT NULL,
      room_name TEXT NOT NULL REFERENCES rooms(name),
      has_color INTEGER DEFAULT 1,
      min_kelvin INTEGER DEFAULT 2500,
      max_kelvin INTEGER DEFAULT 9000,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(light_id, room_name)
    );

    CREATE TABLE IF NOT EXISTS current_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      seq INTEGER DEFAULT 1,
      message TEXT NOT NULL,
      debug TEXT,
      category TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hub_devices (
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      device_name TEXT,
      device_type TEXT DEFAULT 'switch',
      capabilities TEXT DEFAULT '[]',
      attributes TEXT DEFAULT '{}',
      room_name TEXT,
      last_event TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      device_label TEXT NOT NULL,
      device_type TEXT NOT NULL CHECK(device_type IN ('light','switch','sensor','dimmer','contact','motion','twinkly','fairy')),
      room_name TEXT NOT NULL REFERENCES rooms(name),
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(device_id, room_name)
    );
  `)

  // Migration: add scene_manual column to rooms
  try {
    db.prepare('SELECT scene_manual FROM rooms LIMIT 1').get()
  } catch {
    console.log('[db] Migrating rooms: adding scene_manual column')
    db.exec('ALTER TABLE rooms ADD COLUMN scene_manual INTEGER DEFAULT 0')
  }

  // Migration: add auto_activate column to scenes
  try {
    db.prepare('SELECT auto_activate FROM scenes LIMIT 1').get()
  } catch {
    console.log('[db] Migrating scenes: adding auto_activate column')
    db.exec('ALTER TABLE scenes ADD COLUMN auto_activate INTEGER DEFAULT 1')
  }

  // Migration: add active_from/active_to columns to scenes for seasonal date ranges
  try {
    db.prepare("SELECT active_from FROM scenes LIMIT 1").get()
  } catch {
    console.log('[db] Migrating scenes: adding active_from, active_to columns')
    db.exec("ALTER TABLE scenes ADD COLUMN active_from TEXT")
    db.exec("ALTER TABLE scenes ADD COLUMN active_to TEXT")
  }

  // Migration: fix device_rooms CHECK constraint if it doesn't include twinkly/fairy
  // This handles databases created before the constraint was updated
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'device_rooms'").get() as { sql: string } | undefined
    if (tableInfo?.sql && !tableInfo.sql.includes("'twinkly'")) {
      console.log('[db] Migrating device_rooms: adding twinkly/fairy to CHECK constraint')
      const existingData = db.prepare('SELECT * FROM device_rooms').all()
      db.exec('DROP TABLE device_rooms')
      db.exec(`
        CREATE TABLE device_rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL,
          device_label TEXT NOT NULL,
          device_type TEXT NOT NULL CHECK(device_type IN ('light','switch','sensor','dimmer','contact','motion','twinkly','fairy')),
          room_name TEXT NOT NULL REFERENCES rooms(name),
          config TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(device_id, room_name)
        )
      `)
      const insert = db.prepare('INSERT INTO device_rooms (device_id, device_label, device_type, room_name, config) VALUES (?, ?, ?, ?, ?)')
      for (const row of existingData as any[]) {
        insert.run(row.device_id, row.device_label, row.device_type, row.room_name, row.config || '{}')
      }
      console.log(`[db] Migrated ${(existingData as any[]).length} device_rooms rows`)
    }
  } catch (e) {
    console.error('[db] Migration warning:', e)
  }
}

export function getAll<T>(sql: string, params?: unknown[]): T[] {
  const stmt = db.prepare(sql)
  return (params ? stmt.all(...params) : stmt.all()) as T[]
}

export function getOne<T>(sql: string, params?: unknown[]): T | undefined {
  const stmt = db.prepare(sql)
  return (params ? stmt.get(...params) : stmt.get()) as T | undefined
}

export function run(sql: string, params?: unknown[]): Database.RunResult {
  const stmt = db.prepare(sql)
  return params ? stmt.run(...params) : stmt.run()
}

export { db }
