import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Disc3,
  Hash,
  Heart,
  ListEnd,
  ListStart,
  MoreVertical,
  Music2,
  Play,
  RefreshCw,
  User,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosLibraryTrack, SonosLibraryArtist, SonosGenre, SonosGenreAlbum } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type NasView = 'home' | 'artist-detail' | 'album-detail' | 'genre-albums' | 'genre-album-tracks'
type BrowseMode = 'genres' | 'artists' | 'albums'

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
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Disc3 className="h-4 w-4 text-caption/40" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

// ── Track row ─────────────────────────────────────────────────────────────────

function TrackRow({ track, speaker }: { track: SonosLibraryTrack; speaker: string | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)

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
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bg-tertiary)]">
        <Music2 className="h-4 w-4 text-caption/60" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{track.title || 'Unknown track'}</p>
        <p className="truncate text-xs text-caption">
          {[track.artist, track.album].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Play now — universally recognisable icon, icon-only acceptable */}
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

        {/* Three-dot menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            disabled={!speaker}
            onClick={() => setMenuOpen(v => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            aria-label={`More options for ${track.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              'flex h-11 w-9 items-center justify-center rounded-lg',
              'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'disabled:opacity-40',
            )}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>

          {menuOpen && (
            <ul
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
            >
              <li role="none">
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); playNext.mutate() }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                >
                  <ListStart className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Play next
                </button>
              </li>
              <li role="none">
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); addToQueue.mutate() }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                >
                  <ListEnd className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add to queue
                </button>
              </li>
              <li role="none">
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); addToFavourites.mutate() }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                >
                  <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add to favourites
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </li>
  )
}

// ── Skeleton helpers ─────────────────────────────────────────────────────────

function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
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

// ── Browse mode tabs ──────────────────────────────────────────────────────────

function BrowseModeTabs({
  mode,
  onChangeMode,
}: {
  mode: BrowseMode
  onChangeMode: (m: BrowseMode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Browse by"
      className="mb-4 flex gap-2"
    >
      {(['genres', 'artists', 'albums'] as const).map(m => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChangeMode(m)}
          className={cn(
            'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            'min-h-[36px]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            mode === m
              ? 'bg-fairy-500 text-white'
              : 'bg-[var(--bg-secondary)] text-caption hover:text-body',
          )}
        >
          {m === 'genres' ? 'Genres' : m === 'artists' ? 'Artists' : 'Albums'}
        </button>
      ))}
    </div>
  )
}

// ── Artist list ──────────────────────────────────────────────────────────────

function ArtistList({
  onSelectArtist,
}: {
  onSelectArtist: (name: string) => void
}) {
  const { data: artists, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-artists'],
    queryFn: api.sonos.getLibraryArtists,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Failed to load artists'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!artists || artists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No music found</p>
          <p className="mt-1 max-w-xs text-xs text-caption">
            Your NAS library hasn't been indexed yet. Make sure a music library share is configured in the Sonos app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="-mx-4">
      {artists.map((artist: SonosLibraryArtist) => (
        <li key={artist.name}>
          <button
            type="button"
            onClick={() => onSelectArtist(artist.name)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-2.5 text-left',
              'transition-colors hover:bg-[var(--bg-secondary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
              <User className="h-4 w-4 text-caption/60" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
              <p className="text-xs text-caption">
                {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} · {artist.trackCount} {artist.trackCount === 1 ? 'track' : 'tracks'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Album list ───────────────────────────────────────────────────────────────

function AlbumList({
  onSelectAlbum,
}: {
  onSelectAlbum: (album: SonosGenreAlbum) => void
}) {
  const { data: albums, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-albums'],
    queryFn: api.sonos.getLibraryAlbums,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Failed to load albums'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!albums || albums.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <p className="text-sm font-medium text-heading">No albums found</p>
      </div>
    )
  }

  return (
    <ul className="-mx-4">
      {albums.map((album: SonosGenreAlbum) => (
        <li key={album.objectId}>
          <button
            type="button"
            onClick={() => onSelectAlbum(album)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-2.5 text-left',
              'transition-colors hover:bg-[var(--bg-secondary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
            )}
          >
            <AlbumArt uri={album.albumArtUri} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-heading">{album.name}</p>
              <p className="truncate text-xs text-caption">{album.artist}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Artist detail view ───────────────────────────────────────────────────────

function ArtistDetail({
  artist,
  speaker,
  onBack,
  onSelectAlbum,
}: {
  artist: string
  speaker: string | null
  onBack: () => void
  onSelectAlbum: (album: SonosGenreAlbum) => void
}) {
  const { data: tracks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-artist-tracks', artist],
    queryFn: () => api.sonos.getArtistTracks(artist),
    staleTime: 5 * 60_000,
  })

  // Group tracks by album
  const albums = new Map<string, SonosLibraryTrack[]>()
  if (tracks) {
    for (const t of tracks) {
      const key = t.album || 'Unknown Album'
      const list = albums.get(key) ?? []
      list.push(t)
      albums.set(key, list)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to artists"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="truncate text-lg font-semibold text-heading">{artist}</h2>
      </div>

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load tracks'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && albums.size > 0 && (
        <div className="-mx-4">
          {Array.from(albums.entries()).map(([albumName, albumTracks]) => (
            <section key={albumName} aria-label={albumName}>
              <button
                type="button"
                onClick={() => onSelectAlbum({ name: albumName, artist, albumArtUri: '', objectId: `A:ALBUMARTIST/${artist}/${albumName}` })}
                className={cn(
                  'flex w-full items-center gap-2 px-4 pb-1 pt-4 text-left',
                  'transition-colors hover:bg-[var(--bg-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
              >
                <Disc3 className="h-3.5 w-3.5 text-fairy-400" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-fairy-400">{albumName}</h3>
                <span className="text-xs text-caption">· {albumTracks.length} tracks</span>
                <ChevronRight className="ml-auto h-3 w-3 text-caption/40" aria-hidden="true" />
              </button>
              <ul>
                {albumTracks.slice(0, 5).map((track, i) => (
                  <TrackRow key={track.uri + ':' + i} track={track} speaker={speaker} />
                ))}
                {albumTracks.length > 5 && (
                  <li className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => onSelectAlbum({ name: albumName, artist, albumArtUri: '', objectId: `A:ALBUMARTIST/${artist}/${albumName}` })}
                      className="text-xs font-medium text-fairy-400 hover:text-fairy-300"
                    >
                      Show all {albumTracks.length} tracks
                    </button>
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Album detail view ────────────────────────────────────────────────────────

function AlbumDetail({
  album,
  speaker,
  onBack,
}: {
  album: SonosGenreAlbum
  speaker: string | null
  onBack: () => void
}) {
  const { toast } = useToast()
  const { data: tracks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-album-tracks', album.objectId],
    queryFn: () => api.sonos.getAlbumTracks(album.objectId),
    staleTime: 5 * 60_000,
  })

  const playAlbum = useMutation({
    mutationFn: () => api.sonos.playUri(speaker!, album.objectId),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <AlbumArt uri={album.albumArtUri} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-heading">{album.name}</h2>
          <p className="truncate text-xs text-caption">{album.artist}</p>
        </div>
        <button
          type="button"
          disabled={!speaker || playAlbum.isPending}
          onClick={() => playAlbum.mutate()}
          aria-label={`Play album ${album.name}`}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fairy-500',
            'text-white transition-colors hover:bg-fairy-400',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <Play className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load tracks'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && tracks && tracks.length > 0 && (
        <ul className="-mx-4">
          {tracks.map((track, i) => (
            <TrackRow key={track.uri + ':' + i} track={track} speaker={speaker} />
          ))}
        </ul>
      )}

      {!isLoading && !isError && (!tracks || tracks.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No tracks found</p>
        </div>
      )}
    </div>
  )
}

// ── Genre list ───────────────────────────────────────────────────────────────

function GenreList({
  onSelectGenre,
}: {
  onSelectGenre: (genre: string) => void
}) {
  const { data: genres, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-genres'],
    queryFn: api.sonos.getLibraryGenres,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <ListSkeleton />

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
            Your music library may not have genre metadata, or it hasn't been indexed yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="-mx-4">
      {genres.map((genre: SonosGenre) => (
        <li key={genre.title}>
          <button
            type="button"
            onClick={() => onSelectGenre(genre.title)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-2.5 text-left',
              'transition-colors hover:bg-[var(--bg-secondary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
              <Hash className="h-4 w-4 text-caption/60" aria-hidden="true" />
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-heading">{genre.title}</p>
            <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Genre album list ─────────────────────────────────────────────────────────

function GenreAlbumList({
  genre,
  onSelectAlbum,
  onBack,
}: {
  genre: string
  onSelectAlbum: (album: SonosGenreAlbum) => void
  onBack: () => void
}) {
  const { data: albums, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-genre-albums', genre],
    queryFn: () => api.sonos.getGenreAlbums(genre),
    staleTime: 5 * 60_000,
  })

  return (
    <div>
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

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load albums'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && albums && albums.length > 0 && (
        <ul className="-mx-4">
          {albums.map((album: SonosGenreAlbum) => (
            <li key={album.objectId}>
              <button
                type="button"
                onClick={() => onSelectAlbum(album)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left',
                  'transition-colors hover:bg-[var(--bg-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'min-h-[44px]',
                )}
              >
                <AlbumArt uri={album.albumArtUri} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-heading">{album.name}</p>
                  <p className="truncate text-xs text-caption">{album.artist}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !isError && (!albums || albums.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No albums found in {genre}</p>
        </div>
      )}
    </div>
  )
}

// ── Genre album tracks ───────────────────────────────────────────────────────

function GenreAlbumTracks({
  album,
  speaker,
  onBack,
}: {
  album: SonosGenreAlbum
  speaker: string | null
  onBack: () => void
}) {
  const { toast } = useToast()
  const { data: tracks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-genre-album-tracks', album.objectId],
    queryFn: () => api.sonos.getGenreAlbumTracks(album.objectId),
    staleTime: 5 * 60_000,
  })

  const playAlbum = useMutation({
    mutationFn: () => api.sonos.playUri(speaker!, album.objectId),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to albums"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <AlbumArt uri={album.albumArtUri} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-heading">{album.name}</h2>
          <p className="truncate text-xs text-caption">{album.artist}</p>
        </div>
        <button
          type="button"
          disabled={!speaker || playAlbum.isPending}
          onClick={() => playAlbum.mutate()}
          aria-label={`Play album ${album.name}`}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fairy-500',
            'text-white transition-colors hover:bg-fairy-400',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <Play className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {isLoading && <ListSkeleton count={5} />}

      {isError && (
        <ErrorState
          message={(error as Error).message ?? 'Failed to load tracks'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && tracks && tracks.length > 0 && (
        <ul className="-mx-4">
          {tracks.map((track, i) => (
            <TrackRow key={track.uri + ':' + i} track={track} speaker={speaker} />
          ))}
        </ul>
      )}

      {!isLoading && !isError && (!tracks || tracks.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No tracks found</p>
        </div>
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

  if (isLoading) return <ListSkeleton count={5} />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Search failed'}
        onRetry={() => refetch()}
      />
    )
  }

  const totalResults = (data?.tracks?.length ?? 0)

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
    <ul className="-mx-4">
      {data.tracks.map((track, i) => (
        <TrackRow key={track.uri + ':' + i} track={track} speaker={speaker} />
      ))}
    </ul>
  )
}

// ── NasBrowseView ─────────────────────────────────────────────────────────────

interface NasBrowseViewProps {
  searchQuery: string
  targetSpeaker?: string | null
}

export function NasBrowseView({ searchQuery, targetSpeaker }: NasBrowseViewProps) {
  const [view, setView] = useState<NasView>('home')
  const [browseMode, setBrowseMode] = useState<BrowseMode>('genres')
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<SonosGenreAlbum | null>(null)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [selectedGenreAlbum, setSelectedGenreAlbum] = useState<SonosGenreAlbum | null>(null)
  const firstSpeaker = useFirstSpeaker()
  const speaker = targetSpeaker ?? firstSpeaker

  const debouncedQuery = useDebounce(searchQuery.trim(), 300)
  const isSearching = debouncedQuery.length > 0

  function handleSelectArtist(name: string) {
    setSelectedArtist(name)
    setView('artist-detail')
  }

  function handleSelectAlbum(album: SonosGenreAlbum) {
    setSelectedAlbum(album)
    setView('album-detail')
  }

  function handleSelectGenre(genre: string) {
    setSelectedGenre(genre)
    setView('genre-albums')
  }

  function handleSelectGenreAlbum(album: SonosGenreAlbum) {
    setSelectedGenreAlbum(album)
    setView('genre-album-tracks')
  }

  function handleBack() {
    if (view === 'genre-album-tracks') {
      setView('genre-albums')
      setSelectedGenreAlbum(null)
    } else if (view === 'album-detail' && selectedArtist) {
      setView('artist-detail')
      setSelectedAlbum(null)
    } else {
      setView('home')
      setSelectedArtist(null)
      setSelectedAlbum(null)
      setSelectedGenre(null)
      setSelectedGenreAlbum(null)
    }
  }

  if (isSearching) {
    return <SearchResults query={debouncedQuery} speaker={speaker} />
  }

  if (view === 'genre-album-tracks' && selectedGenreAlbum) {
    return (
      <GenreAlbumTracks
        album={selectedGenreAlbum}
        speaker={speaker}
        onBack={handleBack}
      />
    )
  }

  if (view === 'genre-albums' && selectedGenre) {
    return (
      <GenreAlbumList
        genre={selectedGenre}
        onSelectAlbum={handleSelectGenreAlbum}
        onBack={handleBack}
      />
    )
  }

  if (view === 'album-detail' && selectedAlbum) {
    return (
      <AlbumDetail
        album={selectedAlbum}
        speaker={speaker}
        onBack={handleBack}
      />
    )
  }

  if (view === 'artist-detail' && selectedArtist) {
    return (
      <ArtistDetail
        artist={selectedArtist}
        speaker={speaker}
        onBack={handleBack}
        onSelectAlbum={handleSelectAlbum}
      />
    )
  }

  return (
    <div>
      <BrowseModeTabs mode={browseMode} onChangeMode={setBrowseMode} />
      {browseMode === 'genres' && <GenreList onSelectGenre={handleSelectGenre} />}
      {browseMode === 'artists' && <ArtistList onSelectArtist={handleSelectArtist} />}
      {browseMode === 'albums' && <AlbumList onSelectAlbum={handleSelectAlbum} />}
    </div>
  )
}
