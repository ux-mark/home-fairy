import { Router, Request, Response } from 'express'
import { getAll } from '../db/index.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const router = Router()

router.get('/', (req: Request, res: Response) => {
  try {
    const entityType = req.query.entity_type as string | undefined
    const entityId = req.query.entity_id as string | undefined
    const userId = req.query.user_id as string | undefined
    const limit = Math.min(Number(req.query.limit) || 20, 100)

    let sql = 'SELECT * FROM user_actions WHERE 1=1'
    const params: unknown[] = []

    if (entityType) { sql += ' AND entity_type = ?'; params.push(entityType) }
    if (entityId) { sql += ' AND entity_id = ?'; params.push(entityId) }
    if (userId) { sql += ' AND user_id = ?'; params.push(userId) }

    sql += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const actions = getAll<{
      id: number; user_id: string; user_name: string; action: string;
      entity_type: string; entity_id: string; details: string | null; created_at: string
    }>(sql, params)

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
