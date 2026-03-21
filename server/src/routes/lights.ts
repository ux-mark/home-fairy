import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, run } from '../db/index.js'

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
      has_color: z.boolean().optional(),
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
    res.status(500).json({ error: msg })
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
    res.status(500).json({ error: msg })
  }
})

// POST /rooms — save assignments for a room (replace all)
router.post('/rooms', (req: Request, res: Response) => {
  try {
    const body = saveAssignmentsSchema.parse(req.body)

    // Delete existing assignments for this room
    run('DELETE FROM light_rooms WHERE room_name = ?', [body.room_name])

    // Insert new assignments
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
    res.status(500).json({ error: msg })
  }
})

// DELETE /rooms/:roomName — remove all lights from a room
router.delete('/rooms/:roomName', (req: Request, res: Response) => {
  try {
    run('DELETE FROM light_rooms WHERE room_name = ?', [req.params.roomName])
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
