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
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      device_label TEXT NOT NULL,
      device_type TEXT NOT NULL CHECK(device_type IN ('light','switch','sensor','dimmer','contact','motion','twinkly','fairy','kasa_plug','kasa_strip','kasa_outlet','kasa_switch','kasa_dimmer')),
      room_name TEXT NOT NULL REFERENCES rooms(name),
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(device_id, room_name)
    );

    CREATE TABLE IF NOT EXISTS kasa_devices (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      device_type TEXT NOT NULL,
      model TEXT,
      parent_id TEXT,
      ip_address TEXT,
      has_emeter INTEGER DEFAULT 0,
      firmware TEXT,
      hardware TEXT,
      rssi INTEGER,
      is_online INTEGER DEFAULT 1,
      attributes TEXT DEFAULT '{}',
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_seen TEXT
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
      PRIMARY KEY (scene_name, room_name)
    );

    CREATE TABLE IF NOT EXISTS scene_modes (
      scene_name TEXT NOT NULL REFERENCES scenes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      mode_name TEXT NOT NULL REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      PRIMARY KEY (scene_name, mode_name)
    );

    CREATE TABLE IF NOT EXISTS room_default_scenes (
      room_name TEXT NOT NULL REFERENCES rooms(name) ON UPDATE CASCADE ON DELETE CASCADE,
      mode_name TEXT NOT NULL REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      scene_name TEXT NOT NULL REFERENCES scenes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      PRIMARY KEY (room_name, mode_name)
    );
  `)

  // Migrate: rename room_auto_scenes → room_default_scenes
  migrateAutoToDefault()

  // Migrate: drop auto_activate column from scenes
  migrateDropAutoActivate()

  // Migrate: priority column → room_default_scenes table
  migrateScenePriority()

  // Seed defaults for a fresh database
  seedDefaults()
}

function migrateAutoToDefault(): void {
  // Rename room_auto_scenes to room_default_scenes if old table exists and new one doesn't
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  const hasOld = tables.some(t => t.name === 'room_auto_scenes')
  const hasNew = tables.some(t => t.name === 'room_default_scenes')
  if (!hasOld || hasNew) return

  console.log('[db] Migrating room_auto_scenes → room_default_scenes')
  db.exec('ALTER TABLE room_auto_scenes RENAME TO room_default_scenes')
  console.log('[db] Renamed room_auto_scenes to room_default_scenes')
}

function migrateDropAutoActivate(): void {
  // Drop auto_activate column from scenes table if it exists
  const cols = db.prepare("PRAGMA table_info(scenes)").all() as { name: string }[]
  const hasAutoActivate = cols.some(c => c.name === 'auto_activate')
  if (!hasAutoActivate) return

  console.log('[db] Migrating scenes: dropping auto_activate column')
  // Disable FK constraints during table recreation to avoid CASCADE deletes
  // on scene_rooms, scene_modes, and room_default_scenes
  db.pragma('foreign_keys = OFF')
  db.exec(`
    CREATE TABLE scenes_new (
      name TEXT PRIMARY KEY,
      icon TEXT DEFAULT '',
      commands TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      active_from TEXT,
      active_to TEXT,
      last_activated_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO scenes_new (name, icon, commands, tags, active_from, active_to, last_activated_at, created_at, updated_at)
      SELECT name, icon, commands, tags, active_from, active_to, last_activated_at, created_at, updated_at FROM scenes;
    DROP TABLE scenes;
    ALTER TABLE scenes_new RENAME TO scenes;
  `)
  db.pragma('foreign_keys = ON')
  console.log('[db] Removed auto_activate column from scenes')
}

function migrateScenePriority(): void {
  // Check if scene_rooms still has a priority column
  const cols = db.prepare("PRAGMA table_info(scene_rooms)").all() as { name: string }[]
  const hasPriority = cols.some(c => c.name === 'priority')
  if (!hasPriority) return

  console.log('[db] Migrating scene priority → room_default_scenes')

  db.transaction(() => {
    // Populate room_default_scenes from existing priority data:
    // For each room+mode combo, pick the highest-priority scene
    const defaultScenes = db.prepare(`
      SELECT sr.room_name, sm.mode_name, sr.scene_name, sr.priority
      FROM scene_rooms sr
      JOIN scene_modes sm ON sr.scene_name = sm.scene_name
      ORDER BY sr.room_name, sm.mode_name, sr.priority DESC
    `).all() as { room_name: string; mode_name: string; scene_name: string; priority: number }[]

    const seen = new Set<string>()
    const insert = db.prepare(
      'INSERT OR IGNORE INTO room_default_scenes (room_name, mode_name, scene_name) VALUES (?, ?, ?)',
    )
    for (const row of defaultScenes) {
      const key = `${row.room_name}::${row.mode_name}`
      if (seen.has(key)) continue
      seen.add(key)
      insert.run(row.room_name, row.mode_name, row.scene_name)
    }

    // Recreate scene_rooms without the priority column
    db.exec(`
      CREATE TABLE scene_rooms_new (
        scene_name TEXT NOT NULL REFERENCES scenes(name) ON UPDATE CASCADE ON DELETE CASCADE,
        room_name TEXT NOT NULL REFERENCES rooms(name) ON UPDATE CASCADE ON DELETE CASCADE,
        PRIMARY KEY (scene_name, room_name)
      );
      INSERT INTO scene_rooms_new (scene_name, room_name)
        SELECT scene_name, room_name FROM scene_rooms;
      DROP TABLE scene_rooms;
      ALTER TABLE scene_rooms_new RENAME TO scene_rooms;
    `)

    console.log(`[db] Migrated ${seen.size} default scene assignments, removed priority column`)
  })()
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
