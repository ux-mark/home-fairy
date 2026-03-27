import type { Scene } from './api'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Check whether a scene is currently in its seasonal date range.
 * Returns hasSeason=false for scenes without active_from/active_to.
 */
export function isSceneInSeason(scene: Scene): { hasSeason: boolean; inSeason: boolean; label: string } {
  if (!scene.active_from || !scene.active_to) {
    return { hasSeason: false, inSeason: true, label: '' }
  }
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const today = month * 100 + day

  const [fromM, fromD] = scene.active_from.split('-').map(Number)
  const [toM, toD] = scene.active_to.split('-').map(Number)
  const from = fromM * 100 + fromD
  const to = toM * 100 + toD

  const inRange = from <= to
    ? (today >= from && today <= to)
    : (today >= from || today <= to)

  const fromLabel = `${MONTH_NAMES[fromM - 1]} ${fromD}`
  const toLabel = `${MONTH_NAMES[toM - 1]} ${toD}`

  if (inRange) {
    return { hasSeason: true, inSeason: true, label: `In season until ${toLabel}` }
  }
  return { hasSeason: true, inSeason: false, label: `Out of season until ${fromLabel}` }
}

/**
 * Look up the default scene name for a room+mode from the default scenes map.
 */
export function getDefaultScene(
  defaultScenes: Record<string, Record<string, string>> | undefined,
  roomName: string,
  mode: string,
): string | null {
  return defaultScenes?.[roomName]?.[mode] ?? null
}

/**
 * Check if a scene is stale: not activated in `days` days and not a seasonal scene.
 */
export function isStaleScene(scene: Scene, days = 90): boolean {
  // Seasonal scenes are not considered stale — they may just be waiting for their season
  if (scene.active_from && scene.active_to) return false

  if (!scene.last_activated_at) return true

  const lastActivated = new Date(scene.last_activated_at)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return lastActivated < cutoff
}

/**
 * Get all scenes for a specific room, optionally filtered by mode.
 */
export function getScenesForRoom(scenes: Scene[], roomName: string, mode?: string): Scene[] {
  return scenes.filter(s => {
    const rooms = Array.isArray(s.rooms) ? s.rooms : []
    if (!rooms.some(r => r?.name === roomName)) return false
    if (mode) {
      const modes = Array.isArray(s.modes) ? s.modes : []
      if (!modes.some(m => (m ?? '').toLowerCase() === mode.toLowerCase())) return false
    }
    return true
  })
}

/**
 * Get all unique modes that have scenes in a specific room.
 * If allModes is provided, results are returned in that order (respecting display_order
 * from the backend). Otherwise falls back to alphabetical sort.
 */
export function getModesForRoom(scenes: Scene[], roomName: string, allModes?: string[]): string[] {
  const modeSet = new Set<string>()
  for (const scene of scenes) {
    const rooms = Array.isArray(scene.rooms) ? scene.rooms : []
    if (!rooms.some(r => r?.name === roomName)) continue
    const modes = Array.isArray(scene.modes) ? scene.modes : []
    for (const m of modes) {
      if (m) modeSet.add(m)
    }
  }
  if (allModes) {
    return allModes.filter(m => modeSet.has(m))
  }
  return Array.from(modeSet).sort()
}

/**
 * Format a relative time string from an ISO date.
 */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
  return `${Math.floor(diffDay / 30)}mo ago`
}
