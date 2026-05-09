import { useState } from 'react'
import { ChevronLeft, ChevronRight, HardDrive, Music, Music2, Radio as RadioIcon, RotateCcw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { SonosFavourite, SonosGenreAlbum, SonosLibraryTrack, SonosRadioStation } from '@/lib/api'
import { ArtworkImage } from './ArtworkImage'
import { RadioBrowseView } from './RadioBrowseView'

type Source = 'all' | 'nas' | 'spotify' | 'radio'

interface FavouriteSelectorProps {
  favourites: SonosFavourite[]
  value: string
  onChange: (value: string) => void
  id: string
  includeContinue?: boolean
  nasUri?: string | null
  onNasUriChange?: (uri: string | null) => void
}

function isSpotifyPlaylist(fav: SonosFavourite): boolean {
  return (fav.contentClass?.toLowerCase() ?? '').includes('playlistcontainer')
}

export function FavouriteSelector({
  favourites,
  value,
  onChange,
  id,
  includeContinue = true,
  nasUri,
  onNasUriChange,
}: FavouriteSelectorProps) {
  const [source, setSource] = useState<Source>('all')
  const [search, setSearch] = useState('')
  const [drillAlbum, setDrillAlbum] = useState<SonosGenreAlbum | null>(null)

  const supportsNas = !!onNasUriChange

  // NAS albums — flat list
  const { data: nasAlbums = [], isLoading: nasLoading } = useQuery({
    queryKey: ['sonos', 'library', 'albums'],
    queryFn: api.sonos.getLibraryAlbums,
    staleTime: 300_000,
    enabled: supportsNas,
  })

  // Album tracks when drilling in
  const { data: albumTracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: ['sonos', 'album-tracks', drillAlbum?.objectId],
    queryFn: () => api.sonos.getAlbumTracks(drillAlbum!.objectId),
    enabled: !!drillAlbum,
    staleTime: 300_000,
  })

  // Spotify playlists from the Sonos favourites already passed in
  const spotifyPlaylists = favourites.filter(isSpotifyPlaylist)

  const q = search.trim().toLowerCase()

  const filteredNas = q
    ? nasAlbums.filter(a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))
    : nasAlbums

  const filteredSpotify = q
    ? spotifyPlaylists.filter(p => p.title.toLowerCase().includes(q))
    : spotifyPlaylists

  const filteredTracks = q
    ? albumTracks.filter((t: SonosLibraryTrack) => t.title.toLowerCase().includes(q))
    : albumTracks

  function pick(title: string, uri?: string | null) {
    onChange(title)
    onNasUriChange?.(uri ?? null)
    setDrillAlbum(null)
  }

  const sources: { id: Source; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'nas', label: 'NAS' },
    { id: 'spotify', label: 'Spotify' },
    { id: 'radio', label: 'Radio' },
  ]

  const showNas = source === 'all' || source === 'nas'
  const showSpotify = source === 'all' || source === 'spotify'
  const showRadio = source === 'all' || source === 'radio'

  // ── Album track drill-down ─────────────────────────────────────────────────

  if (drillAlbum) {
    return (
      <div id={id} className="space-y-3">
        <button
          type="button"
          onClick={() => setDrillAlbum(null)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-1 text-sm text-caption transition-colors',
            'min-h-[44px] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          {drillAlbum.name}
        </button>

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tracks…"
          className="w-full rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] h-11 px-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        />

        <ul className="overflow-y-auto rounded-xl border border-[var(--border-secondary)]" style={{ maxHeight: '340px' }}>
          {tracksLoading ? (
            <li className="px-4 py-6 text-center text-sm text-caption">Loading…</li>
          ) : filteredTracks.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-caption">No tracks found</li>
          ) : filteredTracks.map((track: SonosLibraryTrack, i: number) => {
            const isSelected = nasUri === track.uri
            return (
              <li key={track.uri + i}>
                <button
                  type="button"
                  onClick={() => pick(track.title, track.uri)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors min-h-[44px]',
                    'hover:bg-[var(--bg-tertiary)]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    isSelected && 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[14px]',
                  )}
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-caption/50">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm font-medium', isSelected ? 'text-fairy-400' : 'text-heading')}>{track.title}</span>
                    {track.artist && <span className="block truncate text-xs text-caption">{track.artist}</span>}
                  </span>
                  {track.duration_ms != null && (
                    <span className="shrink-0 text-xs text-caption/70">
                      {Math.floor(track.duration_ms / 60000)}:{String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // ── Main picker ────────────────────────────────────────────────────────────

  return (
    <div id={id} className="space-y-3">
      {includeContinue && (
        <button
          type="button"
          onClick={() => pick('__continue__')}
          aria-pressed={value === '__continue__'}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors min-h-[44px]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            value === '__continue__'
              ? 'border-fairy-500/40 bg-fairy-500/10 text-fairy-400'
              : 'border-[var(--border-secondary)] text-body hover:bg-[var(--bg-tertiary)]',
          )}
        >
          <RotateCcw className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Continue what's already playing</span>
        </button>
      )}

      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search music…"
        className="w-full rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] h-11 px-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
      />

      <div role="group" aria-label="Music source" className="flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {sources.map(s => (
          <button
            key={s.id}
            type="button"
            aria-pressed={source === s.id}
            onClick={() => { setSource(s.id); setSearch('') }}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors min-h-[44px]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              source === s.id ? 'bg-fairy-500 text-white' : 'bg-[var(--bg-tertiary)] text-caption hover:bg-[var(--bg-secondary)]',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto rounded-xl border border-[var(--border-secondary)]" style={{ maxHeight: '340px' }}>
        {/* All: source cards like Browse landing */}
        {source === 'all' && (
          <ul className="divide-y divide-[var(--border-secondary)]">
            {supportsNas && (
              <li>
                <button type="button" onClick={() => setSource('nas')}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-tertiary)] min-h-[56px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                    <HardDrive className="h-5 w-5 text-caption" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-heading">NAS</span>
                    <span className="block text-xs text-caption">{nasLoading ? 'Loading…' : `${nasAlbums.length} albums`}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-caption" />
                </button>
              </li>
            )}
            <li>
              <button type="button" onClick={() => setSource('spotify')}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-tertiary)] min-h-[56px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                  <Music className="h-5 w-5 text-caption" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-heading">Spotify</span>
                  <span className="block text-xs text-caption">{spotifyPlaylists.length} playlists</span>
                </span>
                <ChevronRight className="h-4 w-4 text-caption" />
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setSource('radio')}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-tertiary)] min-h-[56px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)]">
                  <RadioIcon className="h-5 w-5 text-caption" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-heading">Radio</span>
                  <span className="block text-xs text-caption">Stations from your Sonos</span>
                </span>
                <ChevronRight className="h-4 w-4 text-caption" />
              </button>
            </li>
          </ul>
        )}

        {/* NAS albums */}
        {source === 'nas' && supportsNas && (
          nasLoading ? (
            <p className="px-4 py-4 text-sm text-caption">Loading library…</p>
          ) : filteredNas.length === 0 ? (
            <p className="px-4 py-4 text-sm text-caption">No albums found</p>
          ) : (
            <ul>
              {filteredNas.map(album => {
                const isSelected = nasUri === album.objectId
                return (
                  <li key={album.objectId} className="flex items-center gap-3 px-4 py-2 min-h-[44px]">
                    <button
                      type="button"
                      onClick={() => pick(album.name, album.objectId)}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-3 text-left rounded-md transition-colors',
                        'hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      )}
                    >
                      <ArtworkImage src={album.albumArtUri} size={40} fallback="disc" />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm font-medium', isSelected ? 'text-fairy-400' : 'text-heading')}>{album.name}</span>
                        <span className="block truncate text-xs text-caption">{album.artist}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrillAlbum(album)}
                      aria-label={`Browse tracks in ${album.name}`}
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-caption',
                        'hover:bg-[var(--bg-tertiary)] hover:text-body transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      )}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        )}

        {/* NAS: show message when not supported */}
        {source === 'nas' && !supportsNas && (
          <p className="px-4 py-4 text-sm text-caption">NAS library not available here</p>
        )}

        {/* Spotify playlists */}
        {source === 'spotify' && (
          filteredSpotify.length === 0 ? (
            <p className="px-4 py-4 text-sm text-caption">No playlists found</p>
          ) : (
            <ul>
              {filteredSpotify.map(fav => {
                const isSelected = value === fav.title && !nasUri
                return (
                  <li key={fav.title}>
                    <button
                      type="button"
                      onClick={() => pick(fav.title, null)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors min-h-[44px]',
                        'hover:bg-[var(--bg-tertiary)]',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        isSelected && 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[14px]',
                      )}
                    >
                      {fav.albumArtURI && (
                        <ArtworkImage src={fav.albumArtURI} size={40} fallback="disc" />
                      )}
                      <span className={cn('truncate text-sm font-medium', isSelected ? 'text-fairy-400' : 'text-heading')}>{fav.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        )}

        {/* Radio stations */}
        {source === 'radio' && (
          <RadioBrowseView
            searchQuery={search}
            onPick={(station: SonosRadioStation) => pick(station.title, null)}
          />
        )}
      </div>

      {/* Selected item indicator */}
      {value && value !== '__continue__' && (
        <div className="flex items-center gap-2 rounded-lg border border-fairy-500/30 bg-fairy-500/5 px-3 py-2">
          <Music2 className="h-3.5 w-3.5 shrink-0 text-fairy-400" />
          <span className="truncate text-xs text-fairy-400">{value}</span>
        </div>
      )}
    </div>
  )
}
