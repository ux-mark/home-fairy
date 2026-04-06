import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SpotifyTrack, SpotifyAlbumTrack } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
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

  return (
    <MusicListItem
      artwork={{ images: track.album.images, size: 40 }}
      title={track.name}
      subtitle={[artistNames, track.album.name].filter(Boolean).join(' · ')}
      duration={formatDuration(track.duration_ms)}
      onTap={() => playNow.mutate()}
      onPlay={() => playNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending}
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

  const artistNames = track.artists.map(a => a.name).join(', ')

  return (
    <MusicListItem
      trackNumber={track.track_number}
      artwork={{ size: 40 }}
      title={track.name}
      subtitle={artistNames}
      duration={formatDuration(track.duration_ms)}
      onTap={() => playNow.mutate()}
      onPlay={() => playNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending}
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
        },
        spotifyTrack: { trackUri: track.uri, trackName: track.name },
      }}
    />
  )
}
