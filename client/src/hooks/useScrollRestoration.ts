import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Saves scroll position on navigation and restores it on back/forward.
 * New navigations (PUSH) scroll to top. Back/forward (POP) restore the saved position.
 *
 * Call this once in AppLayout.
 */
export function useScrollRestoration() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const scrollPositions = useRef<Map<string, number>>(new Map())
  const prevKey = useRef<string | null>(null)

  useEffect(() => {
    // Save scroll position of the page we're leaving
    if (prevKey.current) {
      scrollPositions.current.set(prevKey.current, window.scrollY)
    }
    prevKey.current = location.key

    if (navigationType === 'POP') {
      // Back/forward — restore saved position
      const saved = scrollPositions.current.get(location.key)
      if (saved !== undefined) {
        // Defer to allow the page to render before scrolling
        requestAnimationFrame(() => {
          window.scrollTo(0, saved)
        })
      }
    } else {
      // New navigation (PUSH/REPLACE) — scroll to top
      window.scrollTo(0, 0)
    }
  }, [location.key, navigationType])
}
