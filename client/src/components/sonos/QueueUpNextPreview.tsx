import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SonosQueueItem } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { ArtworkImage } from './ArtworkImage'

// ── Props ─────────────────────────────────────────────────────────────────────

interface QueueUpNextPreviewProps {
  speaker: string
  queue: SonosQueueItem[]
  currentIndex: number
}

// ── QueueUpNextPreview ────────────────────────────────────────────────────────
// Compact strip showing the next 3 tracks above the QueueHeader.
// Tapping a chip seeks to that track immediately.

export function QueueUpNextPreview({ speaker, queue, currentIndex }: QueueUpNextPreviewProps) {
  const { toast } = useToast()

  const seekMutation = useMutation({
    mutationFn: (trackNumber: number) => api.sonos.seekToTrack(speaker, trackNumber),
    onSuccess: (_, trackNumber) => {
      const track = queue[trackNumber - 1]
      if (track) toast({ message: `Playing "${track.title}"` })
    },
    onError: () => toast({ message: 'Could not skip to track', type: 'error' }),
  })

  // Show up to 3 tracks after the current track
  const upNext = queue.slice(currentIndex + 1, currentIndex + 4)
  if (upNext.length === 0) return null

  return (
    <div className="px-4 py-2 border-b border-[var(--border-secondary)]">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-caption">
        Up next
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {upNext.map((track, i) => {
          const queueIndex = currentIndex + 1 + i
          return (
            <button
              key={track.uri + ':' + queueIndex}
              onClick={() => seekMutation.mutate(queueIndex + 1)}
              disabled={seekMutation.isPending}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg p-1.5 pr-3 transition-colors',
                'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)] hover:brightness-110',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'disabled:opacity-50',
              )}
              aria-label={`Skip to ${track.title}`}
            >
              <ArtworkImage src={track.albumArtUri} size={28} fallback="disc" rounded="rounded-md" />
              <div className="min-w-0 text-left">
                <p className="max-w-[96px] truncate text-xs font-medium text-heading leading-tight">
                  {track.title}
                </p>
                {track.artist && (
                  <p className="max-w-[96px] truncate text-[10px] text-caption leading-tight">
                    {track.artist}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
