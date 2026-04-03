import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Heart,
  ImageOff,
  ListEnd,
  ListStart,
  MoreVertical,
  Music2,
  Play,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type {
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyPlaylistTrackItem,
} from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type SpotifyView = 'playlists' | 'playlist-detail'

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

function formatDuration(ms: number): string {
  const totalSecs = Math.round(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ── Cover art ─────────────────────────────────────────────────────────────────

function CoverArt({ images, size = 40, rounded = 'rounded-md' }: {
  images?: Array<{ url: string; height: number | null; width: number | null }>
  size?: number
  rounded?: string
}) {
  const [failed, setFailed] = useState(false)
  const url = images?.[0]?.url
  return (
    <div
      className={cn('shrink-0 overflow-hidden bg-[var(--bg-tertiary)]', rounded)}
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img
          src={url}
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

// ── Skeleton helpers ─────────────────────────────────────────────────────────

function PlaylistGridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3"
      aria-busy="true"
      aria-label="Loading playlists"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl bg-[var(--bg-secondary)] p-3">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-3.5 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
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
  title = 'Something went wrong',
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

// ── Connect Spotify prompt ────────────────────────────────────────────────────

function ConnectSpotifyPrompt({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1DB954]/10">
          <Music2 className="h-8 w-8 text-[#1DB954]" aria-hidden="true" />
        </div>
        <div>
          <p className="text-base font-semibold text-heading">Spotify not configured</p>
          <p className="mt-1 max-w-xs text-sm text-caption">
            Add your Spotify Developer credentials to the server .env file, then restart.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1DB954]/10">
        <Music2 className="h-8 w-8 text-[#1DB954]" aria-hidden="true" />
      </div>
      <div>
        <p className="text-base font-semibold text-heading">Connect Spotify</p>
        <p className="mt-1 max-w-xs text-sm text-caption">
          Link your Spotify account to browse playlists and control playback.
        </p>
      </div>
      <a
        href="/api/spotify/auth"
        className={cn(
          'flex items-center gap-2 rounded-xl bg-[#1DB954] px-6 py-3 text-sm font-semibold text-white',
          'transition-opacity hover:opacity-90',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        Connect Spotify
      </a>
    </div>
  )
}

// ── Playlist card ─────────────────────────────────────────────────────────────

function PlaylistCard({
  playlist,
  onSelect,
}: {
  playlist: SpotifyPlaylist
  onSelect: (playlist: SpotifyPlaylist) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(playlist)}
      className={cn(
        'flex flex-col gap-2 rounded-xl bg-[var(--bg-secondary)] p-3',
        'text-left transition-colors hover:bg-[var(--bg-tertiary)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        'w-full',
      )}
    >
      <CoverArt images={playlist.images} size={undefined} rounded="aspect-square w-full rounded-lg" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-heading">{playlist.name}</p>
        <p className="mt-0.5 text-xs text-caption">
          {playlist.tracks.total} {playlist.tracks.total === 1 ? 'track' : 'tracks'}
        </p>
      </div>
    </button>
  )
}

// ── Playlist grid ─────────────────────────────────────────────────────────────

function PlaylistGrid({ onSelect }: { onSelect: (playlist: SpotifyPlaylist) => void }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-playlists'],
    queryFn: () => api.spotify.getPlaylists(),
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <PlaylistGridSkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Spotify unavailable"
        message={(error as Error).message ?? 'Could not load playlists. Check your internet connection and try again.'}
        onRetry={() => refetch()}
      />
    )
  }

  const playlists = data?.items ?? []

  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No playlists found</p>
          <p className="mt-1 max-w-xs text-xs text-caption">
            Your Spotify account doesn't have any playlists yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {playlists.map(playlist => (
        <PlaylistCard key={playlist.id} playlist={playlist} onSelect={onSelect} />
      ))}
    </div>
  )
}

// ── Spotify track row ─────────────────────────────────────────────────────────

function SpotifyTrackRow({ track, speaker }: { track: SpotifyTrack; speaker: string | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)

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
    <li className="flex items-center gap-3 px-4 py-2.5">
      <CoverArt images={track.album.images} size={40} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{track.name}</p>
        <p className="truncate text-xs text-caption">
          {[artistNames, track.album.name].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="mr-1 text-xs text-caption/70">{formatDuration(track.duration_ms)}</span>

        {/* Play now — universally recognisable icon, icon-only acceptable */}
        <button
          type="button"
          disabled={!speaker || playNow.isPending}
          onClick={() => playNow.mutate()}
          aria-label={`Play ${track.name}`}
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
            aria-label={`More options for ${track.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-lg',
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

// ── Playlist detail ───────────────────────────────────────────────────────────

function PlaylistDetail({
  playlist,
  speaker,
  onBack,
}: {
  playlist: SpotifyPlaylist
  speaker: string | null
  onBack: () => void
}) {
  const { toast } = useToast()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-playlist-tracks', playlist.id],
    queryFn: () => api.spotify.getPlaylistTracks(playlist.id),
    staleTime: 5 * 60_000,
  })

  const playPlaylist = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, playlist.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${playlist.name}"` }),
    onError: () => toast({ message: 'Failed to play playlist', type: 'error' }),
  })

  const tracks = (data?.items ?? [])
    .map((item: SpotifyPlaylistTrackItem) => item.track)
    .filter((t): t is SpotifyTrack => t !== null)

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to playlists"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug text-heading">{playlist.name}</h2>
          <p className="text-xs text-caption">
            {playlist.tracks.total} {playlist.tracks.total === 1 ? 'track' : 'tracks'}
          </p>
        </div>
        <button
          type="button"
          disabled={!speaker || playPlaylist.isPending}
          onClick={() => playPlaylist.mutate()}
          aria-label={`Play playlist ${playlist.name}`}
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

      {/* Content */}
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
            <SpotifyTrackRow key={track.id + ':' + i} track={track} speaker={speaker} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Search result playlist row ────────────────────────────────────────────────

function SearchResultPlaylists({
  playlists,
  speaker,
}: {
  playlists: SpotifyPlaylist[]
  speaker: string | null
}) {
  return (
    <section aria-label="Playlists">
      <h3 className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-caption">
        Playlists
      </h3>
      <ul>
        {playlists.map(pl => (
          <SearchPlaylistRow key={pl.id} playlist={pl} speaker={speaker} />
        ))}
      </ul>
    </section>
  )
}

function SearchPlaylistRow({
  playlist,
  speaker,
}: {
  playlist: SpotifyPlaylist
  speaker: string | null
}) {
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, playlist.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${playlist.name}"` }),
    onError: () => toast({ message: 'Failed to play playlist', type: 'error' }),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <CoverArt images={playlist.images} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{playlist.name}</p>
        <p className="truncate text-xs text-caption">
          {playlist.tracks.total} {playlist.tracks.total === 1 ? 'track' : 'tracks'}
        </p>
      </div>
      <button
        type="button"
        disabled={!speaker || playNow.isPending}
        onClick={() => playNow.mutate()}
        aria-label={`Play playlist ${playlist.name}`}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
          'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'disabled:opacity-40',
        )}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Search result album row ───────────────────────────────────────────────────

type SpotifySearchAlbum = {
  id: string
  name: string
  images: Array<{ url: string; height: number | null; width: number | null }>
  artists: Array<{ id: string; name: string }>
  uri: string
  external_urls: { spotify: string }
}

function SearchResultAlbums({
  albums,
  speaker,
}: {
  albums: SpotifySearchAlbum[]
  speaker: string | null
}) {
  return (
    <section aria-label="Albums">
      <h3 className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-caption">
        Albums
      </h3>
      <ul>
        {albums.map((album, i) => (
          <SearchAlbumRow key={album.id + ':album:' + i} album={album} speaker={speaker} />
        ))}
      </ul>
    </section>
  )
}

function SearchAlbumRow({
  album,
  speaker,
}: {
  album: SpotifySearchAlbum
  speaker: string | null
}) {
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <CoverArt images={album.images} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{album.name}</p>
        <p className="truncate text-xs text-caption">
          {album.artists.map(a => a.name).join(', ')}
        </p>
      </div>
      <button
        type="button"
        disabled={!speaker || playNow.isPending}
        onClick={() => playNow.mutate()}
        aria-label={`Play album ${album.name}`}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
          'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'disabled:opacity-40',
        )}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Spotify search results ────────────────────────────────────────────────────

function SpotifySearchResults({ query, speaker }: { query: string; speaker: string | null }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-search', query],
    queryFn: () => api.spotify.search(query),
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

  const trackItems = data?.tracks?.items ?? []
  const playlistItems = data?.playlists?.items ?? []
  const albumItems = data?.albums?.items ?? []
  const totalResults = trackItems.length + playlistItems.length + albumItems.length

  if (totalResults === 0) {
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
      {trackItems.length > 0 && (
        <section aria-label="Tracks">
          <h3 className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-caption">
            Tracks
          </h3>
          <ul>
            {trackItems.map((track, i) => (
              <SpotifyTrackRow key={track.id + ':track:' + i} track={track} speaker={speaker} />
            ))}
          </ul>
        </section>
      )}
      {playlistItems.length > 0 && (
        <SearchResultPlaylists playlists={playlistItems} speaker={speaker} />
      )}
      {albumItems.length > 0 && (
        <SearchResultAlbums albums={albumItems} speaker={speaker} />
      )}
    </div>
  )
}

// ── SpotifyBrowseView ─────────────────────────────────────────────────────────

interface SpotifyBrowseViewProps {
  searchQuery: string
  targetSpeaker?: string | null
}

export function SpotifyBrowseView({ searchQuery, targetSpeaker }: SpotifyBrowseViewProps) {
  const [view, setView] = useState<SpotifyView>('playlists')
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null)
  const firstSpeaker = useFirstSpeaker()
  const speaker = targetSpeaker ?? firstSpeaker

  const debouncedQuery = useDebounce(searchQuery.trim(), 300)
  const isSearching = debouncedQuery.length > 0

  const {
    data: statusData,
    isLoading: statusLoading,
    isError: statusIsError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: api.spotify.getStatus,
    staleTime: 30_000,
    retry: 1,
  })

  function handleSelectPlaylist(playlist: SpotifyPlaylist) {
    setSelectedPlaylist(playlist)
    setView('playlist-detail')
  }

  function handleBack() {
    setView('playlists')
    setSelectedPlaylist(null)
  }

  if (statusLoading) {
    return <PlaylistGridSkeleton />
  }

  if (statusIsError) {
    return (
      <ErrorState
        title="Spotify unavailable"
        message="Could not reach Spotify. Check your internet connection and try again."
        onRetry={() => refetchStatus()}
      />
    )
  }

  if (!statusData?.connected) {
    return <ConnectSpotifyPrompt configured={statusData?.configured ?? false} />
  }

  if (isSearching) {
    return <SpotifySearchResults query={debouncedQuery} speaker={speaker} />
  }

  if (view === 'playlist-detail' && selectedPlaylist) {
    return (
      <PlaylistDetail playlist={selectedPlaylist} speaker={speaker} onBack={handleBack} />
    )
  }

  return <PlaylistGrid onSelect={handleSelectPlaylist} />
}
