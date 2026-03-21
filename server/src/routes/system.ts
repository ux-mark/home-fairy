import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run, db } from '../db/index.js'

const router = Router()

interface CurrentStateRow {
  key: string
  value: string
  updated_at: string
}

interface LogRow {
  id: number
  parent_id: number | null
  seq: number
  message: string
  debug: string | null
  category: string | null
  created_at: string
}

const modeSchema = z.object({
  mode: z.string().min(1),
})

// GET /current — get current mode
router.get('/current', (_req: Request, res: Response) => {
  try {
    const row = getOne<CurrentStateRow>(
      "SELECT * FROM current_state WHERE key = 'mode'",
    )
    res.json({ mode: row?.value ?? 'day' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /mode — update current mode
router.put('/mode', (req: Request, res: Response) => {
  try {
    const body = modeSchema.parse(req.body)
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('mode', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [body.mode],
    )
    res.json({ mode: body.mode })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /health — health check
router.get('/health', (_req: Request, res: Response) => {
  try {
    // Quick DB check
    const dbOk = (() => {
      try {
        db.prepare('SELECT 1').get()
        return true
      } catch {
        return false
      }
    })()

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      db: dbOk ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /logs — get recent logs with pagination
router.get('/logs', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)

    const rows = getAll<LogRow>(
      'SELECT * FROM logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset],
    )
    res.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
