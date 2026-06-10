import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SonosQueueItem } from '@/lib/api'
import { queueQueryKey } from '@/lib/queueCache'
import { useToast } from '@/hooks/useToast'
import type { UseUndoableQueueActionResult } from './useUndoableQueueAction'

// ── useQueueClear ─────────────────────────────────────────────────────────────
// Immediate, undoable queue clear: optimistic empty + server clear right away,
// with a 5s undo window that restores via POST /restore (server preserves
// Spotify tracks). Pass in the caller's undo instance so the snackbar is
// shared with other undoable actions in the same view.

export function useQueueClear(speaker: string, undo: UseUndoableQueueActionResult) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return function clearQueue() {
    const queueKey = queueQueryKey(speaker)
    const queue = queryClient.getQueryData<SonosQueueItem[]>(queueKey)
    if (!queue || queue.length === 0) return
    const snapshot = [...queue]
    const snapshotUris = snapshot.map(t => t.uri).filter(Boolean)

    // Optimistic client clear
    queryClient.setQueryData<SonosQueueItem[]>(queueKey, [])

    // Fire the server clear immediately — the user expects the speaker to stop
    // queueing up these tracks right away, not after a 5s grace period.
    api.sonos.clearQueue(speaker).catch(() => {
      toast({ message: 'Could not clear queue', type: 'error' })
      queryClient.setQueryData<SonosQueueItem[]>(queueKey, snapshot)
      // Disarm the undo — pressing it after a failed clear would double-add
      // the queue via /restore.
      undo.cancelAction()
    })

    undo.scheduleAction(
      `Queue cleared · ${snapshot.length} ${snapshot.length === 1 ? 'track' : 'tracks'}`,
      // Commit: nothing to do — the clear already happened.
      () => {},
      // Undo: restore the client state and re-add everything on the server.
      () => {
        queryClient.setQueryData<SonosQueueItem[]>(queueKey, snapshot)
        if (snapshotUris.length > 0) {
          api.sonos
            .restoreQueue(speaker, snapshotUris)
            .then(() => {
              toast({ message: `Restored ${snapshotUris.length} tracks` })
              queryClient.invalidateQueries({ queryKey: queueKey })
            })
            .catch(() => {
              toast({ message: 'Could not restore queue', type: 'error' })
              queryClient.invalidateQueries({ queryKey: queueKey })
            })
        }
      },
    )
  }
}
