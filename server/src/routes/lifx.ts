import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { lifxClient } from '../lib/lifx-client.js'

const router = Router()

const stateSchema = z.object({
  power: z.enum(['on', 'off']).optional(),
  color: z.string().optional(),
  brightness: z.number().min(0).max(1).optional(),
  duration: z.number().optional(),
})

// GET /lights — list all LIFX lights
router.get('/lights', async (_req: Request, res: Response) => {
  try {
    const lights = await lifxClient.listAll()
    const cleaned = lights.map((l: Record<string, unknown>) => ({
      id: l.id,
      uuid: l.uuid,
      label: l.label,
      connected: l.connected,
      power: l.power,
      brightness: l.brightness,
      color: l.color,
      group: l.group,
      location: l.location,
      product: l.product,
    }))
    res.json(cleaned)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /lights/:selector — get lights by selector
router.get('/lights/:selector', async (req: Request, res: Response) => {
  try {
    const selector = req.params.selector as string
    const data = await lifxClient.listBySelector(selector)
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// PUT /lights/:selector/state — set light state
router.put('/lights/:selector/state', async (req: Request, res: Response) => {
  try {
    const selector = req.params.selector as string
    const body = stateSchema.parse(req.body)
    const data = await lifxClient.setState(selector, body)
    res.json(data)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /lights/:selector/toggle — toggle power
router.post('/lights/:selector/toggle', async (req: Request, res: Response) => {
  try {
    const selector = req.params.selector as string
    const data = await lifxClient.toggle(selector)
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /lights/:selector/identify — breathe effect
router.post('/lights/:selector/identify', async (req: Request, res: Response) => {
  try {
    const selector = req.params.selector as string
    const data = await lifxClient.identify(selector)
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /scenes — list LIFX scenes
router.get('/scenes', async (_req: Request, res: Response) => {
  try {
    const data = await lifxClient.listScenes()
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

export default router
