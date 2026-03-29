import type { Request, Response, NextFunction } from 'express'
import { auth } from '../lib/auth.js'
import { fromNodeHeaders } from 'better-auth/node'

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })

  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Attach session to request for downstream use
  ;(req as any).session = session.session
  ;(req as any).user = session.user

  next()
}
