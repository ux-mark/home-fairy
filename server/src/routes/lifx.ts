import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { lifxClient, getRateLimitStatus } from '../lib/lifx-client.js'
import { deviceHealthService } from '../lib/device-health-service.js'
import { getAll, getOne } from '../db/index.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

const stateSchema = z.object({
  power: z.enum(['on', 'off']).optional(),
  color: z.string().optional(),
  brightness: z.number().min(0).max(1).optional(),
  duration: z.number().optional(),
})

const batchStateItemSchema = z.object({
  selector: z.string(),
  power: z.enum(['on', 'off']).optional(),
  color: z.string().optional(),
  brightness: z.number().min(0).max(1).optional(),
  duration: z.number().optional(),
})

const batchStatesSchema = z.object({
  states: z.array(batchStateItemSchema).min(1).max(50),
  defaults: z.record(z.unknown()).optional(),
})

const effectParamsSchema = z.object({
  color: z.string().optional(),
  from_color: z.string().optional(),
  period: z.number().optional(),
  cycles: z.number().optional(),
  persist: z.boolean().optional(),
  power_on: z.boolean().optional(),
  peak: z.number().optional(),
  direction: z.string().optional(),
  speed: z.number().optional(),
})

const validEffects = ['breathe', 'pulse', 'move'] as const

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
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /rate-limit — return current rate limit status
router.get('/rate-limit', (_req: Request, res: Response) => {
  res.json(getRateLimitStatus())
})

// PUT /lights/states — batch set states (up to 50 lights)
router.put('/lights/states', async (req: Request, res: Response) => {
  try {
    const body = batchStatesSchema.parse(req.body)
    const data = await lifxClient.setStates(body.states, body.defaults)
    res.json(data)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /lights/:lightId/usage — get where a light is used (rooms, scenes, indicator)
router.get('/lights/:lightId/usage', (req: Request, res: Response) => {
  try {
    const lightId = req.params.lightId

    // Find room assignment
    const roomAssignment = getOne<{ room_name: string }>(
      'SELECT * FROM light_rooms WHERE light_id = ?',
      [lightId],
    )

    // Find scenes that reference this light
    interface SceneRow { name: string; icon: string; commands: string }
    const scenes = getAll<SceneRow>('SELECT name, icon, commands FROM scenes')
    const usedInScenes = scenes
      .filter(scene => {
        const cmds = JSON.parse(scene.commands || '[]') as { light_id?: string }[]
        return cmds.some(c => c.light_id === lightId)
      })
      .map(s => ({ name: s.name, icon: s.icon }))

    // Check if it's a configured indicator light
    const mtaIndicator = getOne<{ value: string }>(
      "SELECT value FROM current_state WHERE key = 'pref_mta_indicator'",
    )
    const weatherIndicator = getOne<{ value: string }>(
      "SELECT value FROM current_state WHERE key = 'pref_weather_indicator'",
    )

    let indicatorRole: 'subway' | 'weather' | null = null
    try {
      const mta = JSON.parse(mtaIndicator?.value || '{}') as { lightId?: string }
      if (mta.lightId === lightId) indicatorRole = 'subway'
    } catch { /* ignore */ }
    try {
      const weather = JSON.parse(weatherIndicator?.value || '{}') as { lightId?: string }
      if (weather.lightId === lightId) indicatorRole = 'weather'
    } catch { /* ignore */ }

    res.json({
      lightId,
      room: roomAssignment?.room_name || null,
      scenes: usedInScenes,
      indicatorRole,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
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
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PUT /lights/:selector/state — set light state
router.put('/lights/:selector/state', async (req: Request, res: Response) => {
  const selector = req.params.selector as string
  try {
    const body = stateSchema.parse(req.body)
    const data = await lifxClient.setState(selector, body)
    // Record success when selector is a specific light ID
    if (selector.startsWith('id:')) {
      deviceHealthService.recordSuccess('lifx', selector.replace('id:', ''))
    }
    res.json(data)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (selector.startsWith('id:')) {
      deviceHealthService.recordFailure('lifx', selector.replace('id:', ''), msg)
    }
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /lights/:selector/toggle — toggle power
router.post('/lights/:selector/toggle', async (req: Request, res: Response) => {
  const selector = req.params.selector as string
  try {
    const data = await lifxClient.toggle(selector)
    if (selector.startsWith('id:')) {
      deviceHealthService.recordSuccess('lifx', selector.replace('id:', ''))
    }
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (selector.startsWith('id:')) {
      deviceHealthService.recordFailure('lifx', selector.replace('id:', ''), msg)
    }
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
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
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /lights/:selector/effects/off — stop effects
router.post('/lights/:selector/effects/off', async (req: Request, res: Response) => {
  try {
    const selector = req.params.selector as string
    const data = await lifxClient.effectsOff(selector)
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /lights/:selector/effects/:effect — run an effect (breathe, pulse, move)
router.post('/lights/:selector/effects/:effect', async (req: Request, res: Response) => {
  try {
    const selector = req.params.selector as string
    const effect = req.params.effect as string

    if (!validEffects.includes(effect as (typeof validEffects)[number])) {
      res.status(400).json({ error: `Invalid effect: ${effect}. Must be one of: ${validEffects.join(', ')}` })
      return
    }

    const params = effectParamsSchema.parse(req.body)
    let data: unknown
    switch (effect) {
      case 'breathe':
        data = await lifxClient.breathe(selector, params)
        break
      case 'pulse':
        data = await lifxClient.pulse(selector, params)
        break
      case 'move':
        data = await lifxClient.move(selector, params)
        break
    }
    res.json(data)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /test — test LIFX connectivity by identifying a random connected light
router.post('/test', async (_req: Request, res: Response) => {
  try {
    const lights = await lifxClient.listAll()
    const connected = lights.filter((l: Record<string, unknown>) => l.connected)
    if (connected.length === 0) {
      res.status(503).json({ success: false, message: 'No connected lights found' })
      return
    }
    // Pick a random connected light and identify it
    const light = connected[Math.floor(Math.random() * connected.length)] as Record<string, unknown>
    await lifxClient.identify(`id:${light.id}`)
    res.json({ success: true, message: `Identified ${light.label}`, light: light.label })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(503).json({ success: false, message: IS_PRODUCTION ? 'Service unavailable' : msg })
  }
})

// GET /scenes — list LIFX scenes
router.get('/scenes', async (_req: Request, res: Response) => {
  try {
    const data = await lifxClient.listScenes()
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
