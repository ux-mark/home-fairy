import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Music2, Pause, Play } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useFirstSpeaker } from '@/hooks/useBrowseShared'
import { usePlaybackState } from '@/hooks/usePlaybackState'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { AlbumPlaylistMenu } from '../AlbumPlaylistMenu'
import { TrackListSkeleton, ErrorState } from './BrowseShared'
import { SpotifyAlbumTrackRow } from './SpotifyTrackRow'

export function SpotifyAlbumDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const speakerParam = searchParams.get('speaker')
  const firstSpeaker = useFirstSpeaker()
  const speaker = speakerParam ?? firstSpeaker

  const backUrl = `/sonos/browse?source=spotify${speakerParam ? `&speaker=${encodeURIComponent(speakerParam)}` : ''}`

  // Load album metadata from the enriched albums list (cached)
  const { data: albumsData } = useQuery({
    queryKey: ['spotify-enriched-albums'],
    queryFn: () => api.spotify.getEnrichedAlbums(),
    staleTime: 5 * 60_000,
  })
  const albumItem = (albumsData?.items ?? []).find(item => item.album.id === id)
  const album = albumItem?.album

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-album-tracks', id],
    queryFn: () => api.spotify.getAlbumTracks(id!),
    staleTime: 5 * 60_000,
    enabled: !!id,
  })

  const playAlbum = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album!.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${album?.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  const pauseAlbum = useMutation({
    mutationFn: () => api.sonos.pause(speaker!),
    onError: () => toast({ message: 'Failed to pause', type: 'error' }),
  })

  const { isTrackPlaying: isTrackActive, isSelectedPlaying: isPlaying } = usePlaybackState()

  if (!id) return null

  const tracks = data?.items ?? []

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(backUrl)}
          aria-label="Back to albums"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {album && <ArtworkImage images={album.images} size={44} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">
            {album?.name ?? 'Album'}
          </h2>
          {album && (
            <p className="truncate text-xs text-caption">
              {album.artists.map(a => a.name).join(', ')}
            </p>
          )}
        </div>
        {album && (
          <>
            <AlbumPlaylistMenu
              uri={album.uri}
              title={album.name}
              artUri={album.images?.[0]?.url}
              source="spotify"
              speaker={speaker}
            />
            <button
              type="button"
              disabled={!speaker || playAlbum.isPending || pauseAlbum.isPending}
              onClick={() => isPlaying ? pauseAlbum.mutate() : playAlbum.mutate()}
              aria-label={isPlaying ? `Pause ${album.name}` : `Play album ${album.name}`}
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
          <p className="text-sm text-caption">No tracks found</p>
        </div>
      )}

      {tracks.length > 0 && (
        <ul className="-mx-4">
          {tracks.map((track, i) => (
            <SpotifyAlbumTrackRow
              key={track.id + ':' + i}
              track={track}
              speaker={speaker}
              isActive={isTrackActive(track.uri, track.name)}
              isPlaying={isPlaying}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
