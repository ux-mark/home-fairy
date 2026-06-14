import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Saves scroll position on navigation and restores it on back/forward.
 * New navigations (PUSH/REPLACE) scroll to top. Back/forward (POP) restore
 * the saved position.
 *
 * Implementation notes:
 *   - We key scroll by URL (`location.pathname + location.search`), not by
 *     `location.key`. React Router's `replace` creates a new key even for
 *     the same URL, and our Sonos flow deliberately uses `replace` to hide
 *     intermediate pages from Back. Keying by URL means the saved scroll
 *     position survives those replace chains.
 *   - We record scroll via a passive `scroll` listener. Reading
 *     `window.scrollY` only at navigation time is unreliable — when React
 *     commits a shorter route, the browser clamps `scrollY` before our
 *     effect runs. The scroll listener captures the value while the user
 *     is actually on the page.
 *   - We also mirror to `sessionStorage` so scroll survives page reloads
 *     within a session.
 *
 * Call this once in AppLayout.
 */

const STORAGE_PREFIX = 'scrollY:'

function storageKey(url: string): string {
  return STORAGE_PREFIX + url
}

function readStoredScroll(url: string): number | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey(url))
    if (raw == null) return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  } catch {
    return undefined
  }
}

function writeStoredScroll(url: string, y: number): void {
  try {
    sessionStorage.setItem(storageKey(url), String(y))
  } catch {
    // sessionStorage quota or unavailable — ignore
  }
}

export function useScrollRestoration() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const currentUrl = useRef<string>(location.pathname + location.search)

  // Update currentUrl during render so scroll events fired by the browser
  // after DOM commit (e.g. clamp when a new shorter route renders) write
  // to the NEW url, not to the outgoing page.
  currentUrl.current = location.pathname + location.search

  useEffect(() => {
    const handler = () => {
      writeStoredScroll(currentUrl.current, window.scrollY)
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    if (navigationType === 'POP') {
      const url = location.pathname + location.search
      const saved = readStoredScroll(url)
      if (saved !== undefined && saved > 0) {
        // Retry scrolling over a long window so slow async data loads can
        // finish laying out before we give up. Also observe <html> size
        // changes so we re-scroll whenever more content arrives.
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

        let resizeObserver: ResizeObserver | null = null
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => tryScroll())
          resizeObserver.observe(document.documentElement)
        }

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
  }, [location.key, location.pathname, location.search, navigationType])
}
