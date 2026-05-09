import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SonosFavourite, SonosGenreAlbum, SonosRadioStation } from '@/lib/api'
import { NasBrowseView } from './NasBrowseView'
import { SpotifyBrowseView } from './SpotifyBrowseView'
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

  const supportsNas = !!onNasUriChange

  function pickNasAlbum(album: SonosGenreAlbum) {
    onChange(album.name)
    onNasUriChange?.(album.objectId)
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
    ...(supportsNas ? [{ id: 'nas' as Source, label: 'NAS' }] : []),
    { id: 'spotify', label: 'Spotify' },
    { id: 'radio', label: 'Radio' },
  ]

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

      {/* Browse view */}
      <div className="overflow-y-auto rounded-xl border border-[var(--border-secondary)]" style={{ maxHeight: '340px' }}>
        {(source === 'all' || source === 'nas') && supportsNas && (
          <NasBrowseView
            searchQuery={source === 'nas' || source === 'all' ? search : ''}
            onPickAlbum={pickNasAlbum}
          />
        )}
        {(source === 'all' || source === 'spotify') && (
          <SpotifyBrowseView
            searchQuery={source === 'spotify' || source === 'all' ? search : ''}
            onPickPlaylist={pickSpotifyPlaylist}
          />
        )}
        {(source === 'all' || source === 'radio') && (
          <RadioBrowseView
            searchQuery={source === 'radio' || source === 'all' ? search : ''}
            onPick={pickRadioStation}
          />
        )}
      </div>
    </div>
  )
}
