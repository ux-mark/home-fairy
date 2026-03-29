import { Router, Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { getOne, run } from '../db/index.js'
import { auth } from '../lib/auth.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT) || 3001

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

function validateLink(link: AccessLinkRow | undefined): { valid: true } | { valid: false; reason: string } {
  if (!link) return { valid: false, reason: 'Link not found' }
  if (link.revoked_at) return { valid: false, reason: 'Link has been revoked' }
  if (link.expires_at && new Date(link.expires_at) < new Date()) return { valid: false, reason: 'Link has expired' }
  if (link.use_count >= link.max_uses) return { valid: false, reason: 'Link has reached its maximum number of uses' }
  return { valid: true }
}

// GET /:token/verify — Check if a link is valid
router.get('/:token/verify', (req: Request, res: Response): void => {
  const { token } = req.params

  const link = getOne<AccessLinkRow>('SELECT * FROM access_links WHERE token = ?', [token])
  const result = validateLink(link)

  if (!result.valid) {
    res.json({ valid: false, reason: result.reason })
    return
  }

  res.json({ valid: true, mode: link!.mode, label: link!.label })
})

const redeemResidentSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
})

// POST /:token/redeem — Consume the link
router.post('/:token/redeem', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params

  const link = getOne<AccessLinkRow>('SELECT * FROM access_links WHERE token = ?', [token])
  const validation = validateLink(link)

  if (!validation.valid) {
    res.status(400).json({ success: false, error: validation.reason })
    return
  }

  const safeLink = link!

  try {
    if (safeLink.mode === 'guest') {
      await redeemGuest(req, res, safeLink)
    } else {
      await redeemResident(req, res, safeLink)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[access-links-public] redeem error:', msg)
    res.status(500).json({ success: false, error: IS_PRODUCTION ? 'Failed to redeem link' : msg })
  }
})

async function redeemGuest(req: Request, res: Response, link: AccessLinkRow): Promise<void> {
  const guestEmail = `guest-${crypto.randomUUID().slice(0, 8)}@guest.local`
  const guestPassword = crypto.randomBytes(32).toString('base64url')

  // Create the guest user. Better Auth's TypeScript types narrow the role field to configured
  // role values ('admin'|'user'), but the underlying admin plugin endpoint accepts any string.
  // We cast the body to bypass this constraint so the 'guest' role is stored correctly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created = await (auth.api.createUser as (opts: any) => Promise<any>)({
    body: {
      email: guestEmail,
      password: guestPassword,
      name: link.label,
      role: 'guest',
    },
  })

  if (!created || !created.user) {
    res.status(500).json({ success: false, error: 'Failed to create guest user' })
    return
  }

  const userId = created.user.id

  // Sign in via internal HTTP to get proper signed cookies from Better Auth
  const cookies = await signInAndGetCookies(guestEmail, guestPassword)
  if (!cookies) {
    res.status(500).json({ success: false, error: 'Failed to create guest session' })
    return
  }

  // Override session expiry if guestSessionDuration is set (duration in seconds)
  if (link.guest_session_duration) {
    const expiresAt = new Date(Date.now() + link.guest_session_duration * 1000).toISOString()
    run(
      `UPDATE session SET expiresAt = ?
       WHERE id = (SELECT id FROM session WHERE userId = ? ORDER BY createdAt DESC LIMIT 1)`,
      [expiresAt, userId],
    )
  }

  // Track usage
  run(
    "UPDATE access_links SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
    [link.id],
  )
  run(
    'INSERT INTO access_link_uses (link_id, user_id) VALUES (?, ?)',
    [link.id, userId],
  )

  // Forward the signed session cookies to the client
  for (const cookie of cookies) {
    res.append('Set-Cookie', cookie)
  }

  res.json({ success: true, mode: 'guest', redirect: '/' })
}

async function redeemResident(req: Request, res: Response, link: AccessLinkRow): Promise<void> {
  const parsed = redeemResidentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.flatten() })
    return
  }

  const { name, email, password } = parsed.data

  // Create the resident user
  const created = await auth.api.createUser({
    body: {
      email,
      password,
      name,
      role: 'user',
    },
  })

  if (!created || !created.user) {
    res.status(500).json({ success: false, error: 'Failed to create user account' })
    return
  }

  const userId = created.user.id

  // Sign in via internal HTTP to get proper signed cookies from Better Auth
  const cookies = await signInAndGetCookies(email, password)
  if (!cookies) {
    res.status(500).json({ success: false, error: 'Failed to create session' })
    return
  }

  // Track usage and consume link (resident links are single-use by convention)
  run(
    "UPDATE access_links SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
    [link.id],
  )
  run(
    'INSERT INTO access_link_uses (link_id, user_id) VALUES (?, ?)',
    [link.id, userId],
  )

  // Forward the signed session cookies to the client
  for (const cookie of cookies) {
    res.append('Set-Cookie', cookie)
  }

  res.json({ success: true, mode: 'resident', redirect: '/' })
}

async function signInAndGetCookies(email: string, password: string): Promise<string[] | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${PORT}`,
      },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
    })
    if (!response.ok) {
      const body = await response.text()
      console.error(`[access-links] sign-in failed: ${response.status} ${body}`)
      return null
    }
    return response.headers.getSetCookie()
  } catch (err) {
    console.error('[access-links] sign-in fetch error:', err)
    return null
  }
}

export default router
