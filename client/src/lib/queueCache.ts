import type { QueryClient } from '@tanstack/react-query'

// ── Live queue cache helpers ─────────────────────────────────────────────────
// The live queue (useQueueSync / QueueView / InlineQueue) is cached under
// ['sonos', 'queue', speaker]. Always invalidate through this helper — ad-hoc
// keys (e.g. the old 'sonos-queue') match nothing and silently no-op.

export function queueQueryKey(speaker: string | null) {
  return ['sonos', 'queue', speaker]
}

export function invalidateQueue(queryClient: QueryClient, speaker: string | null) {
  queryClient.invalidateQueries({ queryKey: queueQueryKey(speaker) })
}
