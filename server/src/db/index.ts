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
      tags TEXT DEFAULT '[]',
      current_scene TEXT,
      last_active TEXT,
      scene_manual INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenes (
      name TEXT PRIMARY KEY,
      icon TEXT DEFAULT '',
      commands TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      auto_activate INTEGER DEFAULT 1,
      active_from TEXT,
      active_to TEXT,
      last_activated_at TEXT DEFAULT NULL,
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
      mode_name TEXT NOT NULL REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
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

    CREATE TABLE IF NOT EXISTS modes (
      name TEXT PRIMARY KEY,
      display_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scene_rooms (
      scene_name TEXT NOT NULL REFERENCES scenes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      room_name TEXT NOT NULL REFERENCES rooms(name) ON UPDATE CASCADE ON DELETE CASCADE,
      priority INTEGER DEFAULT 0,
      PRIMARY KEY (scene_name, room_name)
    );

    CREATE TABLE IF NOT EXISTS scene_modes (
      scene_name TEXT NOT NULL REFERENCES scenes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      mode_name TEXT NOT NULL REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      PRIMARY KEY (scene_name, mode_name)
    );
  `)

  // Seed defaults for a fresh database
  seedDefaults()
}

function seedDefaults(): void {
  const modeCount = (db.prepare('SELECT COUNT(*) as cnt FROM modes').get() as { cnt: number }).cnt
  if (modeCount === 0) {
    const defaultModes = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Late Evening', 'Night', 'Sleep Time']
    const insertMode = db.prepare('INSERT OR IGNORE INTO modes (name, display_order) VALUES (?, ?)')
    for (let i = 0; i < defaultModes.length; i++) {
      insertMode.run(defaultModes[i], i)
    }
    console.log(`[db] Seeded ${defaultModes.length} default modes`)
  }

  const triggerCount = (db.prepare('SELECT COUNT(*) as cnt FROM mode_triggers').get() as { cnt: number }).cnt
  if (triggerCount === 0) {
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
       VALUES (?, 'sun', ?, ?)`,
    )
    for (const t of defaultSunTriggers) {
      insertTrigger.run(t.mode, t.event, t.priority)
    }
    console.log('[db] Seeded default sun mode triggers')

    const sleepRow = db.prepare("SELECT value FROM current_state WHERE key = 'sleep_mode_name'").get() as { value: string } | undefined
    if (!sleepRow) {
      db.prepare(
        `INSERT INTO current_state (key, value, updated_at) VALUES ('sleep_mode_name', 'Sleep Time', datetime('now'))
         ON CONFLICT(key) DO NOTHING`,
      ).run()
    }
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
