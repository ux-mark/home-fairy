import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run } from '../db/index.js'
import { hubitatClient, type HubitatDevice } from '../lib/hubitat-client.js'
import { emit } from '../lib/socket.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

interface HubDeviceRow {
  id: number
  label: string
  device_name: string | null
  device_type: string
  capabilities: string
  attributes: string
  config: string
  created_at: string
  updated_at: string
}

interface DeviceRoomRow {
  id: number
  device_id: string
  device_label: string
  device_type: string
  room_name: string
  config: string
  created_at: string
}

// GET /devices — list all hub devices from database
router.get('/devices', (_req: Request, res: Response) => {
  try {
    const rows = getAll<HubDeviceRow>('SELECT * FROM hub_devices ORDER BY label')
    res.json(
      rows.map((r) => {
        let capabilities: unknown = []
        let attributes: unknown = {}
        try { capabilities = JSON.parse(r.capabilities) } catch { capabilities = [] }
        try { attributes = JSON.parse(r.attributes) } catch { attributes = {} }
        return {
          ...r,
          capabilities: Array.isArray(capabilities) ? capabilities : [],
          attributes: attributes && typeof attributes === 'object' ? attributes : {},
        }
      }),
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /devices/sync — pull from Hubitat API and upsert into hub_devices
router.post('/devices/sync', async (_req: Request, res: Response) => {
  try {
    let devices: HubitatDevice[]
    try {
      devices = await hubitatClient.listDevices()
    } catch (connErr) {
      const connMsg = connErr instanceof Error ? connErr.message : String(connErr)
      res.status(503).json({
        error: 'Unable to reach Hubitat hub',
        details: connMsg,
      })
      return
    }

    let newCount = 0
    let updatedCount = 0

    for (const dev of devices) {
      // Get full device details for capabilities/attributes
      let fullDevice: HubitatDevice
      try {
        fullDevice = await hubitatClient.getDevice(dev.id)
      } catch {
        fullDevice = dev
      }

      // Determine device type based on capabilities
      // Hubitat returns mixed arrays of strings and objects — filter to strings only
      const caps = (fullDevice.capabilities ?? [])
        .filter((c: unknown): c is string => typeof c === 'string')
        .map(c => c.toLowerCase())
      let deviceType = 'unknown'
      if (caps.includes('motionsensor') || caps.includes('motion sensor')) {
        deviceType = 'motion'
      } else if (caps.includes('contactsensor') || caps.includes('contact sensor')) {
        deviceType = 'contact'
      } else if (caps.includes('temperaturesensor') || caps.includes('temperature sensor') || caps.includes('temperaturemeasurement') || caps.includes('temperature measurement')) {
        deviceType = 'temperature'
      } else if (caps.includes('switchlevel') || caps.includes('switch level')) {
        deviceType = 'dimmer'
      } else if (caps.includes('switch')) {
        deviceType = 'switch'
      } else if (caps.includes('lock')) {
        deviceType = 'lock'
      } else if (caps.includes('thermostat')) {
        deviceType = 'thermostat'
      } else if (caps.includes('battery')) {
        deviceType = 'sensor'
      }

      // Check if device already exists
      const existing = getOne<HubDeviceRow>('SELECT id FROM hub_devices WHERE id = ?', [fullDevice.id])
      if (existing) {
        updatedCount++
      } else {
        newCount++
      }

      // Flatten attributes from Hubitat array format [{name, currentValue}] to {name: currentValue}
      let flatAttrs: Record<string, unknown> = {}
      const rawAttrs = fullDevice.attributes
      if (Array.isArray(rawAttrs)) {
        for (const attr of rawAttrs) {
          if (attr && typeof attr === 'object' && 'name' in attr && 'currentValue' in attr) {
            flatAttrs[(attr as { name: string }).name] = (attr as { currentValue: unknown }).currentValue
          }
        }
      } else if (rawAttrs && typeof rawAttrs === 'object') {
        flatAttrs = rawAttrs as Record<string, unknown>
      }

      run(
        `INSERT INTO hub_devices (id, label, device_name, device_type, capabilities, attributes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label,
           device_name = excluded.device_name,
           device_type = excluded.device_type,
           capabilities = excluded.capabilities,
           attributes = excluded.attributes,
           updated_at = datetime('now')`,
        [
          fullDevice.id,
          fullDevice.label,
          fullDevice.name ?? null,
          deviceType,
          JSON.stringify(fullDevice.capabilities ?? []),
          JSON.stringify(flatAttrs),
        ],
      )
    }

    // Remove hub_devices that no longer exist on the hub
    // Compare as strings to avoid number/string type mismatch
    // Skip locally-created devices (negative IDs: fairy, twinkly) — they're not from Hubitat
    const hubIdStrings = new Set(devices.map((d) => String(d.id)))
    const existingRows = getAll<{ id: number; label: string }>('SELECT id, label FROM hub_devices')
    let removedCount = 0
    for (const row of existingRows) {
      if (row.id < 0) continue // locally-created device, not from Hubitat
      if (!hubIdStrings.has(String(row.id))) {
        run('DELETE FROM device_rooms WHERE device_id = ?', [String(row.id)])
        run('DELETE FROM hub_devices WHERE id = ?', [row.id])
        removedCount++
        console.log(`[hubitat-sync] Removed device no longer on hub: ${row.label} (${row.id})`)
      }
    }

    const rows = getAll<HubDeviceRow>('SELECT * FROM hub_devices ORDER BY label')
    res.json({
      synced: devices.length,
      new: newCount,
      updated: updatedCount,
      removed: removedCount,
      devices: rows.map((r) => ({
        ...r,
        capabilities: JSON.parse(r.capabilities),
        attributes: JSON.parse(r.attributes),
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /devices/:id — get single device
router.get('/devices/:id', (req: Request, res: Response) => {
  try {
    const row = getOne<HubDeviceRow>('SELECT * FROM hub_devices WHERE id = ?', [
      req.params.id,
    ])
    if (!row) {
      res.status(404).json({ error: 'Device not found' })
      return
    }
    res.json({
      ...row,
      capabilities: JSON.parse(row.capabilities),
      attributes: JSON.parse(row.attributes),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /devices/:id/command — send command to device
router.post('/devices/:id/command', async (req: Request, res: Response) => {
  try {
    const { command, value } = req.body as {
      command: string
      value?: string | number
    }
    if (!command) {
      res.status(400).json({ error: 'command is required' })
      return
    }

    const deviceId = String(req.params.id)
    let result: unknown
    if (value !== undefined) {
      result = await hubitatClient.sendCommandWithValue(
        deviceId,
        command,
        value,
      )
    } else {
      result = await hubitatClient.sendCommand(deviceId, command)
    }
    emit('device:command', { deviceId, command, value })
    res.json({ success: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /device-rooms — get all device-room assignments
router.get('/device-rooms', (_req: Request, res: Response) => {
  try {
    const rows = getAll<DeviceRoomRow>(
      'SELECT * FROM device_rooms ORDER BY room_name, device_label',
    )
    res.json(
      rows.map((r) => ({
        ...r,
        config: JSON.parse(r.config),
      })),
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /device-rooms/:roomName — get devices for a room
router.get('/device-rooms/:roomName', (req: Request, res: Response) => {
  try {
    const rows = getAll<DeviceRoomRow>(
      'SELECT * FROM device_rooms WHERE room_name = ? ORDER BY device_label',
      [req.params.roomName],
    )
    res.json(
      rows.map((r) => ({
        ...r,
        config: JSON.parse(r.config),
      })),
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

const deviceRoomSchema = z.object({
  device_id: z.string().min(1),
  device_label: z.string().min(1),
  device_type: z.enum(['motion', 'sensor', 'contact', 'temperature', 'switch', 'dimmer', 'light', 'lock', 'thermostat', 'unknown', 'kasa_plug', 'kasa_strip', 'kasa_outlet', 'kasa_switch', 'kasa_dimmer']),
  room_name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
})

// POST /device-rooms — assign device to room
router.post('/device-rooms', (req: Request, res: Response) => {
  try {
    const body = deviceRoomSchema.parse(req.body)

    run(
      `INSERT INTO device_rooms (device_id, device_label, device_type, room_name, config)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id, room_name) DO UPDATE SET
         device_label = excluded.device_label,
         device_type = excluded.device_type,
         config = excluded.config`,
      [
        body.device_id,
        body.device_label,
        body.device_type,
        body.room_name,
        JSON.stringify(body.config ?? {}),
      ],
    )

    const created = getOne<DeviceRoomRow>(
      'SELECT * FROM device_rooms WHERE device_id = ? AND room_name = ?',
      [body.device_id, body.room_name],
    )
    res.status(201).json({
      ...created!,
      config: JSON.parse(created!.config),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PATCH /devices/:id/config — update device-level config (e.g. exclude_from_all_off)
router.patch('/devices/:id/config', (req: Request, res: Response) => {
  try {
    const deviceId = String(req.params.id)
    const { config } = req.body as { config?: Record<string, unknown> }
    if (!config || typeof config !== 'object') {
      res.status(400).json({ error: 'config object is required' })
      return
    }

    const existing = getOne<HubDeviceRow>('SELECT * FROM hub_devices WHERE id = ?', [Number(deviceId)])
    if (!existing) {
      res.status(404).json({ error: 'Device not found' })
      return
    }

    let existingConfig: Record<string, unknown> = {}
    try { existingConfig = JSON.parse(existing.config ?? '{}') } catch { existingConfig = {} }
    const merged = { ...existingConfig, ...config }

    run(
      "UPDATE hub_devices SET config = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(merged), Number(deviceId)],
    )

    // Also sync to device_rooms if assigned
    run(
      'UPDATE device_rooms SET config = ? WHERE device_id = ?',
      [JSON.stringify(merged), deviceId],
    )

    res.json({ id: Number(deviceId), config: merged })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PATCH /device-rooms/:deviceId/:roomName/config — merge config fields
router.patch(
  '/device-rooms/:deviceId/:roomName/config',
  (req: Request, res: Response) => {
    try {
      const { config } = req.body as { config?: Record<string, unknown> }
      if (!config || typeof config !== 'object') {
        res.status(400).json({ error: 'config object is required' })
        return
      }

      const existing = getOne<DeviceRoomRow>(
        'SELECT * FROM device_rooms WHERE device_id = ? AND room_name = ?',
        [req.params.deviceId, req.params.roomName],
      )
      if (!existing) {
        res.status(404).json({ error: 'Device-room assignment not found' })
        return
      }

      let existingConfig: Record<string, unknown> = {}
      try { existingConfig = JSON.parse(existing.config) } catch { existingConfig = {} }

      const mergedConfig = { ...existingConfig, ...config }

      run(
        'UPDATE device_rooms SET config = ? WHERE device_id = ? AND room_name = ?',
        [JSON.stringify(mergedConfig), req.params.deviceId, req.params.roomName],
      )

      const updated = getOne<DeviceRoomRow>(
        'SELECT * FROM device_rooms WHERE device_id = ? AND room_name = ?',
        [req.params.deviceId, req.params.roomName],
      )
      res.json({ ...updated!, config: JSON.parse(updated!.config) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
    }
  },
)

// DELETE /device-rooms/:deviceId/:roomName — remove device from room
router.delete(
  '/device-rooms/:deviceId/:roomName',
  (req: Request, res: Response) => {
    try {
      const existing = getOne<DeviceRoomRow>(
        'SELECT * FROM device_rooms WHERE device_id = ? AND room_name = ?',
        [req.params.deviceId, req.params.roomName],
      )
      if (!existing) {
        res.status(404).json({ error: 'Device-room assignment not found' })
        return
      }
      run('DELETE FROM device_rooms WHERE device_id = ? AND room_name = ?', [
        req.params.deviceId,
        req.params.roomName,
      ])
      res.json({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
    }
  },
)

export default router
