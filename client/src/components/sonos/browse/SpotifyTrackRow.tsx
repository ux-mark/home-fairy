import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pause, Play } from 'lucide-react'
import { api } from '@/lib/api'
import type { SpotifyTrack, SpotifyAlbumTrack } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { ActiveTrackIndicator } from '../ActiveTrackIndicator'
import { MusicItemMenu } from '../MusicItemMenu'
import { MusicListItem } from '../MusicListItem'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSecs = Math.round(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ── SpotifyTrackRow ───────────────────────────────────────────────────────────

export function SpotifyTrackRow({
  track,
  speaker,
  isActive = false,
  isPlaying = false,
}: {
  track: SpotifyTrack
  speaker: string | null
  isActive?: boolean
  isPlaying?: boolean
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${track.name}"` }),
    onError: () => toast({ message: 'Failed to play track', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'queue'),
    onSuccess: () => {
      toast({ message: `Added "${track.name}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'next'),
    onSuccess: () => {
      toast({ message: `"${track.name}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const pauseNow = useMutation({
    mutationFn: () => api.sonos.pause(speaker!),
    onError: () => toast({ message: 'Failed to pause', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: 'spotify',
      source_uri: track.uri,
      title: track.name,
      album_art_uri: track.album.images?.[0]?.url,
    }),
    onSuccess: () => toast({ message: `Added "${track.name}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  const artistNames = track.artists.map(a => a.name).join(', ')
  const duration = formatDuration(track.duration_ms)

  return (
    <MusicListItem
      artwork={{ images: track.album.images, size: 40, fallback: 'disc' }}
      title={track.name}
      subtitle={[artistNames, track.album.name, duration].filter(Boolean).join(' · ')}
      onTap={() => {}}
      onPlay={() => playNow.mutate()}
      onPause={() => pauseNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending || pauseNow.isPending}
      disabled={!speaker}
      isCurrentTrack={isActive}
      isPlaying={isPlaying}
      menuProps={{
        label: track.name,
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        onAddToFavourites: () => addToFavourites.mutate(),
        fairylistTrack: {
          source: 'spotify',
          source_uri: track.uri,
          title: track.name,
          artist: artistNames,
          album_art_uri: track.album.images?.[0]?.url,
        },
        spotifyTrack: { trackUri: track.uri, trackName: track.name },
      }}
    />
  )
}

// ── SpotifyAlbumTrackRow ──────────────────────────────────────────────────────

export function SpotifyAlbumTrackRow({
  track,
  speaker,
  isActive = false,
  isPlaying = false,
}: {
  track: SpotifyAlbumTrack
  speaker: string | null
  isActive?: boolean
  isPlaying?: boolean
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${track.name}"` }),
    onError: () => toast({ message: 'Failed to play track', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'queue'),
    onSuccess: () => {
      toast({ message: `Added "${track.name}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, track.uri, 'next'),
    onSuccess: () => {
      toast({ message: `"${track.name}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: 'spotify',
      source_uri: track.uri,
      title: track.name,
    }),
    onSuccess: () => toast({ message: `Added "${track.name}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  const pauseNow = useMutation({
    mutationFn: () => api.sonos.pause(speaker!),
    onError: () => toast({ message: 'Failed to pause', type: 'error' }),
  })

  const artistNames = track.artists.map(a => a.name).join(', ')
  const showPause = isActive && isPlaying

  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', isActive && 'bg-fairy-500/5')}>
      <div className="w-6 shrink-0 flex items-center justify-end">
        {isActive
          ? <ActiveTrackIndicator isActive={isActive} isPlaying={isPlaying} />
          : (
            <span
              className="text-right text-xs tabular-nums text-caption/50"
              aria-label={`Track ${track.track_number}`}
            >
              {track.track_number}
            </span>
          )
        }
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', isActive ? 'text-fairy-400' : 'text-heading')}>{track.name}</p>
        <p className="truncate text-xs text-caption">{artistNames}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="mr-1 text-xs text-caption/70">{formatDuration(track.duration_ms)}</span>

        <button
          type="button"
          disabled={!speaker || playNow.isPending || pauseNow.isPending}
          onClick={() => showPause ? pauseNow.mutate() : playNow.mutate()}
          aria-label={showPause ? `Pause ${track.name}` : `Play ${track.name}`}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          {showPause
            ? <Pause className="h-4 w-4" aria-hidden="true" />
            : <Play className="h-4 w-4" aria-hidden="true" />
          }
        </button>

        <MusicItemMenu
          label={track.name}
          disabled={!speaker}
          onPlayNext={() => playNext.mutate()}
          onAddToQueue={() => addToQueue.mutate()}
          onAddToFavourites={() => addToFavourites.mutate()}
          fairylistTrack={{
            source: 'spotify',
            source_uri: track.uri,
            title: track.name,
            artist: artistNames,
          }}
          spotifyTrack={{ trackUri: track.uri, trackName: track.name }}
        />
      </div>
    </li>
  )
}
