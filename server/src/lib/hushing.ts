import { getOne } from '../db/index.js'

/**
 * Returns true if Hushing Home is currently active.
 * Reads from current_state so it always reflects the live value.
 */
export function isHushingActive(): boolean {
  const row = getOne<{ value: string }>(
    "SELECT value FROM current_state WHERE key = 'hushing_active'",
  )
  return row?.value === 'true'
}
