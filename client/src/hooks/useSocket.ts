import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// This module deliberately does NOT statically import socket.io-client. The
// transport is ~43 KB minified and used to land in the entry chunk because
// AppLayout calls useDashboardSocket synchronously. Now everything reaches
// `@/lib/socket-impl` via dynamic import(), so the socket bundle loads in
// its own chunk only after the first paint of the layout.
//
// Public API is unchanged for callers: `useDashboardSocket()` still attaches
// the React-Query invalidation listeners; `getSocketAsync()` returns a
// promise that resolves to the connected socket for one-off subscribers.

let implPromise: Promise<typeof import('@/lib/socket-impl')> | null = null
function loadImpl() {
  // Cache the promise so concurrent callers wait on the same fetch.
  if (!implPromise) {
    implPromise = import('@/lib/socket-impl')
  }
  return implPromise
}

/**
 * Subscribe to Hubitat and system events and invalidate relevant
 * TanStack Query caches for real-time dashboard updates. Idempotent;
 * mount in the layout component once.
 */
export function useDashboardSocket(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    loadImpl().then(({ attachDashboardListeners }) => {
      if (cancelled) return
      cleanup = attachDashboardListeners(queryClient)
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [queryClient])
}

/**
 * Resolve to the live Socket.io connection, lazily loading the transport
 * if needed. Use for one-off subscriptions (e.g. PlaybackStateContext);
 * remember to detach in the cleanup of whatever effect you mount it in.
 */
export async function getSocketAsync() {
  const impl = await loadImpl()
  return impl.getSocket()
}

/**
 * Attach a one-off listener to the global socket. Returns a Promise that
 * resolves to a cleanup function. Convenient when you want both the
 * deferred-load behaviour and the listener boilerplate handled.
 */
export async function attachSocketListener<T = unknown>(
  event: string,
  handler: (data: T) => void,
): Promise<() => void> {
  const impl = await loadImpl()
  return impl.attachListener(event, handler)
}
