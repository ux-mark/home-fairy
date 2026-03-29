import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Saves scroll position on navigation and restores it on back/forward.
 * New navigations (PUSH) scroll to top. Back/forward (POP) restore the saved position.
 *
 * Uses multiple deferred attempts to handle pages where restored state (e.g.
 * accordion expansions) changes the scrollable height after the initial render.
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
        // Attempt scroll restoration multiple times to handle content that
        // renders progressively (e.g. accordions expanding, data loading).
        // The first rAF handles synchronous renders; the later timeouts
        // catch CSS transitions and async data that increases page height.
        const attempts = [0, 50, 150, 350]
        const timers: number[] = []

        const tryScroll = () => {
          if (document.documentElement.scrollHeight >= saved + window.innerHeight * 0.5) {
            window.scrollTo(0, saved)
          }
        }

        // First attempt: next frame (covers synchronous state restoration)
        requestAnimationFrame(tryScroll)

        // Follow-up attempts cover accordion transitions (300ms) and async data
        for (const delay of attempts) {
          timers.push(window.setTimeout(() => window.scrollTo(0, saved), delay))
        }

        return () => {
          for (const t of timers) clearTimeout(t)
        }
      }
    } else {
      // New navigation (PUSH/REPLACE) — scroll to top
      window.scrollTo(0, 0)
    }
  }, [location.key, navigationType])
}
