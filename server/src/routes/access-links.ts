import { Router, Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { getAll, getOne, run } from '../db/index.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

interface AccessLinkRow {
  id: string
  token: string
  label: string
  mode: 'guest' | 'resident'
  expires_at: string | null
  max_uses: number
  use_count: number
  guest_session_duration: number | null
  created_by: string
  revoked_at: string | null
  created_at: string
  updated_at: string
}

function computeStatus(link: AccessLinkRow): 'active' | 'expired' | 'revoked' | 'consumed' {
  if (link.revoked_at) return 'revoked'
  if (link.expires_at && new Date(link.expires_at) < new Date()) return 'expired'
  if (link.use_count >= link.max_uses) return 'consumed'
  return 'active'
}

const createLinkSchema = z.object({
  label: z.string().min(1).max(100),
  mode: z.enum(['guest', 'resident']),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  maxUses: z.number().int().min(1).optional(),
  guestSessionDuration: z.number().int().min(1).optional(),
})

// POST / — Create an access link
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user
  if (user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }

  const parsed = createLinkSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    return
  }

  const { label, mode, expiresAt, maxUses, guestSessionDuration } = parsed.data

  try {
    const id = crypto.randomUUID()
    const token = crypto.randomBytes(24).toString('base64url')
    const maxUsesValue = maxUses ?? 1

    run(
      `INSERT INTO access_links (id, token, label, mode, expires_at, max_uses, guest_session_duration, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, token, label, mode, expiresAt ?? null, maxUsesValue, guestSessionDuration ?? null, user.id],
    )

    const link = getOne<AccessLinkRow>('SELECT * FROM access_links WHERE id = ?', [id])
    if (!link) {
      res.status(500).json({ error: 'Failed to retrieve created link' })
      return
    }

    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${process.env.PORT || 3001}`
    const url = `${protocol}://${host}/invite/${link.token}`

    res.status(201).json({
      id: link.id,
      token: link.token,
      label: link.label,
      mode: link.mode,
      expires_at: link.expires_at,
      max_uses: link.max_uses,
      use_count: 0,
      guest_session_duration: link.guest_session_duration,
      created_at: link.created_at,
      revoked_at: null,
      status: 'active' as const,
      url,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[access-links] create error:', msg)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET / — List all access links
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user
  if (user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }

  try {
    const links = getAll<AccessLinkRow>('SELECT * FROM access_links ORDER BY created_at DESC')

    res.json(links.map(link => ({
      id: link.id,
      token: link.token,
      label: link.label,
      mode: link.mode,
      expires_at: link.expires_at,
      max_uses: link.max_uses,
      use_count: link.use_count,
      guest_session_duration: link.guest_session_duration,
      created_at: link.created_at,
      revoked_at: link.revoked_at,
      status: computeStatus(link),
    })))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[access-links] list error:', msg)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// DELETE /:id — Delete a link (revokes sessions for any guest users it created)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user
  if (user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }

  const { id } = req.params

  try {
    const link = getOne<AccessLinkRow>('SELECT * FROM access_links WHERE id = ?', [id])
    if (!link) {
      res.status(404).json({ error: 'Access link not found' })
      return
    }

    // Revoke sessions for guest users created via this link
    const uses = getAll<{ user_id: string }>(
      'SELECT user_id FROM access_link_uses WHERE link_id = ?',
      [id],
    )

    if (uses.length > 0) {
      const userIds = uses.map(u => u.user_id)
      const placeholders = userIds.map(() => '?').join(', ')
      run(`DELETE FROM session WHERE userId IN (${placeholders})`, userIds)
    }

    // Delete usage records and the link itself
    run('DELETE FROM access_link_uses WHERE link_id = ?', [id])
    run('DELETE FROM access_links WHERE id = ?', [id])

    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[access-links] delete error:', msg)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
