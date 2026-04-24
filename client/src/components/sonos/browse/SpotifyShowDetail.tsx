import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Mic2, Play } from 'lucide-react'
import { api } from '@/lib/api'
import type { SpotifyEpisode } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useFirstSpeaker } from '@/hooks/useBrowseShared'
import { useSmartBack } from '@/hooks/useSmartBack'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { MusicItemMenu } from '../MusicItemMenu'
import { ListSkeleton, ErrorState } from './BrowseShared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatDuration(ms: number): string {
  const totalSecs = Math.round(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ── EpisodeRow ────────────────────────────────────────────────────────────────

function EpisodeRow({ episode, speaker }: { episode: SpotifyEpisode; speaker: string | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, episode.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${episode.name}"` }),
    onError: () => toast({ message: 'Failed to play episode', type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, episode.uri, 'queue'),
    onSuccess: () => {
      toast({ message: `Added "${episode.name}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, episode.uri, 'next'),
    onSuccess: () => {
      toast({ message: `"${episode.name}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: 'spotify',
      source_uri: episode.uri,
      title: episode.name,
      album_art_uri: episode.images?.[0]?.url,
    }),
    onSuccess: () => toast({ message: `Added "${episode.name}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <ArtworkImage images={episode.images} size={48} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{episode.name}</p>
        <p className="truncate text-xs text-caption">
          {[formatDate(episode.release_date), formatDuration(episode.duration_ms)].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={!speaker || playNow.isPending}
          onClick={() => playNow.mutate()}
          aria-label={`Play ${episode.name}`}
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
          label={episode.name}
          disabled={!speaker}
          onPlayNext={() => playNext.mutate()}
          onAddToQueue={() => addToQueue.mutate()}
          onAddToFavourites={() => addToFavourites.mutate()}
          fairylistTrack={{
            source: 'spotify',
            source_uri: episode.uri,
            title: episode.name,
            album_art_uri: episode.images?.[0]?.url,
          }}
        />
      </div>
    </li>
  )
}

// ── SpotifyShowDetail ─────────────────────────────────────────────────────────

export function SpotifyShowDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()

  const speakerParam = searchParams.get('speaker')
  const firstSpeaker = useFirstSpeaker()
  const speaker = speakerParam ?? firstSpeaker

  const backUrl = `/sonos/browse?source=spotify${speakerParam ? `&speaker=${encodeURIComponent(speakerParam)}` : ''}`
  const handleBack = useSmartBack(backUrl)

  // Load show metadata from saved shows list (cached)
  const { data: showsData } = useQuery({
    queryKey: ['spotify-saved-shows'],
    queryFn: () => api.spotify.getSavedShows(),
    staleTime: 5 * 60_000,
  })
  // Spotify can return items with `show: null` for podcasts unavailable in
  // the current market. Filter those out before matching by id.
  const show = (showsData?.items ?? []).find(item => item.show?.id === id)?.show

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-show-episodes', id],
    queryFn: () => api.spotify.getShowEpisodes(id!),
    staleTime: 5 * 60_000,
    enabled: !!id,
  })

  if (!id) return null

  // Spotify can return null episodes for items unavailable in the current
  // market or removed from the show. Filter them out before rendering.
  const episodes = (data?.items ?? []).filter(
    (e): e is SpotifyEpisode => e !== null && e !== undefined,
  )

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back to podcasts"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {show && <ArtworkImage images={show.images} size={44} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">
            {show?.name ?? 'Podcast'}
          </h2>
          {show && <p className="truncate text-xs text-caption">{show.publisher}</p>}
        </div>
      </div>

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load episodes'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && episodes.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Mic2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No episodes found</p>
        </div>
      )}

      {episodes.length > 0 && (
        <ul className="-mx-4">
          {episodes.map((episode, i) => (
            <EpisodeRow key={episode.id + ':' + i} episode={episode} speaker={speaker} />
          ))}
        </ul>
      )}
    </div>
  )
}
