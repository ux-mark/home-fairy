import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Heart, ImageOff, ListEnd, ListStart, Loader2, Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { SonosNowPlayingEntry } from '@/lib/api'
import { useToast } from '@/hooks/useToast'

/**
 * Track detail page — reached by tapping a track in queue or now-playing.
 * Route: /sonos/track?uri=<track-uri>&speaker=<speaker-name>
 *
 * Works for both Spotify and NAS tracks; sources metadata from queue or
 * now-playing state. Shows large artwork, title, album, artist, play/pause,
 * add to favourites, add to start/end of queue.
 */
export default function SonosTrackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const uri = searchParams.get('uri') ?? ''
  const speaker = searchParams.get('speaker') ?? ''

  const [imgFailed, setImgFailed] = useState(false)
  const [addedToFavourites, setAddedToFavourites] = useState(false)

  // Try to find track metadata from queue cache first, then now-playing cache
  const queueData = queryClient.getQueryData<{ uri: string; title: string; artist: string; album: string; albumArtUri: string }[]>(['sonos', 'queue', speaker])
  const nowPlayingData = queryClient.getQueryData<SonosNowPlayingEntry[]>(['sonos', 'now-playing'])

  // Look up track from queue
  const trackFromQueue = queueData?.find(item => item.uri === uri)

  // Look up track from now-playing
  const speakerEntry = nowPlayingData?.find(e => e.speakerName === speaker)
  const trackFromNowPlaying = speakerEntry?.state?.currentTrack?.uri === uri
    ? speakerEntry.state.currentTrack
    : undefined

  const track = trackFromQueue ?? trackFromNowPlaying

  // Check if this track is currently playing on the speaker
  const isCurrentlyPlaying =
    speakerEntry?.state?.currentTrack?.uri === uri &&
    speakerEntry?.state?.playbackState === 'PLAYING'
  const isCurrentlyPaused =
    speakerEntry?.state?.currentTrack?.uri === uri &&
    speakerEntry?.state?.playbackState === 'PAUSED_PLAYBACK'

  // Fetch current favourites to check if this track is already favourited
  const { data: favourites } = useQuery({
    queryKey: ['favourites'],
    queryFn: api.favourites.list,
    staleTime: 60_000,
  })
  const existingFavourite = favourites?.find(f => f.source_uri === uri)
  const isFavourited = addedToFavourites || !!existingFavourite

  // Mutations
  const playMutation = useMutation({
    mutationFn: () => api.sonos.play(speaker),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] }),
    onError: () => toast({ message: 'Could not play', type: 'error' }),
  })

  const pauseMutation = useMutation({
    mutationFn: () => api.sonos.pause(speaker),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] }),
    onError: () => toast({ message: 'Could not pause', type: 'error' }),
  })

  const favouriteMutation = useMutation({
    mutationFn: () =>
      api.favourites.add({
        source: uri.startsWith('spotify:') ? 'spotify' : 'nas',
        source_uri: uri,
        title: track?.title ?? 'Unknown track',
        album_art_uri: track?.albumArtUri || undefined,
      }),
    onSuccess: () => {
      setAddedToFavourites(true)
      queryClient.invalidateQueries({ queryKey: ['favourites'] })
      toast({ message: 'Added to favourites' })
    },
    onError: () => toast({ message: 'Could not add to favourites', type: 'error' }),
  })

  const removeFavouriteMutation = useMutation({
    mutationFn: () => api.favourites.remove(existingFavourite!.id),
    onSuccess: () => {
      setAddedToFavourites(false)
      queryClient.invalidateQueries({ queryKey: ['favourites'] })
      toast({ message: 'Removed from favourites' })
    },
    onError: () => toast({ message: 'Could not remove from favourites', type: 'error' }),
  })

  const playNextMutation = useMutation({
    mutationFn: () => api.sonos.playNext(speaker, uri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'queue', speaker] })
      toast({ message: 'Added to play next' })
    },
    onError: () => toast({ message: 'Could not add to queue', type: 'error' }),
  })

  const addToQueueMutation = useMutation({
    mutationFn: () => api.sonos.addToQueue(speaker, uri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'queue', speaker] })
      toast({ message: 'Added to end of queue' })
    },
    onError: () => toast({ message: 'Could not add to queue', type: 'error' }),
  })

  const title = track?.title ?? 'Unknown track'
  const artist = track?.artist ?? null
  const album = track?.album ?? null
  const artUri = track?.albumArtUri ?? null
  const showArt = artUri && !imgFailed

  return (
    <div className="flex flex-col">
      {/* Back navigation */}
      <div className="mb-4 flex items-center">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className={cn(
            'flex min-h-[44px] items-center gap-1.5 rounded-lg px-1 text-sm text-caption transition-colors',
            'hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
      </div>

      {/* Album artwork */}
      <div className="mx-auto mb-6 aspect-square w-full max-w-xs overflow-hidden rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center">
        {showArt ? (
          <img
            src={artUri!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ImageOff className="h-16 w-16 text-caption" aria-hidden="true" />
        )}
      </div>

      {/* Track metadata */}
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-heading">{title}</h1>
        {album && (
          <p className="mt-1 text-sm text-caption">{album}</p>
        )}
        {artist && (
          <p className="mt-0.5 text-sm text-caption/70">{artist}</p>
        )}
      </div>

      {/* Primary action: Play / Pause */}
      {speaker && (isCurrentlyPlaying || isCurrentlyPaused) ? (
        <button
          onClick={() => isCurrentlyPlaying ? pauseMutation.mutate() : playMutation.mutate()}
          disabled={playMutation.isPending || pauseMutation.isPending}
          aria-label={isCurrentlyPlaying ? 'Pause' : 'Play'}
          className={cn(
            'mb-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-base font-semibold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-50',
            isCurrentlyPlaying
              ? 'bg-fairy-500 text-white hover:bg-fairy-600'
              : 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25',
          )}
        >
          {(playMutation.isPending || pauseMutation.isPending) ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : isCurrentlyPlaying ? (
            <Pause className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5" aria-hidden="true" />
          )}
          {isCurrentlyPlaying ? 'Pause' : 'Play'}
        </button>
      ) : null}

      {/* Secondary actions */}
      <div className="flex flex-col gap-2">
        {/* Favourite */}
        <button
          onClick={() => isFavourited ? removeFavouriteMutation.mutate() : favouriteMutation.mutate()}
          disabled={favouriteMutation.isPending || removeFavouriteMutation.isPending}
          aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          aria-pressed={isFavourited}
          className={cn(
            'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors',
            'surface',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-50',
            isFavourited ? 'text-fairy-400' : 'text-body',
          )}
        >
          {(favouriteMutation.isPending || removeFavouriteMutation.isPending) ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Heart
              className="h-4 w-4"
              fill={isFavourited ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
          )}
          {isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        </button>

        {/* Add to start of queue (play next) */}
        {speaker && (
          <button
            onClick={() => playNextMutation.mutate()}
            disabled={playNextMutation.isPending}
            aria-label="Add to start of queue"
            className={cn(
              'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors',
              'surface text-body',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'disabled:opacity-50',
            )}
          >
            {playNextMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ListStart className="h-4 w-4" aria-hidden="true" />
            )}
            Play next
          </button>
        )}

        {/* Add to end of queue */}
        {speaker && (
          <button
            onClick={() => addToQueueMutation.mutate()}
            disabled={addToQueueMutation.isPending}
            aria-label="Add to end of queue"
            className={cn(
              'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors',
              'surface text-body',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'disabled:opacity-50',
            )}
          >
            {addToQueueMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ListEnd className="h-4 w-4" aria-hidden="true" />
            )}
            Add to queue
          </button>
        )}
      </div>
    </div>
  )
}
