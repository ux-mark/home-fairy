import { Router, type Request, type Response } from 'express'
import { getAll, getOne, run } from '../db/index.js'
import { kasaClient } from '../lib/kasa-client.js'

const router = Router()

interface KasaDeviceRow {
  id: string
  label: string
  device_type: string
  model: string | null
  parent_id: string | null
  ip_address: string | null
  has_emeter: number
  firmware: string | null
  hardware: string | null
  rssi: number | null
  is_online: number
  attributes: string
  created_at: string
  updated_at: string
  last_seen: string | null
}

function parseDeviceRow(row: KasaDeviceRow) {
  let attributes: unknown = {}
  try { attributes = JSON.parse(row.attributes) } catch { attributes = {} }
  return {
    ...row,
    has_emeter: row.has_emeter === 1,
    is_online: row.is_online === 1,
    attributes: attributes && typeof attributes === 'object' ? attributes : {},
  }
}

// GET /devices — list all Kasa devices from DB with live attributes
router.get('/devices', (_req: Request, res: Response) => {
  try {
    const rows = getAll<KasaDeviceRow>('SELECT * FROM kasa_devices ORDER BY label')
    res.json(rows.map(parseDeviceRow))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /devices/:id — single device with full attributes (strips include children)
router.get('/devices/:id', (req: Request, res: Response) => {
  try {
    const row = getOne<KasaDeviceRow>('SELECT * FROM kasa_devices WHERE id = ?', [req.params.id])
    if (!row) {
      res.status(404).json({ error: 'Device not found' })
      return
    }
    const device = parseDeviceRow(row)
    // For strip devices, attach child outlets
    if (row.device_type === 'strip') {
      const children = getAll<KasaDeviceRow>(
        'SELECT * FROM kasa_devices WHERE parent_id = ? ORDER BY id',
        [row.id],
      )
      ;(device as Record<string, unknown>).children = children.map(parseDeviceRow)
    }
    res.json(device)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /devices/:id/command — send command (on/off/brightness)
router.post('/devices/:id/command', async (req: Request, res: Response) => {
  try {
    const { command, value } = req.body as { command: string; value?: number }
    if (!command) {
      res.status(400).json({ error: 'command is required' })
      return
    }

    const deviceId = String(req.params.id)
    await kasaClient.sendCommand(deviceId, command, value)
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /discover — trigger network discovery, sync to DB
router.post('/discover', async (_req: Request, res: Response) => {
  try {
    const result = await kasaClient.discover()
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(503).json({ error: 'Unable to reach Kasa sidecar', details: msg })
  }
})

// GET /devices/:id/energy/daily — daily energy stats from device
router.get('/devices/:id/energy/daily', async (req: Request, res: Response) => {
  try {
    const deviceId = String(req.params.id)
    const year = req.query.year != null ? Number(String(req.query.year)) : undefined
    const month = req.query.month != null ? Number(String(req.query.month)) : undefined
    const data = await kasaClient.getDailyStats(deviceId, year, month)
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /devices/:id/energy/monthly — monthly energy stats from device
router.get('/devices/:id/energy/monthly', async (req: Request, res: Response) => {
  try {
    const deviceId = String(req.params.id)
    const year = req.query.year != null ? Number(String(req.query.year)) : undefined
    const data = await kasaClient.getMonthlyStats(deviceId, year)
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// POST /devices/:id/label — rename device label
router.post('/devices/:id/label', (req: Request, res: Response) => {
  try {
    const { label } = req.body as { label?: string }
    if (!label || typeof label !== 'string' || !label.trim()) {
      res.status(400).json({ error: 'label is required' })
      return
    }

    const existing = getOne<KasaDeviceRow>('SELECT * FROM kasa_devices WHERE id = ?', [req.params.id])
    if (!existing) {
      res.status(404).json({ error: 'Device not found' })
      return
    }

    run(
      "UPDATE kasa_devices SET label = ?, updated_at = datetime('now') WHERE id = ?",
      [label.trim(), req.params.id],
    )

    const updated = getOne<KasaDeviceRow>('SELECT * FROM kasa_devices WHERE id = ?', [req.params.id])
    res.json(parseDeviceRow(updated!))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// GET /health — sidecar health status
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await kasaClient.health()
    res.json(health)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(503).json({ error: 'Kasa sidecar unreachable', details: msg })
  }
})

export default router
