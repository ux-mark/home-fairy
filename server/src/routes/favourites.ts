import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { getAll, run, db } from '../db/index.js'

const router = Router()

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function handleError(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
}

const addFavouriteSchema = z.object({
  source: z.enum(['sonos', 'spotify', 'nas', 'radio']),
  source_uri: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album_art_uri: z.string().optional(),
})

// GET / — list user's favourites ordered by sort_order
router.get('/', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id
    const favourites = getAll(
      'SELECT * FROM user_favourites WHERE user_id = ? ORDER BY sort_order ASC',
      [userId],
    )
    res.json(favourites)
  } catch (err) {
    handleError(res, err)
  }
})

// POST / — add a favourite
router.post('/', (req: Request, res: Response) => {
  const parsed = addFavouriteSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message })
    return
  }
  try {
    const userId = (req as any).user.id
    const { source, source_uri, title, artist, album_art_uri } = parsed.data

    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM user_favourites WHERE user_id = ?')
      .get(userId) as { max_order: number }
    const nextOrder = maxRow.max_order + 1

    const result = run(
      `INSERT INTO user_favourites (user_id, source, source_uri, title, artist, album_art_uri, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, source, source_uri, title, artist ?? null, album_art_uri ?? null, nextOrder],
    )

    const created = db
      .prepare('SELECT * FROM user_favourites WHERE id = ?')
      .get(result.lastInsertRowid)

    res.status(201).json(created)
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Already in favourites' })
      return
    }
    handleError(res, err)
  }
})

// DELETE /:id — remove a favourite (scoped to authenticated user)
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  try {
    const userId = (req as any).user.id
    const result = run(
      'DELETE FROM user_favourites WHERE id = ? AND user_id = ?',
      [id, userId],
    )
    if (result.changes === 0) {
      res.status(404).json({ error: 'Favourite not found' })
      return
    }
    res.status(204).send()
  } catch (err) {
    handleError(res, err)
  }
})

// PUT /reorder — update sort_order for an ordered array of ids
router.put('/reorder', (req: Request, res: Response) => {
  const parsed = z.object({ ids: z.array(z.number().int().positive()) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message })
    return
  }
  try {
    const userId = (req as any).user.id
    const { ids } = parsed.data

    const updateStmt = db.prepare(
      'UPDATE user_favourites SET sort_order = ? WHERE id = ? AND user_id = ?',
    )
    const reorder = db.transaction((orderedIds: number[]) => {
      for (let i = 0; i < orderedIds.length; i++) {
        updateStmt.run(i, orderedIds[i], userId)
      }
    })
    reorder(ids)

    res.json({ success: true })
  } catch (err) {
    handleError(res, err)
  }
})

export default router
