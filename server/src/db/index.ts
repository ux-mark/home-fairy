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
      promoted INTEGER DEFAULT 0,
      auto INTEGER DEFAULT 1,
      timer INTEGER DEFAULT 15,
      tags TEXT DEFAULT '[]',
      current_scene TEXT,
      last_active TEXT,
      scene_manual INTEGER DEFAULT 0,
      created_by TEXT DEFAULT 'fairy-queen',
      updated_by TEXT DEFAULT 'fairy-queen',
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
      last_activated_by TEXT DEFAULT 'fairy-queen',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      created_by TEXT DEFAULT 'fairy-queen',
      updated_by TEXT DEFAULT 'fairy-queen',
      sort_order INTEGER DEFAULT 0
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
      active INTEGER DEFAULT 1,
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
      user_id TEXT,
      user_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hub_devices (
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      device_name TEXT,
      device_type TEXT DEFAULT 'switch',
      capabilities TEXT DEFAULT '[]',
      attributes TEXT DEFAULT '{}',
      active INTEGER DEFAULT 1,
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
      active INTEGER DEFAULT 1,
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

    -- hub_devices.label is used as a JOIN key by motion-handler's lux query
    -- (device_rooms.device_label = h.label) and by several scene-executor
    -- lookups for Twinkly / Fairy devices. Without this index those JOINs
    -- scan the full hub_devices table on every motion event.
    CREATE INDEX IF NOT EXISTS idx_hub_devices_label
      ON hub_devices (label);

    CREATE TABLE IF NOT EXISTS room_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_name TEXT NOT NULL,
      sensor_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_room_activity_lookup
      ON room_activity (room_name, recorded_at);

    CREATE INDEX IF NOT EXISTS idx_logs_category
      ON logs (category, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_logs_parent_id
      ON logs (parent_id) WHERE parent_id IS NOT NULL;

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

    CREATE TABLE IF NOT EXISTS device_health (
      device_type TEXT NOT NULL,
      device_id TEXT NOT NULL,
      consecutive_failures INTEGER DEFAULT 0,
      unreachable_since TEXT,
      last_success TEXT,
      last_failure TEXT,
      last_failure_reason TEXT,
      deactivated_at TEXT,
      deactivated_reason TEXT,
      PRIMARY KEY (device_type, device_id)
    );

    CREATE TABLE IF NOT EXISTS modes (
      name TEXT PRIMARY KEY,
      display_order INTEGER DEFAULT 0,
      created_by TEXT DEFAULT 'fairy-queen',
      updated_by TEXT DEFAULT 'fairy-queen',
      created_at TEXT DEFAULT (datetime('now'))
    );

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

    CREATE TABLE IF NOT EXISTS device_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL CHECK(source_type IN ('sonos', 'kasa', 'lifx', 'hub')),
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('kasa', 'sonos', 'lifx', 'hub')),
      target_id TEXT NOT NULL,
      link_type TEXT DEFAULT 'power' CHECK(link_type IN ('power')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS sonos_speakers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_name TEXT NOT NULL REFERENCES rooms(name) ON UPDATE CASCADE ON DELETE CASCADE,
      speaker_name TEXT NOT NULL,
      favourite TEXT,
      default_volume INTEGER DEFAULT 25,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(room_name),
      UNIQUE(speaker_name)
    );

    CREATE TABLE IF NOT EXISTS sonos_auto_play (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_name TEXT,
      mode_name TEXT REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
      favourite_name TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('mode_change', 'if_not_playing', 'if_source_not')),
      trigger_value TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS access_links (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('guest', 'resident')),
      expires_at TEXT,
      max_uses INTEGER DEFAULT 1,
      use_count INTEGER DEFAULT 0,
      guest_session_duration INTEGER,
      created_by TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS access_link_uses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      used_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_actions_entity
      ON user_actions (entity_type, entity_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_user_actions_user
      ON user_actions (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS spotify_tokens (
      id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      scope TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_favourites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('sonos','spotify','nas','radio')),
      source_uri TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT,
      album_art_uri TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, source, source_uri)
    );

    CREATE TABLE IF NOT EXISTS artist_countries (
      spotify_artist_id TEXT PRIMARY KEY,
      artist_name TEXT NOT NULL,
      country_code TEXT,
      country_name TEXT,
      sub_region TEXT,
      image_url TEXT,
      source TEXT NOT NULL DEFAULT 'musicbrainz',
      musicbrainz_id TEXT,
      confidence TEXT NOT NULL DEFAULT 'high',
      resolved_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_artist_countries_name
      ON artist_countries (artist_name COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS track_countries (
      spotify_track_id TEXT PRIMARY KEY,
      track_name TEXT NOT NULL,
      isrc TEXT,
      artist_ids TEXT NOT NULL DEFAULT '[]',
      musicbrainz_recording_id TEXT,
      resolved_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_track_countries_isrc
      ON track_countries (isrc) WHERE isrc IS NOT NULL;

    CREATE TABLE IF NOT EXISTS fairylists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fairylist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fairylist_id INTEGER NOT NULL REFERENCES fairylists(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK(source IN ('sonos','spotify','nas','radio')),
      source_uri TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT,
      album_art_uri TEXT,
      sort_order INTEGER DEFAULT 0,
      added_by TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(fairylist_id, source, source_uri)
    );

    CREATE INDEX IF NOT EXISTS idx_fairylist_items_list
      ON fairylist_items (fairylist_id, sort_order);

    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,           -- JSON-encoded scalar/object
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS spotify_pinned_playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      playlist_id TEXT NOT NULL,
      uri TEXT NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT,
      owner_display_name TEXT,
      owner_id TEXT,
      track_total INTEGER,
      is_editorial INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, playlist_id)
    );

    CREATE INDEX IF NOT EXISTS idx_spotify_pinned_user
      ON spotify_pinned_playlists (user_id, sort_order);
  `)

  // Migration: add user tracking columns to scenes
  const sceneCols = db.prepare("PRAGMA table_info('scenes')").all() as { name: string }[]
  const sceneColNames = sceneCols.map(c => c.name)
  if (!sceneColNames.includes('created_by')) {
    db.exec(`ALTER TABLE scenes ADD COLUMN created_by TEXT DEFAULT 'fairy-queen'`)
  }
  if (!sceneColNames.includes('updated_by')) {
    db.exec(`ALTER TABLE scenes ADD COLUMN updated_by TEXT DEFAULT 'fairy-queen'`)
  }
  if (!sceneColNames.includes('last_activated_by')) {
    db.exec(`ALTER TABLE scenes ADD COLUMN last_activated_by TEXT DEFAULT 'fairy-queen'`)
  }

  // Add max_plays column to sonos_auto_play table if it doesn't exist
  const autoPlayCols = db.prepare("PRAGMA table_info('sonos_auto_play')").all() as { name: string }[]
  const autoPlayColNames = autoPlayCols.map(c => c.name)
  if (!autoPlayColNames.includes('max_plays')) {
    db.exec('ALTER TABLE sonos_auto_play ADD COLUMN max_plays INTEGER DEFAULT NULL')
  }
  if (!autoPlayColNames.includes('podcast_feed_url')) {
    db.exec('ALTER TABLE sonos_auto_play ADD COLUMN podcast_feed_url TEXT DEFAULT NULL')
  }
  if (!autoPlayCols.some(c => c.name === 'nas_uri')) {
    db.exec('ALTER TABLE sonos_auto_play ADD COLUMN nas_uri TEXT DEFAULT NULL')
  }
  if (!autoPlayCols.some(c => c.name === 'spotify_uri')) {
    db.exec('ALTER TABLE sonos_auto_play ADD COLUMN spotify_uri TEXT DEFAULT NULL')
  }
  // Phase 4: schedule gating (days of week + time window)
  if (!autoPlayColNames.includes('days_of_week')) {
    db.exec('ALTER TABLE sonos_auto_play ADD COLUMN days_of_week TEXT DEFAULT NULL')
  }
  if (!autoPlayColNames.includes('time_start')) {
    db.exec('ALTER TABLE sonos_auto_play ADD COLUMN time_start TEXT DEFAULT NULL')
  }
  if (!autoPlayColNames.includes('time_end')) {
    db.exec('ALTER TABLE sonos_auto_play ADD COLUMN time_end TEXT DEFAULT NULL')
  }

  // Drop the NOT NULL constraint from sonos_auto_play.mode_name so a rule can
  // be scheduled by time window alone (Mode XOR Time-window). SQLite has no
  // ALTER TABLE … DROP NOT NULL — rebuild the table preserving data.
  const modeNameCol = autoPlayCols.find(c => c.name === 'mode_name') as
    | { name: string; notnull: number }
    | undefined
  if (modeNameCol && modeNameCol.notnull === 1) {
    db.exec(`
      BEGIN;
      CREATE TABLE sonos_auto_play__new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_name TEXT,
        mode_name TEXT REFERENCES modes(name) ON UPDATE CASCADE ON DELETE CASCADE,
        favourite_name TEXT NOT NULL,
        trigger_type TEXT NOT NULL CHECK(trigger_type IN ('mode_change', 'if_not_playing', 'if_source_not')),
        trigger_value TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        max_plays INTEGER DEFAULT NULL,
        podcast_feed_url TEXT DEFAULT NULL,
        nas_uri TEXT DEFAULT NULL,
        spotify_uri TEXT DEFAULT NULL,
        days_of_week TEXT DEFAULT NULL,
        time_start TEXT DEFAULT NULL,
        time_end TEXT DEFAULT NULL
      );
      INSERT INTO sonos_auto_play__new
        (id, room_name, mode_name, favourite_name, trigger_type, trigger_value,
         enabled, created_at, updated_at, max_plays, podcast_feed_url, nas_uri,
         spotify_uri, days_of_week, time_start, time_end)
      SELECT id, room_name, mode_name, favourite_name, trigger_type, trigger_value,
             enabled, created_at, updated_at, max_plays, podcast_feed_url, nas_uri,
             spotify_uri, days_of_week, time_start, time_end
      FROM sonos_auto_play;
      DROP TABLE sonos_auto_play;
      ALTER TABLE sonos_auto_play__new RENAME TO sonos_auto_play;
      COMMIT;
    `)
    console.log('[db] Rebuilt sonos_auto_play with nullable mode_name')
  }

  // Migration: add user tracking columns to rooms
  const roomTrackCols = db.prepare("PRAGMA table_info('rooms')").all() as { name: string }[]
  const roomTrackColNames = roomTrackCols.map(c => c.name)
  if (!roomTrackColNames.includes('created_by')) {
    db.exec(`ALTER TABLE rooms ADD COLUMN created_by TEXT DEFAULT 'fairy-queen'`)
  }
  if (!roomTrackColNames.includes('updated_by')) {
    db.exec(`ALTER TABLE rooms ADD COLUMN updated_by TEXT DEFAULT 'fairy-queen'`)
  }

  // Migration: add user tracking columns to modes
  const modeTrackCols = db.prepare("PRAGMA table_info('modes')").all() as { name: string }[]
  const modeTrackColNames = modeTrackCols.map(c => c.name)
  if (!modeTrackColNames.includes('created_by')) {
    db.exec(`ALTER TABLE modes ADD COLUMN created_by TEXT DEFAULT 'fairy-queen'`)
  }
  if (!modeTrackColNames.includes('updated_by')) {
    db.exec(`ALTER TABLE modes ADD COLUMN updated_by TEXT DEFAULT 'fairy-queen'`)
  }

  // Migration: add user tracking columns to logs
  const logsCols = db.prepare("PRAGMA table_info('logs')").all() as { name: string }[]
  const logsColNames = logsCols.map(c => c.name)
  if (!logsColNames.includes('user_id')) {
    db.exec(`ALTER TABLE logs ADD COLUMN user_id TEXT`)
  }
  if (!logsColNames.includes('user_name')) {
    db.exec(`ALTER TABLE logs ADD COLUMN user_name TEXT`)
  }

  // Add sonos columns to rooms table if they don't exist
  const roomCols = db.prepare("PRAGMA table_info('rooms')").all() as { name: string }[]
  const colNames = roomCols.map(c => c.name)
  if (!colNames.includes('sonos_follow_me')) {
    db.exec('ALTER TABLE rooms ADD COLUMN sonos_follow_me INTEGER DEFAULT 1')
  }
  if (!colNames.includes('sonos_auto_start')) {
    db.exec('ALTER TABLE rooms ADD COLUMN sonos_auto_start INTEGER DEFAULT 1')
  }
  if (!colNames.includes('icon')) {
    db.exec('ALTER TABLE rooms ADD COLUMN icon TEXT DEFAULT NULL')
  }
  if (!colNames.includes('promoted')) {
    db.exec('ALTER TABLE rooms ADD COLUMN promoted INTEGER DEFAULT 0')
  }
  if (!colNames.includes('hush_scene')) {
    if (colNames.includes('manual_scene')) {
      // Rename existing manual_scene column to hush_scene
      db.exec('ALTER TABLE rooms RENAME COLUMN manual_scene TO hush_scene')
      console.log('[db] Renamed rooms.manual_scene → hush_scene')
    } else {
      db.exec('ALTER TABLE rooms ADD COLUMN hush_scene TEXT DEFAULT NULL')
    }
  }

  // Migrate current_state key from manual_active to hush_active (legacy)
  const hushActiveRow = db.prepare("SELECT value FROM current_state WHERE key = 'hush_active'").get() as { value: string } | undefined
  if (!hushActiveRow) {
    const oldManualRow = db.prepare("SELECT value FROM current_state WHERE key = 'manual_active'").get() as { value: string } | undefined
    if (oldManualRow) {
      db.prepare(
        `INSERT INTO current_state (key, value, updated_at)
         VALUES ('hush_active', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(oldManualRow.value)
      db.prepare("DELETE FROM current_state WHERE key = 'manual_active'").run()
      console.log('[db] Migrated current_state key manual_active → hush_active')
    }
  }

  // Migration: rename current_state key hush_active → hushing_active
  const hushingActiveRow = db.prepare("SELECT value FROM current_state WHERE key = 'hushing_active'").get() as { value: string } | undefined
  if (!hushingActiveRow) {
    const oldHushRow = db.prepare("SELECT value FROM current_state WHERE key = 'hush_active'").get() as { value: string } | undefined
    if (oldHushRow) {
      db.prepare(
        `INSERT INTO current_state (key, value, updated_at)
         VALUES ('hushing_active', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(oldHushRow.value)
      db.prepare("DELETE FROM current_state WHERE key = 'hush_active'").run()
      console.log('[db] Migrated current_state key hush_active → hushing_active')
    }
  }

  // Migration: seed hushing_scene from first configured room hush_scene if not already set
  const hushingSceneRow = db.prepare("SELECT value FROM current_state WHERE key = 'hushing_scene'").get() as { value: string } | undefined
  if (!hushingSceneRow) {
    const firstHushRoom = db.prepare('SELECT hush_scene FROM rooms WHERE hush_scene IS NOT NULL LIMIT 1').get() as { hush_scene: string } | undefined
    const sceneValue = firstHushRoom?.hush_scene ?? null
    if (sceneValue) {
      db.prepare(
        `INSERT INTO current_state (key, value, updated_at)
         VALUES ('hushing_scene', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(sceneValue)
      console.log(`[db] Seeded hushing_scene from room hush_scene: ${sceneValue}`)
    }
  }

  // Migration: drop hush_scene column from rooms (superseded by current_state hushing_scene)
  if (colNames.includes('hush_scene')) {
    db.exec('ALTER TABLE rooms DROP COLUMN hush_scene')
    console.log('[db] Dropped rooms.hush_scene column')
  }

  // Add active column to tables that need device deactivation support (existing DBs)
  const hubCols = db.prepare("PRAGMA table_info('hub_devices')").all() as { name: string }[]
  if (!hubCols.map(c => c.name).includes('active')) {
    db.exec("ALTER TABLE hub_devices ADD COLUMN active INTEGER DEFAULT 1")
  }
  const kasaCols = db.prepare("PRAGMA table_info('kasa_devices')").all() as { name: string }[]
  if (!kasaCols.map(c => c.name).includes('active')) {
    db.exec("ALTER TABLE kasa_devices ADD COLUMN active INTEGER DEFAULT 1")
  }
  const lightCols = db.prepare("PRAGMA table_info('light_rooms')").all() as { name: string }[]
  if (!lightCols.map(c => c.name).includes('active')) {
    db.exec("ALTER TABLE light_rooms ADD COLUMN active INTEGER DEFAULT 1")
  }

  // Add icon column to modes table if it doesn't exist
  const modeCols = db.prepare("PRAGMA table_info('modes')").all() as { name: string }[]
  const modeColNames = modeCols.map(c => c.name)
  if (!modeColNames.includes('icon')) {
    db.exec("ALTER TABLE modes ADD COLUMN icon TEXT DEFAULT NULL")
    db.exec(`UPDATE modes SET icon = 'sunrise' WHERE LOWER(name) = 'early morning'`)
    db.exec(`UPDATE modes SET icon = 'sun' WHERE LOWER(name) = 'morning'`)
    db.exec(`UPDATE modes SET icon = 'sun' WHERE LOWER(name) = 'afternoon'`)
    db.exec(`UPDATE modes SET icon = 'sunset' WHERE LOWER(name) = 'evening'`)
    db.exec(`UPDATE modes SET icon = 'moon-star' WHERE LOWER(name) = 'late evening'`)
    db.exec(`UPDATE modes SET icon = 'moon' WHERE LOWER(name) = 'night'`)
    db.exec(`UPDATE modes SET icon = 'bed' WHERE LOWER(name) = 'sleep time'`)
  }

  // Migrate WFH scene from old Hubitat device IDs to Kasa outlet IDs
  // The WFH scene still references Hubitat device IDs that no longer exist (devices migrated to Kasa sidecar)
  const wfhScene = db.prepare("SELECT commands FROM scenes WHERE name = 'WFH'").get() as { commands: string } | undefined
  if (wfhScene?.commands) {
    try {
      const cmds = JSON.parse(wfhScene.commands)
      const hasHubitatCmds = cmds.some((c: { type: string }) => c.type === 'hubitat_device')
      if (hasHubitatCmds) {
        const kasaCmds = [
          { type: 'kasa_device', name: 'WFH-Power-Computer', command: 'on', device_id: '98DAC4B32BE3_0' },
          { type: 'kasa_device', name: 'WFH-Monitor', command: 'on', device_id: '98DAC4B32BE3_1' },
          { type: 'kasa_device', name: 'WFH-Power-USB-C', command: 'on', device_id: '98DAC4B32BE3_2' },
          { type: 'kasa_device', name: 'WFH-Desk', command: 'on', device_id: '98DAC4B32BE3_4' },
        ]
        db.prepare("UPDATE scenes SET commands = ? WHERE name = 'WFH'").run(JSON.stringify(kasaCmds))
        console.log('[db] Migrated WFH scene from Hubitat to Kasa device IDs')
      }
    } catch { /* WFH scene doesn't exist or has invalid JSON — skip */ }
  }

  // Sync device_rooms labels with current hub_devices labels (fixes stale names after Hubitat renames)
  const staleLabels = db.prepare(
    `SELECT dr.device_id, dr.device_label AS old_label, hd.label AS new_label
     FROM device_rooms dr
     JOIN hub_devices hd ON dr.device_id = CAST(hd.id AS TEXT)
     WHERE dr.device_label != hd.label`,
  ).all() as Array<{ device_id: string; old_label: string; new_label: string }>
  if (staleLabels.length > 0) {
    const updateLabel = db.prepare('UPDATE device_rooms SET device_label = ? WHERE device_id = ?')
    for (const row of staleLabels) {
      updateLabel.run(row.new_label, row.device_id)
      console.log(`[db] Synced device_rooms label: "${row.old_label}" → "${row.new_label}" (device ${row.device_id})`)
    }
  }

  // Migration: add image_url to artist_countries
  const artistCountryCols = db.prepare("PRAGMA table_info('artist_countries')").all() as { name: string }[]
  if (!artistCountryCols.map(c => c.name).includes('image_url')) {
    db.exec('ALTER TABLE artist_countries ADD COLUMN image_url TEXT DEFAULT NULL')
  }

  // Migration: add artist column to user_favourites
  const favCols = db.prepare("PRAGMA table_info('user_favourites')").all() as { name: string }[]
  if (!favCols.map(c => c.name).includes('artist')) {
    db.exec('ALTER TABLE user_favourites ADD COLUMN artist TEXT DEFAULT NULL')
  }

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

// Cache of prepared statements keyed by their SQL text. better-sqlite3 does
// NOT cache statements internally — `db.prepare(sql)` re-parses the SQL
// every call (~50–500 µs depending on complexity). The motion path runs
// 10–15 prepared queries per event; reusing prepared statements saves
// 10–30 ms per event end-to-end without changing semantics.
//
// Statements bind parameters at `.run/.get/.all` time, so a cached
// statement is safe to reuse across callers and across transactions.
const _stmtCache = new Map<string, Database.Statement>()
export function prepareCached(sql: string): Database.Statement {
  let stmt = _stmtCache.get(sql)
  if (!stmt) {
    stmt = db.prepare(sql)
    _stmtCache.set(sql, stmt)
  }
  return stmt
}

export function getAll<T>(sql: string, params?: unknown[]): T[] {
  const stmt = prepareCached(sql)
  return (params ? stmt.all(...params) : stmt.all()) as T[]
}

export function getOne<T>(sql: string, params?: unknown[]): T | undefined {
  const stmt = prepareCached(sql)
  return (params ? stmt.get(...params) : stmt.get()) as T | undefined
}

export function run(sql: string, params?: unknown[]): Database.RunResult {
  const stmt = prepareCached(sql)
  return params ? stmt.run(...params) : stmt.run()
}

export { db }
