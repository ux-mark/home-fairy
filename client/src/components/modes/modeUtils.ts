// ── Shared utilities for mode components ─────────────────────────────────────

/**
 * Human-readable labels for SunCalc sun-phase event keys.
 * Exported for use in ModesList and ModeDetail.
 */
export const SUN_EVENT_LABELS: Record<string, string> = {
  nightEnd: 'night end',
  dawn: 'dawn',
  sunrise: 'sunrise',
  goldenHourEnd: 'morning golden hour',
  solarNoon: 'solar noon',
  goldenHour: 'golden hour',
  sunset: 'sunset',
  dusk: 'dusk',
  nauticalDawn: 'nautical dawn',
  nauticalDusk: 'nautical dusk',
  night: 'night',
}
