/**
 * Schedule-gating helpers for Sonos auto-play rules.
 *
 * Rules can be scoped to specific weekdays and a localtime window on top of
 * mode + trigger-condition filters. These helpers compute "now" in the
 * configured IANA timezone (independent of process.env.TZ) and answer:
 *   - what is today's ISO day-of-week (Mon=1 … Sun=7)?
 *   - what is the current HH:MM in that zone?
 *   - is HH:MM inside a [start, end) window (with wrap-around past midnight)?
 */

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Computed "now" in a given IANA timezone. */
export interface NowInZone {
  /** ISO 8601 day-of-week: Mon=1 … Sun=7. */
  isoDay: number
  /** Current local time, zero-padded HH:MM (24h). */
  hhmm: string
}

/**
 * Return the current ISO day-of-week and HH:MM for the given IANA timezone.
 * Uses Intl.DateTimeFormat so we don't depend on process.env.TZ.
 *
 * Accepts an optional `now` Date for testability (defaults to new Date()).
 */
export function nowIn(timezone: string, now: Date = new Date()): NowInZone {
  // weekday: 'short' returns Mon/Tue/Wed/Thu/Fri/Sat/Sun in English locales.
  // Pin to 'en-GB' to keep the mapping deterministic across runtimes.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const partMap: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') partMap[p.type] = p.value
  }
  const weekday = partMap.weekday ?? 'Mon'
  let hour = partMap.hour ?? '00'
  const minute = partMap.minute ?? '00'
  // Intl can produce "24" for midnight in some runtimes — normalise to "00".
  if (hour === '24') hour = '00'
  const isoDay = WEEKDAY_TO_ISO[weekday] ?? 1
  return { isoDay, hhmm: `${hour}:${minute}` }
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

/**
 * Return true when `now` falls inside the [start, end) HH:MM window.
 * - When end > start: standard same-day window. now must satisfy start <= now < end.
 * - When end <= start: wrap-around past midnight. now must satisfy now >= start OR now < end.
 * - When now === end exactly: out (inclusive-start, exclusive-end).
 *
 * All inputs must already be validated HH:MM (24h) strings.
 */
export function withinWindow(now: string, start: string, end: string): boolean {
  if (!HHMM_RE.test(now) || !HHMM_RE.test(start) || !HHMM_RE.test(end)) {
    return false
  }
  if (end > start) {
    return now >= start && now < end
  }
  // wrap-around (end <= start)
  return now >= start || now < end
}

/** Strict HH:MM (24h) validator — exposed for the route layer. */
export function isValidHHMM(s: string): boolean {
  return HHMM_RE.test(s)
}
