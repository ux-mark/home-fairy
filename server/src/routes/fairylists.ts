import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { getAll, run, db } from '../db/index.js'

const router = Router()

const SONOS_BASE = process.env.SONOS_API_URL || 'http://localhost:5005'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function handleError(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
}

interface FairylistRow {
  id: number
  name: string
  created_by: string
  created_at: string
}

interface FairylistWithCount extends FairylistRow {
  item_count: number
}

interface FairylistItemRow {
  id: number
  fairylist_id: number
  source: string
  source_uri: string
  title: string
  artist: string | null
  album_art_uri: string | null
  sort_order: number
  added_by: string
  added_at: string
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
})

const renameSchema = z.object({
  name: z.string().min(1).max(100),
})

const addItemSchema = z.object({
  source: z.enum(['sonos', 'spotify', 'nas', 'radio']),
  source_uri: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album_art_uri: z.string().optional(),
})

const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()),
})

// GET / — list all fairylists with item count
router.get('/', (req: Request, res: Response) => {
  try {
    const fairylists = getAll<FairylistWithCount>(
      `SELECT f.*, COUNT(fi.id) as item_count
       FROM fairylists f
       LEFT JOIN fairylist_items fi ON fi.fairylist_id = f.id
       GROUP BY f.id
       ORDER BY f.created_at ASC`,
    )
    res.json(fairylists)
  } catch (err) {
    handleError(res, err)
  }
})

// POST / — create a new fairylist
router.post('/', (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message })
    return
  }
  try {
    const userId = (req as any).user.id
    const { name } = parsed.data

    const result = run(
      `INSERT INTO fairylists (name, created_by) VALUES (?, ?)`,
      [name, userId],
    )

    const created = db.prepare('SELECT * FROM fairylists WHERE id = ?').get(result.lastInsertRowid) as FairylistRow
    res.status(201).json({ ...created, item_count: 0 })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /:id — get fairylist with all items ordered by sort_order
router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  try {
    const fairylist = db
      .prepare(
        `SELECT f.*, COUNT(fi.id) as item_count
         FROM fairylists f
         LEFT JOIN fairylist_items fi ON fi.fairylist_id = f.id
         WHERE f.id = ?
         GROUP BY f.id`,
      )
      .get(id) as FairylistWithCount | undefined

    if (!fairylist) {
      res.status(404).json({ error: 'Fairylist not found' })
      return
    }

    const items = getAll<FairylistItemRow>(
      `SELECT * FROM fairylist_items WHERE fairylist_id = ? ORDER BY sort_order ASC`,
      [id],
    )

    res.json({ fairylist, items })
  } catch (err) {
    handleError(res, err)
  }
})

// PUT /:id — rename a fairylist
router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const parsed = renameSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message })
    return
  }
  try {
    const { name } = parsed.data
    const result = run(`UPDATE fairylists SET name = ? WHERE id = ?`, [name, id])
    if (result.changes === 0) {
      res.status(404).json({ error: 'Fairylist not found' })
      return
    }
    const updated = db
      .prepare(
        `SELECT f.*, COUNT(fi.id) as item_count
         FROM fairylists f
         LEFT JOIN fairylist_items fi ON fi.fairylist_id = f.id
         WHERE f.id = ?
         GROUP BY f.id`,
      )
      .get(id) as FairylistWithCount
    res.json(updated)
  } catch (err) {
    handleError(res, err)
  }
})

// DELETE /:id — delete a fairylist (cascades items)
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  try {
    const result = run(`DELETE FROM fairylists WHERE id = ?`, [id])
    if (result.changes === 0) {
      res.status(404).json({ error: 'Fairylist not found' })
      return
    }
    res.status(204).send()
  } catch (err) {
    handleError(res, err)
  }
})

// POST /:id/items — add an item to a fairylist
router.post('/:id/items', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const parsed = addItemSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message })
    return
  }
  try {
    const userId = (req as any).user.id
    const { source, source_uri, title, artist, album_art_uri } = parsed.data

    // Check fairylist exists
    const fairylist = db.prepare('SELECT id FROM fairylists WHERE id = ?').get(id) as { id: number } | undefined
    if (!fairylist) {
      res.status(404).json({ error: 'Fairylist not found' })
      return
    }

    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM fairylist_items WHERE fairylist_id = ?')
      .get(id) as { max_order: number }
    const nextOrder = maxRow.max_order + 1

    const result = run(
      `INSERT INTO fairylist_items (fairylist_id, source, source_uri, title, artist, album_art_uri, sort_order, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, source, source_uri, title, artist ?? null, album_art_uri ?? null, nextOrder, userId],
    )

    const created = db.prepare('SELECT * FROM fairylist_items WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(created)
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Already in this Fairylist' })
      return
    }
    handleError(res, err)
  }
})

// DELETE /:id/items/:itemId — remove an item from a fairylist
router.delete('/:id/items/:itemId', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const itemId = Number(req.params.itemId)
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  try {
    const result = run(
      `DELETE FROM fairylist_items WHERE id = ? AND fairylist_id = ?`,
      [itemId, id],
    )
    if (result.changes === 0) {
      res.status(404).json({ error: 'Item not found' })
      return
    }
    res.status(204).send()
  } catch (err) {
    handleError(res, err)
  }
})

// PUT /:id/items/reorder — reorder items by providing an ordered array of ids
router.put('/:id/items/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const parsed = reorderSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message })
    return
  }
  try {
    const { ids } = parsed.data
    const updateStmt = db.prepare(
      'UPDATE fairylist_items SET sort_order = ? WHERE id = ? AND fairylist_id = ?',
    )
    const reorder = db.transaction((orderedIds: number[]) => {
      for (let i = 0; i < orderedIds.length; i++) {
        updateStmt.run(i, orderedIds[i], id)
      }
    })
    reorder(ids)
    res.json({ success: true })
  } catch (err) {
    handleError(res, err)
  }
})

// POST /:id/play/:speaker — play fairylist on a Sonos speaker
router.post('/:id/play/:speaker', async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const speaker = String(req.params.speaker)
  if (!speaker) {
    res.status(400).json({ error: 'Speaker name required' })
    return
  }
  try {
    const items = getAll<FairylistItemRow>(
      `SELECT * FROM fairylist_items WHERE fairylist_id = ? ORDER BY sort_order ASC`,
      [id],
    )
    if (items.length === 0) {
      res.status(400).json({ error: 'Fairylist is empty' })
      return
    }

    const encSpeaker = encodeURIComponent(speaker)

    // Clear the queue first
    await fetch(`${SONOS_BASE}/${encSpeaker}/clearqueue`)

    // Add all items to the queue
    for (const item of items) {
      await fetch(
        `${SONOS_BASE}/${encSpeaker}/addtoqueue?uri=${encodeURIComponent(item.source_uri)}`,
      )
    }

    // Start playing
    await fetch(`${SONOS_BASE}/${encSpeaker}/play`)

    res.json({ success: true, itemCount: items.length })
  } catch (err) {
    handleError(res, err)
  }
})

export default router
