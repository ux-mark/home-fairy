import { useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, ListMusic, Music2, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosQueueItem, SonosPlaybackState } from '@/lib/api'
import { useQueueSync } from '@/hooks/useQueueSync'
import { useUndoableQueueAction } from '@/hooks/useUndoableQueueAction'
import { useQueueClear } from '@/hooks/useQueueClear'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { ArtworkImage } from './ArtworkImage'
import { UndoSnackbar } from './UndoSnackbar'

// ── Constants ─────────────────────────────────────────────────────────────────

const UP_NEXT_PREVIEW_COUNT = 3

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InlineQueueProps {
  speaker: string
  currentTrackUri: string | null
  playbackState?: SonosPlaybackState | null
  /** Called when the user taps "See full queue" — opens the full QueueView sheet */
  onViewFullQueue?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number | undefined): string {
  if (!totalSeconds || totalSeconds <= 0) return ''
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── InlineQueue ───────────────────────────────────────────────────────────────
//
// A lightweight preview of what's coming up next on a speaker. Shows only the
// next few tracks after the currently playing track, plus a button that opens
// the full QueueView sheet for anything more detailed. No drag-to-reorder, no
// shuffle/repeat controls — those all live in QueueView.

export function InlineQueue({
  speaker,
  currentTrackUri,
  playbackState,
  onViewFullQueue,
}: InlineQueueProps) {
  const { toast } = useToast()

  const { queue, isLoading, isError, refetch } = useQueueSync({
    speaker,
    enabled: !!speaker,
  })

  const undo = useUndoableQueueAction()
  const clearQueue = useQueueClear(speaker, undo)

  // ── Resolve the current track index with the same fallback logic as QueueView ──
  const currentIndex = useMemo(() => {
    if (!queue || queue.length === 0) return -1
    if (currentTrackUri) {
      const idx = queue.findIndex(item => item.uri === currentTrackUri)
      if (idx >= 0) return idx
    }
    const trackNo = playbackState?.trackNo
    if (typeof trackNo === 'number' && trackNo >= 1 && trackNo <= queue.length) {
      return trackNo - 1
    }
    return -1
  }, [queue, currentTrackUri, playbackState?.trackNo])

  const upNext = useMemo<SonosQueueItem[]>(() => {
    if (!queue) return []
    const start = currentIndex < 0 ? 0 : currentIndex + 1
    return queue.slice(start, start + UP_NEXT_PREVIEW_COUNT)
  }, [queue, currentIndex])

  const seekMutation = useMutation({
    mutationFn: (trackNumber: number) => api.sonos.seekToTrack(speaker, trackNumber),
    onError: () => toast({ message: 'Could not skip to track', type: 'error' }),
  })

  const totalCount = queue?.length ?? 0
  const upNextStart = currentIndex < 0 ? 0 : currentIndex + 1
  const remainingAfterPreview = Math.max(0, totalCount - upNextStart - upNext.length)

  // ── Render states ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="mt-2 border-t border-[var(--border-secondary)] pt-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-caption">
          <ListMusic className="h-3 w-3" aria-hidden="true" />
          Up next
        </div>
        <div className="flex flex-col gap-2" role="status" aria-label="Loading up next">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-2.5 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mt-2 border-t border-[var(--border-secondary)] pt-3">
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-caption">
          <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />
          <span className="flex-1">Couldn't load the queue.</span>
          <button
            onClick={() => refetch()}
            className="rounded px-2 py-1 text-xs font-semibold text-fairy-400 hover:text-fairy-300 focus-visible:outline-2 focus-visible:outline-fairy-500"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!queue || queue.length === 0) {
    return (
      <div className="mt-2 border-t border-[var(--border-secondary)] pt-3">
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-caption">
          <Music2 className="h-4 w-4" aria-hidden="true" />
          Queue is empty — start playing something to build it up.
        </div>
        {/* Undo snackbar must survive the optimistic clear-to-empty, or the
            user can never undo a clear started from this header. */}
        {undo.pendingAction && (
          <UndoSnackbar
            label={undo.pendingAction.label}
            onUndo={undo.triggerUndo}
            className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2"
          />
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 border-t border-[var(--border-secondary)] pt-3">
      {/* Section label */}
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-caption">
          <ListMusic className="h-3 w-3" aria-hidden="true" />
          Up next
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[11px] tabular-nums text-caption">
            {totalCount} {totalCount === 1 ? 'track' : 'tracks'}
          </span>
          {/* Clear queue — immediate, with undo snackbar */}
          <button
            onClick={clearQueue}
            aria-label="Clear queue"
            className={cn(
              'flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors',
              'text-red-400 hover:bg-red-500/10',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
        </span>
      </div>

      {/* Up-next preview rows */}
      {upNext.length > 0 ? (
        <ul className="flex flex-col gap-0.5 px-1">
          {upNext.map((track, i) => {
            const queueIndex = upNextStart + i
            return (
              <li key={track.uri + ':' + queueIndex}>
                <button
                  onClick={() => seekMutation.mutate(queueIndex + 1)}
                  disabled={seekMutation.isPending}
                  className={cn(
                    'flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                    'hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'disabled:opacity-50',
                  )}
                  aria-label={`Skip to ${track.title}`}
                >
                  <ArtworkImage src={track.albumArtUri} size={36} fallback="disc" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight text-heading">
                      {track.title || 'Unknown track'}
                    </p>
                    <p className="truncate text-xs text-caption">
                      {[track.artist, track.album].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {track.duration ? (
                    <span className="shrink-0 text-[10px] tabular-nums text-caption">
                      {formatDuration(track.duration)}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="px-2 py-2 text-xs text-caption">
          Nothing queued after this track.
        </div>
      )}

      {/* See full queue button */}
      {onViewFullQueue && (
        <button
          onClick={onViewFullQueue}
          className={cn(
            'mt-2 flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors',
            'border border-[var(--border-primary)] text-body hover:brightness-95 dark:hover:brightness-110',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label={`See full queue — ${totalCount} tracks`}
        >
          <span>
            See full queue
            {remainingAfterPreview > 0 && (
              <span className="ml-1 text-xs text-caption">
                ({remainingAfterPreview} more)
              </span>
            )}
          </span>
          <ChevronRight className="h-4 w-4 text-caption" aria-hidden="true" />
        </button>
      )}

      {/* Undo snackbar — fixed above the bottom nav */}
      {undo.pendingAction && (
        <UndoSnackbar
          label={undo.pendingAction.label}
          onUndo={undo.triggerUndo}
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2"
        />
      )}
    </div>
  )
}
