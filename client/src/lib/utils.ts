import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function hsbToHex(hue: number, saturation: number, brightness: number): string {
  const h = hue / 360
  const s = saturation
  const v = brightness
  let r: number, g: number, b: number
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    default: r = v; g = p; b = q; break
  }
  return '#' + [r, g, b].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
}

export function kelvinToHex(kelvin: number): string {
  const temp = kelvin / 100
  let r: number, g: number, b: number
  if (temp <= 66) {
    r = 255
    g = Math.min(255, Math.max(0, 99.4708025861 * Math.log(temp) - 161.1195681661))
  } else {
    r = Math.min(255, Math.max(0, 329.698727446 * Math.pow(temp - 60, -0.1332047592)))
    g = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)))
  }
  if (temp >= 66) b = 255
  else if (temp <= 19) b = 0
  else b = Math.min(255, Math.max(0, 138.5177312231 * Math.log(temp - 10) - 305.0447927307))
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')
}

/**
 * Parse a date string from the server, treating SQLite dates as UTC.
 * SQLite datetime('now') produces "2026-03-21 13:27:05" without timezone.
 * JavaScript new Date() treats this as LOCAL time, which is wrong.
 * This function appends 'Z' (UTC) if no timezone indicator is present.
 */
export function parseServerDate(dateStr: string): Date {
  // If it already has a timezone (Z, +, -), parse as-is
  if (/[Z+\-]\d{0,2}:?\d{0,2}$/.test(dateStr) || dateStr.endsWith('Z')) {
    return new Date(dateStr)
  }
  // SQLite format: "2026-03-21 13:27:05" → treat as UTC by appending Z
  // Also handle "2026-03-21T13:27:05" without Z
  return new Date(dateStr.replace(' ', 'T') + 'Z')
}

/**
 * Format a server date to local time string.
 * Respects the user's locale for AM/PM vs 24h automatically
 * (browser uses the system's locale settings).
 */
export function formatDateTime(dateStr: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return ''
  const d = parseServerDate(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  })
}

/**
 * Format just the time portion in local timezone.
 */
export function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = parseServerDate(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const d = parseServerDate(dateStr)
  const diff = Date.now() - d.getTime()
  if (isNaN(diff)) return 'Unknown'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function getLightColorHex(light: { color: { hue: number; saturation: number; kelvin: number }; brightness: number }): string {
  if (light.color.saturation > 0.1) {
    return hsbToHex(light.color.hue, light.color.saturation, light.brightness)
  }
  return kelvinToHex(light.color.kelvin)
}

export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>
  const debounced = (...args: any[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  debounced.cancel = () => clearTimeout(timer)
  return debounced as T & { cancel: () => void }
}

// Default modes — overridden by API data from /api/system/current (reads from modes table)
export const DEFAULT_MODES = [
  'Early Morning',
  'Morning',
  'Afternoon',
  'Evening',
  'Late Evening',
  'Night',
  'Sleep Time',
] as const
