import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run, db } from '../db/index.js'
import { activateScene, deactivateScene } from '../lib/scene-executor.js'

const router = Router()

interface SceneRow {
  name: string
  icon: string
  commands: string
  tags: string
  active_from: string | null
  active_to: string | null
  auto_activate: number
  last_activated_at: string | null
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
  let commands: unknown = []
  let tags: unknown = []
  try { commands = JSON.parse(row.commands) } catch { commands = [] }
  try { tags = JSON.parse(row.tags) } catch { tags = [] }

  const rooms = getAll<{ room_name: string; priority: number }>(
    'SELECT room_name, priority FROM scene_rooms WHERE scene_name = ?',
    [row.name],
  ).map(r => ({ name: r.room_name, priority: r.priority }))

  const modes = getAll<{ mode_name: string }>(
    'SELECT mode_name FROM scene_modes WHERE scene_name = ?',
    [row.name],
  ).map(m => m.mode_name)

  return {
    ...row,
    rooms,
    modes,
    commands: Array.isArray(commands) ? commands : [],
    tags: Array.isArray(tags) ? tags : [],
    active_from: row.active_from ?? null,
    active_to: row.active_to ?? null,
    auto_activate: Boolean(row.auto_activate ?? 1),
    last_activated_at: row.last_activated_at ?? null,
  }
}

const commandSchema = z.object({
  type: z.enum([
    'lifx_light',
    'all_off',
    'lifx_off',
    'hubitat_device',
    'scene_timer',
    'mode_update',
    'lifx_effect',
    'twinkly',
    'fairy_device',
    'fairy_scene',
  ]),
  name: z.string().optional(),
  scene_name: z.string().optional(),
  light_id: z.string().optional(),
  selector: z.string().optional(),
  color: z.string().optional(),
  brightness: z.number().optional(),
  power: z.string().optional(),
  duration: z.number().optional(),
  command: z.string().optional(),
  device_id: z.union([z.number(), z.string()]).optional(),
  value: z.union([z.string(), z.number()]).optional(),
  effect: z.enum(['breathe', 'pulse', 'move']).optional(),
  effect_params: z.record(z.unknown()).optional(),
})

const createSceneSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  rooms: z.array(z.object({ name: z.string(), priority: z.union([z.number(), z.string().transform(Number)]) })).optional(),
  modes: z.array(z.string()).optional(),
  commands: z.array(commandSchema).optional(),
  tags: z.array(z.string()).optional(),
  active_from: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
  active_to: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
  auto_activate: z.boolean().optional(),
})

const updateSceneSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  rooms: z.array(z.object({ name: z.string(), priority: z.union([z.number(), z.string().transform(Number)]) })).optional(),
  modes: z.array(z.string()).optional(),
  commands: z.array(commandSchema).optional(),
  tags: z.array(z.string()).optional(),
  active_from: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
  active_to: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
  auto_activate: z.boolean().optional(),
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

    const createTransaction = db.transaction(() => {
      run(
        `INSERT INTO scenes (name, icon, commands, tags, active_from, active_to, auto_activate)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          body.name,
          body.icon ?? '',
          JSON.stringify(body.commands ?? []),
          JSON.stringify(body.tags ?? []),
          body.active_from ?? null,
          body.active_to ?? null,
          body.auto_activate !== undefined ? Number(body.auto_activate) : 1,
        ],
      )

      // Insert room assignments
      if (body.rooms) {
        const insertRoom = db.prepare('INSERT INTO scene_rooms (scene_name, room_name, priority) VALUES (?, ?, ?)')
        for (const room of body.rooms) {
          insertRoom.run(body.name, room.name, Number(room.priority) || 0)
        }
      }

      // Insert mode assignments
      if (body.modes) {
        const insertMode = db.prepare('INSERT INTO scene_modes (scene_name, mode_name) VALUES (?, ?)')
        for (const mode of body.modes) {
          insertMode.run(body.name, mode)
        }
      }
    })

    createTransaction()

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

    const updateTransaction = db.transaction(() => {
      const fields: string[] = []
      const values: unknown[] = []

      if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
      if (body.icon !== undefined) { fields.push('icon = ?'); values.push(body.icon) }
      if (body.commands !== undefined) { fields.push('commands = ?'); values.push(JSON.stringify(body.commands)) }
      if (body.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(body.tags)) }
      if (body.active_from !== undefined) { fields.push('active_from = ?'); values.push(body.active_from) }
      if (body.active_to !== undefined) { fields.push('active_to = ?'); values.push(body.active_to) }
      if (body.auto_activate !== undefined) { fields.push('auto_activate = ?'); values.push(Number(body.auto_activate)) }

      if (fields.length > 0) {
        fields.push("updated_at = datetime('now')")
        values.push(req.params.name)
        run(`UPDATE scenes SET ${fields.join(', ')} WHERE name = ?`, values)
      }

      // If name changed, ON UPDATE CASCADE propagates to junction tables automatically.
      // Use the new name for subsequent junction table operations.
      const lookupName = body.name ?? req.params.name

      if (body.rooms !== undefined) {
        run('DELETE FROM scene_rooms WHERE scene_name = ?', [lookupName])
        const insertRoom = db.prepare('INSERT INTO scene_rooms (scene_name, room_name, priority) VALUES (?, ?, ?)')
        for (const room of body.rooms) {
          insertRoom.run(lookupName, room.name, Number(room.priority) || 0)
        }
      }
      if (body.modes !== undefined) {
        run('DELETE FROM scene_modes WHERE scene_name = ?', [lookupName])
        const insertMode = db.prepare('INSERT INTO scene_modes (scene_name, mode_name) VALUES (?, ?)')
        for (const mode of body.modes) {
          insertMode.run(lookupName, mode)
        }
      }
    })

    updateTransaction()

    const lookupName = body.name ?? req.params.name
    const updated = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [lookupName])
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

    // Mark all rooms in this scene as having a manual override so motion
    // events do not replace the user's chosen scene until the room goes idle.
    const sceneRooms = getAll<{ room_name: string }>('SELECT room_name FROM scene_rooms WHERE scene_name = ?', [name])
    for (const sr of sceneRooms) {
      run('UPDATE rooms SET scene_manual = 1 WHERE name = ?', [sr.room_name])
    }

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
