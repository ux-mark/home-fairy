import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StackEntry {
  url: string
  key: string
}

const STORAGE_KEY = 'sonos:navStack'

// ── Helpers ───────────────────────────────────────────────────────────────────

function readStack(): StackEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as unknown[]).filter(
      (e): e is StackEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>).url === 'string' &&
        typeof (e as Record<string, unknown>).key === 'string',
    )
  } catch {
    return []
  }
}

function writeStack(stack: StackEntry[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack))
  } catch {
    // sessionStorage quota or unavailable — ignore
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface NavStackAPI {
  /**
   * Returns how many `navigate(-N)` steps are required to reach the most
   * recent occurrence of `targetUrl` from the top of the stack.
   * Returns null if the URL is not in the stack (or is the current page).
   */
  findDepth: (targetUrl: string) => number | null
}

/**
 * Maintains an in-memory + sessionStorage mirror of the browser history stack
 * for in-app navigations. Lets callers compute `navigate(-N)` depths to reach
 * a prior URL rather than blindly using `navigate(url, { replace: true })`.
 *
 * Call once in AppLayout. The returned API is exposed via NavStackContext.
 */
export function useNavStack(): NavStackAPI {
  const location = useLocation()
  const navigationType = useNavigationType()
  const stackRef = useRef<StackEntry[]>(readStack())

  useEffect(() => {
    const entry: StackEntry = {
      url: location.pathname + location.search,
      key: location.key,
    }

    if (navigationType === 'PUSH') {
      stackRef.current = [...stackRef.current, entry]
    } else if (navigationType === 'REPLACE') {
      const stack = stackRef.current
      if (stack.length === 0) {
        stackRef.current = [entry]
      } else {
        stackRef.current = [...stack.slice(0, -1), entry]
      }
    } else if (navigationType === 'POP') {
      // On POP, find the matching key in the existing stack and truncate there.
      const stack = stackRef.current
      const idx = stack.findLastIndex(e => e.key === entry.key)
      if (idx !== -1) {
        stackRef.current = stack.slice(0, idx + 1)
      } else {
        // Key not found — history was rebuilt or a Forward happened beyond
        // our recorded stack. Append conservatively so we don't lose the entry.
        stackRef.current = [...stack, entry]
      }
    }

    writeStack(stackRef.current)
  }, [location.key, location.pathname, location.search, navigationType])

  const findDepth = (targetUrl: string): number | null => {
    const stack = stackRef.current
    // We search from second-to-last backwards (top of stack is current page,
    // depth-0; one below is depth-1, i.e. navigate(-1)).
    for (let i = stack.length - 2; i >= 0; i--) {
      if (stack[i].url === targetUrl) {
        return stack.length - 1 - i
      }
    }
    return null
  }

  return { findDepth }
}
