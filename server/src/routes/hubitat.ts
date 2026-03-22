import { Router, Request, Response } from 'express'
import { getAll, getOne, run } from '../db/index.js'
import { hubitatClient, type HubitatDevice } from '../lib/hubitat-client.js'

const router = Router()

interface HubDeviceRow {
  id: number
  label: string
  device_name: string | null
  device_type: string
  capabilities: string
  attributes: string
  room_name: string | null
  last_event: string | null
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
    res.status(500).json({ error: msg })
  }
})

// GET /devices/sync — pull from Hubitat API and upsert into hub_devices
router.get('/devices/sync', async (_req: Request, res: Response) => {
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
          JSON.stringify(fullDevice.attributes ?? {}),
        ],
      )
    }

    const rows = getAll<HubDeviceRow>('SELECT * FROM hub_devices ORDER BY label')
    res.json({
      synced: devices.length,
      new: newCount,
      updated: updatedCount,
      devices: rows.map((r) => ({
        ...r,
        capabilities: JSON.parse(r.capabilities),
        attributes: JSON.parse(r.attributes),
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
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
    res.status(500).json({ error: msg })
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
    res.json({ success: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
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
    res.status(500).json({ error: msg })
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
    res.status(500).json({ error: msg })
  }
})

// POST /device-rooms — assign device to room
router.post('/device-rooms', (req: Request, res: Response) => {
  try {
    const { device_id, device_label, device_type, room_name, config } =
      req.body as {
        device_id: string
        device_label: string
        device_type: string
        room_name: string
        config?: Record<string, unknown>
      }

    if (!device_id || !device_label || !device_type || !room_name) {
      res
        .status(400)
        .json({
          error: 'device_id, device_label, device_type, and room_name are required',
        })
      return
    }

    run(
      `INSERT INTO device_rooms (device_id, device_label, device_type, room_name, config)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id, room_name) DO UPDATE SET
         device_label = excluded.device_label,
         device_type = excluded.device_type,
         config = excluded.config`,
      [
        device_id,
        device_label,
        device_type,
        room_name,
        JSON.stringify(config ?? {}),
      ],
    )

    const created = getOne<DeviceRoomRow>(
      'SELECT * FROM device_rooms WHERE device_id = ? AND room_name = ?',
      [device_id, room_name],
    )
    res.status(201).json({
      ...created!,
      config: JSON.parse(created!.config),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

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
      res.status(500).json({ error: msg })
    }
  },
)

export default router
