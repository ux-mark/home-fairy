import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Returns a handler that performs a proper browser "back" when the user
 * navigated here from within the app, so `useScrollRestoration` can restore
 * the previous page's scroll position (scroll restore fires on POP only).
 *
 * If the user landed on this page directly (e.g. loaded the URL, opened from
 * an external link, or arrived via a full page reload), `location.key` is
 * `'default'` and there is no in-app history to pop — we fall back to a
 * `replace` to the provided URL so Back still stays inside the app.
 */
export function useSmartBack(fallbackUrl: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    if (location.key !== 'default') {
      navigate(-1)
    } else {
      navigate(fallbackUrl, { replace: true })
    }
  }, [navigate, location.key, fallbackUrl])
}
