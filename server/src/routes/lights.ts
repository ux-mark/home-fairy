import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, run, db } from '../db/index.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

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

const saveAssignmentsSchema = z.object({
  room_name: z.string().min(1),
  lights: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      selector: z.string().optional(),
      has_color: z.union([z.boolean(), z.number()]).optional(), // Accept both bool and 0/1
      min_kelvin: z.number().optional(),
      max_kelvin: z.number().optional(),
    }),
  ),
})

// GET /rooms — get all light-room assignments
router.get('/rooms', (_req: Request, res: Response) => {
  try {
    const rows = getAll<LightRoomRow>('SELECT * FROM light_rooms ORDER BY room_name')
    res.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /rooms/:roomName — get lights for a specific room
router.get('/rooms/:roomName', (req: Request, res: Response) => {
  try {
    const rows = getAll<LightRoomRow>(
      'SELECT * FROM light_rooms WHERE room_name = ?',
      [req.params.roomName],
    )
    res.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /rooms — save assignments for a room (replace all)
router.post('/rooms', (req: Request, res: Response) => {
  try {
    if (process.env.DEBUG) console.log('[lights POST /rooms] body:', JSON.stringify(req.body))
    const body = saveAssignmentsSchema.parse(req.body)

    const saveAssignments = db.transaction(() => {
      run('DELETE FROM light_rooms WHERE room_name = ?', [body.room_name])
      for (const light of body.lights) {
        run(
          `INSERT INTO light_rooms (light_id, light_label, light_selector, room_name, has_color, min_kelvin, max_kelvin)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            light.id,
            light.label,
            light.selector ?? `id:${light.id}`,
            body.room_name,
            light.has_color !== undefined ? Number(light.has_color) : 1,
            light.min_kelvin ?? 2500,
            light.max_kelvin ?? 9000,
          ],
        )
      }
    })
    saveAssignments()

    const rows = getAll<LightRoomRow>(
      'SELECT * FROM light_rooms WHERE room_name = ?',
      [body.room_name],
    )
    res.json(rows)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// DELETE /rooms/:roomName — remove all lights from a room
router.delete('/rooms/:roomName', (req: Request, res: Response) => {
  try {
    run('DELETE FROM light_rooms WHERE room_name = ?', [req.params.roomName])
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
