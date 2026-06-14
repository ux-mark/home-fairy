import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run, db } from '../db/index.js'
import { activateScene, deactivateScene } from '../lib/scene-executor.js'
import { FAIRY_QUEEN } from '../lib/constants.js'
import { logUserAction } from '../lib/user-action-logger.js'
import { log } from '../lib/logger.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

interface SceneRow {
  name: string
  icon: string
  commands: string
  tags: string
  active_from: string | null
  active_to: string | null
  last_activated_at: string | null
  last_activated_by: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  sort_order: number
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

  const rooms = getAll<{ room_name: string }>(
    'SELECT room_name FROM scene_rooms WHERE scene_name = ?',
    [row.name],
  ).map(r => ({ name: r.room_name }))

  const modes = getAll<{ mode_name: string }>(
    'SELECT mode_name FROM scene_modes WHERE scene_name = ?',
    [row.name],
  ).map(m => m.mode_name)

  const userIds = new Set<string>()
  for (const id of [row.created_by, row.updated_by, row.last_activated_by]) {
    if (id && id !== 'fairy-queen') userIds.add(id)
  }
  const nameMap = new Map<string, string>([['fairy-queen', 'Fairy Queen']])
  if (userIds.size > 0) {
    const placeholders = [...userIds].map(() => '?').join(',')
    const users = getAll<{ id: string; name: string }>(
      `SELECT id, name FROM user WHERE id IN (${placeholders})`,
      [...userIds],
    )
    for (const u of users) nameMap.set(u.id, u.name)
  }

  return {
    ...row,
    rooms,
    modes,
    commands: Array.isArray(commands) ? commands : [],
    tags: Array.isArray(tags) ? tags : [],
    active_from: row.active_from ?? null,
    active_to: row.active_to ?? null,
    last_activated_at: row.last_activated_at ?? null,
    created_by_name: nameMap.get(row.created_by) ?? 'Fairy Queen',
    updated_by_name: nameMap.get(row.updated_by) ?? 'Fairy Queen',
    last_activated_by_name: nameMap.get(row.last_activated_by) ?? 'Fairy Queen',
  }
}

const commandSchema = z.object({
  type: z.enum([
    'lifx_light',
    'all_off',
    'lifx_off',
    'hubitat_device',
    'kasa_device',
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
  sort_order: z.number().int().optional(),
  rooms: z.array(z.object({ name: z.string() })).optional(),
  modes: z.array(z.string()).optional(),
  commands: z.array(commandSchema).optional(),
  tags: z.array(z.string()).optional(),
  active_from: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
  active_to: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
})

const updateSceneSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  sort_order: z.number().int().optional(),
  rooms: z.array(z.object({ name: z.string() })).optional(),
  modes: z.array(z.string()).optional(),
  commands: z.array(commandSchema).optional(),
  tags: z.array(z.string()).optional(),
  active_from: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
  active_to: z.string().regex(/^\d{2}-\d{2}$/).nullable().optional(),
})

// GET / — list all scenes
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = getAll<SceneRow>('SELECT * FROM scenes ORDER BY sort_order, name')

    // Bulk load all scene-room and scene-mode associations
    const allSceneRooms = getAll<{ scene_name: string; room_name: string }>(
      'SELECT scene_name, room_name FROM scene_rooms',
    )
    const allSceneModes = getAll<{ scene_name: string; mode_name: string }>(
      'SELECT scene_name, mode_name FROM scene_modes',
    )

    // Group by scene name
    const roomsByScene = new Map<string, string[]>()
    for (const sr of allSceneRooms) {
      const list = roomsByScene.get(sr.scene_name) ?? []
      list.push(sr.room_name)
      roomsByScene.set(sr.scene_name, list)
    }
    const modesByScene = new Map<string, string[]>()
    for (const sm of allSceneModes) {
      const list = modesByScene.get(sm.scene_name) ?? []
      list.push(sm.mode_name)
      modesByScene.set(sm.scene_name, list)
    }

    // Collect unique user IDs for batch name lookup
    const userIds = new Set<string>()
    for (const row of rows) {
      if (row.created_by && row.created_by !== 'fairy-queen') userIds.add(row.created_by)
      if (row.updated_by && row.updated_by !== 'fairy-queen') userIds.add(row.updated_by)
      if (row.last_activated_by && row.last_activated_by !== 'fairy-queen') userIds.add(row.last_activated_by)
    }
    const userNameMap = new Map<string, string>()
    userNameMap.set('fairy-queen', 'Fairy Queen')
    if (userIds.size > 0) {
      const placeholders = [...userIds].map(() => '?').join(',')
      const users = getAll<{ id: string; name: string }>(
        `SELECT id, name FROM user WHERE id IN (${placeholders})`,
        [...userIds],
      )
      for (const u of users) userNameMap.set(u.id, u.name)
    }

    const scenes = rows.map(row => {
      let commands: unknown = []
      let tags: unknown = []
      try { commands = JSON.parse(row.commands) } catch { commands = [] }
      try { tags = JSON.parse(row.tags) } catch { tags = [] }
      return {
        ...row,
        commands: Array.isArray(commands) ? commands : [],
        tags: Array.isArray(tags) ? tags : [],
        rooms: (roomsByScene.get(row.name) ?? []).map(r => ({ name: r })),
        modes: modesByScene.get(row.name) ?? [],
        active_from: row.active_from ?? null,
        active_to: row.active_to ?? null,
        last_activated_at: row.last_activated_at ?? null,
        created_by_name: userNameMap.get(row.created_by) ?? 'Fairy Queen',
        updated_by_name: userNameMap.get(row.updated_by) ?? 'Fairy Queen',
        last_activated_by_name: userNameMap.get(row.last_activated_by) ?? 'Fairy Queen',
      }
    })

    res.json(scenes)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
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
    for (const room of parsed.rooms as { name: string }[]) {
      roomLights[room.name] = getAll<LightRoomRow>(
        'SELECT * FROM light_rooms WHERE room_name = ?',
        [room.name],
      )
    }

    res.json({ ...parsed, room_lights: roomLights })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PUT /reorder — reorder scenes by providing an array of scene names in desired order
router.put('/reorder', (req: Request, res: Response) => {
  try {
    const body = z.object({ scenes: z.array(z.string().min(1)) }).parse(req.body)

    const reorderTransaction = db.transaction(() => {
      const updateOrder = db.prepare('UPDATE scenes SET sort_order = ? WHERE name = ?')
      for (let i = 0; i < body.scenes.length; i++) {
        const result = updateOrder.run(i, body.scenes[i])
        if (result.changes === 0) {
          throw new Error(`Scene not found: ${body.scenes[i]}`)
        }
      }
    })

    reorderTransaction()

    const rows = getAll<SceneRow>('SELECT * FROM scenes ORDER BY sort_order, name')
    const allSceneRooms = getAll<{ scene_name: string; room_name: string }>(
      'SELECT scene_name, room_name FROM scene_rooms',
    )
    const allSceneModes = getAll<{ scene_name: string; mode_name: string }>(
      'SELECT scene_name, mode_name FROM scene_modes',
    )
    const roomsByScene = new Map<string, string[]>()
    for (const sr of allSceneRooms) {
      const list = roomsByScene.get(sr.scene_name) ?? []
      list.push(sr.room_name)
      roomsByScene.set(sr.scene_name, list)
    }
    const modesByScene = new Map<string, string[]>()
    for (const sm of allSceneModes) {
      const list = modesByScene.get(sm.scene_name) ?? []
      list.push(sm.mode_name)
      modesByScene.set(sm.scene_name, list)
    }

    const reorderUserIds = new Set<string>()
    for (const row of rows) {
      if (row.created_by && row.created_by !== 'fairy-queen') reorderUserIds.add(row.created_by)
      if (row.updated_by && row.updated_by !== 'fairy-queen') reorderUserIds.add(row.updated_by)
      if (row.last_activated_by && row.last_activated_by !== 'fairy-queen') reorderUserIds.add(row.last_activated_by)
    }
    const reorderUserNameMap = new Map<string, string>()
    reorderUserNameMap.set('fairy-queen', 'Fairy Queen')
    if (reorderUserIds.size > 0) {
      const placeholders = [...reorderUserIds].map(() => '?').join(',')
      const users = getAll<{ id: string; name: string }>(
        `SELECT id, name FROM user WHERE id IN (${placeholders})`,
        [...reorderUserIds],
      )
      for (const u of users) reorderUserNameMap.set(u.id, u.name)
    }

    const scenes = rows.map(row => {
      let commands: unknown = []
      let tags: unknown = []
      try { commands = JSON.parse(row.commands) } catch { commands = [] }
      try { tags = JSON.parse(row.tags) } catch { tags = [] }
      return {
        ...row,
        commands: Array.isArray(commands) ? commands : [],
        tags: Array.isArray(tags) ? tags : [],
        rooms: (roomsByScene.get(row.name) ?? []).map(r => ({ name: r })),
        modes: modesByScene.get(row.name) ?? [],
        active_from: row.active_from ?? null,
        active_to: row.active_to ?? null,
        last_activated_at: row.last_activated_at ?? null,
        created_by_name: reorderUserNameMap.get(row.created_by) ?? 'Fairy Queen',
        updated_by_name: reorderUserNameMap.get(row.updated_by) ?? 'Fairy Queen',
        last_activated_by_name: reorderUserNameMap.get(row.last_activated_by) ?? 'Fairy Queen',
      }
    })

    res.json(scenes)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('Scene not found:')) {
      res.status(404).json({ error: msg })
      return
    }
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST / — create scene
router.post('/', (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const userId = user?.id ?? FAIRY_QUEEN.id
    const userName = user?.name ?? FAIRY_QUEEN.name
    const body = createSceneSchema.parse(req.body)

    const createTransaction = db.transaction(() => {
      const sortOrder = body.sort_order !== undefined
        ? body.sort_order
        : ((getOne<{ m: number | null }>('SELECT MAX(sort_order) as m FROM scenes')?.m ?? -1) + 1)

      run(
        `INSERT INTO scenes (name, icon, commands, tags, active_from, active_to, sort_order, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          body.name,
          body.icon ?? '',
          JSON.stringify(body.commands ?? []),
          JSON.stringify(body.tags ?? []),
          body.active_from ?? null,
          body.active_to ?? null,
          sortOrder,
          userId,
          userId,
        ],
      )

      // Insert room assignments
      if (body.rooms) {
        const insertRoom = db.prepare('INSERT INTO scene_rooms (scene_name, room_name) VALUES (?, ?)')
        for (const room of body.rooms) {
          insertRoom.run(body.name, room.name)
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
    log(`${userName} created scene ${body.name}`, 'scene', { id: userId, name: userName })
    logUserAction(userId, userName, 'create', 'scene', body.name)

    const created = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [body.name])
    res.status(201).json(parseScene(created!))
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PUT /:name — update scene
router.put('/:name', (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const userId = user?.id ?? FAIRY_QUEEN.id
    const userName = user?.name ?? FAIRY_QUEEN.name
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
      if (body.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(body.sort_order) }
      if (body.commands !== undefined) { fields.push('commands = ?'); values.push(JSON.stringify(body.commands)) }
      if (body.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(body.tags)) }
      if (body.active_from !== undefined) { fields.push('active_from = ?'); values.push(body.active_from) }
      if (body.active_to !== undefined) { fields.push('active_to = ?'); values.push(body.active_to) }

      if (fields.length > 0) {
        fields.push("updated_at = datetime('now')")
        fields.push('updated_by = ?')
        values.push(userId)
        values.push(req.params.name)
        run(`UPDATE scenes SET ${fields.join(', ')} WHERE name = ?`, values)
      }

      // If name changed, ON UPDATE CASCADE propagates to junction tables automatically.
      // Use the new name for subsequent junction table operations.
      const lookupName = body.name ?? req.params.name

      if (body.rooms !== undefined) {
        // Clean up room_default_scenes for rooms no longer in this scene
        const newRoomNames = body.rooms.map(r => r.name)
        const oldRoomNames = getAll<{ room_name: string }>(
          'SELECT room_name FROM scene_rooms WHERE scene_name = ?', [lookupName],
        ).map(r => r.room_name)
        const removedRooms = oldRoomNames.filter(rn => !newRoomNames.includes(rn))
        if (removedRooms.length > 0) {
          const placeholders = removedRooms.map(() => '?').join(',')
          run(
            `DELETE FROM room_default_scenes WHERE scene_name = ? AND room_name IN (${placeholders})`,
            [lookupName, ...removedRooms],
          )
        }

        run('DELETE FROM scene_rooms WHERE scene_name = ?', [lookupName])
        const insertRoom = db.prepare('INSERT INTO scene_rooms (scene_name, room_name) VALUES (?, ?)')
        for (const room of body.rooms) {
          insertRoom.run(lookupName, room.name)
        }
      }
      if (body.modes !== undefined) {
        // Clean up room_default_scenes for modes no longer assigned to this scene
        const removedModes = getAll<{ mode_name: string }>(
          'SELECT mode_name FROM scene_modes WHERE scene_name = ?', [lookupName],
        ).map(m => m.mode_name).filter(mn => !body.modes!.includes(mn))
        if (removedModes.length > 0) {
          const placeholders = removedModes.map(() => '?').join(',')
          run(
            `DELETE FROM room_default_scenes WHERE scene_name = ? AND mode_name IN (${placeholders})`,
            [lookupName, ...removedModes],
          )
        }

        run('DELETE FROM scene_modes WHERE scene_name = ?', [lookupName])
        const insertMode = db.prepare('INSERT INTO scene_modes (scene_name, mode_name) VALUES (?, ?)')
        for (const mode of body.modes) {
          insertMode.run(lookupName, mode)
        }
      }
    })

    updateTransaction()

    const lookupName = body.name ?? req.params.name
    log(`${userName} updated scene ${lookupName}`, 'scene', { id: userId, name: userName })
    logUserAction(userId, userName, 'update', 'scene', String(lookupName))

    const updated = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [lookupName])
    res.json(parseScene(updated!))
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// DELETE /:name — delete scene
router.delete('/:name', (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const userId = user?.id ?? FAIRY_QUEEN.id
    const userName = user?.name ?? FAIRY_QUEEN.name
    const existing = getOne<SceneRow>('SELECT * FROM scenes WHERE name = ?', [req.params.name])
    if (!existing) {
      res.status(404).json({ error: 'Scene not found' })
      return
    }
    log(`${userName} deleted scene ${req.params.name}`, 'scene', { id: userId, name: userName })
    logUserAction(userId, userName, 'delete', 'scene', String(req.params.name))
    run('DELETE FROM scenes WHERE name = ?', [req.params.name])
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /:name/activate — activate scene
router.post('/:name/activate', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const userId = user?.id ?? FAIRY_QUEEN.id
    const userName = user?.name ?? FAIRY_QUEEN.name
    const name = req.params.name as string
    await activateScene(name, new Set(), 'manual', { id: userId, name: userName })

    // Mark all rooms in this scene as having a manual override so motion
    // events do not replace the user's chosen scene until the room goes idle.
    const sceneRooms = getAll<{ room_name: string }>('SELECT room_name FROM scene_rooms WHERE scene_name = ?', [name])
    for (const sr of sceneRooms) {
      run('UPDATE rooms SET scene_manual = 1 WHERE name = ?', [sr.room_name])
    }

    res.json({ success: true, scene: name, action: 'activated' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /:name/deactivate — deactivate scene
router.post('/:name/deactivate', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const userId = user?.id ?? FAIRY_QUEEN.id
    const userName = user?.name ?? FAIRY_QUEEN.name
    const name = req.params.name as string
    await deactivateScene(name, { id: userId, name: userName })
    res.json({ success: true, scene: name, action: 'deactivated' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /:name/activity — activity log for a specific scene
router.get('/:name/activity', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const actions = getAll<{
      id: number; user_id: string; user_name: string; action: string;
      entity_type: string; entity_id: string; details: string | null; created_at: string
    }>(
      'SELECT * FROM user_actions WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?',
      ['scene', req.params.name, limit],
    )
    res.json(actions.map(a => ({
      ...a,
      details: a.details ? JSON.parse(a.details) : null,
    })))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
