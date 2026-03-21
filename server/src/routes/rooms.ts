import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run } from '../db/index.js'

const router = Router()

interface RoomRow {
  name: string
  display_order: number
  parent_room: string | null
  auto: number
  timer: number
  sensors: string
  tags: string
  current_scene: string | null
  last_active: string | null
  temperature: number | null
  lux: number | null
  mode_changed: number
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
  let sensors: unknown = []
  let tags: unknown = []
  try { sensors = JSON.parse(row.sensors) } catch { sensors = [] }
  try { tags = JSON.parse(row.tags) } catch { tags = [] }
  return {
    ...row,
    sensors: Array.isArray(sensors) ? sensors : [],
    tags: Array.isArray(tags) ? tags : [],
    auto: Boolean(row.auto),
    mode_changed: Boolean(row.mode_changed),
  }
}

const sensorSchema = z.object({
  name: z.string(),
  priority_threshold: z.number().optional(),
  priorityThreshold: z.number().optional(), // legacy format
}).passthrough()

const createRoomSchema = z.object({
  name: z.string().min(1),
  display_order: z.number().optional(),
  parent_room: z.string().nullable().optional(),
  auto: z.boolean().optional(),
  timer: z.number().optional(),
  sensors: z.array(sensorSchema).optional(),
  tags: z.array(z.string()).optional(),
})

const updateRoomSchema = z.object({
  display_order: z.number().optional(),
  parent_room: z.string().nullable().optional(),
  auto: z.boolean().optional(),
  timer: z.number().optional(),
  sensors: z.array(sensorSchema).optional(),
  tags: z.array(z.string()).optional(),
  current_scene: z.string().nullable().optional(),
  last_active: z.string().nullable().optional(),
  temperature: z.number().nullable().optional(),
  lux: z.number().nullable().optional(),
  mode_changed: z.boolean().optional(),
})

// GET / — list all rooms
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = getAll<RoomRow>('SELECT * FROM rooms ORDER BY display_order')
    res.json(rows.map(parseRoom))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
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
    res.status(500).json({ error: msg })
  }
})

// POST / — create room
router.post('/', (req: Request, res: Response) => {
  try {
    const body = createRoomSchema.parse(req.body)
    run(
      `INSERT INTO rooms (name, display_order, parent_room, auto, timer, sensors, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.display_order ?? 0,
        body.parent_room ?? null,
        body.auto !== undefined ? Number(body.auto) : 1,
        body.timer ?? 15,
        JSON.stringify(body.sensors ?? []),
        JSON.stringify(body.tags ?? []),
      ],
    )
    const created = getOne<RoomRow>('SELECT * FROM rooms WHERE name = ?', [body.name])
    res.status(201).json(parseRoom(created!))
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /:name — update room
router.put('/:name', (req: Request, res: Response) => {
  try {
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
    if (body.sensors !== undefined) { fields.push('sensors = ?'); values.push(JSON.stringify(body.sensors)) }
    if (body.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(body.tags)) }
    if (body.current_scene !== undefined) { fields.push('current_scene = ?'); values.push(body.current_scene) }
    if (body.last_active !== undefined) { fields.push('last_active = ?'); values.push(body.last_active) }
    if (body.temperature !== undefined) { fields.push('temperature = ?'); values.push(body.temperature) }
    if (body.lux !== undefined) { fields.push('lux = ?'); values.push(body.lux) }
    if (body.mode_changed !== undefined) { fields.push('mode_changed = ?'); values.push(Number(body.mode_changed)) }

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
    res.status(500).json({ error: msg })
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
    run('DELETE FROM light_rooms WHERE room_name = ?', [req.params.name])
    run('DELETE FROM rooms WHERE name = ?', [req.params.name])
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
