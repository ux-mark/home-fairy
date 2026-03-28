import { kasaClient, type KasaSidecarDevice } from './kasa-client.js'
import { db, run } from '../db/index.js'
import { deviceHealthService } from './device-health-service.js'
import type { Server as SocketServer } from 'socket.io'

const POLL_INTERVAL_MS = 10_000

let intervalId: ReturnType<typeof setInterval> | null = null
let initTimeout: ReturnType<typeof setTimeout> | null = null
let io: SocketServer | null = null
let previousStates: Record<string, { switch_state: string; power: number }> = {}

// Prepare statements once at module scope for performance.
// The upsert does NOT update the label on conflict — labels are only changed
// via the rename endpoint. This prevents the poller from reverting a rename
// while the sidecar's cache is stale.
const upsert = db.prepare(`
  INSERT INTO kasa_devices (id, label, device_type, model, parent_id, ip_address, has_emeter, firmware, hardware, rssi, is_online, attributes, last_seen, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    ip_address = excluded.ip_address,
    rssi = excluded.rssi,
    is_online = 1,
    attributes = excluded.attributes,
    last_seen = datetime('now'),
    updated_at = datetime('now')
`)

function flattenDevices(devices: KasaSidecarDevice[]): KasaSidecarDevice[] {
  const flat: KasaSidecarDevice[] = []
  for (const device of devices) {
    flat.push(device)
    if (device.children) {
      for (const child of device.children) {
        flat.push(child)
      }
    }
  }
  return flat
}

async function pollKasaDevices(): Promise<void> {
  try {
    const devices = await kasaClient.listDevices()
    const allDevices = flattenDevices(devices)

    // Track which devices were offline before this poll so we can call
    // recordSuccess for devices that have reappeared.
    const seenIds = new Set(allDevices.map(d => d.id))

    const transaction = db.transaction(() => {
      for (const device of allDevices) {
        const attributes = JSON.stringify({
          switch: device.switch_state,
          brightness: device.brightness,
          power: device.emeter?.power ?? null,
          voltage: device.emeter?.voltage ?? null,
          current: device.emeter?.current ?? null,
          energy: device.emeter?.total ?? null,
          runtime_today: device.runtime_today,
          runtime_month: device.runtime_month,
        })

        upsert.run(
          device.id,
          device.label,
          device.device_type,
          device.model,
          device.parent_id,
          device.ip_address,
          device.has_emeter ? 1 : 0,
          device.firmware,
          device.hardware,
          device.rssi,
          attributes,
        )

        // Emit Socket.io events for state changes
        if (io) {
          const prev = previousStates[device.id]
          const currentPower = device.emeter?.power ?? 0

          if (prev) {
            if (prev.switch_state !== device.switch_state) {
              io.emit('kasa:state', {
                deviceId: device.id,
                label: device.label,
                switch_state: device.switch_state,
              })
            }
            if (Math.abs(prev.power - currentPower) > 0.5) {
              io.emit('kasa:power', {
                deviceId: device.id,
                label: device.label,
                power: currentPower,
                voltage: device.emeter?.voltage,
                current: device.emeter?.current,
              })
            }
          }

          previousStates[device.id] = {
            switch_state: device.switch_state,
            power: currentPower,
          }
        }
      }

      // Mark devices not found in this poll as offline
      const onlineDevices = db
        .prepare('SELECT id FROM kasa_devices WHERE is_online = 1')
        .all() as { id: string }[]
      for (const row of onlineDevices) {
        if (!seenIds.has(row.id)) {
          db.prepare(
            "UPDATE kasa_devices SET is_online = 0, updated_at = datetime('now') WHERE id = ?",
          ).run(row.id)
        }
      }
    })

    transaction()

    // Record health outcomes outside the transaction (health service uses its
    // own transactions internally).
    for (const device of allDevices) {
      deviceHealthService.recordSuccess('kasa', device.id)
    }

    // Record failures for devices that are now offline
    const nowOffline = db
      .prepare('SELECT id FROM kasa_devices WHERE is_online = 0')
      .all() as { id: string }[]
    for (const row of nowOffline) {
      if (!seenIds.has(row.id)) {
        deviceHealthService.recordFailure('kasa', row.id, 'Device not found in network scan')
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[kasa-poller] Poll failed:', msg)
    try { run('INSERT INTO logs (message, category) VALUES (?, ?)', [`Kasa poll failed: ${msg}`, 'kasa']) } catch { /* ignore */ }
    // Online/offline state is authoritative from the sidecar — devices that
    // drop off the network will stop appearing in the sidecar response.
    // The upsert only touches devices present in the response, so stale
    // devices retain their last-known state until the next discovery cycle.
  }
}

export function startKasaPoller(socketIo: SocketServer): void {
  if (intervalId) return
  io = socketIo
  console.log('[kasa-poller] Starting Kasa device poller (10s interval)')

  // Initial poll after short delay
  initTimeout = setTimeout(() => {
    initTimeout = null
    pollKasaDevices()
    intervalId = setInterval(pollKasaDevices, POLL_INTERVAL_MS)
  }, 5_000)
}

export function stopKasaPoller(): void {
  if (initTimeout) {
    clearTimeout(initTimeout)
    initTimeout = null
  }
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[kasa-poller] Poller stopped')
  }
}
