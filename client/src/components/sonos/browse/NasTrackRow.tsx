import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosLibraryTrack } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { ActiveTrackIndicator } from '../ActiveTrackIndicator'
import { MusicItemMenu } from '../MusicItemMenu'

// ── NasTrackRow ───────────────────────────────────────────────────────────────

export function NasTrackRow({
  track,
  speaker,
  isActive = false,
  isPlaying = false,
}: {
  track: SonosLibraryTrack
  speaker: string | null
  isActive?: boolean
  isPlaying?: boolean
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playUri(speaker!, track.uri),
    onSuccess: () => toast({ message: `Playing "${track.title}"` }),
    onError: () => toast({ message: 'Failed to play track', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addToQueue(speaker!, track.uri),
    onSuccess: () => {
      toast({ message: `Added "${track.title}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playNext(speaker!, track.uri),
    onSuccess: () => {
      toast({ message: `"${track.title}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: 'nas',
      source_uri: track.uri,
      title: track.title,
      album_art_uri: track.albumArtUri,
    }),
    onSuccess: () => toast({ message: `Added "${track.title}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', isActive && 'bg-fairy-500/10')}>
      <div className="relative shrink-0">
        <ArtworkImage src={track.albumArtUri} size={40} fallback="disc" />
        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40">
            <ActiveTrackIndicator isActive={isActive} isPlaying={isPlaying} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{track.title || 'Unknown track'}</p>
        <p className="truncate text-xs text-caption">
          {[track.artist, track.album].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={!speaker || playNow.isPending}
          onClick={() => playNow.mutate()}
          aria-label={`Play ${track.title}`}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>

        <MusicItemMenu
          label={track.title || 'Unknown track'}
          disabled={!speaker}
          onPlayNext={() => playNext.mutate()}
          onAddToQueue={() => addToQueue.mutate()}
          onAddToFavourites={() => addToFavourites.mutate()}
          fairylistTrack={{
            source: 'nas',
            source_uri: track.uri,
            title: track.title || 'Unknown track',
            artist: track.artist,
            album_art_uri: track.albumArtUri,
          }}
        />
      </div>
    </li>
  )
}
