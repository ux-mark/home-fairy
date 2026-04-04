import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDown01,
  ArrowDownAZ,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Disc3,
  Globe,
  Heart,
  Loader2,
  ListEnd,
  ListStart,
  MapPin,
  Mic2,
  MoreVertical,
  Music2,
  Pause,
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
  EnrichedAlbumItem,
  EnrichmentProgress,
} from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { Accordion } from '@/components/ui/Accordion'
import { cn } from '@/lib/utils'
import { CountryList, CountryArtistList, type CountryArtistItem } from './CountryBrowse'
import { ArtworkImage } from './ArtworkImage'
import { ActiveTrackIndicator } from './ActiveTrackIndicator'
import { AlbumPlaylistMenu } from './AlbumPlaylistMenu'

// ── Types ─────────────────────────────────────────────────────────────────────

type SpotifyView = 'home' | 'playlist-detail' | 'album-detail' | 'show-detail' | 'artist-detail' | 'country-artists'
type BrowseMode = 'playlists' | 'countries' | 'podcasts' | 'albums' | 'artists' | 'songs'
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

function useNowPlayingTrack(speaker: string | null) {
  const { data: nowPlaying } = useQuery({
    queryKey: ['sonos', 'now-playing'],
    queryFn: api.sonos.getNowPlaying,
    refetchInterval: 5_000,
    staleTime: 4_000,
    enabled: !!speaker,
  })
  if (!speaker || !nowPlaying) return null
  const entry = nowPlaying.find(e => e.speakerName === speaker || e.roomName === speaker)
  return entry?.state ?? null
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
      {(['playlists', 'countries', 'podcasts', 'albums', 'artists', 'songs'] as const).map(m => (
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
          {m === 'playlists' ? 'Playlists' : m === 'countries' ? 'Countries' : m === 'podcasts' ? 'Podcasts' : m === 'albums' ? 'Albums' : m === 'artists' ? 'Artists' : 'Songs'}
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
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="shrink-0">
      <button
        ref={menuBtnRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (menuOpen) {
            setMenuOpen(false)
          } else {
            if (menuBtnRef.current) {
              const rect = menuBtnRef.current.getBoundingClientRect()
              const showAbove = rect.bottom + 160 > window.innerHeight
              setMenuPos({
                top: showAbove ? rect.top - 160 - 4 : rect.bottom + 4,
                right: window.innerWidth - rect.right,
              })
            }
            setMenuOpen(true)
          }
        }}
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
      {menuOpen && menuPos && createPortal(
        <ul
          role="menu"
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
          className="z-[200] min-w-[160px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
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
        </ul>,
        document.body,
      )}
    </div>
  )
}

// ── Spotify track row ─────────────────────────────────────────────────────────

function SpotifyTrackRow({
  track,
  speaker,
  isActive = false,
  isPlaying = false,
}: {
  track: SpotifyTrack
  speaker: string | null
  isActive?: boolean
  isPlaying?: boolean
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
      album_art_uri: track.album.images?.[0]?.url,
    }),
    onSuccess: () => toast({ message: `Added "${track.name}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  const artistNames = track.artists.map(a => a.name).join(', ')

  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', isActive && 'bg-fairy-500/10')}>
      <div className="relative shrink-0">
        <ArtworkImage images={track.album.images} size={40} />
        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40">
            <ActiveTrackIndicator isActive={isActive} isPlaying={isPlaying} />
          </div>
        )}
      </div>

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
  isActive = false,
  isPlaying = false,
}: {
  track: SpotifyAlbumTrack
  speaker: string | null
  isActive?: boolean
  isPlaying?: boolean
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
    <li className={cn('flex items-center gap-3 px-4 py-2.5', isActive && 'bg-fairy-500/10')}>
      <div className="w-6 shrink-0 flex items-center justify-end">
        {isActive
          ? <ActiveTrackIndicator isActive={isActive} isPlaying={isPlaying} />
          : (
            <span
              className="text-right text-xs tabular-nums text-caption/50"
              aria-label={`Track ${track.track_number}`}
            >
              {track.track_number}
            </span>
          )
        }
      </div>

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
            <ArtworkImage images={playlist.images} size={48} />
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

  const pausePlaylist = useMutation({
    mutationFn: () => api.sonos.pause(speaker!),
    onSuccess: () => { /* state updates via polling */ },
    onError: () => toast({ message: 'Failed to pause', type: 'error' }),
  })

  const nowPlayingState = useNowPlayingTrack(speaker)
  const isPlaying = nowPlayingState?.playbackState === 'PLAYING'
  const currentUri = nowPlayingState?.currentTrack?.uri

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
        <ArtworkImage images={playlist.images} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">{playlist.name}</h2>
          <p className="text-xs text-caption">
            {playlist.tracks.total} {playlist.tracks.total === 1 ? 'track' : 'tracks'}
          </p>
        </div>
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

// ── Album list ────────────────────────────────────────────────────────────────

type AlbumSort = 'recent' | 'a-z' | 'country'

function EnrichmentStatusBar() {
  const { data: progress, refetch } = useQuery({
    queryKey: ['enrichment-status'],
    queryFn: () => api.spotify.getEnrichmentStatus(),
    staleTime: 2_000,
    refetchInterval: (query) => {
      const d = query.state.data as EnrichmentProgress | undefined
      return d?.status === 'running' ? 2_000 : false
    },
  })
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const enrich = useMutation({
    mutationFn: () => api.spotify.enrichArtists(),
    onSuccess: (data) => {
      if (data.status === 'started') {
        toast({ message: `Enriching ${data.total} artists...` })
        refetch()
      } else if (data.status === 'already_running') {
        toast({ message: 'Enrichment already in progress' })
      } else if (data.status === 'no_artists') {
        toast({ message: 'No artists to enrich' })
      }
    },
    onError: () => toast({ message: 'Failed to start enrichment', type: 'error' }),
  })

  const cancel = useMutation({
    mutationFn: () => api.spotify.cancelEnrichment(),
    onSuccess: () => {
      toast({ message: 'Enrichment cancelled' })
      refetch()
      queryClient.invalidateQueries({ queryKey: ['spotify-enriched-albums'] })
    },
  })

  const backfill = useMutation({
    mutationFn: () => api.spotify.backfillImages(),
    onSuccess: (data) => {
      if (data.total_updated > 0) {
        toast({ message: `Updated ${data.total_updated} artist images` })
        queryClient.invalidateQueries({ queryKey: ['spotify-artist-countries'] })
        queryClient.invalidateQueries({ queryKey: ['spotify-enriched-albums'] })
        queryClient.invalidateQueries({ queryKey: ['spotify-artists'] })
      } else {
        toast({ message: 'All artist images are up to date' })
      }
    },
    onError: () => toast({ message: 'Failed to fetch artwork', type: 'error' }),
  })

  const isRunning = progress?.status === 'running'
  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0

  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={() => isRunning ? cancel.mutate() : enrich.mutate()}
        disabled={enrich.isPending || cancel.isPending}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[36px]',
          isRunning
            ? 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
            : 'bg-[var(--bg-secondary)] text-caption hover:bg-[var(--bg-tertiary)] hover:text-body',
        )}
      >
        {isRunning ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {pct}% ({progress.resolved} resolved) — Cancel
          </>
        ) : (
          <>
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            Enrich countries
          </>
        )}
      </button>
      {progress?.status === 'complete' && progress.resolved > 0 && (
        <span className="text-xs text-caption">
          {progress.resolved} of {progress.total} resolved
        </span>
      )}
      <button
        type="button"
        onClick={() => backfill.mutate()}
        disabled={backfill.isPending || isRunning}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[36px]',
          'bg-[var(--bg-secondary)] text-caption hover:bg-[var(--bg-tertiary)] hover:text-body',
          backfill.isPending && 'opacity-50',
        )}
      >
        {backfill.isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Fetching artwork...
          </>
        ) : (
          <>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Fetch artwork
          </>
        )}
      </button>
    </div>
  )
}

function groupAlbumsByCountry(
  items: EnrichedAlbumItem[],
): Array<{ country: string; countryCode: string | null; albums: EnrichedAlbumItem[] }> {
  const groups = new Map<string, EnrichedAlbumItem[]>()

  for (const item of items) {
    // Use the first artist's country (primary artist)
    const primaryCountry = item.artist_countries?.[0]
    const cc = primaryCountry?.country_code
    const hasValidCode = typeof cc === 'string' && /^[A-Z]{2}$/.test(cc)
    const key = hasValidCode ? (primaryCountry?.country_name ?? cc!) : 'Not Known'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  // Sort groups: known countries alphabetically, "Not Known" last
  const sorted = Array.from(groups.entries())
    .map(([country, albums]) => ({
      country,
      countryCode: albums[0]?.artist_countries?.[0]?.country_code ?? null,
      albums,
    }))
    .sort((a, b) => {
      if (a.country === 'Not Known') return 1
      if (b.country === 'Not Known') return -1
      return a.country.localeCompare(b.country, undefined, { sensitivity: 'base' })
    })

  return sorted
}

function AlbumList({ onSelect }: { onSelect: (album: SpotifyAlbum) => void }) {
  const [sort, setSort] = useState<AlbumSort>('recent')
  const [collapsedCountries, setCollapsedCountries] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-enriched-albums'],
    queryFn: () => api.spotify.getEnrichedAlbums(),
    staleTime: 5 * 60_000,
  })

  // Refresh enriched data when enrichment completes
  const { data: enrichStatus } = useQuery({
    queryKey: ['enrichment-status'],
    queryFn: () => api.spotify.getEnrichmentStatus(),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const d = query.state.data as EnrichmentProgress | undefined
      return d?.status === 'running' ? 3_000 : false
    },
  })

  // When enrichment transitions to complete, invalidate albums
  const prevStatus = useRef(enrichStatus?.status)
  useEffect(() => {
    if (prevStatus.current === 'running' && enrichStatus?.status === 'complete') {
      queryClient.invalidateQueries({ queryKey: ['spotify-enriched-albums'] })
    }
    prevStatus.current = enrichStatus?.status
  }, [enrichStatus?.status, queryClient])

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

  const items = data?.items ?? []

  if (items.length === 0) {
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

  const toggleCountry = (country: string) => {
    setCollapsedCountries(prev => {
      const next = new Set(prev)
      if (next.has(country)) next.delete(country)
      else next.add(country)
      return next
    })
  }

  // Sort albums
  const sortedItems = [...items]
  if (sort === 'a-z') {
    sortedItems.sort((a, b) => a.album.name.localeCompare(b.album.name, undefined, { sensitivity: 'base' }))
  }

  const hasCountryData = items.some(item =>
    item.artist_countries?.some(ac => ac.country_code !== null),
  )

  return (
    <div>
      {/* Sort + enrichment controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {([
          { value: 'recent' as const, label: 'Recent', icon: Clock },
          { value: 'a-z' as const, label: 'A – Z', icon: ArrowDownAZ },
          ...(hasCountryData ? [{ value: 'country' as const, label: 'Country', icon: MapPin }] : []),
        ]).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSort(opt.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              'min-h-[32px]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              sort === opt.value
                ? 'bg-fairy-500 text-white'
                : 'bg-[var(--bg-secondary)] text-caption hover:text-body',
            )}
          >
            <opt.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {opt.label}
          </button>
        ))}
      </div>

      <EnrichmentStatusBar />

      {sort === 'country' ? (
        // Grouped by country
        <div className="-mx-4">
          {groupAlbumsByCountry(sortedItems).map(group => {
            const isCollapsed = collapsedCountries.has(group.country)
            return (
              <div key={group.country}>
                <button
                  type="button"
                  onClick={() => toggleCountry(group.country)}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2.5 text-left',
                    'bg-[var(--bg-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]',
                    'min-h-[40px]',
                  )}
                  aria-expanded={!isCollapsed}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-fairy-500" aria-hidden="true" />
                  <span className="flex-1 text-sm font-semibold text-heading">
                    {group.country}
                  </span>
                  <span className="text-xs text-caption">{group.albums.length}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 text-caption/50 transition-transform', isCollapsed && '-rotate-90')}
                    aria-hidden="true"
                  />
                </button>
                {!isCollapsed && (
                  <ul>
                    {group.albums.map(item => (
                      <AlbumRow key={item.album.id} item={item} onSelect={onSelect} showCountry={false} />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        // Flat list
        <ul className="-mx-4">
          {sortedItems.map(item => (
            <AlbumRow key={item.album.id} item={item} onSelect={onSelect} showCountry={hasCountryData} />
          ))}
        </ul>
      )}
    </div>
  )
}

function AlbumRow({
  item,
  onSelect,
  showCountry,
}: {
  item: EnrichedAlbumItem
  onSelect: (album: SpotifyAlbum) => void
  showCountry: boolean
}) {
  const country = item.artist_countries?.[0]
  const countryLabel = country?.country_code ?? null

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.album)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left',
          'transition-colors hover:bg-[var(--bg-secondary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <ArtworkImage images={item.album.images} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-heading">{item.album.name}</p>
          <p className="truncate text-xs text-caption">
            {item.album.artists.map(a => a.name).join(', ')}
            {showCountry && countryLabel && (
              <span className="text-caption/60"> · {countryLabel}</span>
            )}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
      </button>
    </li>
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

  const pauseAlbum = useMutation({
    mutationFn: () => api.sonos.pause(speaker!),
    onSuccess: () => { /* state updates via polling */ },
    onError: () => toast({ message: 'Failed to pause', type: 'error' }),
  })

  const nowPlayingState = useNowPlayingTrack(speaker)
  const isPlaying = nowPlayingState?.playbackState === 'PLAYING'
  const currentUri = nowPlayingState?.currentTrack?.uri

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
        <ArtworkImage images={album.images} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">{album.name}</h2>
          <p className="truncate text-xs text-caption">
            {album.artists.map(a => a.name).join(', ')}
          </p>
        </div>
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
              isActive={!!currentUri && currentUri === track.uri}
              isPlaying={isPlaying}
            />
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
            <ArtworkImage images={show.images} size={48} />
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
        <ArtworkImage images={show.images} size={44} />
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
                <ArtworkImage images={artist.images} size={48} rounded="rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
                  <p className="truncate text-xs text-caption">
                    {artist.followers !== undefined && `${artist.followers.total.toLocaleString()} followers`}
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
        <ArtworkImage images={artist.images} size={44} rounded="rounded-full" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-snug text-heading">{artist.name}</h2>
          {artist.followers !== undefined && (
            <p className="truncate text-xs text-caption">
              {artist.followers.total.toLocaleString()} followers
            </p>
          )}
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
                <ArtworkImage images={album.images} size={48} />
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

type SpotifySearchArtistItem = {
  id: string
  name: string
  images: Array<{ url: string; height: number | null; width: number | null }>
  genres: string[]
  uri: string
  external_urls: { spotify: string }
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
      <ArtworkImage images={playlist.images} size={40} />
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
      <ArtworkImage images={album.images} size={40} />
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

function SearchArtistRow({
  artist,
  onSelect,
}: {
  artist: SpotifySearchArtistItem
  onSelect: (artist: SpotifyArtist) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(artist as SpotifyArtist)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left',
          'transition-colors hover:bg-[var(--bg-secondary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <ArtworkImage images={artist.images} size={40} rounded="rounded-full" fallback="user" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
          {artist.genres.length > 0 && (
            <p className="truncate text-xs text-caption">
              {artist.genres.slice(0, 2).join(', ')}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Spotify search results ────────────────────────────────────────────────────

function SpotifySearchResults({
  query,
  speaker,
  onSelectArtist,
}: {
  query: string
  speaker: string | null
  onSelectArtist: (artist: SpotifyArtist) => void
}) {
  const [artistsOpen, setArtistsOpen] = useState(true)
  const [tracksOpen, setTracksOpen] = useState(true)
  const [albumsOpen, setAlbumsOpen] = useState(true)
  const [playlistsOpen, setPlaylistsOpen] = useState(true)

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
  const artistItems = (data?.artists?.items ?? []).filter((a): a is SpotifySearchArtistItem => a !== null)
  const totalResults = trackItems.length + playlistItems.length + albumItems.length + artistItems.length

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
    <div className="flex flex-col gap-3">
      {artistItems.length > 0 && (
        <Accordion
          id="spotify-search-artists"
          title="Artists"
          open={artistsOpen}
          onToggle={() => setArtistsOpen(v => !v)}
          count={artistItems.length}
          card={false}
        >
          <ul className="-mx-4">
            {artistItems.map(artist => (
              <SearchArtistRow key={artist.id} artist={artist} onSelect={onSelectArtist} />
            ))}
          </ul>
        </Accordion>
      )}
      {trackItems.length > 0 && (
        <Accordion
          id="spotify-search-tracks"
          title="Tracks"
          open={tracksOpen}
          onToggle={() => setTracksOpen(v => !v)}
          count={trackItems.length}
          card={false}
        >
          <ul className="-mx-4">
            {trackItems.map((track, i) => (
              <SpotifyTrackRow key={track.id + ':track:' + i} track={track} speaker={speaker} />
            ))}
          </ul>
        </Accordion>
      )}
      {albumItems.length > 0 && (
        <Accordion
          id="spotify-search-albums"
          title="Albums"
          open={albumsOpen}
          onToggle={() => setAlbumsOpen(v => !v)}
          count={albumItems.length}
          card={false}
        >
          <ul className="-mx-4">
            {albumItems.map((album, i) => (
              <SearchAlbumRow key={album.id + ':album:' + i} album={album} speaker={speaker} />
            ))}
          </ul>
        </Accordion>
      )}
      {playlistItems.length > 0 && (
        <Accordion
          id="spotify-search-playlists"
          title="Playlists"
          open={playlistsOpen}
          onToggle={() => setPlaylistsOpen(v => !v)}
          count={playlistItems.length}
          card={false}
        >
          <ul className="-mx-4">
            {playlistItems.map(pl => (
              <SearchPlaylistRow key={pl.id} playlist={pl} speaker={speaker} />
            ))}
          </ul>
        </Accordion>
      )}
    </div>
  )
}

// ── SpotifyCountryList ────────────────────────────────────────────────────────

function SpotifyCountryList({
  onSelectCountry,
}: {
  onSelectCountry: (code: string, name: string) => void
}) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-artist-countries'],
    queryFn: () => api.spotify.getArtistCountries(),
    staleTime: 5 * 60_000,
  })

  const { data: enrichStatus } = useQuery({
    queryKey: ['enrichment-status'],
    queryFn: () => api.spotify.getEnrichmentStatus(),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const d = query.state.data as EnrichmentProgress | undefined
      return d?.status === 'running' ? 3_000 : false
    },
  })

  const prevStatus = useRef(enrichStatus?.status)
  useEffect(() => {
    if (prevStatus.current === 'running' && enrichStatus?.status === 'complete') {
      queryClient.invalidateQueries({ queryKey: ['spotify-artist-countries'] })
    }
    prevStatus.current = enrichStatus?.status
  }, [enrichStatus?.status, queryClient])

  const artists: CountryArtistItem[] = (data?.items ?? []).map(a => ({
    id: a.spotify_artist_id,
    name: a.artist_name,
    country_code: a.country_code,
    country_name: a.country_name,
    sub_region: a.sub_region,
    image_url: a.image_url,
  }))

  return (
    <CountryList
      artists={artists}
      isLoading={isLoading}
      isError={isError}
      error={error as Error | null}
      onRetry={() => refetch()}
      onSelectCountry={onSelectCountry}
      enrichmentStatusBar={<EnrichmentStatusBar />}
    />
  )
}

// ── SpotifyCountryArtistList ──────────────────────────────────────────────────

function SpotifyCountryArtistList({
  countryCode,
  countryName,
  onSelectArtist,
  onBack,
}: {
  countryCode: string
  countryName: string
  onSelectArtist: (artist: SpotifyArtist) => void
  onBack: () => void
}) {
  const { data: countryData, isLoading: countryLoading, isError: countryIsError, error: countryError, refetch: refetchCountry } = useQuery({
    queryKey: ['spotify-artist-countries'],
    queryFn: () => api.spotify.getArtistCountries(),
    staleTime: 5 * 60_000,
  })

  const { data: artistsData } = useQuery({
    queryKey: ['spotify-artists'],
    queryFn: () => api.spotify.getArtists(),
    staleTime: 5 * 60_000,
  })

  const artists: CountryArtistItem[] = (countryData?.items ?? []).map(a => ({
    id: a.spotify_artist_id,
    name: a.artist_name,
    country_code: a.country_code,
    country_name: a.country_name,
    sub_region: a.sub_region,
    image_url: a.image_url,
  }))

  // Build a lookup of Spotify artist objects for rich rendering
  const spotifyArtistMap = new Map<string, SpotifyArtist>()
  for (const a of artistsData?.items ?? []) {
    spotifyArtistMap.set(a.id, a)
    spotifyArtistMap.set(a.name.toLowerCase(), a)
  }

  return (
    <CountryArtistList
      countryCode={countryCode}
      countryName={countryName}
      artists={artists}
      isLoading={countryLoading}
      isError={countryIsError}
      error={countryError as Error | null}
      onRetry={() => refetchCountry()}
      onBack={onBack}
      renderArtistRow={(artist) => {
        const spotifyArtist = spotifyArtistMap.get(artist.id) ?? spotifyArtistMap.get(artist.name.toLowerCase())
        const artistForNav: SpotifyArtist = spotifyArtist ?? {
          id: artist.id,
          name: artist.name,
          images: artist.image_url ? [{ url: artist.image_url, height: null, width: null }] : [],
          genres: [],
          uri: `spotify:artist:${artist.id}`,
          external_urls: { spotify: `https://open.spotify.com/artist/${artist.id}` },
        }
        return (
          <li key={artist.id}>
            <button
              type="button"
              onClick={() => onSelectArtist(artistForNav)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left',
                'transition-colors hover:bg-[var(--bg-secondary)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'min-h-[44px]',
              )}
            >
              <ArtworkImage
                src={artist.image_url}
                images={!artist.image_url ? spotifyArtist?.images : undefined}
                size={48}
                rounded="rounded-full"
                fallback="user"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
                {spotifyArtist && (
                  <p className="truncate text-xs text-caption">
                    {spotifyArtist.followers !== undefined && `${spotifyArtist.followers.total.toLocaleString()} followers`}
                    {spotifyArtist.genres.length > 0 && ` · ${spotifyArtist.genres[0]}`}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
            </button>
          </li>
        )
      }}
    />
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
  const [selectedCountry, setSelectedCountry] = useState<{ code: string; name: string } | null>(null)

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

  function handleSelectCountry(code: string, name: string) {
    setSelectedCountry({ code, name })
    setView('country-artists')
  }

  function handleBack() {
    if (view === 'album-detail' && selectedCountry && selectedArtist) {
      setView('artist-detail')
      setSelectedAlbum(null)
    } else if (view === 'album-detail' && selectedArtist) {
      setView('artist-detail')
      setSelectedAlbum(null)
    } else if (view === 'artist-detail' && selectedCountry) {
      setView('country-artists')
      setSelectedArtist(null)
      setSelectedAlbum(null)
    } else {
      setView('home')
      setSelectedPlaylist(null)
      setSelectedAlbum(null)
      setSelectedShow(null)
      setSelectedArtist(null)
      setSelectedCountry(null)
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
    return (
      <SpotifySearchResults
        query={debouncedQuery}
        speaker={speaker}
        onSelectArtist={handleSelectArtist}
      />
    )
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

  if (view === 'country-artists' && selectedCountry) {
    return (
      <SpotifyCountryArtistList
        countryCode={selectedCountry.code}
        countryName={selectedCountry.name}
        onSelectArtist={handleSelectArtist}
        onBack={handleBack}
      />
    )
  }

  return (
    <div>
      <BrowseModeTabs mode={browseMode} onChangeMode={m => { setBrowseMode(m); setView('home') }} />
      {browseMode === 'playlists' && <PlaylistList onSelect={handleSelectPlaylist} />}
      {browseMode === 'countries' && <SpotifyCountryList onSelectCountry={handleSelectCountry} />}
      {browseMode === 'podcasts' && <ShowList onSelect={handleSelectShow} />}
      {browseMode === 'albums' && <AlbumList onSelect={handleSelectAlbum} />}
      {browseMode === 'artists' && <ArtistList onSelect={handleSelectArtist} />}
      {browseMode === 'songs' && <SongsList speaker={speaker} />}
    </div>
  )
}
