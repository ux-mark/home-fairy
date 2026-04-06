import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Shuffle, Repeat, Trash2, Loader2 } from 'lucide-react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'

interface QueueHeaderProps {
  speaker: string
  currentPlayMode: string | undefined
  onModeChange?: () => void
}

function parsePlayMode(mode: string | undefined) {
  if (!mode) return { shuffle: false, repeatAll: false }
  const upper = mode.toUpperCase()
  return {
    shuffle: upper.includes('SHUFFLE'),
    repeatAll:
      upper.includes('REPEAT_ALL') ||
      upper === 'REPEAT' ||
      (upper.includes('REPEAT') &&
        !upper.includes('NOREPEAT') &&
        !upper.includes('REPEAT_ONE')),
  }
}

/**
 * Three-button header for queue views: shuffle, repeat all, clear queue.
 * Rendered at the top of both InlineQueue and QueueView expanded content.
 */
export function QueueHeader({ speaker, currentPlayMode, onModeChange }: QueueHeaderProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const parsed = parsePlayMode(currentPlayMode)

  // Optimistic local state — immediately reflects user taps, syncs with server data
  const [shuffleActive, setShuffleActive] = useState(parsed.shuffle)
  const [repeatAllActive, setRepeatAllActive] = useState(parsed.repeatAll)

  // Sync local state when server data arrives (after refetch)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setShuffleActive(parsed.shuffle) }, [parsed.shuffle])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRepeatAllActive(parsed.repeatAll) }, [parsed.repeatAll])

  function invalidatePlayback() {
    // Delay slightly to let Sonos process the command before refetching
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
    }, 500)
    onModeChange?.()
  }

  const shuffleMutation = useMutation({
    mutationFn: () => api.sonos.shuffle(speaker, !shuffleActive),
    onMutate: () => {
      // Optimistic toggle
      setShuffleActive(prev => !prev)
    },
    onSuccess: invalidatePlayback,
    onError: () => {
      // Revert on failure
      setShuffleActive(parsed.shuffle)
      toast({ message: 'Could not toggle shuffle', type: 'error' })
    },
  })

  const repeatMutation = useMutation({
    mutationFn: () => api.sonos.repeat(speaker, !repeatAllActive, repeatAllActive ? 'off' : 'all'),
    onMutate: () => {
      setRepeatAllActive(prev => !prev)
    },
    onSuccess: invalidatePlayback,
    onError: () => {
      setRepeatAllActive(parsed.repeatAll)
      toast({ message: 'Could not toggle repeat', type: 'error' })
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => api.sonos.clearQueue(speaker),
    onSuccess: () => {
      queryClient.setQueryData(['sonos', 'queue', speaker], [])
      setConfirmOpen(false)
      toast({ message: 'Queue cleared' })
    },
    onError: () => {
      setConfirmOpen(false)
      toast({ message: 'Could not clear queue', type: 'error' })
    },
  })

  return (
    <div className="flex items-center gap-1 px-2 py-1.5" role="group" aria-label="Queue controls">
      {/* Shuffle */}
      <button
        onClick={() => shuffleMutation.mutate()}
        disabled={shuffleMutation.isPending}
        aria-label={shuffleActive ? 'Disable shuffle' : 'Enable shuffle'}
        aria-pressed={shuffleActive}
        className={cn(
          'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          shuffleMutation.isPending
            ? 'opacity-40 cursor-not-allowed text-caption'
            : shuffleActive
              ? 'bg-fairy-500/15 text-fairy-400'
              : 'text-caption hover:text-body',
        )}
      >
        {shuffleMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Shuffle className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* Repeat all */}
      <button
        onClick={() => repeatMutation.mutate()}
        disabled={repeatMutation.isPending}
        aria-label={repeatAllActive ? 'Disable repeat' : 'Repeat all'}
        aria-pressed={repeatAllActive}
        className={cn(
          'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          repeatMutation.isPending
            ? 'opacity-40 cursor-not-allowed text-caption'
            : repeatAllActive
              ? 'bg-fairy-500/15 text-fairy-400'
              : 'text-caption hover:text-body',
        )}
      >
        {repeatMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Repeat className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* Clear queue — with confirmation dialog */}
      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Trigger asChild>
          <button
            className={cn(
              'flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors',
              'text-red-400 hover:bg-red-500/10',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
            aria-label="Clear queue"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Clear queue
          </button>
        </AlertDialog.Trigger>

        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <AlertDialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2',
              'rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 shadow-xl',
              'focus:outline-none',
            )}
          >
            <AlertDialog.Title className="text-base font-semibold text-heading">
              Clear the queue?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-caption">
              This will remove all tracks from the queue. This cannot be undone.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button className="rounded-lg border border-[var(--border-primary)] px-4 py-2 text-sm text-body hover:brightness-95 dark:hover:brightness-110 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 min-h-[44px]">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/25 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 min-h-[44px] disabled:opacity-50"
                >
                  {clearMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Clear queue
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}
