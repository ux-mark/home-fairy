import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SonosQueueItem } from '@/lib/api'
import { getSocketAsync } from '@/hooks/useSocket'

// ── useQueueSync ──────────────────────────────────────────────────────────────
// Syncs the Sonos queue for a given speaker via TanStack Query + WebSocket.
// Returns the same shape as a useQuery result: { queue, isLoading, error }.

interface UseQueueSyncOptions {
  speaker: string
  enabled: boolean
}

interface UseQueueSyncResult {
  queue: SonosQueueItem[]
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

export function useQueueSync({ speaker, enabled }: UseQueueSyncOptions): UseQueueSyncResult {
  const queryClient = useQueryClient()
  const queueKey = ['sonos', 'queue', speaker]

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queueKey,
    queryFn: () => api.sonos.getQueue(speaker),
    refetchInterval: 10_000,
    staleTime: 9_000,
    enabled: enabled && !!speaker,
    retry: 1,
  })

  useEffect(() => {
    if (!enabled || !speaker) return
    let cancelled = false
    let cleanup: (() => void) | undefined

    function handleQueueUpdate(event: { speaker: string; action: string; queue: SonosQueueItem[] }) {
      if (event.speaker !== speaker) return
      queryClient.setQueryData<SonosQueueItem[]>(queueKey, event.queue)
    }

    getSocketAsync().then(socket => {
      if (cancelled) return
      socket.on('sonos:queue-update', handleQueueUpdate)
      cleanup = () => socket.off('sonos:queue-update', handleQueueUpdate)
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [enabled, speaker, queryClient]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    queue: data ?? [],
    isLoading,
    isError,
    error,
    refetch,
  }
}
