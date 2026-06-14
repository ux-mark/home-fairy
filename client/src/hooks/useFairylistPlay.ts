import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { invalidateQueue } from '@/lib/queueCache'
import { useToast } from '@/hooks/useToast'
import type { UseUndoableQueueActionResult } from './useUndoableQueueAction'

// ── useFairylistPlay ──────────────────────────────────────────────────────────
// Plays a whole Fairylist (server clears the queue, queues every track, plays)
// with the same undo treatment as queue clear: the previous queue is
// snapshotted before play, and Undo clears the Fairylist tracks then restores
// the snapshot. If the previous queue was empty — or the snapshot fetch fails —
// there is nothing to restore, so we degrade to a plain toast.

/** ` — 2 tracks skipped` suffix for toasts, empty string when nothing was skipped. */
export function skippedSuffix(skipped: { title: string; reason: string }[] | undefined): string {
  const count = skipped?.length ?? 0
  if (count === 0) return ''
  return ` — ${count} ${count === 1 ? 'track' : 'tracks'} skipped`
}

export function useFairylistPlay(
  effectiveSpeaker: string | null,
  undo: UseUndoableQueueActionResult,
) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id }: { id: number; name: string }) => {
      const speaker = effectiveSpeaker!
      // Snapshot the queue we're about to replace. Never block play on this —
      // a failed snapshot just means no undo affordance.
      const prevUris = await api.sonos
        .getQueue(speaker)
        .then(queue => queue.map(t => t.uri).filter(Boolean))
        .catch(() => null)
      const result = await api.fairylists.play(id, speaker)
      return { prevUris, skipped: result?.skipped ?? [] }
    },
    onSuccess: ({ prevUris, skipped }, { name }) => {
      const speaker = effectiveSpeaker!
      invalidateQueue(queryClient, speaker)

      const label =
        skipped.length > 0
          ? `Playing "${name}"${skippedSuffix(skipped)} (replaced queue)`
          : `Playing "${name}" — replaced queue`

      if (!prevUris || prevUris.length === 0) {
        toast({ message: label })
        return
      }

      undo.scheduleAction(
        label,
        // Commit: nothing to do — the replace already happened.
        () => {},
        // Undo: clear the Fairylist tracks first (a replace-undo, unlike a
        // clear-undo, has new tracks on the queue), then restore the snapshot.
        () => {
          api.sonos
            .clearQueue(speaker)
            .then(() => api.sonos.restoreQueue(speaker, prevUris))
            .then(() => {
              toast({ message: `Restored ${prevUris.length} ${prevUris.length === 1 ? 'track' : 'tracks'}` })
              invalidateQueue(queryClient, speaker)
            })
            .catch(() => {
              toast({ message: 'Could not restore the queue', type: 'error' })
              invalidateQueue(queryClient, speaker)
            })
        },
      )
    },
    onError: () => toast({ message: 'Could not play Fairylist', type: 'error' }),
  })
}
