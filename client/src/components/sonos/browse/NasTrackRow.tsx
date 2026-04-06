import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SonosLibraryTrack } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { MusicListItem } from '../MusicListItem'

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

  const pauseNow = useMutation({
    mutationFn: () => api.sonos.pause(speaker!),
    onError: () => toast({ message: 'Failed to pause', type: 'error' }),
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
    <MusicListItem
      artwork={{ src: track.albumArtUri, size: 40, fallback: 'disc' }}
      title={track.title || 'Unknown track'}
      subtitle={[track.artist, track.album].filter(Boolean).join(' · ')}
      onTap={() => {}}
      onPlay={() => playNow.mutate()}
      onPause={() => pauseNow.mutate()}
      playDisabled={!speaker}
      playPending={playNow.isPending || pauseNow.isPending}
      disabled={!speaker}
      isCurrentTrack={isActive}
      isPlaying={isPlaying}
      menuProps={{
        label: track.title || 'Unknown track',
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        onAddToFavourites: () => addToFavourites.mutate(),
        fairylistTrack: {
          source: 'nas',
          source_uri: track.uri,
          title: track.title || 'Unknown track',
          artist: track.artist,
          album_art_uri: track.albumArtUri,
        },
      }}
    />
  )
}
