import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run, db } from '../db/index.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

interface RoomRow {
  name: string
  display_order: number
  parent_room: string | null
  auto: number
  timer: number
  tags: string
  current_scene: string | null
  last_active: string | null
  sonos_follow_me: number
  sonos_auto_start: number
  icon: string | null
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

function parseRoom(row: RoomRow) {
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

  return {
    ...row,
    sensors: sensorRows.map(s => ({ name: s.device_label, id: s.device_id })),
    tags: Array.isArray(tags) ? tags : [],
    auto: Boolean(row.auto),
    sonos_follow_me: Boolean(row.sonos_follow_me),
    sonos_auto_start: Boolean(row.sonos_auto_start),
    temperature: sensorReading?.temperature ?? null,
    lux: sensorReading?.lux ?? null,
  }
}

const createRoomSchema = z.object({
  name: z.string().min(1),
  display_order: z.number().optional(),
  parent_room: z.string().nullable().optional(),
  auto: z.boolean().optional(),
  timer: z.number().optional(),
  tags: z.array(z.string()).optional(),
  icon: z.string().nullable().optional(),
})

const updateRoomSchema = z.object({
  display_order: z.number().optional(),
  parent_room: z.string().nullable().optional(),
  auto: z.boolean().optional(),
  timer: z.number().optional(),
  tags: z.array(z.string()).optional(),
  current_scene: z.string().nullable().optional(),
  last_active: z.string().nullable().optional(),
  sonos_follow_me: z.boolean().optional(),
  sonos_auto_start: z.boolean().optional(),
  icon: z.string().nullable().optional(),
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

// GET / — list all rooms
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = getAll<RoomRow>('SELECT * FROM rooms ORDER BY display_order')
    res.json(rows.map(parseRoom))
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
    res.json({ ...parseRoom(row), lights })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST / — create room
router.post('/', (req: Request, res: Response) => {
  try {
    console.log('[rooms POST] body:', JSON.stringify(req.body))
    const body = createRoomSchema.parse(req.body)
    run(
      `INSERT INTO rooms (name, display_order, parent_room, auto, timer, tags, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.display_order ?? 0,
        body.parent_room ?? null,
        body.auto !== undefined ? Number(body.auto) : 1,
        body.timer ?? 15,
        JSON.stringify(body.tags ?? []),
        body.icon ?? null,
      ],
    )
    const created = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [body.name])
    res.status(201).json(parseRoom(created!))
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
    console.log(`[rooms PUT /${req.params.name}] body:`, JSON.stringify(req.body))
    const existing = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [req.params.name])
    if (!existing) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    const body = updateRoomSchema.parse(req.body)
    const fields: string[] = []
    const values: unknown[] = []

    if (body.display_order !== undefined) { fields.push('display_order = ?'); values.push(body.display_order) }
    if (body.parent_room !== undefined) { fields.push('parent_room = ?'); values.push(body.parent_room) }
    if (body.auto !== undefined) { fields.push('auto = ?'); values.push(Number(body.auto)) }
    if (body.timer !== undefined) { fields.push('timer = ?'); values.push(body.timer) }
    if (body.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(body.tags)) }
    if (body.current_scene !== undefined) { fields.push('current_scene = ?'); values.push(body.current_scene) }
    if (body.last_active !== undefined) { fields.push('last_active = ?'); values.push(body.last_active) }
    if (body.sonos_follow_me !== undefined) { fields.push('sonos_follow_me = ?'); values.push(Number(body.sonos_follow_me)) }
    if (body.sonos_auto_start !== undefined) { fields.push('sonos_auto_start = ?'); values.push(Number(body.sonos_auto_start)) }
    if (body.icon !== undefined) { fields.push('icon = ?'); values.push(body.icon) }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(req.params.name)
      run(`UPDATE rooms SET ${fields.join(', ')} WHERE name = ?`, values)
    }

    const updated = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [req.params.name])
    res.json(parseRoom(updated!))
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
