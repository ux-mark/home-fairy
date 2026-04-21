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
        // Restoration strategy:
        //   1. Retry `window.scrollTo(0, saved)` at escalating delays so
        //      short progressive renders (accordions, lazy images) settle.
        //   2. Observe `<html>` for size changes so slow async data loads
        //      (e.g. a NAS library fetch) still land the user back where
        //      they were, even if it takes several seconds.
        //   3. Give up after 5s so we don't fight a user scroll forever.
        const attempts = [0, 50, 150, 350, 600, 1000, 1500, 2200, 3000, 4000]
        const timers: number[] = []
        let cancelled = false

        const tryScroll = () => {
          if (cancelled) return
          if (document.documentElement.scrollHeight >= saved + window.innerHeight * 0.5) {
            window.scrollTo(0, saved)
          }
        }

        requestAnimationFrame(tryScroll)
        for (const delay of attempts) {
          timers.push(window.setTimeout(tryScroll, delay))
        }

        // Keep scrolling whenever the page grows — e.g., when the NAS
        // library or a long list finishes loading after our timers have
        // fired.
        let resizeObserver: ResizeObserver | null = null
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => tryScroll())
          resizeObserver.observe(document.documentElement)
        }

        // Hard stop so we don't hijack the page if the user has started
        // interacting with it.
        timers.push(
          window.setTimeout(() => {
            cancelled = true
            resizeObserver?.disconnect()
          }, 5000),
        )

        return () => {
          cancelled = true
          for (const t of timers) clearTimeout(t)
          resizeObserver?.disconnect()
        }
      }
    } else {
      // New navigation (PUSH/REPLACE) — scroll to top
      window.scrollTo(0, 0)
    }
  }, [location.key, navigationType])
}
