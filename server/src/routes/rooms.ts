import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run, db } from '../db/index.js'
import { FAIRY_QUEEN } from '../lib/constants.js'
import { logUserAction } from '../lib/user-action-logger.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

interface RoomRow {
  name: string
  display_order: number
  parent_room: string | null
  promoted: number
  auto: number
  timer: number
  tags: string
  current_scene: string | null
  last_active: string | null
  sonos_follow_me: number
  sonos_auto_start: number
  icon: string | null
  hush_scene: string | null
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

interface LightRoomRow {
  id: number
  light_id: string
  light_label: string
  light_selector: string
  room_name: string
  has_color: number
  min_kelvin: number
  max_kelvin: number
  created_at: string
}

function parseRoom(row: RoomRow, userNameMap?: Map<string, string>) {
  let tags: unknown = []
  try { tags = JSON.parse(row.tags) } catch { tags = [] }

  // Get sensors from device_rooms table
  const sensorRows = getAll<{ device_id: string; device_label: string }>(
    "SELECT device_id, device_label FROM device_rooms WHERE room_name = ? AND device_type IN ('motion', 'sensor')",
    [row.name],
  )

  // Get temperature and lux from sensor device attributes
  const sensorReading = getOne<{ temperature: number | null; lux: number | null }>(
    `SELECT CAST(json_extract(h.attributes, '$.temperature') AS REAL) as temperature,
      CAST(json_extract(h.attributes, '$.illuminance') AS REAL) as lux
     FROM device_rooms dr
     JOIN hub_devices h ON h.label = dr.device_label
     WHERE dr.room_name = ? AND dr.device_type IN ('motion', 'sensor')
     AND (json_extract(h.attributes, '$.temperature') IS NOT NULL
       OR json_extract(h.attributes, '$.illuminance') IS NOT NULL)
     LIMIT 1`,
    [row.name],
  )

  const nameMap = userNameMap ?? new Map<string, string>([['fairy-queen', 'Fairy Queen']])

  return {
    ...row,
    sensors: sensorRows.map(s => ({ name: s.device_label, id: s.device_id })),
    tags: Array.isArray(tags) ? tags : [],
    auto: Boolean(row.auto),
    promoted: Boolean(row.promoted),
    sonos_follow_me: Boolean(row.sonos_follow_me),
    sonos_auto_start: Boolean(row.sonos_auto_start),
    hush_scene: row.hush_scene ?? null,
    temperature: sensorReading?.temperature ?? null,
    lux: sensorReading?.lux ?? null,
    created_by_name: nameMap.get(row.created_by ?? 'fairy-queen') ?? FAIRY_QUEEN.name,
    updated_by_name: nameMap.get(row.updated_by ?? 'fairy-queen') ?? FAIRY_QUEEN.name,
  }
}

function buildUserNameMap(rows: RoomRow[]): Map<string, string> {
  const userIds = new Set<string>()
  for (const room of rows) {
    if (room.created_by && room.created_by !== 'fairy-queen') userIds.add(room.created_by)
    if (room.updated_by && room.updated_by !== 'fairy-queen') userIds.add(room.updated_by)
  }
  const userNameMap = new Map<string, string>([[FAIRY_QUEEN.id, FAIRY_QUEEN.name]])
  if (userIds.size > 0) {
    const placeholders = [...userIds].map(() => '?').join(',')
    const users = getAll<{ id: string; name: string }>(
      `SELECT id, name FROM user WHERE id IN (${placeholders})`,
      [...userIds],
    )
    for (const u of users) userNameMap.set(u.id, u.name)
  }
  return userNameMap
}

const createRoomSchema = z.object({
  name: z.string().min(1),
  display_order: z.number().optional(),
  parent_room: z.string().nullable().optional(),
  promoted: z.boolean().optional(),
  auto: z.boolean().optional(),
  timer: z.number().optional(),
  tags: z.array(z.string()).optional(),
  icon: z.string().nullable().optional(),
})

const updateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  display_order: z.number().optional(),
  parent_room: z.string().nullable().optional(),
  promoted: z.boolean().optional(),
  auto: z.boolean().optional(),
  timer: z.number().optional(),
  tags: z.array(z.string()).optional(),
  current_scene: z.string().nullable().optional(),
  last_active: z.string().nullable().optional(),
  sonos_follow_me: z.boolean().optional(),
  sonos_auto_start: z.boolean().optional(),
  icon: z.string().nullable().optional(),
  hush_scene: z.string().nullable().optional(),
})

// GET /default-scenes — bulk: all default scene assignments for all rooms
router.get('/default-scenes', (_req: Request, res: Response) => {
  try {
    const rows = getAll<{ room_name: string; mode_name: string; scene_name: string }>(
      'SELECT room_name, mode_name, scene_name FROM room_default_scenes',
    )
    const result: Record<string, Record<string, string>> = {}
    for (const r of rows) {
      if (!result[r.room_name]) result[r.room_name] = {}
      result[r.room_name][r.mode_name] = r.scene_name
    }
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PUT /reorder — bulk update display_order for all rooms
router.put('/reorder', (req: Request, res: Response) => {
  try {
    const schema = z.array(z.object({
      name: z.string(),
      display_order: z.number(),
    }))
    const items = schema.parse(req.body)

    const stmt = db.prepare('UPDATE rooms SET display_order = ?, updated_at = datetime(\'now\') WHERE name = ?')
    const transaction = db.transaction((items: Array<{name: string; display_order: number}>) => {
      for (const item of items) {
        stmt.run(item.display_order, item.name)
      }
    })
    transaction(items)

    const rows = getAll<RoomRow>('SELECT * FROM rooms ORDER BY display_order')
    const userNameMap = buildUserNameMap(rows)
    res.json(rows.map(row => parseRoom(row, userNameMap)))
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET / — list all rooms
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = getAll<RoomRow>('SELECT * FROM rooms ORDER BY display_order')
    const userNameMap = buildUserNameMap(rows)
    res.json(rows.map(row => parseRoom(row, userNameMap)))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /:name — get single room with lights
router.get('/:name', (req: Request, res: Response) => {
  try {
    const row = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [req.params.name])
    if (!row) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    const lights = getAll<LightRoomRow>(
      'SELECT * FROM light_rooms WHERE room_name = ?',
      [req.params.name],
    )
    const userNameMap = buildUserNameMap([row])
    res.json({ ...parseRoom(row, userNameMap), lights })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST / — create room
router.post('/', (req: Request, res: Response) => {
  try {
    if (process.env.DEBUG) console.log('[rooms POST] body:', JSON.stringify(req.body))
    const body = createRoomSchema.parse(req.body)
    const user = (req as any).user ?? FAIRY_QUEEN
    run(
      `INSERT INTO rooms (name, display_order, parent_room, promoted, auto, timer, tags, icon, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.display_order ?? 0,
        body.parent_room ?? null,
        body.promoted !== undefined ? Number(body.promoted) : 0,
        body.auto !== undefined ? Number(body.auto) : 1,
        body.timer ?? 15,
        JSON.stringify(body.tags ?? []),
        body.icon ?? null,
        user.id,
        user.id,
      ],
    )
    logUserAction(user.id, user.name, 'create', 'room', body.name)
    const created = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [body.name])
    const userNameMap = buildUserNameMap([created!])
    res.status(201).json(parseRoom(created!, userNameMap))
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error('[rooms POST] validation error:', JSON.stringify(err.errors))
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[rooms POST] error:', msg)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PUT /:name — update room
router.put('/:name', (req: Request, res: Response) => {
  try {
    if (process.env.DEBUG) console.log(`[rooms PUT /${req.params.name}] body:`, JSON.stringify(req.body))
    const existing = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [req.params.name])
    if (!existing) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    const body = updateRoomSchema.parse(req.body)
    const user = (req as any).user ?? FAIRY_QUEEN

    // Prevent child-of-child: proposed parent must not itself have a parent
    if (body.parent_room) {
      const proposedParent = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [body.parent_room])
      if (!proposedParent) {
        res.status(400).json({ error: 'Parent room not found' })
        return
      }
      if (proposedParent.parent_room) {
        res.status(400).json({ error: 'Cannot nest rooms more than one level deep' })
        return
      }
    }

    const fields: string[] = []
    const values: unknown[] = []

    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
    if (body.display_order !== undefined) { fields.push('display_order = ?'); values.push(body.display_order) }
    if (body.parent_room !== undefined) { fields.push('parent_room = ?'); values.push(body.parent_room) }
    if (body.promoted !== undefined) { fields.push('promoted = ?'); values.push(Number(body.promoted)) }
    if (body.auto !== undefined) { fields.push('auto = ?'); values.push(Number(body.auto)) }
    if (body.timer !== undefined) { fields.push('timer = ?'); values.push(body.timer) }
    if (body.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(body.tags)) }
    if (body.current_scene !== undefined) { fields.push('current_scene = ?'); values.push(body.current_scene) }
    if (body.last_active !== undefined) { fields.push('last_active = ?'); values.push(body.last_active) }
    if (body.sonos_follow_me !== undefined) { fields.push('sonos_follow_me = ?'); values.push(Number(body.sonos_follow_me)) }
    if (body.sonos_auto_start !== undefined) { fields.push('sonos_auto_start = ?'); values.push(Number(body.sonos_auto_start)) }
    if (body.icon !== undefined) { fields.push('icon = ?'); values.push(body.icon) }
    if (body.hush_scene !== undefined) { fields.push('hush_scene = ?'); values.push(body.hush_scene) }

    if (fields.length > 0) {
      fields.push('updated_by = ?')
      values.push(user.id)
      fields.push("updated_at = datetime('now')")
      values.push(req.params.name)
      run(`UPDATE rooms SET ${fields.join(', ')} WHERE name = ?`, values)
    }

    // If renamed, update tables that lack ON UPDATE CASCADE
    const lookupName = body.name ?? req.params.name
    if (body.name && body.name !== req.params.name) {
      run('UPDATE light_rooms SET room_name = ? WHERE room_name = ?', [body.name, req.params.name])
      run('UPDATE device_rooms SET room_name = ? WHERE room_name = ?', [body.name, req.params.name])
      // Also update parent_room references in other rooms
      run('UPDATE rooms SET parent_room = ? WHERE parent_room = ?', [body.name, req.params.name])
    }

    logUserAction(user.id, user.name, 'update', 'room', String(lookupName))
    const updated = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [lookupName])
    const userNameMap = buildUserNameMap([updated!])
    res.json(parseRoom(updated!, userNameMap))
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /:name/default-scenes — get default scene assignments for a room (all modes)
router.get('/:name/default-scenes', (req: Request, res: Response) => {
  try {
    const existing = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [req.params.name])
    if (!existing) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    const rows = getAll<{ mode_name: string; scene_name: string }>(
      'SELECT mode_name, scene_name FROM room_default_scenes WHERE room_name = ?',
      [req.params.name],
    )
    const result: Record<string, string> = {}
    for (const r of rows) {
      result[r.mode_name] = r.scene_name
    }
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PUT /:name/default-scene — set or clear default scene for a room+mode combo
router.put('/:name/default-scene', (req: Request, res: Response) => {
  try {
    const existing = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [req.params.name])
    if (!existing) {
      res.status(404).json({ error: 'Room not found' })
      return
    }

    const body = z.object({
      mode: z.string().min(1),
      scene: z.string().min(1).nullable(),
    }).parse(req.body)

    if (body.scene === null) {
      // Clear default scene for this room+mode
      run('DELETE FROM room_default_scenes WHERE room_name = ? AND mode_name = ?', [req.params.name, body.mode])
    } else {
      // Validate: scene exists, is assigned to room and mode
      const scene = getOne<{ name: string }>('SELECT name FROM scenes WHERE name = ?', [body.scene])
      if (!scene) {
        res.status(400).json({ error: 'Scene not found' })
        return
      }
      const inRoom = getOne<{ scene_name: string }>('SELECT scene_name FROM scene_rooms WHERE scene_name = ? AND room_name = ?', [body.scene, req.params.name])
      if (!inRoom) {
        res.status(400).json({ error: 'Scene is not assigned to this room' })
        return
      }
      const inMode = getOne<{ scene_name: string }>('SELECT scene_name FROM scene_modes WHERE scene_name = ? AND mode_name = ?', [body.scene, body.mode])
      if (!inMode) {
        res.status(400).json({ error: 'Scene is not assigned to this mode' })
        return
      }

      run(
        `INSERT INTO room_default_scenes (room_name, mode_name, scene_name) VALUES (?, ?, ?)
         ON CONFLICT(room_name, mode_name) DO UPDATE SET scene_name = excluded.scene_name`,
        [req.params.name, body.mode, body.scene],
      )
    }

    // Return updated default scenes for this room
    const rows = getAll<{ mode_name: string; scene_name: string }>(
      'SELECT mode_name, scene_name FROM room_default_scenes WHERE room_name = ?',
      [req.params.name],
    )
    const result: Record<string, string> = {}
    for (const r of rows) {
      result[r.mode_name] = r.scene_name
    }
    res.json(result)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// DELETE /:name — delete room and its light assignments
router.delete('/:name', (req: Request, res: Response) => {
  try {
    const existing = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [req.params.name])
    if (!existing) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    const user = (req as any).user ?? FAIRY_QUEEN
    logUserAction(user.id, user.name, 'delete', 'room', String(req.params.name))
    const deleteRoom = db.transaction(() => {
      run('DELETE FROM light_rooms WHERE room_name = ?', [req.params.name])
      run('DELETE FROM device_rooms WHERE room_name = ?', [req.params.name])
      run('DELETE FROM room_default_scenes WHERE room_name = ?', [req.params.name])
      run('DELETE FROM scene_rooms WHERE room_name = ?', [req.params.name])
      run('DELETE FROM room_activity WHERE room_name = ?', [req.params.name])
      run('DELETE FROM rooms WHERE name = ?', [req.params.name])
    })
    deleteRoom()
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
