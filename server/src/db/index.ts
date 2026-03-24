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

    CREATE TABLE IF NOT EXISTS device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      value REAL,
      value_text TEXT,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_device_history_lookup
      ON device_history (source, source_id, recorded_at);

    CREATE TABLE IF NOT EXISTS room_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_name TEXT NOT NULL,
      sensor_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_room_activity_lookup
      ON room_activity (room_name, recorded_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      source_label TEXT,
      dedup_key TEXT,
      occurrence_count INTEGER DEFAULT 1,
      first_occurred_at TEXT DEFAULT (datetime('now')),
      last_occurred_at TEXT DEFAULT (datetime('now')),
      read INTEGER DEFAULT 0,
      dismissed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_unread
      ON notifications (read, dismissed, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_dedup
      ON notifications (dedup_key, dismissed);

    CREATE TABLE IF NOT EXISTS mode_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode_name TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('sun', 'time')),
      sun_event TEXT,
      trigger_time TEXT,
      trigger_days TEXT,
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_mode_triggers_mode
      ON mode_triggers (mode_name);
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

  // Migration: add last_activated_at column to scenes for tracking activation history
  try {
    db.prepare('SELECT last_activated_at FROM scenes LIMIT 1').get()
  } catch {
    console.log('[db] Migrating scenes: adding last_activated_at column')
    db.exec('ALTER TABLE scenes ADD COLUMN last_activated_at TEXT DEFAULT NULL')
    // Backfill from logs table
    db.exec(`
      UPDATE scenes SET last_activated_at = (
        SELECT MAX(created_at) FROM logs
        WHERE message LIKE 'Activating scene: ' || scenes.name
        AND category = 'scene'
      )
    `)
    console.log('[db] Backfilled last_activated_at from logs')
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

  // Migration: seed default mode triggers if mode_triggers table is empty
  try {
    const triggerCount = db.prepare('SELECT COUNT(*) as cnt FROM mode_triggers').get() as { cnt: number }
    if (triggerCount.cnt === 0) {
      console.log('[db] Seeding default sun mode triggers')
      const defaultSunTriggers = [
        { mode: 'Early Morning', event: 'nightEnd', priority: 10 },
        { mode: 'Morning', event: 'dawn', priority: 10 },
        { mode: 'Afternoon', event: 'solarNoon', priority: 10 },
        { mode: 'Evening', event: 'goldenHour', priority: 10 },
        { mode: 'Late Evening', event: 'dusk', priority: 10 },
        { mode: 'Night', event: 'night', priority: 10 },
      ]
      const insertTrigger = db.prepare(
        `INSERT INTO mode_triggers (mode_name, trigger_type, sun_event, priority)
         VALUES (?, 'sun', ?, ?)`
      )
      for (const t of defaultSunTriggers) {
        insertTrigger.run(t.mode, t.event, t.priority)
      }

      // Ensure all_modes includes defaults if not already set
      const modesRow = db.prepare("SELECT value FROM current_state WHERE key = 'all_modes'").get() as { value: string } | undefined
      let allModes: string[] = []
      try { allModes = modesRow?.value ? JSON.parse(modesRow.value) : [] } catch { allModes = [] }
      if (allModes.length === 0) {
        allModes = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Late Evening', 'Night', 'Sleep Time']
        db.prepare(
          `INSERT INTO current_state (key, value, updated_at) VALUES ('all_modes', ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).run(JSON.stringify(allModes))
      }

      // Set default sleep mode name if not already set
      const sleepRow = db.prepare("SELECT value FROM current_state WHERE key = 'sleep_mode_name'").get() as { value: string } | undefined
      if (!sleepRow) {
        db.prepare(
          `INSERT INTO current_state (key, value, updated_at) VALUES ('sleep_mode_name', 'Sleep Time', datetime('now'))
           ON CONFLICT(key) DO NOTHING`
        ).run()
      }
    }
  } catch (e) {
    console.error('[db] Migration warning (mode_triggers seed):', e)
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
