import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_KEY = 'sonos:lastBrowsePath'

/**
 * Saves the current location to sessionStorage whenever the user is on a
 * `/sonos/browse*` route. Use alongside `getSonosBrowseEntryPath` so that
 * re-entering Browse (via the nav link or a "Change music" button) resumes
 * at the last-visited browse location within the session.
 */
export function useTrackSonosBrowsePath(): void {
  const location = useLocation()

  useEffect(() => {
    if (!location.pathname.startsWith('/sonos/browse')) return
    try {
      sessionStorage.setItem(STORAGE_KEY, location.pathname + location.search)
    } catch {
      // sessionStorage unavailable — skip silently
    }
  }, [location.pathname, location.search])
}

/**
 * Returns the Browse path to navigate to when entering the Browse section.
 * Prefers the last-visited `/sonos/browse*` path from the session; falls back
 * to `/sonos/browse`. If a speaker is provided, the `speaker` query param is
 * merged into the returned URL.
 */
export function getSonosBrowseEntryPath(speaker?: string): string {
  let savedPath: string | null = null
  try {
    savedPath = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    // sessionStorage unavailable — use default
  }

  const base = savedPath && savedPath.startsWith('/sonos/browse') ? savedPath : '/sonos/browse'
  if (!speaker) return base

  const [pathname, search = ''] = base.split('?')
  const params = new URLSearchParams(search)
  params.set('speaker', speaker)
  return `${pathname}?${params.toString()}`
}
