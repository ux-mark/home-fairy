import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Music2, Pause, Play } from 'lucide-react'
import { api } from '@/lib/api'
import type { SpotifyPlaylistTrackItem, SpotifyTrack } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useFirstSpeaker, useNowPlayingTrack } from '@/hooks/useBrowseShared'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { AlbumPlaylistMenu } from '../AlbumPlaylistMenu'
import { ListSkeleton, TrackListSkeleton, ErrorState } from './BrowseShared'
import { SpotifyTrackRow } from './SpotifyTrackRow'

export function SpotifyPlaylistDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const speakerParam = searchParams.get('speaker')
  const firstSpeaker = useFirstSpeaker()
  const speaker = speakerParam ?? firstSpeaker

  const backUrl = `/sonos/browse?source=spotify${speakerParam ? `&speaker=${encodeURIComponent(speakerParam)}` : ''}`

  // Load playlist metadata from the playlists list (cached)
  const { data: playlistsData } = useQuery({
    queryKey: ['spotify-playlists'],
    queryFn: () => api.spotify.getPlaylists(),
    staleTime: 5 * 60_000,
  })
  const playlist = (playlistsData?.items ?? []).find(p => p.id === id)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-playlist-tracks', id],
    queryFn: () => api.spotify.getPlaylistTracks(id!),
    staleTime: 5 * 60_000,
    enabled: !!id,
  })

  const playPlaylist = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, playlist!.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${playlist?.name}"` }),
    onError: () => toast({ message: 'Failed to play playlist', type: 'error' }),
  })

  const pausePlaylist = useMutation({
    mutationFn: () => api.sonos.pause(speaker!),
    onError: () => toast({ message: 'Failed to pause', type: 'error' }),
  })

  const nowPlayingState = useNowPlayingTrack(speaker)
  const isPlaying = nowPlayingState?.playbackState === 'PLAYING'
  const currentUri = nowPlayingState?.currentTrack?.uri

  if (!id) return null

  if (!playlist && !isLoading) {
    return <ListSkeleton />
  }

  const tracks = (data?.items ?? [])
    .map((item: SpotifyPlaylistTrackItem) => item.track)
    .filter((t): t is SpotifyTrack => t !== null)

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(backUrl)}
          aria-label="Back to playlists"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {playlist && <ArtworkImage images={playlist.images} size={44} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">
            {playlist?.name ?? 'Playlist'}
          </h2>
          {playlist && (
            <p className="text-xs text-caption">
              {playlist.tracks.total} {playlist.tracks.total === 1 ? 'track' : 'tracks'}
            </p>
          )}
        </div>
        {playlist && (
          <>
            <AlbumPlaylistMenu
              uri={playlist.uri}
              title={playlist.name}
              artUri={playlist.images?.[0]?.url}
              source="spotify"
              speaker={speaker}
            />
            <button
              type="button"
              disabled={!speaker || playPlaylist.isPending || pausePlaylist.isPending}
              onClick={() => isPlaying ? pausePlaylist.mutate() : playPlaylist.mutate()}
              aria-label={isPlaying ? `Pause ${playlist.name}` : `Play playlist ${playlist.name}`}
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fairy-500',
                'text-white transition-colors hover:bg-fairy-400',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'disabled:opacity-40',
              )}
            >
              {isPlaying
                ? <Pause className="h-5 w-5" aria-hidden="true" />
                : <Play className="h-5 w-5" aria-hidden="true" />
              }
            </button>
          </>
        )}
      </div>

      {isLoading && <TrackListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load tracks'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && tracks.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No tracks in this playlist</p>
        </div>
      )}

      {tracks.length > 0 && (
        <ul className="-mx-4">
          {tracks.map((track, i) => (
            <SpotifyTrackRow
              key={track.id + ':' + i}
              track={track}
              speaker={speaker}
              isActive={!!currentUri && currentUri === track.uri}
              isPlaying={isPlaying}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
