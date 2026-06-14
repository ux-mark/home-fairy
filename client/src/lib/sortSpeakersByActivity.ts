import type { SonosNowPlayingEntry } from './api'

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sonos.lastActiveAt'

function loadLastActiveAt(): Map<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as Record<string, number>
    return new Map(Object.entries(parsed))
  } catch {
    return new Map()
  }
}

function saveLastActiveAt(map: Map<string, number>): void {
  try {
    const obj: Record<string, number> = {}
    map.forEach((v, k) => { obj[k] = v })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // Silently ignore storage errors (e.g. private browsing quota)
  }
}

/** Module-level map of speakerName → timestamp of last observed PLAYING state */
export const lastActiveAt: Map<string, number> = loadLastActiveAt()

// ── Activity tracking ─────────────────────────────────────────────────────────

/**
 * Iterate nowPlaying entries. For any entry whose playbackState is PLAYING,
 * stamp Date.now() for that speaker (and, if it's a coordinator, also stamp
 * all group members so they bubble up together).
 */
export function updateSpeakerActivity(entries: SonosNowPlayingEntry[]): void {
  const now = Date.now()
  let changed = false

  for (const entry of entries) {
    if (entry.state?.playbackState === 'PLAYING') {
      lastActiveAt.set(entry.speakerName, now)
      changed = true

      // Also stamp coordinator if this speaker is a group member
      if (entry.group?.coordinator && entry.group.coordinator !== entry.speakerName) {
        lastActiveAt.set(entry.group.coordinator, now)
      }

      // Stamp all group members if this speaker is the coordinator
      if (entry.group?.isCoordinator && entry.group.members.length > 1) {
        for (const memberName of entry.group.members) {
          lastActiveAt.set(memberName, now)
        }
      }
    }
  }

  if (changed) saveLastActiveAt(lastActiveAt)
}

// ── Sort ──────────────────────────────────────────────────────────────────────

/**
 * Return a new array of entries sorted by activity:
 *  1. PLAYING (ties: lastActiveAt desc)
 *  2. PAUSED_PLAYBACK (ties: lastActiveAt desc)
 *  3. Everything else by lastActiveAt desc
 *  4. Speakers with no recorded activity — original order preserved
 *
 * Stable: equal-rank entries maintain their original relative order.
 */
export function sortSpeakersByActivity(entries: SonosNowPlayingEntry[]): SonosNowPlayingEntry[] {
  return entries
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .sort((a, b) => {
      const stateA = a.entry.state?.playbackState
      const stateB = b.entry.state?.playbackState
      const tsA = lastActiveAt.get(a.entry.speakerName) ?? -1
      const tsB = lastActiveAt.get(b.entry.speakerName) ?? -1

      const rankA = stateA === 'PLAYING' ? 0 : stateA === 'PAUSED_PLAYBACK' ? 1 : 2
      const rankB = stateB === 'PLAYING' ? 0 : stateB === 'PAUSED_PLAYBACK' ? 1 : 2

      if (rankA !== rankB) return rankA - rankB

      // Same rank bucket — sort by lastActiveAt descending
      if (tsA !== tsB) {
        // Speakers with no recorded activity go to the bottom of their bucket
        if (tsA === -1) return 1
        if (tsB === -1) return -1
        return tsB - tsA
      }

      // Fully equal — preserve original order for stability
      return a.originalIndex - b.originalIndex
    })
    .map(({ entry }) => entry)
}
