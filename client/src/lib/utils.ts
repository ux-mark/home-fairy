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

export function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
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

export const MODES = ['Morning', 'Day', 'Evening', 'Night', 'Away', 'Movie', 'Party'] as const
export type Mode = typeof MODES[number]
