import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronRight,
  HardDrive,
  Heart,
  ListEnd,
  ListPlus,
  ListStart,
  MoreVertical,
  Music2,
  Play,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type {
  SonosLibraryTrack,
  SonosSearchArtist,
  SonosSearchAlbum,
  SonosRadioStation,
  SpotifyTrack,
} from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { Accordion } from '@/components/ui/Accordion'
import { cn } from '@/lib/utils'
import { ArtworkImage } from './ArtworkImage'
import { AddToFairylistDialog } from './AddToFairylistDialog'
import { AddToSpotifyPlaylistDialog } from './AddToSpotifyPlaylistDialog'

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

// ── Shared action button style ────────────────────────────────────────────────

const actionBtn = cn(
  'flex h-11 w-11 items-center justify-center rounded-lg',
  'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
  'disabled:opacity-40',
)

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <ul aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
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

// ── Section error ─────────────────────────────────────────────────────────────

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-xs text-caption">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium text-body',
          'transition-colors hover:bg-[var(--bg-tertiary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[36px]',
        )}
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// ── NAS track row ─────────────────────────────────────────────────────────────

function NasTrackRow({ track, speaker }: { track: SonosLibraryTrack; speaker: string | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [fairylistDialogOpen, setFairylistDialogOpen] = useState(false)

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
      title: track.title || 'Unknown track',
      album_art_uri: track.albumArtUri,
    }),
    onSuccess: () => toast({ message: `Added "${track.title}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  return (
    <>
      <li className="flex items-center gap-3 px-4 py-2.5">
        <ArtworkImage src={track.albumArtUri} fallback="disc" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-heading">{track.title || 'Unknown track'}</p>
          <p className="truncate text-xs text-caption">
            {[track.artist, track.album].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!speaker || playNow.isPending}
            onClick={() => playNow.mutate()}
            aria-label={`Play ${track.title}`}
            className={actionBtn}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="shrink-0">
            <button
              ref={menuBtnRef}
              type="button"
              disabled={!speaker}
              onClick={() => {
                if (menuOpen) {
                  setMenuOpen(false)
                } else {
                  if (menuBtnRef.current) {
                    const rect = menuBtnRef.current.getBoundingClientRect()
                    const showAbove = rect.bottom + 200 > window.innerHeight
                    setMenuPos({
                      top: showAbove ? rect.top - 200 - 4 : rect.bottom + 4,
                      right: window.innerWidth - rect.right,
                    })
                  }
                  setMenuOpen(true)
                }
              }}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              aria-label={`More options for ${track.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={actionBtn}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen && menuPos && createPortal(
              <ul
                role="menu"
                style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
                className="z-[200] min-w-[180px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
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
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setFairylistDialogOpen(true) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                  >
                    <ListPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Add to Fairylist
                  </button>
                </li>
              </ul>,
              document.body,
            )}
          </div>
        </div>
      </li>
      <AddToFairylistDialog
        open={fairylistDialogOpen}
        onOpenChange={setFairylistDialogOpen}
        track={{
          source: 'nas',
          source_uri: track.uri,
          title: track.title || 'Unknown track',
          artist: track.artist || undefined,
          album_art_uri: track.albumArtUri,
        }}
      />
    </>
  )
}

// ── Spotify track row ─────────────────────────────────────────────────────────

function SpotifyTrackRow({ track, speaker }: { track: SpotifyTrack; speaker: string | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [fairylistDialogOpen, setFairylistDialogOpen] = useState(false)
  const [spotifyPlaylistDialogOpen, setSpotifyPlaylistDialogOpen] = useState(false)

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
  const artUri = track.album.images?.[0]?.url

  return (
    <>
      <li className="flex items-center gap-3 px-4 py-2.5">
        <ArtworkImage src={artUri} fallback="disc" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-heading">{track.name}</p>
          <p className="truncate text-xs text-caption">
            {[artistNames, track.album.name].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!speaker || playNow.isPending}
            onClick={() => playNow.mutate()}
            aria-label={`Play ${track.name}`}
            className={actionBtn}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="shrink-0">
            <button
              ref={menuBtnRef}
              type="button"
              disabled={!speaker}
              onClick={() => {
                if (menuOpen) {
                  setMenuOpen(false)
                } else {
                  if (menuBtnRef.current) {
                    const rect = menuBtnRef.current.getBoundingClientRect()
                    const showAbove = rect.bottom + 240 > window.innerHeight
                    setMenuPos({
                      top: showAbove ? rect.top - 240 - 4 : rect.bottom + 4,
                      right: window.innerWidth - rect.right,
                    })
                  }
                  setMenuOpen(true)
                }
              }}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              aria-label={`More options for ${track.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={actionBtn}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen && menuPos && createPortal(
              <ul
                role="menu"
                style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
                className="z-[200] min-w-[200px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
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
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setFairylistDialogOpen(true) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                  >
                    <ListPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Add to Fairylist
                  </button>
                </li>
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setSpotifyPlaylistDialogOpen(true) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                  >
                    <Music2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Add to Spotify Playlist
                  </button>
                </li>
              </ul>,
              document.body,
            )}
          </div>
        </div>
      </li>
      <AddToFairylistDialog
        open={fairylistDialogOpen}
        onOpenChange={setFairylistDialogOpen}
        track={{
          source: 'spotify',
          source_uri: track.uri,
          title: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album_art_uri: track.album.images?.[0]?.url,
        }}
      />
      <AddToSpotifyPlaylistDialog
        open={spotifyPlaylistDialogOpen}
        onOpenChange={setSpotifyPlaylistDialogOpen}
        trackUri={track.uri}
        trackName={track.name}
      />
    </>
  )
}

// ── Radio station row ─────────────────────────────────────────────────────────

function RadioStationRow({
  station,
  speaker,
}: {
  station: SonosRadioStation
  speaker: string | null
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  const play = useMutation({
    mutationFn: () => api.sonos.playFavourite(speaker!, station.title),
    onSuccess: () => toast({ message: `Playing ${station.title}` }),
    onError: () => toast({ message: `Failed to play ${station.title}`, type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playNext(speaker!, station.uri),
    onSuccess: () => {
      toast({ message: `${station.title} will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: `Failed to queue ${station.title}`, type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: 'radio',
      source_uri: station.uri,
      title: station.title,
      album_art_uri: station.albumArtUri,
    }),
    onSuccess: () => toast({ message: `Added "${station.title}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <ArtworkImage src={station.albumArtUri} fallback="disc" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{station.title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={!speaker || play.isPending}
          onClick={() => play.mutate()}
          aria-label={`Play ${station.title}`}
          className={actionBtn}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="shrink-0">
          <button
            ref={menuBtnRef}
            type="button"
            disabled={!speaker}
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false)
              } else {
                if (menuBtnRef.current) {
                  const rect = menuBtnRef.current.getBoundingClientRect()
                  const showAbove = rect.bottom + 120 > window.innerHeight
                  setMenuPos({
                    top: showAbove ? rect.top - 120 - 4 : rect.bottom + 4,
                    right: window.innerWidth - rect.right,
                  })
                }
                setMenuOpen(true)
              }
            }}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            aria-label={`More options for ${station.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={actionBtn}
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
                  onClick={() => { setMenuOpen(false); addToFavourites.mutate() }}
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
      </div>
    </li>
  )
}

// ── NAS search artist row ─────────────────────────────────────────────────────

function NasSearchArtistRow({ artist }: { artist: SonosSearchArtist }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <ArtworkImage src={artist.albumArtUri} size={40} rounded="rounded-full" fallback="user" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
        <p className="text-xs text-caption">
          {artist.trackCount} {artist.trackCount === 1 ? 'track' : 'tracks'}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
    </li>
  )
}

// ── NAS search album row ──────────────────────────────────────────────────────

function NasSearchAlbumRow({ album, speaker }: { album: SonosSearchAlbum; speaker: string | null }) {
  const { toast } = useToast()

  const playNow = useMutation({
    mutationFn: () => api.sonos.playUri(
      speaker!,
      `A:ALBUMARTIST/${album.artist}/${album.name}`,
    ),
    onSuccess: () => toast({ message: `Playing "${album.name}"` }),
    onError: () => toast({ message: 'Failed to play album', type: 'error' }),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <ArtworkImage src={album.albumArtUri} size={40} fallback="disc" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{album.name}</p>
        <p className="truncate text-xs text-caption">{album.artist}</p>
      </div>
      <button
        type="button"
        disabled={!speaker || playNow.isPending}
        onClick={() => playNow.mutate()}
        aria-label={`Play album ${album.name}`}
        className={actionBtn}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── NAS section ───────────────────────────────────────────────────────────────

function NasSection({ query, speaker }: { query: string; speaker: string | null }) {
  const [nasOpen, setNasOpen] = useState(true)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-search', query],
    queryFn: () => api.sonos.searchLibrary(query),
    staleTime: 60_000,
    enabled: query.length > 0,
  })

  const artists = data?.artists ?? []
  const albums = data?.albums ?? []
  const tracks = data?.tracks ?? []
  const totalCount = artists.length + albums.length + tracks.length

  return (
    <Accordion
      id="unified-nas"
      title={
        <span className="inline-flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 text-caption/70" aria-hidden="true" />
          NAS Library
        </span>
      }
      open={nasOpen}
      onToggle={() => setNasOpen(v => !v)}
      count={isLoading ? undefined : totalCount}
      card={false}
    >
      {isLoading && <SectionSkeleton />}
      {isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to search NAS library'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && totalCount === 0 && (
        <p className="py-3 text-xs text-caption">No NAS results for &ldquo;{query}&rdquo;</p>
      )}
      {!isLoading && !isError && totalCount > 0 && (
        <div className="-mx-4">
          {artists.length > 0 && (
            <ul>
              {artists.map(artist => (
                <NasSearchArtistRow key={artist.name} artist={artist} />
              ))}
            </ul>
          )}
          {albums.length > 0 && (
            <ul>
              {albums.map((album, i) => (
                <NasSearchAlbumRow key={album.name + ':' + album.artist + ':' + i} album={album} speaker={speaker} />
              ))}
            </ul>
          )}
          {tracks.length > 0 && (
            <ul>
              {tracks.map((track, i) => (
                <NasTrackRow key={track.uri + ':' + i} track={track} speaker={speaker} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Accordion>
  )
}

// ── Spotify section ───────────────────────────────────────────────────────────

function SpotifySection({ query, speaker }: { query: string; speaker: string | null }) {
  const [spotifyOpen, setSpotifyOpen] = useState(true)

  const {
    data: statusData,
    isError: statusIsError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: api.spotify.getStatus,
    staleTime: 30_000,
    retry: 1,
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-search', query],
    queryFn: () => api.spotify.search(query),
    staleTime: 60_000,
    enabled: query.length > 0 && !!statusData?.connected,
  })

  const trackItems = (data?.tracks?.items ?? []).filter((t): t is SpotifyTrack => t !== null)

  return (
    <Accordion
      id="unified-spotify"
      title={
        <span className="inline-flex items-center gap-1.5">
          <Music2 className="h-3.5 w-3.5 text-caption/70" aria-hidden="true" />
          Spotify
        </span>
      }
      open={spotifyOpen}
      onToggle={() => setSpotifyOpen(v => !v)}
      count={isLoading ? undefined : trackItems.length}
      card={false}
    >
      {statusIsError && (
        <SectionError
          message="Spotify unavailable — check your internet connection"
          onRetry={() => refetchStatus()}
        />
      )}
      {!statusIsError && !statusData?.connected && (
        <p className="py-3 text-xs text-caption">
          Connect Spotify in Settings to see results here
        </p>
      )}
      {!statusIsError && statusData?.connected && isLoading && <SectionSkeleton />}
      {!statusIsError && statusData?.connected && isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to search Spotify'}
          onRetry={() => refetch()}
        />
      )}
      {!statusIsError && statusData?.connected && !isLoading && !isError && trackItems.length === 0 && (
        <p className="py-3 text-xs text-caption">No Spotify results for &ldquo;{query}&rdquo;</p>
      )}
      {trackItems.length > 0 && (
        <ul className="-mx-4">
          {trackItems.map((track, i) => (
            <SpotifyTrackRow key={track.id + ':' + i} track={track} speaker={speaker} />
          ))}
        </ul>
      )}
    </Accordion>
  )
}

// ── Radio section ─────────────────────────────────────────────────────────────

function RadioSection({ query, speaker }: { query: string; speaker: string | null }) {
  const [radioOpen, setRadioOpen] = useState(true)

  const { data: stations, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-radio-stations'],
    queryFn: api.sonos.getRadioStations,
    staleTime: 5 * 60_000,
  })

  const filtered = stations
    ? stations.filter(s => s.title.toLowerCase().includes(query.toLowerCase()))
    : []

  return (
    <Accordion
      id="unified-radio"
      title={
        <span className="inline-flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 text-caption/70" aria-hidden="true" />
          Radio
        </span>
      }
      open={radioOpen}
      onToggle={() => setRadioOpen(v => !v)}
      count={isLoading ? undefined : filtered.length}
      card={false}
    >
      {isLoading && <SectionSkeleton />}
      {isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to load radio stations'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <p className="py-3 text-xs text-caption">No radio stations match &ldquo;{query}&rdquo;</p>
      )}
      {filtered.length > 0 && (
        <ul className="-mx-4">
          {filtered.map((station, i) => (
            <RadioStationRow key={station.uri + ':' + i} station={station} speaker={speaker} />
          ))}
        </ul>
      )}
    </Accordion>
  )
}

// ── UnifiedSearchResults ──────────────────────────────────────────────────────

interface UnifiedSearchResultsProps {
  searchQuery: string
  targetSpeaker?: string | null
}

export function UnifiedSearchResults({ searchQuery, targetSpeaker }: UnifiedSearchResultsProps) {
  const firstSpeaker = useFirstSpeaker()
  const speaker = targetSpeaker ?? firstSpeaker
  const debouncedQuery = useDebounce(searchQuery.trim(), 300)

  if (!debouncedQuery) return null

  return (
    <div className="flex flex-col gap-2">
      <NasSection query={debouncedQuery} speaker={speaker} />
      <SpotifySection query={debouncedQuery} speaker={speaker} />
      <RadioSection query={debouncedQuery} speaker={speaker} />
    </div>
  )
}
