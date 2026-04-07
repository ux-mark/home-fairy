import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ListPlus, Loader2, Repeat, Shuffle, Trash2, CheckSquare } from 'lucide-react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { SonosQueueItem } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { SaveQueueAsFairylistDialog } from './SaveQueueAsFairylistDialog'

// ── Props ─────────────────────────────────────────────────────────────────────

interface QueueHeaderProps {
  speaker: string
  currentPlayMode: string | undefined
  onModeChange?: () => void
  /** Queue tracks — used for summary line and save-as-fairylist */
  queue?: SonosQueueItem[]
  /** Whether multi-select mode is active */
  isSelecting?: boolean
  /** Toggle multi-select mode */
  onToggleSelect?: () => void
  /** Called when user confirms clear queue (so parent can apply undo) */
  onClearQueue?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatQueueSummary(queue: SonosQueueItem[]): string {
  const count = queue.length
  if (count === 0) return ''

  // Calculate total duration from items that have duration
  const totalSeconds = queue.reduce((sum, item) => sum + (item.duration ?? 0), 0)

  const countLabel = `${count} ${count === 1 ? 'track' : 'tracks'}`

  if (totalSeconds === 0) return countLabel

  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const durationLabel = h > 0 ? `${h}h ${m}m` : `${m}m`

  // Estimate end time: now + totalSeconds
  const endDate = new Date(Date.now() + totalSeconds * 1000)
  const endLabel = endDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return `${countLabel} · ${durationLabel} · ends ~${endLabel}`
}

// ── QueueHeader ───────────────────────────────────────────────────────────────

/**
 * Controls row for queue views: shuffle, repeat all, select, save as Fairylist, clear queue.
 * Optionally shows a queue summary line below the controls.
 */
export function QueueHeader({
  speaker,
  currentPlayMode,
  onModeChange,
  queue,
  isSelecting,
  onToggleSelect,
  onClearQueue,
}: QueueHeaderProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)

  const parsed = parsePlayMode(currentPlayMode)
  const [shuffleActive, setShuffleActive] = useState(parsed.shuffle)
  const [repeatAllActive, setRepeatAllActive] = useState(parsed.repeatAll)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setShuffleActive(parsed.shuffle) }, [parsed.shuffle])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRepeatAllActive(parsed.repeatAll) }, [parsed.repeatAll])

  function invalidatePlayback() {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
    }, 500)
    onModeChange?.()
  }

  const shuffleMutation = useMutation({
    mutationFn: () => api.sonos.shuffle(speaker, !shuffleActive),
    onMutate: () => { setShuffleActive(prev => !prev) },
    onSuccess: invalidatePlayback,
    onError: () => {
      setShuffleActive(parsed.shuffle)
      toast({ message: 'Could not toggle shuffle', type: 'error' })
    },
  })

  const repeatMutation = useMutation({
    mutationFn: () => api.sonos.repeat(speaker, !repeatAllActive, repeatAllActive ? 'off' : 'all'),
    onMutate: () => { setRepeatAllActive(prev => !prev) },
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
      onClearQueue?.()
      toast({ message: 'Queue cleared' })
    },
    onError: () => {
      setConfirmOpen(false)
      toast({ message: 'Could not clear queue', type: 'error' })
    },
  })

  const hasTracks = (queue?.length ?? 0) > 0
  const summary = queue ? formatQueueSummary(queue) : ''

  return (
    <>
      <div className="border-b border-[var(--border-secondary)]">
        {/* Controls row */}
        <div className="flex items-center gap-1 px-2 py-1" role="group" aria-label="Queue controls">
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

          {/* Repeat */}
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* Select mode toggle */}
          {onToggleSelect && hasTracks && (
            <button
              onClick={onToggleSelect}
              aria-label={isSelecting ? 'Exit select mode' : 'Select tracks'}
              aria-pressed={isSelecting}
              className={cn(
                'flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                isSelecting
                  ? 'bg-fairy-500/15 text-fairy-400'
                  : 'text-caption hover:text-body',
              )}
            >
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
              Select
            </button>
          )}

          {/* Save as Fairylist */}
          {hasTracks && (
            <button
              onClick={() => setSaveOpen(true)}
              aria-label="Save queue as Fairylist"
              className={cn(
                'flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors',
                'text-caption hover:text-body',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
            >
              <ListPlus className="h-4 w-4" aria-hidden="true" />
              Save
            </button>
          )}

          {/* Clear queue */}
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
                Clear
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
                  This will remove all {queue?.length ?? ''} tracks. You can undo this for 5 seconds.
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

        {/* Queue summary line */}
        {summary && (
          <p className="px-3 pb-2 text-[11px] text-caption tabular-nums">
            {summary}
          </p>
        )}
      </div>

      {/* Save as Fairylist dialog */}
      <SaveQueueAsFairylistDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        speaker={speaker}
        trackCount={queue?.length ?? 0}
      />
    </>
  )
}
