import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io, Socket } from 'socket.io-client'

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

    // Kasa state changes (from 10s poller)
    function handleKasaState() {
      queryClient.invalidateQueries({ queryKey: ['kasa'] })
      queryClient.invalidateQueries({ queryKey: ['hubitat'] })
    }

    // Kasa power readings update
    function handleKasaPower() {
      queryClient.invalidateQueries({ queryKey: ['kasa'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
    }

    // Device commands from another tab or automation
    function handleDeviceCommand() {
      queryClient.invalidateQueries({ queryKey: ['hubitat'] })
      queryClient.invalidateQueries({ queryKey: ['kasa'] })
    }

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
    s.on('device:command', handleDeviceCommand)
    s.on('notification:new', handleNotificationNew)
    s.on('notification:update', handleNotificationUpdate)

    return () => {
      s.off('hubitat:event', handleHubitatEvent)
      s.off('mode:change', handleModeChange)
      s.off('mode_changed', handleModeChange)
      s.off('scene:change', handleSceneChange)
      s.off('kasa:state', handleKasaState)
      s.off('kasa:power', handleKasaPower)
      s.off('device:command', handleDeviceCommand)
      s.off('notification:new', handleNotificationNew)
      s.off('notification:update', handleNotificationUpdate)
    }
  }, [queryClient])
}
