import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, ListPlus, ListStart, Music2, Pause, Play, Sparkles, Wand2 } from 'lucide-react'
import { api } from '@/lib/api'
import type {
  SpotifyPlaylistMetadata,
  SpotifyPlaylistTrackItem,
  SpotifyTrack,
} from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useFirstSpeaker } from '@/hooks/useBrowseShared'
import { useSmartBack } from '@/hooks/useSmartBack'
import { usePlaybackState } from '@/hooks/usePlaybackState'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { AlbumPlaylistMenu } from '../AlbumPlaylistMenu'
import { ListSkeleton, TrackListSkeleton, ErrorState } from './BrowseShared'
import { SpotifyTrackRow } from './SpotifyTrackRow'

export function SpotifyPlaylistDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()

  const speakerParam = searchParams.get('speaker')
  const firstSpeaker = useFirstSpeaker()
  const speaker = speakerParam ?? firstSpeaker

  const backUrl = `/sonos/browse?source=spotify${speakerParam ? `&speaker=${encodeURIComponent(speakerParam)}` : ''}`
  const handleBack = useSmartBack(backUrl)

  const {
    data: playlist,
    isLoading: metaLoading,
    isError: metaIsError,
    error: metaError,
    refetch: refetchMeta,
  } = useQuery<SpotifyPlaylistMetadata>({
    queryKey: ['spotify-playlist-metadata', id],
    queryFn: () => api.spotify.getPlaylistMetadata(id!),
    staleTime: 5 * 60_000,
    enabled: !!id,
    retry: 1,
  })

  const isEditorial = playlist?.is_editorial ?? false

  const {
    data: tracksData,
    isLoading: tracksLoading,
    isError: tracksIsError,
    error: tracksError,
    refetch: refetchTracks,
  } = useQuery({
    queryKey: ['spotify-playlist-tracks', id],
    queryFn: () => api.spotify.getPlaylistTracks(id!),
    staleTime: 5 * 60_000,
    enabled: !!id && !isEditorial,
    retry: 1,
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

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, playlist!.uri, 'next'),
    onSuccess: () => toast({ message: `"${playlist?.name}" will play next` }),
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, playlist!.uri, 'queue'),
    onSuccess: () => toast({ message: `Added "${playlist?.name}" to queue` }),
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const { isTrackPlaying: isTrackActive, isSelectedPlaying: isPlaying } = usePlaybackState()

  if (!id) return null

  if (metaLoading) {
    return <ListSkeleton />
  }

  if (metaIsError || !playlist) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back to playlists"
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
              'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <ErrorState
          message={(metaError as Error)?.message ?? 'Failed to load playlist'}
          onRetry={() => refetchMeta()}
        />
      </div>
    )
  }

  const tracks = (tracksData?.items ?? [])
    .map((item: SpotifyPlaylistTrackItem) => item.track)
    .filter((t): t is SpotifyTrack => t !== null)

  const trackCountLabel = playlist.track_total != null
    ? `${playlist.track_total} ${playlist.track_total === 1 ? 'track' : 'tracks'}`
    : 'Playlist'
  const ownerLine = playlist.owner_display_name
    ? `${trackCountLabel} · ${playlist.owner_display_name}`
    : trackCountLabel

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back to playlists"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <ArtworkImage
          images={playlist.image_url ? [{ url: playlist.image_url, height: null, width: null }] : []}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">
            {playlist.name}
          </h2>
          <p className="truncate text-xs text-caption">{ownerLine}</p>
        </div>
        <AlbumPlaylistMenu
          uri={playlist.uri}
          title={playlist.name}
          artUri={playlist.image_url ?? undefined}
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
      </div>

      {/* Editorial playlist — Spotify won't give us tracks. Offer play/queue and a cheeky note. */}
      {isEditorial ? (
        <EditorialPlaylistCurtain
          speaker={speaker}
          onPlayNext={() => playNext.mutate()}
          playNextPending={playNext.isPending}
          onAddToQueue={() => addToQueue.mutate()}
          addToQueuePending={addToQueue.isPending}
        />
      ) : (
        <>
          {tracksLoading && <TrackListSkeleton />}

          {tracksIsError && (
            <ErrorState
              message={(tracksError as Error)?.message ?? 'Failed to load tracks'}
              onRetry={() => refetchTracks()}
            />
          )}

          {!tracksLoading && !tracksIsError && tracks.length === 0 && (
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
                  isActive={isTrackActive(track.uri, track.name)}
                  isPlaying={isPlaying}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function EditorialPlaylistCurtain({
  speaker,
  onPlayNext,
  playNextPending,
  onAddToQueue,
  addToQueuePending,
}: {
  speaker: string | null
  onPlayNext: () => void
  playNextPending: boolean
  onAddToQueue: () => void
  addToQueuePending: boolean
}) {
  return (
    <div className="mx-1 rounded-2xl border border-fairy-400/25 bg-gradient-to-br from-fairy-400/10 via-fairy-400/5 to-transparent px-4 py-6">
      <div className="mx-auto max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-fairy-400/15">
          <Wand2 className="h-6 w-6 text-fairy-300" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-heading">
            We'd love to show you the tracks…
          </h3>
          <p className="text-sm text-body">
            …but Spotify pulled the curtain on its own playlists for little apps like me back in
            2024. The track list stays hidden — even Home Fairy can't sprinkle fairy dust on that one.
          </p>
          <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-caption">
            <Sparkles className="h-3.5 w-3.5 text-fairy-400" aria-hidden="true" />
            <span>The good news: your speakers don't mind. Press play.</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={onPlayNext}
            disabled={!speaker || playNextPending}
            className={cn(
              'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-2',
              'text-sm font-medium text-body transition-colors hover:bg-[var(--bg-tertiary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'disabled:opacity-50',
            )}
          >
            <ListStart className="h-4 w-4" aria-hidden="true" />
            <span>Play next</span>
          </button>
          <button
            type="button"
            onClick={onAddToQueue}
            disabled={!speaker || addToQueuePending}
            className={cn(
              'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-2',
              'text-sm font-medium text-body transition-colors hover:bg-[var(--bg-tertiary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'disabled:opacity-50',
            )}
          >
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            <span>Add to queue</span>
          </button>
        </div>
      </div>
    </div>
  )
}
