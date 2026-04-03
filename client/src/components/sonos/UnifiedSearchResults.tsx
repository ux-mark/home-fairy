import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  HardDrive,
  ImageOff,
  ListStart,
  Music2,
  Play,
  Plus,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type {
  SonosLibraryTrack,
  SonosRadioStation,
  SpotifyTrack,
} from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

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

// ── Album art ─────────────────────────────────────────────────────────────────

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

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  label,
}: {
  icon: React.ElementType
  label: string
}) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-4">
      <Icon className="h-3.5 w-3.5 text-caption/70" aria-hidden="true" />
      <h3 className="text-xs font-semibold uppercase tracking-wide text-caption">{label}</h3>
    </div>
  )
}

// ── NAS track row ─────────────────────────────────────────────────────────────

function NasTrackRow({ track, speaker }: { track: SonosLibraryTrack; speaker: string | null }) {
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
          className={actionBtn}
        >
          <ListStart className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!speaker || addToQueue.isPending}
          onClick={() => addToQueue.mutate()}
          aria-label={`Add ${track.title} to queue`}
          className={actionBtn}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

// ── Spotify track row ─────────────────────────────────────────────────────────

function SpotifyTrackRow({ track, speaker }: { track: SpotifyTrack; speaker: string | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addToQueue(speaker!, track.uri),
    onSuccess: () => {
      toast({ message: `Added "${track.name}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playNext(speaker!, track.uri),
    onSuccess: () => {
      toast({ message: `"${track.name}" will play next` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to play next', type: 'error' }),
  })

  const artistNames = track.artists.map(a => a.name).join(', ')
  const artUri = track.album.images?.[0]?.url

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <AlbumArt uri={artUri} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{track.name}</p>
        <p className="truncate text-xs text-caption">
          {[artistNames, track.album.name].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={!speaker || playNext.isPending}
          onClick={() => playNext.mutate()}
          aria-label={`Play ${track.name} next`}
          className={actionBtn}
        >
          <ListStart className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!speaker || addToQueue.isPending}
          onClick={() => addToQueue.mutate()}
          aria-label={`Add ${track.name} to queue`}
          className={actionBtn}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
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
  const { toast } = useToast()

  const play = useMutation({
    mutationFn: () => api.sonos.playFavourite(speaker!, station.title),
    onSuccess: () => toast({ message: `Playing ${station.title}` }),
    onError: () => toast({ message: `Failed to play ${station.title}`, type: 'error' }),
  })

  const playNext = useMutation({
    mutationFn: () => api.sonos.playFavourite(speaker!, station.title),
    onSuccess: () => toast({ message: `${station.title} queued as next` }),
    onError: () => toast({ message: `Failed to queue ${station.title}`, type: 'error' }),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <AlbumArt uri={station.albumArtUri} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{station.title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={!speaker || playNext.isPending}
          onClick={() => playNext.mutate()}
          aria-label={`Play ${station.title} next`}
          className={actionBtn}
        >
          <ListStart className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!speaker || play.isPending}
          onClick={() => play.mutate()}
          aria-label={`Play ${station.title}`}
          className={actionBtn}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

// ── NAS section ───────────────────────────────────────────────────────────────

function NasSection({ query, speaker }: { query: string; speaker: string | null }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-search', query],
    queryFn: () => api.sonos.searchLibrary(query),
    staleTime: 60_000,
    enabled: query.length > 0,
  })

  const allTracks = [
    ...(data?.artists ?? []),
    ...(data?.albums ?? []),
    ...(data?.tracks ?? []),
  ]

  return (
    <section aria-label="NAS Library results">
      <SectionHeading icon={HardDrive} label="NAS Library" />
      {isLoading && <SectionSkeleton />}
      {isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to search NAS library'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && allTracks.length === 0 && (
        <p className="px-4 py-3 text-xs text-caption">No NAS results for &ldquo;{query}&rdquo;</p>
      )}
      {allTracks.length > 0 && (
        <ul>
          {allTracks.map((track, i) => (
            <NasTrackRow key={track.uri + ':' + i} track={track} speaker={speaker} />
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Spotify section ───────────────────────────────────────────────────────────

function SpotifySection({ query, speaker }: { query: string; speaker: string | null }) {
  const { data: statusData } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: api.spotify.getStatus,
    staleTime: 60_000,
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spotify-search', query],
    queryFn: () => api.spotify.search(query),
    staleTime: 60_000,
    enabled: query.length > 0 && !!statusData?.connected,
  })

  const trackItems = data?.tracks?.items ?? []

  return (
    <section aria-label="Spotify results">
      <SectionHeading icon={Music2} label="Spotify" />
      {!statusData?.connected && (
        <p className="px-4 py-3 text-xs text-caption">
          Connect Spotify in Settings to see results here
        </p>
      )}
      {statusData?.connected && isLoading && <SectionSkeleton />}
      {statusData?.connected && isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to search Spotify'}
          onRetry={() => refetch()}
        />
      )}
      {statusData?.connected && !isLoading && !isError && trackItems.length === 0 && (
        <p className="px-4 py-3 text-xs text-caption">No Spotify results for &ldquo;{query}&rdquo;</p>
      )}
      {trackItems.length > 0 && (
        <ul>
          {trackItems.map((track, i) => (
            <SpotifyTrackRow key={track.id + ':' + i} track={track} speaker={speaker} />
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Radio section ─────────────────────────────────────────────────────────────

function RadioSection({ query, speaker }: { query: string; speaker: string | null }) {
  const { data: stations, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-radio-stations'],
    queryFn: api.sonos.getRadioStations,
    staleTime: 5 * 60_000,
  })

  const filtered = stations
    ? stations.filter(s => s.title.toLowerCase().includes(query.toLowerCase()))
    : []

  return (
    <section aria-label="Radio results">
      <SectionHeading icon={Radio} label="Radio" />
      {isLoading && <SectionSkeleton />}
      {isError && (
        <SectionError
          message={(error as Error).message ?? 'Failed to load radio stations'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <p className="px-4 py-3 text-xs text-caption">No radio stations match &ldquo;{query}&rdquo;</p>
      )}
      {filtered.length > 0 && (
        <ul>
          {filtered.map((station, i) => (
            <RadioStationRow key={station.uri + ':' + i} station={station} speaker={speaker} />
          ))}
        </ul>
      )}
    </section>
  )
}

// ── UnifiedSearchResults ──────────────────────────────────────────────────────

export function UnifiedSearchResults({ searchQuery }: { searchQuery: string }) {
  const speaker = useFirstSpeaker()
  const debouncedQuery = useDebounce(searchQuery.trim(), 300)

  if (!debouncedQuery) return null

  return (
    <div className="-mx-4">
      <NasSection query={debouncedQuery} speaker={speaker} />
      <SpotifySection query={debouncedQuery} speaker={speaker} />
      <RadioSection query={debouncedQuery} speaker={speaker} />
    </div>
  )
}
