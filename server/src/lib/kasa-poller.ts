import { kasaClient, type KasaSidecarDevice } from './kasa-client.js'
import { db, prepareCached } from '../db/index.js'
import { log } from './logger.js'
import { deviceHealthService } from './device-health-service.js'
import type { Server as SocketServer } from 'socket.io'

const POLL_INTERVAL_MS = 10_000
// Time between sidecar reachability checks while waiting for first poll.
// Mid-life outages still surface via the regular pollKasaDevices catch block;
// only cold-boot startup noise is hushed here.
const PROBE_INTERVAL_MS = 5_000

let intervalId: ReturnType<typeof setInterval> | null = null
let probeTimeout: ReturnType<typeof setTimeout> | null = null
let io: SocketServer | null = null
let previousStates: Record<string, { switch_state: string; power: number }> = {}

// Skip the DB upsert when a device's state hasn't changed since the last
// write — most devices are in steady state, so unconditional writes every
// 10 s poll were ~250K needless row writes/day straight to the SD card.
// A 5-minute heartbeat still refreshes last_seen/rssi, and entries are
// dropped when a device goes offline so its reappearance always writes
// (is_online must flip back to 1).
const UNCHANGED_WRITE_REFRESH_MS = 5 * 60 * 1000
let lastWrites: Record<string, { stateKey: string; writtenAt: number }> = {}

// What counts as "changed" for the write-skip. Raw emeter readings jitter at
// noise level on every poll (an OFF outlet reads 0 W one poll and 0.067 W the
// next), so exact equality never matches. Power is bucketed at 0.5 W — the
// same threshold the kasa:power socket emit uses — and voltage/current are
// excluded outright; their stored values refresh on the heartbeat write.
function deltaKey(device: KasaSidecarDevice): string {
  const power = device.emeter?.power
  return JSON.stringify({
    switch: device.switch_state,
    brightness: device.brightness,
    power: power == null ? null : Math.round(power * 2) / 2,
    energy: device.emeter?.total ?? null,
    runtime_today: device.runtime_today,
    runtime_month: device.runtime_month,
    ip: device.ip_address ?? null,
  })
}

// Backoff for poll-failure logging — see the catch block in pollKasaDevices.
const FAILURE_LOG_INTERVAL_MS = 15 * 60 * 1000
let lastFailureLogAt = 0

// Upsert SQL — kept as a string constant and prepared on demand via the
// shared statement cache. Doing the prepare lazily avoids a boot-order
// race: ESM imports execute before index.ts can call initDb(), so a
// module-level db.prepare() crashes on a fresh DB ("no such table:
// kasa_devices"). Once initDb has run, prepareCached resolves the same
// statement on every call.
//
// The upsert does NOT update the label on conflict — labels are only
// changed via the rename endpoint. This prevents the poller from
// reverting a rename while the sidecar's cache is stale.
const UPSERT_SQL = `
  INSERT INTO kasa_devices (id, label, device_type, model, parent_id, ip_address, has_emeter, firmware, hardware, rssi, is_online, attributes, last_seen, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    ip_address = excluded.ip_address,
    rssi = excluded.rssi,
    is_online = 1,
    attributes = excluded.attributes,
    last_seen = datetime('now'),
    updated_at = datetime('now')
`

// Devices missing an `id` are unwriteable (`kasa_devices.id` is the primary
// key) and would also trip every NOT NULL constraint downstream. We skip them
// and report once per poll — see pollKasaDevices.
function isUsableDevice(device: unknown): device is KasaSidecarDevice {
  return (
    typeof device === 'object' &&
    device !== null &&
    typeof (device as { id?: unknown }).id === 'string' &&
    (device as { id: string }).id.length > 0
  )
}

function flattenDevices(devices: unknown): {
  usable: KasaSidecarDevice[]
  skippedCount: number
} {
  // Defend against the sidecar being unreachable and a different service
  // answering on its port. Past incident: a stray dev server returned an HTML
  // string; axios accepted it, the poller iterated the string as characters,
  // and every character became a "device with id undefined" — 7 000+ errors
  // per minute, gigabytes of log spam.
  if (!Array.isArray(devices)) {
    throw new Error(
      `sidecar returned ${typeof devices}, expected array — port 3002 may be hosting the wrong service`,
    )
  }
  const usable: KasaSidecarDevice[] = []
  let skippedCount = 0
  for (const device of devices) {
    if (isUsableDevice(device)) {
      usable.push(device)
    } else {
      skippedCount++
      continue
    }
    if (Array.isArray(device.children)) {
      for (const child of device.children) {
        if (isUsableDevice(child)) {
          usable.push(child)
        } else {
          skippedCount++
        }
      }
    }
  }
  return { usable, skippedCount }
}

// Track the most recent skip-count so we only log when it changes — repeated
// identical skip counts are background noise, but a sudden jump (or the first
// occurrence after a quiet period) is worth knowing about.
let lastReportedSkipCount = 0

async function pollKasaDevices(): Promise<void> {
  try {
    const devices = await kasaClient.listDevices()
    const { usable: allDevices, skippedCount } = flattenDevices(devices)

    if (lastFailureLogAt > 0) {
      lastFailureLogAt = 0
      console.log('[kasa-poller] Poll recovered')
      try { log('Kasa poll recovered', 'kasa') } catch { /* ignore */ }
    }

    if (skippedCount !== lastReportedSkipCount) {
      if (skippedCount > 0) {
        console.warn(
          `[kasa-poller] skipped ${skippedCount} malformed device record(s) from sidecar this poll`,
        )
      } else {
        console.log('[kasa-poller] sidecar payload clean — no malformed records')
      }
      lastReportedSkipCount = skippedCount
    }

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

        // Coalesce label/device_type. id is guaranteed non-empty by
        // isUsableDevice, so `device.id` is a safe fallback for label.
        const labelToWrite = device.label || device.id
        const deviceTypeToWrite = device.device_type || 'unknown'

        const stateKey = deltaKey(device)
        const lastWrite = lastWrites[device.id]
        if (
          lastWrite &&
          lastWrite.stateKey === stateKey &&
          Date.now() - lastWrite.writtenAt < UNCHANGED_WRITE_REFRESH_MS
        ) {
          continue
        }

        try {
          prepareCached(UPSERT_SQL).run(
            device.id,
            labelToWrite,
            deviceTypeToWrite,
            device.model,
            device.parent_id,
            device.ip_address,
            device.has_emeter ? 1 : 0,
            device.firmware,
            device.hardware,
            device.rssi,
            attributes,
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[kasa-poller] upsert failed for ${device.id}: ${msg}`)
          // Skip the Socket.io emit too — without a successful write we
          // don't have authoritative state to broadcast.
          continue
        }

        lastWrites[device.id] = { stateKey, writtenAt: Date.now() }

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
          // Force a full upsert when it reappears, even if state is unchanged
          delete lastWrites[row.id]
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
    // A down sidecar fails every 10 s poll — that's 8 640 identical log rows
    // a day. Log the first failure, then at most once per 15 minutes while
    // the outage lasts; recovery is logged by the next successful poll.
    const now = Date.now()
    if (now - lastFailureLogAt > FAILURE_LOG_INTERVAL_MS) {
      lastFailureLogAt = now
      console.error('[kasa-poller] Poll failed:', msg)
      try { log(`Kasa poll failed: ${msg}`, 'kasa') } catch { /* ignore */ }
    }
    // Online/offline state is authoritative from the sidecar — devices that
    // drop off the network will stop appearing in the sidecar response.
    // The upsert only touches devices present in the response, so stale
    // devices retain their last-known state until the next discovery cycle.
  }
}

async function probeForSidecar(): Promise<void> {
  probeTimeout = null
  try {
    const health = await kasaClient.health()
    // A successful health response must look like the sidecar's actual
    // contract. If a different service is squatting on the port and answers
    // 200 with HTML, axios returns a string here; treat that as "not the
    // sidecar" and keep probing.
    if (
      typeof health !== 'object' ||
      health === null ||
      typeof (health as { status?: unknown }).status !== 'string'
    ) {
      probeTimeout = setTimeout(probeForSidecar, PROBE_INTERVAL_MS)
      return
    }
  } catch {
    // Sidecar not yet reachable — quiet retry. On a cold Pi boot the Python
    // venv + Discover.discover(timeout=10) take longer than the old fixed
    // 5 s startup delay, which used to log every miss as an error.
    probeTimeout = setTimeout(probeForSidecar, PROBE_INTERVAL_MS)
    return
  }
  console.log('[kasa-poller] Sidecar reachable; starting poll loop')
  pollKasaDevices()
  intervalId = setInterval(pollKasaDevices, POLL_INTERVAL_MS)
}

export function startKasaPoller(socketIo: SocketServer): void {
  if (intervalId || probeTimeout) return
  io = socketIo
  console.log('[kasa-poller] Starting Kasa device poller (10s interval)')
  // First probe runs on the next tick so this function stays synchronous;
  // probeForSidecar owns the retry loop until the sidecar answers /health.
  probeTimeout = setTimeout(probeForSidecar, 0)
}

export function stopKasaPoller(): void {
  if (probeTimeout) {
    clearTimeout(probeTimeout)
    probeTimeout = null
  }
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[kasa-poller] Poller stopped')
  }
}
