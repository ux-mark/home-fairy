import { Router, type Request, type Response } from 'express'
import { getAll, getOne, run } from '../db/index.js'
import { kasaClient } from '../lib/kasa-client.js'
import { emit } from '../lib/socket.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

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
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
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
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
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
    emit('device:command', { deviceId, command })
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
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
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
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
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /devices/:id/label — rename device on hardware, update DB and history
router.post('/devices/:id/label', async (req: Request, res: Response) => {
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

    const oldLabel = existing.label
    const newLabel = label.trim()

    // 1. Rename on the actual Kasa hardware (persists on the device)
    const deviceId = String(req.params.id)
    await kasaClient.renameDevice(deviceId, newLabel)

    // 2. Update the DB
    run(
      "UPDATE kasa_devices SET label = ?, updated_at = datetime('now') WHERE id = ?",
      [newLabel, req.params.id],
    )

    // 3. Migrate device_history records so charts stay connected
    if (oldLabel !== newLabel) {
      run(
        'UPDATE device_history SET source_id = ? WHERE source_id = ?',
        [newLabel, oldLabel],
      )
      // Also update device_rooms if this device is assigned to a room
      run(
        'UPDATE device_rooms SET device_label = ? WHERE device_id = ?',
        [newLabel, req.params.id],
      )
    }

    const updated = getOne<KasaDeviceRow>('SELECT * FROM kasa_devices WHERE id = ?', [req.params.id])
    res.json(parseDeviceRow(updated!))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PATCH /devices/:id/config — update device-level config (e.g. exclude_from_all_off)
router.patch('/devices/:id/config', (req: Request, res: Response) => {
  try {
    const deviceId = String(req.params.id)
    const { config } = req.body as { config: Record<string, unknown> }
    if (!config || typeof config !== 'object') {
      res.status(400).json({ error: 'config object is required' })
      return
    }

    const existing = getOne<KasaDeviceRow>('SELECT * FROM kasa_devices WHERE id = ?', [deviceId])
    if (!existing) {
      res.status(404).json({ error: 'Device not found' })
      return
    }

    // Config is stored in its own column, not attributes
    let existingConfig: Record<string, unknown> = {}
    try {
      const raw = (existing as unknown as { config: string }).config
      if (raw) existingConfig = JSON.parse(raw)
    } catch { /* */ }

    const merged = { ...existingConfig, ...config }
    run(
      "UPDATE kasa_devices SET config = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(merged), deviceId],
    )

    // Also update device_rooms config if the device is assigned to a room
    run(
      'UPDATE device_rooms SET config = ? WHERE device_id = ?',
      [JSON.stringify(merged), deviceId],
    )

    res.json({ ...parseDeviceRow(existing), config: merged })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
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
