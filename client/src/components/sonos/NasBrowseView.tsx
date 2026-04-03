import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ImageOff,
  ListStart,
  Music2,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosLibraryTrack, SonosGenre } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type NasView = 'genres' | 'genre-detail'

// ── Helpers ──────────────────────────────────────────────────────────────────

function useFirstSpeaker() {
  const { data: zones } = useQuery({
    queryKey: ['sonos-zones'],
    queryFn: api.sonos.getZones,
    staleTime: 30_000,
  })
  return zones?.[0]?.members?.[0]?.roomName ?? zones?.[0]?.coordinator?.roomName ?? null
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [value, delay])

  return debounced
}

// ── Album art thumbnail ───────────────────────────────────────────────────────

function AlbumArt({ uri, size = 40 }: { uri?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className="shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]"
      style={{ width: size, height: size }}
    >
      {uri && !failed ? (
        <img
          src={uri}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-4 w-4 text-slate-500" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

// ── Track row ─────────────────────────────────────────────────────────────────

function TrackRow({ track, speaker }: { track: SonosLibraryTrack; speaker: string | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

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

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <AlbumArt uri={track.albumArtUri} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{track.title || 'Unknown track'}</p>
        <p className="truncate text-xs text-caption">
          {[track.artist, track.album].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={!speaker || playNext.isPending}
          onClick={() => playNext.mutate()}
          aria-label={`Play ${track.title} next`}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <ListStart className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!speaker || addToQueue.isPending}
          onClick={() => addToQueue.mutate()}
          aria-label={`Add ${track.title} to queue`}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

// ── Skeleton helpers ─────────────────────────────────────────────────────────

function GenreGridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      aria-busy="true"
      aria-label="Loading genres"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  )
}

function TrackListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading tracks">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({
  title = 'NAS library unavailable',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-heading">{title}</p>
        <p className="mt-1 max-w-xs text-xs text-caption">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] px-4 py-2 text-sm font-medium text-body',
          'transition-colors hover:bg-[var(--bg-tertiary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// ── Genre grid view ───────────────────────────────────────────────────────────

function GenreGrid({
  onSelectGenre,
}: {
  onSelectGenre: (genre: string) => void
}) {
  const { data: genres, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-genres'],
    queryFn: api.sonos.getLibraryGenres,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <GenreGridSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Failed to load genres'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!genres || genres.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No genres found</p>
          <p className="mt-1 max-w-xs text-xs text-caption">
            Your NAS library doesn't have any genres indexed yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {genres.map((genre: SonosGenre) => (
        <GenreCard key={genre.title} genre={genre} onSelect={onSelectGenre} />
      ))}
    </div>
  )
}

function GenreCard({
  genre,
  onSelect,
}: {
  genre: SonosGenre
  onSelect: (title: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(genre.title)}
      className={cn(
        'flex flex-col items-start justify-between rounded-xl bg-[var(--bg-secondary)] p-4',
        'text-left transition-colors hover:bg-[var(--bg-tertiary)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        'min-h-[80px] w-full',
      )}
    >
      <ChevronRight className="h-4 w-4 self-end text-caption/50" aria-hidden="true" />
      <div className="mt-1">
        <p className="text-sm font-semibold leading-tight text-heading">{genre.title}</p>
        {genre.count !== undefined && (
          <p className="mt-0.5 text-xs text-caption">
            {genre.count} {genre.count === 1 ? 'track' : 'tracks'}
          </p>
        )}
      </div>
    </button>
  )
}

// ── Genre detail view ─────────────────────────────────────────────────────────

function GenreDetail({
  genre,
  speaker,
  onBack,
}: {
  genre: string
  speaker: string | null
  onBack: () => void
}) {
  const { data: tracks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-genre-tracks', genre],
    queryFn: () => api.sonos.getLibraryGenreTracks(genre),
    staleTime: 5 * 60_000,
  })

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to genres"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="truncate text-lg font-semibold text-heading">{genre}</h2>
      </div>

      {/* Content */}
      {isLoading && <TrackListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load tracks'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (!tracks || tracks.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No tracks found in {genre}</p>
        </div>
      )}

      {tracks && tracks.length > 0 && (
        <ul className="-mx-4">
          {tracks.map((track, i) => (
            <TrackRow key={track.uri + ':' + i} track={track} speaker={speaker} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Search results view ───────────────────────────────────────────────────────

function SearchResults({ query, speaker }: { query: string; speaker: string | null }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-search', query],
    queryFn: () => api.sonos.searchLibrary(query),
    staleTime: 60_000,
    enabled: query.length > 0,
  })

  if (isLoading) return <TrackListSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Search failed'}
        onRetry={() => refetch()}
      />
    )
  }

  const totalResults =
    (data?.artists?.length ?? 0) + (data?.albums?.length ?? 0) + (data?.tracks?.length ?? 0)

  if (!data || totalResults === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No results for "{query}"</p>
          <p className="mt-1 text-xs text-caption">Try a different search term</p>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-4">
      {data.artists && data.artists.length > 0 && (
        <section aria-label="Artists">
          <h3 className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-caption">
            Artists
          </h3>
          <ul>
            {data.artists.map((track, i) => (
              <TrackRow key={track.uri + ':artist:' + i} track={track} speaker={speaker} />
            ))}
          </ul>
        </section>
      )}
      {data.albums && data.albums.length > 0 && (
        <section aria-label="Albums">
          <h3 className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-caption">
            Albums
          </h3>
          <ul>
            {data.albums.map((track, i) => (
              <TrackRow key={track.uri + ':album:' + i} track={track} speaker={speaker} />
            ))}
          </ul>
        </section>
      )}
      {data.tracks && data.tracks.length > 0 && (
        <section aria-label="Tracks">
          <h3 className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-caption">
            Tracks
          </h3>
          <ul>
            {data.tracks.map((track, i) => (
              <TrackRow key={track.uri + ':track:' + i} track={track} speaker={speaker} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ── NasBrowseView ─────────────────────────────────────────────────────────────

interface NasBrowseViewProps {
  searchQuery: string
  targetSpeaker?: string | null
}

export function NasBrowseView({ searchQuery, targetSpeaker }: NasBrowseViewProps) {
  const [view, setView] = useState<NasView>('genres')
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const firstSpeaker = useFirstSpeaker()
  const speaker = targetSpeaker ?? firstSpeaker

  const debouncedQuery = useDebounce(searchQuery.trim(), 300)
  const isSearching = debouncedQuery.length > 0

  function handleSelectGenre(genre: string) {
    setSelectedGenre(genre)
    setView('genre-detail')
  }

  function handleBack() {
    setView('genres')
    setSelectedGenre(null)
  }

  if (isSearching) {
    return <SearchResults query={debouncedQuery} speaker={speaker} />
  }

  if (view === 'genre-detail' && selectedGenre) {
    return (
      <GenreDetail genre={selectedGenre} speaker={speaker} onBack={handleBack} />
    )
  }

  return <GenreGrid onSelectGenre={handleSelectGenre} />
}
