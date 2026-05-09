import { useState } from 'react'
import { ChevronLeft, Music2, RotateCcw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { SonosFavourite, SonosGenreAlbum, SonosLibraryTrack, SonosRadioStation } from '@/lib/api'
import { NasBrowseView } from './NasBrowseView'
import { SpotifyBrowseView } from './SpotifyBrowseView'
import { RadioBrowseView } from './RadioBrowseView'
import { ArtworkImage } from './ArtworkImage'

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

export function FavouriteSelector({
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

  // Fetch album tracks when drilling into an album
  const { data: albumTracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: ['sonos', 'album-tracks', drillAlbum?.objectId],
    queryFn: () => api.sonos.getAlbumTracks(drillAlbum!.objectId),
    enabled: !!drillAlbum,
    staleTime: 300_000,
  })

  function pickNasAlbum(album: SonosGenreAlbum) {
    onChange(album.name)
    onNasUriChange?.(album.objectId)
  }

  function pickNasTrack(track: SonosLibraryTrack) {
    onChange(track.title)
    onNasUriChange?.(track.uri)
    setDrillAlbum(null)
  }

  function pickSpotifyPlaylist(title: string) {
    onChange(title)
    onNasUriChange?.(null)
  }

  function pickRadioStation(station: SonosRadioStation) {
    onChange(station.title)
    onNasUriChange?.(null)
  }

  function pickContinue() {
    onChange('__continue__')
    onNasUriChange?.(null)
  }

  const sources: { id: Source; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'nas', label: 'NAS' },
    { id: 'spotify', label: 'Spotify' },
    { id: 'radio', label: 'Radio' },
  ]

  // ── Album track drill-down view ───────────────────────────────────────────

  if (drillAlbum) {
    return (
      <div id={id} className="space-y-3">
        <button
          type="button"
          onClick={() => setDrillAlbum(null)}
          aria-label="Back to albums"
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-1 text-sm text-caption transition-colors',
            'min-h-[44px] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {drillAlbum.name}
        </button>

        <div className="overflow-y-auto rounded-xl border border-[var(--border-secondary)]" style={{ maxHeight: '340px' }}>
          {tracksLoading ? (
            <p className="px-4 py-6 text-center text-sm text-caption">Loading tracks…</p>
          ) : albumTracks.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-caption">No tracks found</p>
          ) : (
            <ul>
              {albumTracks.map((track, i) => {
                const isSelected = nasUri === track.uri
                return (
                  <li key={track.uri + i}>
                    <button
                      type="button"
                      onClick={() => pickNasTrack(track)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        'min-h-[44px] hover:bg-[var(--bg-tertiary)]',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        isSelected && 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[14px]',
                      )}
                    >
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-caption/50">{i + 1}</span>
                      <ArtworkImage src={track.albumArtUri} size={36} fallback="disc" />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm font-medium', isSelected ? 'text-fairy-400' : 'text-heading')}>{track.title}</span>
                        {track.artist && <span className="block truncate text-xs text-caption">{track.artist}</span>}
                      </span>
                      {track.duration_ms && (
                        <span className="shrink-0 text-xs text-caption/70">
                          {Math.floor(track.duration_ms / 60000)}:{String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // ── Main picker view ──────────────────────────────────────────────────────

  return (
    <div id={id} className="space-y-3">
      {/* Continue what's already playing */}
      {includeContinue && (
        <button
          type="button"
          onClick={pickContinue}
          aria-pressed={value === '__continue__'}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
            'min-h-[44px]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            value === '__continue__'
              ? 'border-fairy-500/40 bg-fairy-500/10 text-fairy-400'
              : 'border-[var(--border-secondary)] text-body hover:bg-[var(--bg-tertiary)]',
          )}
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">Continue what's already playing</span>
        </button>
      )}

      {/* Search input */}
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search music..."
        className={cn(
          'w-full rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)]',
          'h-11 px-3 text-sm text-heading placeholder:text-caption',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        )}
      />

      {/* Source tabs */}
      <div
        role="group"
        aria-label="Music source"
        className="flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {sources.map(s => (
          <button
            key={s.id}
            type="button"
            aria-pressed={source === s.id}
            onClick={() => setSource(s.id)}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              'min-h-[44px]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              source === s.id
                ? 'bg-fairy-500 text-white'
                : 'bg-[var(--bg-tertiary)] text-caption hover:bg-[var(--bg-secondary)]',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Browse views */}
      <div className="overflow-y-auto rounded-xl border border-[var(--border-secondary)]" style={{ maxHeight: '340px' }}>
        {(source === 'all' || source === 'nas') && (
          <NasBrowseView
            searchQuery={search}
            onPickAlbum={supportsNas ? pickNasAlbum : undefined}
            onDrillIntoAlbum={supportsNas ? setDrillAlbum : undefined}
          />
        )}
        {(source === 'all' || source === 'spotify') && (
          <SpotifyBrowseView
            searchQuery={search}
            onPickPlaylist={pickSpotifyPlaylist}
          />
        )}
        {(source === 'all' || source === 'radio') && (
          <RadioBrowseView
            searchQuery={search}
            onPick={pickRadioStation}
          />
        )}
      </div>

      {/* Selected item summary (non-continue) */}
      {value && value !== '__continue__' && (
        <div className="flex items-center gap-2 rounded-lg border border-fairy-500/30 bg-fairy-500/5 px-3 py-2">
          <Music2 className="h-3.5 w-3.5 shrink-0 text-fairy-400" aria-hidden="true" />
          <span className="truncate text-xs text-fairy-400">{value}</span>
        </div>
      )}
    </div>
  )
}
