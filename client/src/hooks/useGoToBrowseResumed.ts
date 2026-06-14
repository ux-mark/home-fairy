import { useCallback, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavStackContext } from '@/contexts/NavStackContext'
import { getSonosBrowseEntryPath } from '@/hooks/useSonosBrowseMemory'

/**
 * Returns a navigate function that takes the user to the last-visited Browse
 * path while preserving the full history chain behind it.
 *
 * Strategy:
 *   1. Compute the target URL via getSonosBrowseEntryPath (last visited browse
 *      path in this session, or /sonos/browse as fallback).
 *   2. If that URL exists in the in-app nav stack, walk back to it via
 *      navigate(-N) so the real history entries behind it remain intact —
 *      the user's full Back chain is preserved.
 *   3. If the URL is NOT in the stack (fresh session, hard reload, or an entry
 *      that was replaced out of history) we PUSH a new entry. We never use
 *      replace: true here because REPLACE overwrites the current history entry,
 *      creating a duplicate-entry trap where the first Back press appears to do
 *      nothing.
 */
export function useGoToBrowseResumed(): (speaker?: string) => void {
  const navigate = useNavigate()
  const { findDepth } = useContext(NavStackContext)

  return useCallback(
    (speaker?: string) => {
      const target = getSonosBrowseEntryPath(speaker)
      const depth = findDepth(target)
      if (depth != null && depth > 0) {
        // Walk back through real history — all entries behind the target are
        // preserved and will be reachable via subsequent Back presses.
        navigate(-depth)
        return
      }
      // Target not in back-stack — push a new entry. Never replace.
      navigate(target)
    },
    [navigate, findDepth],
  )
}
