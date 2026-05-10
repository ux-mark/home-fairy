// Heavy implementation file for the socket.io connection. Kept separate so
// `import('@/lib/socket-impl')` is a dynamic import — the socket.io-client
// transport (~43 KB minified) loads in its own chunk after first paint
// rather than blocking cold-load. Anything that statically imports from
// here drags socket.io into its caller's chunk graph, so this module is
// only loaded via dynamic import().

import { io, type Socket } from 'socket.io-client'
import type { QueryClient } from '@tanstack/react-query'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const url = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
    socket = io(url, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    })
  }
  return socket
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (socket) {
      socket.disconnect()
      socket = null
    }
  })
}

/**
 * Wires the global Socket.io connection to the React-Query cache. Returns
 * a cleanup function that removes the listeners. Safe to call multiple
 * times; each call is independent.
 */
export function attachDashboardListeners(queryClient: QueryClient): () => void {
  const s = getSocket()

  function handleHubitatEvent(event: { name?: string }) {
    const eventName = event.name ?? ''

    // Invalidate dashboard summary on sensor/power/battery changes
    if (['power', 'energy', 'battery', 'temperature', 'illuminance', 'lux'].includes(eventName)) {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
    }

    // Invalidate device queries on any hubitat event
    if (['switch', 'power', 'energy', 'battery'].includes(eventName)) {
      queryClient.invalidateQueries({ queryKey: ['hubitat'] })
    }
  }

  function handleModeChange() {
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
    queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
    queryClient.invalidateQueries({ queryKey: ['system', 'night-status'] })
    queryClient.invalidateQueries({ queryKey: ['rooms'] })
    queryClient.invalidateQueries({ queryKey: ['scenes'] })
  }

  function handleSceneChange() {
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
    queryClient.invalidateQueries({ queryKey: ['rooms'] })
    queryClient.invalidateQueries({ queryKey: ['scenes'] })
    queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
  }

  // Kasa state changes (from 10s poller). Don't invalidate ['hubitat'] —
  // a Kasa switch flipping has no bearing on Hubitat state, and the
  // server-side poller fires this event every 10 s, so the spurious
  // invalidation was a quiet refetch storm.
  function handleKasaState() {
    queryClient.invalidateQueries({ queryKey: ['kasa'] })
  }

  // Kasa power readings update
  function handleKasaPower() {
    queryClient.invalidateQueries({ queryKey: ['kasa'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
  }

  // device:command is emitted the moment a command is acked at the device
  // route — i.e. before the underlying device state has actually propagated.
  // Invalidating ['kasa']/['hubitat'] here would refetch BEFORE the sidecar
  // poll or hub webhook has delivered the new state, stomping the
  // optimistic update on the originating tab.
  //
  // Cross-tab sync still works because the state-change events that fire
  // when state HAS propagated — `kasa:state` (poller) and `hubitat:event`
  // with eventName='switch' (webhook) — already invalidate the right keys.

  function handleNotificationNew() {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  function handleNotificationUpdate() {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  s.on('hubitat:event', handleHubitatEvent)
  s.on('mode:change', handleModeChange)
  s.on('mode_changed', handleModeChange)  // emitted by sun-mode-scheduler
  s.on('scene:change', handleSceneChange)
  s.on('kasa:state', handleKasaState)
  s.on('kasa:power', handleKasaPower)
  s.on('notification:new', handleNotificationNew)
  s.on('notification:update', handleNotificationUpdate)

  return () => {
    s.off('hubitat:event', handleHubitatEvent)
    s.off('mode:change', handleModeChange)
    s.off('mode_changed', handleModeChange)
    s.off('scene:change', handleSceneChange)
    s.off('kasa:state', handleKasaState)
    s.off('kasa:power', handleKasaPower)
    s.off('notification:new', handleNotificationNew)
    s.off('notification:update', handleNotificationUpdate)
  }
}

/**
 * Attach a typed listener to the socket for a specific event. Returns a
 * cleanup function. This is for one-off subscribers like
 * PlaybackStateContext that need to react to a small set of events.
 */
export function attachListener<T = unknown>(
  event: string,
  handler: (data: T) => void,
): () => void {
  const s = getSocket()
  s.on(event, handler)
  return () => {
    s.off(event, handler)
  }
}
