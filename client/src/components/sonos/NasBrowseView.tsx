import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Disc3,
  Globe,
  Heart,
  ListEnd,
  ListStart,
  Loader2,
  MapPin,
  MoreVertical,
  Music2,
  Play,
  RefreshCw,
  User,
} from 'lucide-react'
import { api } from '@/lib/api'
import type {
  SonosLibraryTrack,
  SonosGenreAlbum,
  NasEnrichedAlbum,
  NasEnrichedArtist,
  EnrichmentProgress,
} from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { ArtworkImage } from './ArtworkImage'
import { CountryList, CountryArtistList, isValidIsoCode, type CountryArtistItem } from './CountryBrowse'

// ── Types ─────────────────────────────────────────────────────────────────────

type NasView = 'home' | 'artist-detail' | 'album-detail' | 'country-artists'
type BrowseMode = 'countries' | 'albums' | 'artists' | 'songs'

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
      <ArtworkImage src={track.albumArtUri} size={40} fallback="disc" />

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
      className="mb-4 flex gap-2 overflow-x-auto pb-0.5"
    >
      {(['countries', 'albums', 'artists', 'songs'] as const).map(m => (
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
          {m === 'countries' ? 'Countries' : m === 'albums' ? 'Albums' : m === 'artists' ? 'Artists' : 'Songs'}
        </button>
      ))}
    </div>
  )
}

// ── NAS enrichment status bar ────────────────────────────────────────────────

function NasEnrichmentStatusBar() {
  const { data: progress, refetch } = useQuery({
    queryKey: ['nas-enrichment-status'],
    queryFn: () => api.sonos.getNasEnrichmentStatus(),
    staleTime: 2_000,
    refetchInterval: (query) => {
      const d = query.state.data as EnrichmentProgress | undefined
      return d?.status === 'running' ? 2_000 : false
    },
  })
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const enrich = useMutation({
    mutationFn: () => api.sonos.enrichNasArtists(),
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
    mutationFn: () => api.sonos.cancelNasEnrichment(),
    onSuccess: () => {
      toast({ message: 'Enrichment cancelled' })
      refetch()
      queryClient.invalidateQueries({ queryKey: ['nas-enriched-artists'] })
      queryClient.invalidateQueries({ queryKey: ['nas-enriched-albums'] })
    },
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
      <NasBackfillArtworkButton disabled={isRunning} />
    </div>
  )
}

function NasBackfillArtworkButton({ disabled }: { disabled: boolean }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const backfill = useMutation({
    mutationFn: () => api.spotify.backfillImages(),
    onSuccess: (data) => {
      if (data.total_updated > 0) {
        toast({ message: `Updated ${data.total_updated} artist images` })
        queryClient.invalidateQueries({ queryKey: ['nas-enriched-artists'] })
        queryClient.invalidateQueries({ queryKey: ['nas-enriched-albums'] })
      } else {
        toast({ message: 'All artist images are up to date' })
      }
    },
    onError: () => toast({ message: 'Failed to fetch artwork', type: 'error' }),
  })

  return (
    <button
      type="button"
      onClick={() => backfill.mutate()}
      disabled={backfill.isPending || disabled}
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
  )
}

// ── Artist list ──────────────────────────────────────────────────────────────

type NasArtistSort = 'a-z' | 'country'

function ArtistList({
  onSelectArtist,
}: {
  onSelectArtist: (name: string) => void
}) {
  const [sort, setSort] = useState<NasArtistSort>('a-z')
  const [collapsedCountries, setCollapsedCountries] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['nas-enriched-artists'],
    queryFn: api.sonos.getEnrichedNasArtists,
    staleTime: 5 * 60_000,
  })

  // Refresh when enrichment completes
  const { data: enrichStatus } = useQuery({
    queryKey: ['nas-enrichment-status'],
    queryFn: () => api.sonos.getNasEnrichmentStatus(),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const d = query.state.data as EnrichmentProgress | undefined
      return d?.status === 'running' ? 3_000 : false
    },
  })

  const prevStatus = useRef(enrichStatus?.status)
  useEffect(() => {
    if (prevStatus.current === 'running' && enrichStatus?.status === 'complete') {
      queryClient.invalidateQueries({ queryKey: ['nas-enriched-artists'] })
    }
    prevStatus.current = enrichStatus?.status
  }, [enrichStatus?.status, queryClient])

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Failed to load artists'}
        onRetry={() => refetch()}
      />
    )
  }

  const artists = data?.items ?? []

  if (artists.length === 0) {
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

  const hasCountryData = artists.some(a => a.country_code !== null)

  const toggleCountry = (country: string) => {
    setCollapsedCountries(prev => {
      const next = new Set(prev)
      if (next.has(country)) next.delete(country)
      else next.add(country)
      return next
    })
  }

  // Group by country
  const countryGroups = new Map<string, NasEnrichedArtist[]>()
  for (const a of artists) {
    const hasValidCode = isValidIsoCode(a.country_code)
    const key = hasValidCode ? (a.country_name ?? a.country_code!) : 'Not Known'
    if (!countryGroups.has(key)) countryGroups.set(key, [])
    countryGroups.get(key)!.push(a)
  }
  const sortedGroups = Array.from(countryGroups.entries())
    .map(([country, items]) => ({ country, items }))
    .sort((a, b) => {
      if (a.country === 'Not Known') return 1
      if (b.country === 'Not Known') return -1
      return a.country.localeCompare(b.country, undefined, { sensitivity: 'base' })
    })

  return (
    <div>
      {hasCountryData && (
        <div className="mb-3 flex gap-2">
          {([
            { value: 'a-z' as const, label: 'A – Z', icon: User },
            { value: 'country' as const, label: 'Country', icon: MapPin },
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
      )}

      <NasEnrichmentStatusBar />

      {sort === 'country' && hasCountryData ? (
        <div className="-mx-4">
          {sortedGroups.map(group => {
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
                  <span className="flex-1 text-sm font-semibold text-heading">{group.country}</span>
                  <span className="text-xs text-caption">{group.items.length}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 text-caption/50 transition-transform', isCollapsed && '-rotate-90')}
                    aria-hidden="true"
                  />
                </button>
                {!isCollapsed && (
                  <ul>
                    {group.items.map(artist => (
                      <NasArtistRow key={artist.name} artist={artist} onSelect={onSelectArtist} showCountry={false} />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <ul className="-mx-4">
          {artists.map(artist => (
            <NasArtistRow key={artist.name} artist={artist} onSelect={onSelectArtist} showCountry={hasCountryData} />
          ))}
        </ul>
      )}
    </div>
  )
}

function NasArtistRow({
  artist,
  onSelect,
  showCountry,
}: {
  artist: NasEnrichedArtist
  onSelect: (name: string) => void
  showCountry: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(artist.name)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left',
          'transition-colors hover:bg-[var(--bg-secondary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'min-h-[44px]',
        )}
      >
        <ArtworkImage src={artist.image_url} size={40} rounded="rounded-full" fallback="user" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-heading">{artist.name}</p>
          <p className="text-xs text-caption">
            {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} · {artist.trackCount} {artist.trackCount === 1 ? 'track' : 'tracks'}
            {showCountry && artist.country_code && (
              <span className="text-caption/60"> · {artist.country_code}</span>
            )}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Album list ───────────────────────────────────────────────────────────────

type NasAlbumSort = 'a-z' | 'country'

function AlbumList({
  onSelectAlbum,
}: {
  onSelectAlbum: (album: SonosGenreAlbum) => void
}) {
  const [sort, setSort] = useState<NasAlbumSort>('a-z')
  const [collapsedCountries, setCollapsedCountries] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['nas-enriched-albums'],
    queryFn: api.sonos.getEnrichedNasAlbums,
    staleTime: 5 * 60_000,
  })

  // Refresh when enrichment completes
  const { data: enrichStatus } = useQuery({
    queryKey: ['nas-enrichment-status'],
    queryFn: () => api.sonos.getNasEnrichmentStatus(),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const d = query.state.data as EnrichmentProgress | undefined
      return d?.status === 'running' ? 3_000 : false
    },
  })

  const prevStatus = useRef(enrichStatus?.status)
  useEffect(() => {
    if (prevStatus.current === 'running' && enrichStatus?.status === 'complete') {
      queryClient.invalidateQueries({ queryKey: ['nas-enriched-albums'] })
    }
    prevStatus.current = enrichStatus?.status
  }, [enrichStatus?.status, queryClient])

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Failed to load albums'}
        onRetry={() => refetch()}
      />
    )
  }

  const albums = data?.items ?? []

  if (albums.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <p className="text-sm font-medium text-heading">No albums found</p>
      </div>
    )
  }

  const hasCountryData = albums.some(a => a.artist_country?.country_code)

  const toggleCountry = (country: string) => {
    setCollapsedCountries(prev => {
      const next = new Set(prev)
      if (next.has(country)) next.delete(country)
      else next.add(country)
      return next
    })
  }

  // Group by country
  const countryGroups = new Map<string, NasEnrichedAlbum[]>()
  for (const a of albums) {
    const cc = a.artist_country?.country_code
    const hasValidCode = isValidIsoCode(cc)
    const key = hasValidCode ? (a.artist_country?.country_name ?? cc) : 'Not Known'
    if (!countryGroups.has(key)) countryGroups.set(key, [])
    countryGroups.get(key)!.push(a)
  }
  const sortedGroups = Array.from(countryGroups.entries())
    .map(([country, items]) => ({ country, countryCode: items[0]?.artist_country?.country_code ?? null, items }))
    .sort((a, b) => {
      if (a.country === 'Not Known') return 1
      if (b.country === 'Not Known') return -1
      return a.country.localeCompare(b.country, undefined, { sensitivity: 'base' })
    })

  return (
    <div>
      {hasCountryData && (
        <div className="mb-3 flex gap-2">
          {([
            { value: 'a-z' as const, label: 'A – Z', icon: Disc3 },
            { value: 'country' as const, label: 'Country', icon: MapPin },
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
      )}

      <NasEnrichmentStatusBar />

      {sort === 'country' && hasCountryData ? (
        <div className="-mx-4">
          {sortedGroups.map(group => {
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
                  <span className="flex-1 text-sm font-semibold text-heading">{group.country}</span>
                  <span className="text-xs text-caption">{group.items.length}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 text-caption/50 transition-transform', isCollapsed && '-rotate-90')}
                    aria-hidden="true"
                  />
                </button>
                {!isCollapsed && (
                  <ul>
                    {group.items.map(album => (
                      <NasAlbumRow key={album.objectId} album={album} onSelect={onSelectAlbum} showCountry={false} />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <ul className="-mx-4">
          {albums.map(album => (
            <NasAlbumRow key={album.objectId} album={album} onSelect={onSelectAlbum} showCountry={hasCountryData} />
          ))}
        </ul>
      )}
    </div>
  )
}

function NasAlbumRow({
  album,
  onSelect,
  showCountry,
}: {
  album: NasEnrichedAlbum
  onSelect: (album: SonosGenreAlbum) => void
  showCountry: boolean
}) {
  const countryCode = album.artist_country?.country_code ?? null

  return (
    <li>
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
        <ArtworkImage src={album.albumArtUri} size={48} fallback="disc" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-heading">{album.name}</p>
          <p className="truncate text-xs text-caption">
            {album.artist}
            {showCountry && countryCode && (
              <span className="text-caption/60"> · {countryCode}</span>
            )}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-caption/40" aria-hidden="true" />
      </button>
    </li>
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
        <ArtworkImage src={album.albumArtUri} size={44} fallback="disc" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug text-heading">{album.name}</h2>
          <p className="text-xs text-caption">{album.artist}</p>
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

// ── NAS country wrappers (data-fetching shells around shared CountryBrowse components) ──

function NasCountryList({
  onSelectCountry,
}: {
  onSelectCountry: (code: string, name: string) => void
}) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['nas-enriched-artists'],
    queryFn: api.sonos.getEnrichedNasArtists,
    staleTime: 5 * 60_000,
  })

  const { data: enrichStatus } = useQuery({
    queryKey: ['nas-enrichment-status'],
    queryFn: () => api.sonos.getNasEnrichmentStatus(),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const d = query.state.data as EnrichmentProgress | undefined
      return d?.status === 'running' ? 3_000 : false
    },
  })

  const prevStatus = useRef(enrichStatus?.status)
  useEffect(() => {
    if (prevStatus.current === 'running' && enrichStatus?.status === 'complete') {
      queryClient.invalidateQueries({ queryKey: ['nas-enriched-artists'] })
    }
    prevStatus.current = enrichStatus?.status
  }, [enrichStatus?.status, queryClient])

  const artists: CountryArtistItem[] = (data?.items ?? []).map(a => ({
    id: a.name,
    name: a.name,
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
      enrichmentStatusBar={<NasEnrichmentStatusBar />}
    />
  )
}

function NasCountryArtistList({
  countryCode,
  countryName,
  onSelectArtist,
  onBack,
}: {
  countryCode: string
  countryName: string
  onSelectArtist: (name: string) => void
  onBack: () => void
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['nas-enriched-artists'],
    queryFn: api.sonos.getEnrichedNasArtists,
    staleTime: 5 * 60_000,
  })

  const artists: CountryArtistItem[] = (data?.items ?? []).map(a => ({
    id: a.name,
    name: a.name,
    country_code: a.country_code,
    country_name: a.country_name,
    sub_region: a.sub_region,
    image_url: a.image_url,
  }))

  return (
    <CountryArtistList
      countryCode={countryCode}
      countryName={countryName}
      artists={artists}
      isLoading={isLoading}
      isError={isError}
      error={error as Error | null}
      onRetry={() => refetch()}
      onBack={onBack}
      renderArtistRow={(artist) => (
        <NasArtistRow
          key={artist.id}
          artist={(data?.items ?? []).find(a => a.name === artist.name)!}
          onSelect={onSelectArtist}
          showCountry={false}
        />
      )}
    />
  )
}

// ── Songs list ───────────────────────────────────────────────────────────────

function SongsList({ speaker }: { speaker: string | null }) {
  const { data: tracks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-library-songs'],
    queryFn: api.sonos.getLibrarySongs,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Failed to load songs'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!tracks || tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Music2 className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <p className="text-sm font-medium text-heading">No songs found</p>
      </div>
    )
  }

  return (
    <ul className="-mx-4">
      {tracks.map((track: SonosLibraryTrack, i: number) => (
        <TrackRow key={track.uri + ':' + i} track={track} speaker={speaker} />
      ))}
    </ul>
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
  const [browseMode, setBrowseMode] = useState<BrowseMode>('countries')
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<SonosGenreAlbum | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<{ code: string; name: string } | null>(null)
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

  function handleSelectCountry(code: string, name: string) {
    setSelectedCountry({ code, name })
    setView('country-artists')
  }

  function handleBack() {
    if (view === 'country-artists') {
      setView('home')
      setSelectedCountry(null)
    } else if (view === 'album-detail' && selectedArtist) {
      setView('artist-detail')
      setSelectedAlbum(null)
    } else if (view === 'artist-detail' && selectedCountry) {
      setView('country-artists')
      setSelectedArtist(null)
      setSelectedAlbum(null)
    } else {
      setView('home')
      setSelectedArtist(null)
      setSelectedAlbum(null)
      setSelectedCountry(null)
    }
  }

  if (isSearching) {
    return <SearchResults query={debouncedQuery} speaker={speaker} />
  }

  if (view === 'country-artists' && selectedCountry) {
    return (
      <NasCountryArtistList
        countryCode={selectedCountry.code}
        countryName={selectedCountry.name}
        onSelectArtist={handleSelectArtist}
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
      {browseMode === 'countries' && <NasCountryList onSelectCountry={handleSelectCountry} />}
      {browseMode === 'albums' && <AlbumList onSelectAlbum={handleSelectAlbum} />}
      {browseMode === 'artists' && <ArtistList onSelectArtist={handleSelectArtist} />}
      {browseMode === 'songs' && <SongsList speaker={speaker} />}
    </div>
  )
}
