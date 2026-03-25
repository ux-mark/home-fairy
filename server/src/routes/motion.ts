import { Router, Request, Response } from 'express'
import { motionHandler } from '../lib/motion-handler.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

// GET /status — active room timers and sensor states
router.get('/status', (_req: Request, res: Response) => {
  try {
    const timers = motionHandler.getTimerStatus()
    const sensorStates: Record<string, string> = {}
    for (const [name, state] of motionHandler.getSensorStates()) {
      sensorStates[name] = state
    }
    res.json({ timers, sensorStates })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /sensors — all known sensor states
router.get('/sensors', (_req: Request, res: Response) => {
  try {
    const sensorStates: Record<string, string> = {}
    for (const [name, state] of motionHandler.getSensorStates()) {
      sensorStates[name] = state
    }
    res.json(sensorStates)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /timers/:roomName/cancel — cancel a room timer manually
router.post('/timers/:roomName/cancel', (req: Request, res: Response) => {
  try {
    const roomName = String(req.params.roomName)
    motionHandler.cancelRoomTimer(roomName)
    res.json({ success: true, roomName })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
