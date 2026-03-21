import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run } from '../db/index.js'
import { activateScene, deactivateScene } from '../lib/scene-executor.js'

const router = Router()

interface SceneRow {
  name: string
  icon: string
  rooms: string
  modes: string
  commands: string
  tags: string
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
}

function parseScene(row: SceneRow) {
  return {
    ...row,
    rooms: JSON.parse(row.rooms),
    modes: JSON.parse(row.modes),
    commands: JSON.parse(row.commands),
    tags: JSON.parse(row.tags),
  }
}

const commandSchema = z.object({
  type: z.enum(['lifx_scene', 'lifx_light', 'all_off', 'lifx_off']),
  scene_name: z.string().optional(),
  light_id: z.string().optional(),
  selector: z.string().optional(),
  color: z.string().optional(),
  brightness: z.number().min(0).max(1).optional(),
  power: z.string().optional(),
  duration: z.number().optional(),
})

const createSceneSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  rooms: z.array(z.object({ name: z.string(), priority: z.number() })).optional(),
  modes: z.array(z.string()).optional(),
  commands: z.array(commandSchema).optional(),
  tags: z.array(z.string()).optional(),
})

const updateSceneSchema = z.object({
  icon: z.string().optional(),
  rooms: z.array(z.object({ name: z.string(), priority: z.number() })).optional(),
  modes: z.array(z.string()).optional(),
  commands: z.array(commandSchema).optional(),
  tags: z.array(z.string()).optional(),
})

// GET / — list all scenes
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = getAll<SceneRow>('SELECT * FROM scenes')
    res.json(rows.map(parseScene))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /:name — get single scene with room lights
router.get('/:name', (req: Request, res: Response) => {
  try {
    const row = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [req.params.name])
    if (!row) {
      res.status(404).json({ error: 'Scene not found' })
      return
    }
    const parsed = parseScene(row)

    // Get lights for each room in the scene
    const roomLights: Record<string, LightRoomRow[]> = {}
    for (const room of parsed.rooms as { name: string; priority: number }[]) {
      roomLights[room.name] = getAll<LightRoomRow>(
        'SELECT * FROM light_rooms WHERE room_name = ?',
        [room.name],
      )
    }

    res.json({ ...parsed, room_lights: roomLights })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST / — create scene
router.post('/', (req: Request, res: Response) => {
  try {
    const body = createSceneSchema.parse(req.body)
    run(
      `INSERT INTO scenes (name, icon, rooms, modes, commands, tags)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.icon ?? '',
        JSON.stringify(body.rooms ?? []),
        JSON.stringify(body.modes ?? []),
        JSON.stringify(body.commands ?? []),
        JSON.stringify(body.tags ?? []),
      ],
    )
    const created = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [body.name])
    res.status(201).json(parseScene(created!))
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /:name — update scene
router.put('/:name', (req: Request, res: Response) => {
  try {
    const existing = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [req.params.name])
    if (!existing) {
      res.status(404).json({ error: 'Scene not found' })
      return
    }
    const body = updateSceneSchema.parse(req.body)
    const fields: string[] = []
    const values: unknown[] = []

    if (body.icon !== undefined) { fields.push('icon = ?'); values.push(body.icon) }
    if (body.rooms !== undefined) { fields.push('rooms = ?'); values.push(JSON.stringify(body.rooms)) }
    if (body.modes !== undefined) { fields.push('modes = ?'); values.push(JSON.stringify(body.modes)) }
    if (body.commands !== undefined) { fields.push('commands = ?'); values.push(JSON.stringify(body.commands)) }
    if (body.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(body.tags)) }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(req.params.name)
      run(`UPDATE scenes SET ${fields.join(', ')} WHERE name = ?`, values)
    }

    const updated = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [req.params.name])
    res.json(parseScene(updated!))
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// DELETE /:name — delete scene
router.delete('/:name', (req: Request, res: Response) => {
  try {
    const existing = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [req.params.name])
    if (!existing) {
      res.status(404).json({ error: 'Scene not found' })
      return
    }
    run('DELETE FROM scenes WHERE name = ?', [req.params.name])
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /:name/activate — activate scene
router.post('/:name/activate', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string
    await activateScene(name)
    res.json({ success: true, scene: name, action: 'activated' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /:name/deactivate — deactivate scene
router.post('/:name/deactivate', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string
    await deactivateScene(name)
    res.json({ success: true, scene: name, action: 'deactivated' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
