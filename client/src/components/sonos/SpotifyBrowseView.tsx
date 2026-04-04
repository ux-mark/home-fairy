import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDown01,
  ArrowDownAZ,
  ArrowLeft,
  ChevronRight,
  Clock,
  Disc3,
  Heart,
  ImageOff,
  ListEnd,
  ListStart,
  Mic2,
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
  SpotifyAlbum,
  SpotifyAlbumTrack,
  SpotifyShow,
  SpotifyEpisode,
  SpotifyArtist,
} from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type SpotifyView = 'home' | 'playlist-detail' | 'album-detail' | 'show-detail' | 'artist-detail'
type BrowseMode = 'playlists' | 'podcasts' | 'albums' | 'artists' | 'songs'
type PlaylistSort = 'recent' | 'a-z' | 'z-a'

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

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
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
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-4 w-4 text-caption/40" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

// ── Skeleton helpers ─────────────────────────────────────────────────────────

function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-12 w-12 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function TrackListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading tracks">
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
      className="mb-4 flex gap-2 overflow-x-auto pb-0.5"
    >
      {(['playlists', 'podcasts', 'albums', 'artists', 'songs'] as const).map(m => (
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
          {m === 'playlists' ? 'Playlists' : m === 'podcasts' ? 'Podcasts' : m === 'albums' ? 'Albums' : m === 'artists' ? 'Artists' : 'Songs'}
        </button>
      ))}
    </div>
  )
}

// ── Three-dot menu (shared) ───────────────────────────────────────────────────

function TrackMenu({
  label,
  onPlayNext,
  onAddToQueue,
  onAddToFavourites,
  disabled,
}: {
  label: string
  onPlayNext: () => void
  onAddToQueue: () => void
  onAddToFavourites: () => void
  disabled: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setMenuOpen(v => !v)}
        onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
        aria-label={`More options for ${label}`}
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
              onClick={() => { setMenuOpen(false); onPlayNext() }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
            >
              <ListStart className="h-4 w-4 shrink-0" aria-hidden="true" />
              Play next
            </button>
          </li>
          <li role="none">
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onAddToQueue() }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
            >
              <ListEnd className="h-4 w-4 shrink-0" aria-hidden="true" />
              Add to queue
            </button>
          </li>
          <li role="none">
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onAddToFavourites() }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
            >
              <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
              Add to favourites
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

// ── Spotify track row ─────────────────────────────────────────────────────────

function SpotifyTrackRow({ track, speaker }: { track: SpotifyTrack; speaker: string | null }) {
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

        <TrackMenu
          label={track.name}
          disabled={!speaker}
          onPlayNext={() => playNext.mutate()}
          onAddToQueue={() => addToQueue.mutate()}
          onAddToFavourites={() => addToFavourites.mutate()}
        />
      </div>
    </li>
  )
}

// ── Spotify album track row ───────────────────────────────────────────────────

function SpotifyAlbumTrackRow({
  track,
  speaker,
}: {
  track: SpotifyAlbumTrack
  speaker: string | null
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
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span
        className="w-6 shrink-0 text-right text-xs tabular-nums text-caption/50"
        aria-label={`Track ${track.track_number}`}
      >
        {track.track_number}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{track.name}</p>
        <p className="truncate text-xs text-caption">{artistNames}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="mr-1 text-xs text-caption/70">{formatDuration(track.duration_ms)}</span>

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

        <TrackMenu
          label={track.name}
          disabled={!speaker}
          onPlayNext={() => playNext.mutate()}
          onAddToQueue={() => addToQueue.mutate()}
          onAddToFavourites={() => addToFavourites.mutate()}
        />
      </div>
    </li>
  )
}

// ── Episode row ───────────────────────────────────────────────────────────────

function EpisodeRow({
  episode,
  speaker,
}: {
  episode: SpotifyEpisode
  speaker: string | null
}) {
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
      <CoverArt images={episode.images} size={48} />

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

        <TrackMenu
          label={episode.name}
          disabled={!speaker}
          onPlayNext={() => playNext.mutate()}
          onAddToQueue={() => addToQueue.mutate()}
          onAddToFavourites={() => addToFavourites.mutate()}
        />
      </div>
    </li>
  )
}

// ── Playlist list ─────────────────────────────────────────────────────────────

const PLAYLIST_SORT_OPTIONS: Array<{ value: PlaylistSort; label: string; icon: typeof Clock }> = [
  { value: 'recent', label: 'Recently added', icon: Clock },
  { value: 'a-z', label: 'A – Z', icon: ArrowDownAZ },
  { value: 'z-a', label: 'Z – A', icon: ArrowDown01 },
]

function sortPlaylists(playlists: SpotifyPlaylist[], sort: PlaylistSort): SpotifyPlaylist[] {
  if (sort === 'recent') return playlists
  const sorted = [...playlists].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return sort === 'z-a' ? sorted.reverse() : sorted
}

function PlaylistList({ onSelect }: { onSelect: (playlist: SpotifyPlaylist) => void }) {
  const [sort, setSort] = useState<PlaylistSort>('recent')
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-playlists'],
    queryFn: () => api.spotify.getPlaylists(),
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Spotify unavailable"
        message={(error as Error).message ?? 'Could not load playlists. Check your internet connection and try again.'}
        onRetry={() => refetch()}
      />
    )
  }

  const playlists = sortPlaylists(data?.items ?? [], sort)

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
    <div>
      <div className="mb-2 flex items-center justify-end px-1">
        <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-secondary)] p-0.5">
          {PLAYLIST_SORT_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isActive = sort === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSort(opt.value)}
                title={opt.label}
                aria-label={`Sort by ${opt.label}`}
                aria-pressed={isActive}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fairy-500',
                  isActive
                    ? 'bg-[var(--bg-primary)] text-heading shadow-sm'
                    : 'text-caption hover:text-heading',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      <ul className="-mx-4">
      {playlists.map(playlist => (
        <li key={playlist.id}>
          <button
            type="button"
            onClick={() => onSelect(playlist)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-2.5 text-left',
              'transition-colors hover:bg-[var(--bg-secondary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
            )}
          >
            <CoverArt images={playlist.images} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-heading">{playlist.name}</p>
              <p className="text-xs text-caption">
                {playlist.tracks.total} {playlist.tracks.total === 1 ? 'track' : 'tracks'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
    </div>
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
        <CoverArt images={playlist.images} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">{playlist.name}</h2>
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

// ── Album list ────────────────────────────────────────────────────────────────

function AlbumList({ onSelect }: { onSelect: (album: SpotifyAlbum) => void }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-saved-albums'],
    queryFn: () => api.spotify.getSavedAlbums(),
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Could not load albums"
        message={(error as Error).message ?? 'Failed to load your saved albums. Try again.'}
        onRetry={() => refetch()}
      />
    )
  }

  const albums = (data?.items ?? []).map(item => item.album)

  if (albums.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Disc3 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No saved albums</p>
          <p className="mt-1 max-w-xs text-xs text-caption">
            Save albums in Spotify to browse them here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="-mx-4">
      {albums.map(album => (
        <li key={album.id}>
          <button
            type="button"
            onClick={() => onSelect(album)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-2.5 text-left',
              'transition-colors hover:bg-[var(--bg-secondary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
            )}
          >
            <CoverArt images={album.images} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-heading">{album.name}</p>
              <p className="truncate text-xs text-caption">
                {album.artists.map(a => a.name).join(', ')}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Album detail ──────────────────────────────────────────────────────────────

function AlbumDetail({
  album,
  speaker,
  onBack,
}: {
  album: SpotifyAlbum
  speaker: string | null
  onBack: () => void
}) {
  const { toast } = useToast()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-album-tracks', album.id],
    queryFn: () => api.spotify.getAlbumTracks(album.id),
    staleTime: 5 * 60_000,
  })

  const playAlbum = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, album.uri, 'now'),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  const tracks = data?.items ?? []

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
        <CoverArt images={album.images} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">{album.name}</h2>
          <p className="truncate text-xs text-caption">
            {album.artists.map(a => a.name).join(', ')}
          </p>
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
            <SpotifyAlbumTrackRow key={track.id + ':' + i} track={track} speaker={speaker} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Show (podcast) list ───────────────────────────────────────────────────────

function ShowList({ onSelect }: { onSelect: (show: SpotifyShow) => void }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-saved-shows'],
    queryFn: () => api.spotify.getSavedShows(),
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Could not load podcasts"
        message={(error as Error).message ?? 'Failed to load your saved podcasts. Try again.'}
        onRetry={() => refetch()}
      />
    )
  }

  const shows = (data?.items ?? []).map(item => item.show)

  if (shows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Mic2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No saved podcasts</p>
          <p className="mt-1 max-w-xs text-xs text-caption">
            Follow podcasts in Spotify to browse them here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="-mx-4">
      {shows.map(show => (
        <li key={show.id}>
          <button
            type="button"
            onClick={() => onSelect(show)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-2.5 text-left',
              'transition-colors hover:bg-[var(--bg-secondary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
            )}
          >
            <CoverArt images={show.images} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-heading">{show.name}</p>
              <p className="truncate text-xs text-caption">
                {show.publisher}
                {show.total_episodes > 0 && ` · ${show.total_episodes} ${show.total_episodes === 1 ? 'episode' : 'episodes'}`}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Show detail ───────────────────────────────────────────────────────────────

function ShowDetail({
  show,
  speaker,
  onBack,
}: {
  show: SpotifyShow
  speaker: string | null
  onBack: () => void
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-show-episodes', show.id],
    queryFn: () => api.spotify.getShowEpisodes(show.id),
    staleTime: 5 * 60_000,
  })

  const episodes = data?.items ?? []

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to podcasts"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)]',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <CoverArt images={show.images} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">{show.name}</h2>
          <p className="truncate text-xs text-caption">{show.publisher}</p>
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

// ── Songs (liked tracks) ──────────────────────────────────────────────────────

function SongsList({ speaker }: { speaker: string | null }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-saved-tracks'],
    queryFn: () => api.spotify.getSavedTracks(),
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <TrackListSkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Could not load liked songs"
        message={(error as Error).message ?? 'Failed to load your liked songs. Try again.'}
        onRetry={() => refetch()}
      />
    )
  }

  const tracks = (data?.items ?? []).map(item => item.track).filter((t): t is SpotifyTrack => t !== null)

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No liked songs</p>
          <p className="mt-1 max-w-xs text-xs text-caption">
            Like songs in Spotify to find them here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="-mx-4">
      {tracks.map((track, i) => (
        <SpotifyTrackRow key={track.id + ':' + i} track={track} speaker={speaker} />
      ))}
    </ul>
  )
}

// ── Artist list ───────────────────────────────────────────────────────────────

function ArtistList({ onSelect }: { onSelect: (artist: SpotifyArtist) => void }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-artists'],
    queryFn: () => api.spotify.getArtists(),
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Could not load artists"
        message={(error as Error).message ?? 'Failed to load your artists. Try again.'}
        onRetry={() => refetch()}
      />
    )
  }

  const artists = data?.items ?? []

  return (
    <div>
      {data?.scope_warning && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          <p className="font-medium">Limited results</p>
          <p className="mt-0.5 text-xs">{data.scope_warning} Go to Settings to reconnect Spotify.</p>
        </div>
      )}
      {artists.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Mic2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-heading">No artists found</p>
            <p className="mt-1 max-w-xs text-xs text-caption">
              Follow artists or listen to music in Spotify to see them here.
            </p>
          </div>
        </div>
      ) : (
        <ul className="-mx-4">
          {artists.map(artist => (
            <li key={artist.id}>
              <button
                type="button"
                onClick={() => onSelect(artist)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left',
                  'transition-colors hover:bg-[var(--bg-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'min-h-[44px]',
                )}
              >
                <CoverArt images={artist.images} size={48} rounded="rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
                  <p className="truncate text-xs text-caption">
                    {artist.followers.total.toLocaleString()} followers
                    {artist.genres.length > 0 && ` · ${artist.genres[0]}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Artist detail ─────────────────────────────────────────────────────────────

function ArtistDetail({
  artist,
  speaker,
  onBack,
  onSelectAlbum,
}: {
  artist: SpotifyArtist
  speaker: string | null
  onBack: () => void
  onSelectAlbum: (album: SpotifyAlbum) => void
}) {
  const { toast } = useToast()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-artist-albums', artist.id],
    queryFn: () => api.spotify.getArtistAlbums(artist.id),
    staleTime: 5 * 60_000,
  })

  const playArtist = useMutation({
    mutationFn: () => api.sonos.playSpotify(speaker!, artist.uri, 'now'),
    onSuccess: () => toast({ message: `Playing ${artist.name}` }),
    onError: () => toast({ message: 'Failed to play artist', type: 'error' }),
  })

  const albums = data?.items ?? []

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
        <CoverArt images={artist.images} size={44} rounded="rounded-full" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">{artist.name}</h2>
          <p className="truncate text-xs text-caption">
            {artist.followers.total.toLocaleString()} followers
          </p>
        </div>
        <button
          type="button"
          disabled={!speaker || playArtist.isPending}
          onClick={() => playArtist.mutate()}
          aria-label={`Play ${artist.name}`}
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
          message={(error as Error).message ?? 'Failed to load albums'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && albums.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Disc3 className="h-10 w-10 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No albums found</p>
        </div>
      )}

      {albums.length > 0 && (
        <ul className="-mx-4">
          {albums.map(album => (
            <li key={album.id}>
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
                <CoverArt images={album.images} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-heading">{album.name}</p>
                  <p className="truncate text-xs text-caption">
                    {album.album_type.charAt(0).toUpperCase() + album.album_type.slice(1)} · {album.release_date.slice(0, 4)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Search result helpers ─────────────────────────────────────────────────────

type SpotifySearchAlbum = {
  id: string
  name: string
  images: Array<{ url: string; height: number | null; width: number | null }>
  artists: Array<{ id: string; name: string }>
  uri: string
  external_urls: { spotify: string }
}

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

  const trackItems = (data?.tracks?.items ?? []).filter((t): t is SpotifyTrack => t !== null)
  const playlistItems = (data?.playlists?.items ?? []).filter((p): p is SpotifyPlaylist => p !== null)
  const albumItems = (data?.albums?.items ?? []).filter((a): a is SpotifySearchAlbum => a !== null)
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
  const [view, setView] = useState<SpotifyView>('home')
  const [browseMode, setBrowseMode] = useState<BrowseMode>('playlists')
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<SpotifyAlbum | null>(null)
  const [selectedShow, setSelectedShow] = useState<SpotifyShow | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null)

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

  function handleSelectAlbum(album: SpotifyAlbum) {
    setSelectedAlbum(album)
    setView('album-detail')
  }

  function handleSelectShow(show: SpotifyShow) {
    setSelectedShow(show)
    setView('show-detail')
  }

  function handleSelectArtist(artist: SpotifyArtist) {
    setSelectedArtist(artist)
    setView('artist-detail')
  }

  function handleSelectArtistAlbum(album: SpotifyAlbum) {
    setSelectedAlbum(album)
    setView('album-detail')
  }

  function handleBack() {
    if (view === 'album-detail' && selectedArtist) {
      setView('artist-detail')
      setSelectedAlbum(null)
    } else {
      setView('home')
      setSelectedPlaylist(null)
      setSelectedAlbum(null)
      setSelectedShow(null)
      setSelectedArtist(null)
    }
  }

  if (statusLoading) {
    return <ListSkeleton />
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

  if (view === 'album-detail' && selectedAlbum) {
    return (
      <AlbumDetail album={selectedAlbum} speaker={speaker} onBack={handleBack} />
    )
  }

  if (view === 'show-detail' && selectedShow) {
    return (
      <ShowDetail show={selectedShow} speaker={speaker} onBack={handleBack} />
    )
  }

  if (view === 'artist-detail' && selectedArtist) {
    return (
      <ArtistDetail
        artist={selectedArtist}
        speaker={speaker}
        onBack={handleBack}
        onSelectAlbum={handleSelectArtistAlbum}
      />
    )
  }

  return (
    <div>
      <BrowseModeTabs mode={browseMode} onChangeMode={m => { setBrowseMode(m); setView('home') }} />
      {browseMode === 'playlists' && <PlaylistList onSelect={handleSelectPlaylist} />}
      {browseMode === 'podcasts' && <ShowList onSelect={handleSelectShow} />}
      {browseMode === 'albums' && <AlbumList onSelect={handleSelectAlbum} />}
      {browseMode === 'artists' && <ArtistList onSelect={handleSelectArtist} />}
      {browseMode === 'songs' && <SongsList speaker={speaker} />}
    </div>
  )
}
