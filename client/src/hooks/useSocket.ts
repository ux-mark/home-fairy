import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    const url = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
    socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    })
  }
  return socket
}

/**
 * Subscribe to Hubitat and system events and invalidate relevant
 * TanStack Query caches for real-time dashboard updates.
 */
export function useDashboardSocket(): void {
  const queryClient = useQueryClient()
  const connectedRef = useRef(false)

  useEffect(() => {
    const s = getSocket()

    if (!connectedRef.current) {
      connectedRef.current = true
    }

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
    }

    function handleSceneChange() {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    }

    s.on('hubitat:event', handleHubitatEvent)
    s.on('mode:change', handleModeChange)
    s.on('mode_changed', handleModeChange)  // emitted by sun-mode-scheduler
    s.on('scene:change', handleSceneChange)

    return () => {
      s.off('hubitat:event', handleHubitatEvent)
      s.off('mode:change', handleModeChange)
      s.off('mode_changed', handleModeChange)
      s.off('scene:change', handleSceneChange)
    }
  }, [queryClient])
}
