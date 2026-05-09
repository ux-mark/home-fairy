import { useState, useMemo, useEffect, useRef } from 'react'
import {
  ChevronLeft,
  HardDrive,
  ImageOff,
  Music,
  Radio as RadioIcon,
  RotateCcw,
  Search,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { SonosFavourite, SonosGenreAlbum } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type View = 'root' | 'nas' | 'spotify' | 'radio'
type SourceFilter = 'all' | 'nas' | 'spotify' | 'radio'

interface MusicPickerProps {
  favourites: SonosFavourite[]
  value: string
  onChange: (value: string) => void
  id: string
  includeContinue?: boolean
  nasUri?: string | null
  onNasUriChange?: (uri: string | null) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRadio(fav: SonosFavourite): boolean {
  const cls = fav.contentClass?.toLowerCase() ?? ''
  if (cls.startsWith('object.item.audioitem.audiobroadcast')) return true
  // URI fallback for items missing class metadata
  const uri = fav.uri ?? ''
  return uri.startsWith('x-sonosapi-stream:') || uri.startsWith('x-rincon-stream:')
}

function isSpotifyPlaylist(fav: SonosFavourite): boolean {
  const cls = fav.contentClass?.toLowerCase() ?? ''
  return cls.includes('playlistcontainer')
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FavouriteSelector({
  favourites,
  value,
  onChange,
  id,
  includeContinue = true,
  nasUri,
  onNasUriChange,
}: MusicPickerProps) {
  const supportsNas = !!onNasUriChange

  // Source filter pill (root view only). Defaults to 'all'.
  const [filter, setFilter] = useState<SourceFilter>('all')

  // Drill-down view. 'root' is the landing page.
  const [view, setView] = useState<View>('root')

  // Search query (root + drill-down both honour their own search box).
  const [rootSearch, setRootSearch] = useState('')
  const [nasSearch, setNasSearch] = useState('')
  const [spotifySearch, setSpotifySearch] = useState('')
  const [radioSearch, setRadioSearch] = useState('')

  // Refs for scroll-into-view on first paint
  const rootListRef = useRef<HTMLDivElement>(null)
  const drillListRef = useRef<HTMLDivElement>(null)
  const initialValue = useRef(value)
  const initialNasUri = useRef(nasUri)
  const didInitialScroll = useRef(false)

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: nasAlbums = [], isLoading: nasAlbumsLoading } = useQuery({
    queryKey: ['sonos', 'library', 'albums'],
    queryFn: api.sonos.getLibraryAlbums,
    staleTime: 300_000,
    enabled: supportsNas,
  })

  const { data: spotifyStatus, isLoading: spotifyStatusLoading } = useQuery({
    queryKey: ['spotify', 'status'],
    queryFn: api.spotify.getStatus,
    staleTime: 60_000,
  })

  const radioStations = useMemo<SonosFavourite[]>(
    () => favourites.filter(isRadio),
    [favourites],
  )

  const spotifyPlaylists = useMemo<SonosFavourite[]>(
    () => favourites.filter(isSpotifyPlaylist),
    [favourites],
  )

  // ── Filtered lists ──────────────────────────────────────────────────────────

  const filteredNas = useMemo<SonosGenreAlbum[]>(() => {
    const q = nasSearch.trim().toLowerCase()
    if (!q) return nasAlbums
    return nasAlbums.filter(
      a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q),
    )
  }, [nasAlbums, nasSearch])

  const filteredSpotify = useMemo<SonosFavourite[]>(() => {
    const q = spotifySearch.trim().toLowerCase()
    if (!q) return spotifyPlaylists
    return spotifyPlaylists.filter(p => p.title.toLowerCase().includes(q))
  }, [spotifyPlaylists, spotifySearch])

  const filteredRadio = useMemo<SonosFavourite[]>(() => {
    const q = radioSearch.trim().toLowerCase()
    if (!q) return radioStations
    return radioStations.filter(s => s.title.toLowerCase().includes(q))
  }, [radioStations, radioSearch])

  // Root-view search hits (flat results across all sources)
  const rootSearchActive = rootSearch.trim().length > 0
  const rootHits = useMemo(() => {
    const q = rootSearch.trim().toLowerCase()
    if (!q) return { nas: [] as SonosGenreAlbum[], spotify: [] as SonosFavourite[], radio: [] as SonosFavourite[] }
    return {
      nas: supportsNas
        ? nasAlbums.filter(
            a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q),
          )
        : [],
      spotify: spotifyPlaylists.filter(p => p.title.toLowerCase().includes(q)),
      radio: radioStations.filter(s => s.title.toLowerCase().includes(q)),
    }
  }, [rootSearch, nasAlbums, spotifyPlaylists, radioStations, supportsNas])

  // ── Effects ─────────────────────────────────────────────────────────────────

  // On first mount, if a value is already selected, drill into the right view
  // so the user lands where their selection lives — and scroll it into sight.
  useEffect(() => {
    if (didInitialScroll.current) return
    didInitialScroll.current = true

    const v0 = initialValue.current
    const nasUri0 = initialNasUri.current

    if (!v0 || v0 === '__continue__') return

    if (nasUri0 && supportsNas) {
      setView('nas')
      // scroll happens after albums load — handled in second effect
      return
    }

    const fav = favourites.find(f => f.title === v0)
    if (!fav) return

    if (isRadio(fav)) setView('radio')
    else if (isSpotifyPlaylist(fav)) setView('spotify')
  }, [favourites, supportsNas])

  // Scroll the selected item into view inside whichever drill-down list it lives.
  useEffect(() => {
    if (view === 'root') return
    const container = drillListRef.current
    if (!container) return
    const id = requestAnimationFrame(() => {
      const sel = container.querySelector('[aria-selected="true"]') as HTMLElement | null
      if (sel) sel.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [view, nasAlbumsLoading])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function selectContinue() {
    onChange('__continue__')
    onNasUriChange?.(null)
  }

  function selectFavourite(fav: SonosFavourite) {
    onChange(fav.title)
    onNasUriChange?.(null)
  }

  function selectNasAlbum(album: SonosGenreAlbum) {
    onChange(album.name)
    onNasUriChange?.(album.objectId)
  }

  function openSource(source: SourceFilter) {
    if (source === 'all') return
    setView(source)
  }

  function backToRoot() {
    setView('root')
  }

  function handleFilterChange(next: SourceFilter) {
    setFilter(next)
    if (next !== 'all') {
      setView(next)
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const continueSelected = value === '__continue__'

  function renderContinueButton() {
    if (!includeContinue) return null
    return (
      <button
        id={`${id}-item-__continue__`}
        type="button"
        role="option"
        aria-selected={continueSelected}
        onClick={selectContinue}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
          'min-h-[44px]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          continueSelected
            ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[10px]'
            : 'border-l-2 border-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]',
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
          <RotateCcw className="h-4 w-4 text-fairy-400" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-heading">
            Continue what's already playing
          </span>
          <span className="block truncate text-xs text-caption">
            Pick up where the speaker left off
          </span>
        </span>
      </button>
    )
  }

  function renderSearchInput(opts: {
    value: string
    onChange: (v: string) => void
    label: string
    placeholder: string
  }) {
    return (
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caption"
          aria-hidden="true"
        />
        <input
          type="search"
          value={opts.value}
          onChange={e => opts.onChange(e.target.value)}
          placeholder={opts.placeholder}
          aria-label={opts.label}
          className={cn(
            'w-full rounded-xl bg-[var(--bg-secondary)] py-2.5 pl-9 pr-3',
            'min-h-[44px] text-sm text-body placeholder:text-caption',
            'border border-[var(--border-secondary)]',
            'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-fairy-500',
          )}
        />
      </div>
    )
  }

  // Source pills (root only)
  function renderSourcePills() {
    const pills: Array<{ id: SourceFilter; label: string }> = [
      { id: 'all', label: 'All' },
      ...(supportsNas ? [{ id: 'nas' as const, label: 'NAS' }] : []),
      { id: 'spotify', label: 'Spotify' },
      { id: 'radio', label: 'Radio' },
    ]
    return (
      <div
        role="group"
        aria-label="Filter by source"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {pills.map(p => {
          const isActive = filter === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleFilterChange(p.id)}
              aria-pressed={isActive}
              className={cn(
                'shrink-0 rounded-full px-4 text-sm font-medium transition-colors',
                'min-h-[44px]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                isActive
                  ? 'bg-fairy-500 text-white'
                  : 'bg-[var(--bg-secondary)] text-caption hover:text-body',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    )
  }

  // Source card (root, no search)
  function renderSourceCard(opts: {
    source: SourceFilter
    Icon: React.ElementType
    label: string
    subtitle: React.ReactNode
    disabled?: boolean
  }) {
    return (
      <button
        type="button"
        onClick={() => openSource(opts.source)}
        disabled={opts.disabled}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-4 py-3 text-left transition-colors',
          'min-h-[56px]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          opts.disabled
            ? 'opacity-60 cursor-not-allowed'
            : 'hover:bg-[var(--bg-tertiary)]',
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
          <opts.Icon className="h-5 w-5 text-fairy-400" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-heading">{opts.label}</span>
          <span className="block text-xs text-caption">{opts.subtitle}</span>
        </span>
        <ChevronLeft
          className="h-4 w-4 rotate-180 text-caption"
          aria-hidden="true"
        />
      </button>
    )
  }

  // Item row (radio station, spotify playlist)
  function renderFavouriteRow(fav: SonosFavourite, fallbackIcon: React.ElementType) {
    const isSelected = value === fav.title
    const FallbackIcon = fallbackIcon
    return (
      <button
        key={`${fav.title}-${fav.uri ?? ''}`}
        id={`${id}-item-${fav.title}`}
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={() => selectFavourite(fav)}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
          'min-h-[44px]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          isSelected
            ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[10px]'
            : 'border-l-2 border-transparent hover:bg-[var(--bg-tertiary)]',
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
          {fav.albumArtURI ? (
            <img
              src={fav.albumArtURI}
              alt=""
              className="h-full w-full object-cover"
              onError={e => {
                const img = e.currentTarget
                img.style.display = 'none'
              }}
            />
          ) : (
            <FallbackIcon className="h-4 w-4 text-caption" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-body">{fav.title}</span>
        </span>
      </button>
    )
  }

  // NAS album row
  function renderNasRow(album: SonosGenreAlbum) {
    const isSelected = !!nasUri && nasUri === album.objectId
    return (
      <button
        id={`${id}-nas-${album.objectId}`}
        key={album.objectId}
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={() => selectNasAlbum(album)}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
          'min-h-[44px]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          isSelected
            ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[10px]'
            : 'border-l-2 border-transparent hover:bg-[var(--bg-tertiary)]',
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
          {album.albumArtUri ? (
            <img
              src={album.albumArtUri}
              alt=""
              className="h-full w-full object-cover"
              onError={e => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <ImageOff className="h-4 w-4 text-caption" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-body">{album.name}</span>
          <span className="block truncate text-xs text-caption">{album.artist}</span>
        </span>
      </button>
    )
  }

  // ── Subtitles ───────────────────────────────────────────────────────────────

  const nasSubtitle = supportsNas
    ? nasAlbumsLoading
      ? 'Loading…'
      : `${nasAlbums.length} ${nasAlbums.length === 1 ? 'album' : 'albums'}`
    : 'Not available'

  const spotifySubtitle = spotifyStatusLoading
    ? 'Checking…'
    : spotifyStatus?.connected
      ? 'Connected'
      : 'Not connected'

  const radioCount = radioStations.length
  const radioSubtitle = `${radioCount} ${radioCount === 1 ? 'station' : 'stations'}`

  // ── Render ──────────────────────────────────────────────────────────────────

  // Drill-down: NAS
  if (view === 'nas') {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={backToRoot}
          aria-label="Back to all sources"
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-body transition-colors',
            'min-h-[44px]',
            'hover:bg-[var(--bg-tertiary)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium">NAS</span>
        </button>

        {renderSearchInput({
          value: nasSearch,
          onChange: setNasSearch,
          label: 'Search NAS albums',
          placeholder: 'Search albums or artists',
        })}

        <div
          ref={drillListRef}
          id={id}
          role="listbox"
          aria-label="Select a NAS album"
          aria-activedescendant={nasUri ? `${id}-nas-${nasUri}` : undefined}
          className="overflow-y-auto rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)]"
          style={{ maxHeight: '300px' }}
        >
          {nasAlbumsLoading ? (
            <div className="px-3 py-4 text-center text-sm text-caption">Loading library…</div>
          ) : filteredNas.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-caption">
              {nasSearch ? 'No albums match your search' : 'No albums in library'}
            </div>
          ) : (
            filteredNas.map(renderNasRow)
          )}
        </div>
      </div>
    )
  }

  // Drill-down: Spotify
  if (view === 'spotify') {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={backToRoot}
          aria-label="Back to all sources"
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-body transition-colors',
            'min-h-[44px]',
            'hover:bg-[var(--bg-tertiary)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium">Spotify</span>
        </button>

        {renderSearchInput({
          value: spotifySearch,
          onChange: setSpotifySearch,
          label: 'Search Spotify playlists',
          placeholder: 'Search playlists',
        })}

        <div
          ref={drillListRef}
          id={id}
          role="listbox"
          aria-label="Select a Spotify playlist"
          aria-activedescendant={value ? `${id}-item-${value}` : undefined}
          className="overflow-y-auto rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)]"
          style={{ maxHeight: '300px' }}
        >
          {filteredSpotify.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-caption">
              {spotifySearch
                ? 'No playlists match your search'
                : spotifyPlaylists.length === 0
                  ? 'No Spotify playlists in your Sonos favourites yet'
                  : 'No playlists to show'}
            </div>
          ) : (
            filteredSpotify.map(p => renderFavouriteRow(p, Music))
          )}
        </div>
      </div>
    )
  }

  // Drill-down: Radio
  if (view === 'radio') {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={backToRoot}
          aria-label="Back to all sources"
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-body transition-colors',
            'min-h-[44px]',
            'hover:bg-[var(--bg-tertiary)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium">Radio</span>
        </button>

        {renderSearchInput({
          value: radioSearch,
          onChange: setRadioSearch,
          label: 'Search radio stations',
          placeholder: 'Search stations',
        })}

        <div
          ref={drillListRef}
          id={id}
          role="listbox"
          aria-label="Select a radio station"
          aria-activedescendant={value ? `${id}-item-${value}` : undefined}
          className="overflow-y-auto rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)]"
          style={{ maxHeight: '300px' }}
        >
          {filteredRadio.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-caption">
              {radioSearch ? 'No stations match your search' : 'No radio stations'}
            </div>
          ) : (
            filteredRadio.map(s => renderFavouriteRow(s, RadioIcon))
          )}
        </div>
      </div>
    )
  }

  // Root view
  return (
    <div className="space-y-3">
      {/* Continue what's already playing — always first, never buried */}
      {includeContinue && renderContinueButton()}

      {includeContinue && (
        <div role="separator" className="border-t border-[var(--border-secondary)]" />
      )}

      {/* Search */}
      {renderSearchInput({
        value: rootSearch,
        onChange: setRootSearch,
        label: 'Search music',
        placeholder: 'Search music...',
      })}

      {/* Source pills */}
      {renderSourcePills()}

      {/* Body: source cards (no search) or flat search hits */}
      <div
        ref={rootListRef}
        id={id}
        role="listbox"
        aria-label="Pick a music source or item"
        aria-activedescendant={
          continueSelected
            ? `${id}-item-__continue__`
            : value
              ? `${id}-item-${value}`
              : nasUri
                ? `${id}-nas-${nasUri}`
                : undefined
        }
      >
        {rootSearchActive ? (
          <div
            className="overflow-y-auto rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)]"
            style={{ maxHeight: '300px' }}
          >
            {rootHits.nas.length === 0 &&
            rootHits.spotify.length === 0 &&
            rootHits.radio.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-caption">
                No matches across NAS, Spotify, or Radio
              </div>
            ) : (
              <>
                {supportsNas && rootHits.nas.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-caption">
                      NAS
                    </div>
                    {rootHits.nas.slice(0, 25).map(renderNasRow)}
                  </div>
                )}
                {rootHits.spotify.length > 0 && (
                  <div>
                    <div className="border-t border-[var(--border-secondary)] px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-caption">
                      Spotify
                    </div>
                    {rootHits.spotify.slice(0, 25).map(p => renderFavouriteRow(p, Music))}
                  </div>
                )}
                {rootHits.radio.length > 0 && (
                  <div>
                    <div className="border-t border-[var(--border-secondary)] px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-caption">
                      Radio
                    </div>
                    {rootHits.radio.slice(0, 25).map(s => renderFavouriteRow(s, RadioIcon))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {supportsNas &&
              renderSourceCard({
                source: 'nas',
                Icon: HardDrive,
                label: 'NAS',
                subtitle: nasSubtitle,
              })}
            {renderSourceCard({
              source: 'spotify',
              Icon: Music,
              label: 'Spotify',
              subtitle: spotifySubtitle,
            })}
            {renderSourceCard({
              source: 'radio',
              Icon: RadioIcon,
              label: 'Radio',
              subtitle: radioSubtitle,
            })}
          </div>
        )}
      </div>
    </div>
  )
}
