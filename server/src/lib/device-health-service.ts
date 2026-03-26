import { getOne, getAll, run, db } from '../db/index.js'
import { notificationService } from './notification-service.js'

type DeviceType = 'hub' | 'kasa' | 'lifx'

export interface DeactivatedDevice {
  deviceType: DeviceType
  deviceId: string
  deviceLabel: string
  roomName: string | null
  deactivatedAt: string
  deactivatedReason: string
  lastFailureReason: string | null
}

export interface DeviceHealth {
  deviceType: string
  deviceId: string
  consecutiveFailures: number
  unreachableSince: string | null
  lastSuccess: string | null
  lastFailure: string | null
  lastFailureReason: string | null
  deactivatedAt: string | null
  deactivatedReason: string | null
}

interface DeviceHealthRow {
  device_type: string
  device_id: string
  consecutive_failures: number
  unreachable_since: string | null
  last_success: string | null
  last_failure: string | null
  last_failure_reason: string | null
  deactivated_at: string | null
  deactivated_reason: string | null
}

function getDeviceLabel(deviceType: string, deviceId: string): string {
  if (deviceType === 'hub') {
    const row = getOne<{ label: string }>('SELECT label FROM hub_devices WHERE id = ?', [deviceId])
    return row?.label ?? deviceId
  }
  if (deviceType === 'kasa') {
    const row = getOne<{ label: string }>('SELECT label FROM kasa_devices WHERE id = ?', [deviceId])
    return row?.label ?? deviceId
  }
  if (deviceType === 'lifx') {
    const row = getOne<{ light_label: string }>(
      'SELECT light_label FROM light_rooms WHERE light_id = ? LIMIT 1',
      [deviceId],
    )
    return row?.light_label ?? deviceId
  }
  return deviceId
}

function logToDb(message: string): void {
  run(
    `INSERT INTO logs (message, category, created_at) VALUES (?, 'device_health', datetime('now'))`,
    [message],
  )
}

function setActiveFlag(deviceType: DeviceType, deviceId: string, active: 0 | 1): void {
  if (deviceType === 'hub') {
    run('UPDATE hub_devices SET active = ? WHERE id = ?', [active, deviceId])
  } else if (deviceType === 'kasa') {
    run('UPDATE kasa_devices SET active = ? WHERE id = ?', [active, deviceId])
  } else if (deviceType === 'lifx') {
    run('UPDATE light_rooms SET active = ? WHERE light_id = ?', [active, deviceId])
  }
}

export const deviceHealthService = {
  recordSuccess(deviceType: DeviceType, deviceId: string): void {
    const existing = getOne<DeviceHealthRow>(
      'SELECT * FROM device_health WHERE device_type = ? AND device_id = ?',
      [deviceType, deviceId],
    )

    const wasUnreachable = existing?.unreachable_since != null
    const wasDeactivated = existing?.deactivated_at != null

    run(
      `INSERT OR REPLACE INTO device_health
         (device_type, device_id, consecutive_failures, unreachable_since, last_success, last_failure, last_failure_reason, deactivated_at, deactivated_reason)
       VALUES
         (?, ?, 0, NULL, datetime('now'),
          ?, ?, ?, ?)`,
      [
        deviceType,
        deviceId,
        existing?.last_failure ?? null,
        existing?.last_failure_reason ?? null,
        existing?.deactivated_at ?? null,
        existing?.deactivated_reason ?? null,
      ],
    )

    if (wasDeactivated && wasUnreachable) {
      const label = getDeviceLabel(deviceType, deviceId)
      notificationService.create({
        title: `${label} is back online`,
        message:
          'This device was deactivated but is now responding. You can reactivate it from the Devices page.',
        severity: 'info',
        category: 'device_online',
        dedupKey: `device_online:${deviceType}:${deviceId}`,
      })
    }
  },

  recordFailure(deviceType: DeviceType, deviceId: string, reason: string): void {
    db.transaction(() => {
      const existing = getOne<DeviceHealthRow>(
        'SELECT * FROM device_health WHERE device_type = ? AND device_id = ?',
        [deviceType, deviceId],
      )

      const currentFailures = existing?.consecutive_failures ?? 0
      const newFailures = currentFailures + 1
      const wasUnreachable = existing?.unreachable_since != null
      const justHitThreshold = newFailures >= 3 && !wasUnreachable

      // Upsert the health record, preserving unreachable_since if already set
      // When justHitThreshold, we leave unreachable_since as NULL here and set it via UPDATE below
      run(
        `INSERT OR REPLACE INTO device_health
           (device_type, device_id, consecutive_failures, unreachable_since, last_success, last_failure, last_failure_reason, deactivated_at, deactivated_reason)
         VALUES
           (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
        [
          deviceType,
          deviceId,
          newFailures,
          existing?.unreachable_since ?? null,
          existing?.last_success ?? null,
          reason,
          existing?.deactivated_at ?? null,
          existing?.deactivated_reason ?? null,
        ],
      )

      if (justHitThreshold) {
        run(
          `UPDATE device_health SET unreachable_since = datetime('now') WHERE device_type = ? AND device_id = ?`,
          [deviceType, deviceId],
        )

        const label = getDeviceLabel(deviceType, deviceId)
        notificationService.create({
          title: `${label} appears to be offline`,
          message:
            'This device has failed to respond 3 times. You can deactivate it from the Devices page to stop errors.',
          severity: 'warning',
          category: 'device_unreachable',
          dedupKey: `device_unreachable:${deviceType}:${deviceId}`,
        })
      }
    })()
  },

  deactivateDevice(deviceType: DeviceType, deviceId: string, reason: 'manual' | 'auto_unreachable'): void {
    setActiveFlag(deviceType, deviceId, 0)

    run(
      `UPDATE device_health
       SET deactivated_at = datetime('now'), deactivated_reason = ?
       WHERE device_type = ? AND device_id = ?`,
      [reason, deviceType, deviceId],
    )

    const label = getDeviceLabel(deviceType, deviceId)
    logToDb(`Device deactivated: ${label} (${reason})`)
  },

  reactivateDevice(deviceType: DeviceType, deviceId: string): { success: boolean; error?: string } {
    setActiveFlag(deviceType, deviceId, 1)

    run(
      `UPDATE device_health
       SET deactivated_at = NULL, deactivated_reason = NULL, consecutive_failures = 0, unreachable_since = NULL
       WHERE device_type = ? AND device_id = ?`,
      [deviceType, deviceId],
    )

    const label = getDeviceLabel(deviceType, deviceId)
    logToDb(`Device reactivated: ${label}`)

    return { success: true }
  },

  isDeviceActive(deviceType: DeviceType, deviceId: string): boolean {
    if (deviceType === 'hub') {
      const row = getOne<{ active: number }>('SELECT active FROM hub_devices WHERE id = ?', [deviceId])
      return row?.active !== 0
    }
    if (deviceType === 'kasa') {
      const row = getOne<{ active: number }>('SELECT active FROM kasa_devices WHERE id = ?', [deviceId])
      return row?.active !== 0
    }
    if (deviceType === 'lifx') {
      const row = getOne<{ active: number }>(
        'SELECT active FROM light_rooms WHERE light_id = ? LIMIT 1',
        [deviceId],
      )
      return row?.active !== 0
    }
    return true
  },

  getDeactivatedDevices(): DeactivatedDevice[] {
    const hubRows = getAll<{
      device_id: string
      device_label: string
      room_name: string | null
      deactivated_at: string
      deactivated_reason: string
      last_failure_reason: string | null
    }>(
      `SELECT
         hd.id AS device_id,
         hd.label AS device_label,
         dr.room_name,
         dh.deactivated_at,
         dh.deactivated_reason,
         dh.last_failure_reason
       FROM hub_devices hd
       LEFT JOIN device_health dh ON dh.device_type = 'hub' AND dh.device_id = CAST(hd.id AS TEXT)
       LEFT JOIN device_rooms dr ON dr.device_id = CAST(hd.id AS TEXT)
       WHERE hd.active = 0 AND dh.deactivated_at IS NOT NULL`,
    )

    const kasaRows = getAll<{
      device_id: string
      device_label: string
      room_name: string | null
      deactivated_at: string
      deactivated_reason: string
      last_failure_reason: string | null
    }>(
      `SELECT
         kd.id AS device_id,
         kd.label AS device_label,
         dr.room_name,
         dh.deactivated_at,
         dh.deactivated_reason,
         dh.last_failure_reason
       FROM kasa_devices kd
       LEFT JOIN device_health dh ON dh.device_type = 'kasa' AND dh.device_id = kd.id
       LEFT JOIN device_rooms dr ON dr.device_id = kd.id
       WHERE kd.active = 0 AND dh.deactivated_at IS NOT NULL`,
    )

    const lifxRows = getAll<{
      device_id: string
      device_label: string
      room_name: string | null
      deactivated_at: string
      deactivated_reason: string
      last_failure_reason: string | null
    }>(
      `SELECT
         lr.light_id AS device_id,
         lr.light_label AS device_label,
         lr.room_name,
         dh.deactivated_at,
         dh.deactivated_reason,
         dh.last_failure_reason
       FROM light_rooms lr
       LEFT JOIN device_health dh ON dh.device_type = 'lifx' AND dh.device_id = lr.light_id
       WHERE lr.active = 0 AND dh.deactivated_at IS NOT NULL`,
    )

    const toResult = (deviceType: DeviceType) =>
      (rows: typeof hubRows) =>
        rows.map(r => ({
          deviceType,
          deviceId: String(r.device_id),
          deviceLabel: r.device_label,
          roomName: r.room_name,
          deactivatedAt: r.deactivated_at,
          deactivatedReason: r.deactivated_reason,
          lastFailureReason: r.last_failure_reason,
        }))

    return [
      ...toResult('hub')(hubRows),
      ...toResult('kasa')(kasaRows),
      ...toResult('lifx')(lifxRows),
    ]
  },

  getHealthStatus(deviceType: string, deviceId: string): DeviceHealth | null {
    const row = getOne<DeviceHealthRow>(
      'SELECT * FROM device_health WHERE device_type = ? AND device_id = ?',
      [deviceType, deviceId],
    )
    if (!row) return null

    return {
      deviceType: row.device_type,
      deviceId: row.device_id,
      consecutiveFailures: row.consecutive_failures,
      unreachableSince: row.unreachable_since,
      lastSuccess: row.last_success,
      lastFailure: row.last_failure,
      lastFailureReason: row.last_failure_reason,
      deactivatedAt: row.deactivated_at,
      deactivatedReason: row.deactivated_reason,
    }
  },
}
