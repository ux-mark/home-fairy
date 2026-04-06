import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Search, X, Music, Radio, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { SonosGenreAlbum, SpotifyAlbum, SpotifyArtist, SpotifyPlaylist } from '@/lib/api'
import { NasBrowseView } from './NasBrowseView'
import { SpotifyBrowseView } from './SpotifyBrowseView'
import { RadioBrowseView } from './RadioBrowseView'
import { UnifiedSearchResults } from './UnifiedSearchResults'
import { SpeakerSelectorDropdown } from './SpeakerSelectorDropdown'
import { usePlaybackState } from '@/hooks/usePlaybackState'

// ── Types ─────────────────────────────────────────────────────────────────────

type SourceFilter = 'all' | 'nas' | 'spotify' | 'radio'

interface SourceConfig {
  id: SourceFilter
  label: string
  Icon: React.ElementType
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCES: SourceConfig[] = [
  { id: 'all', label: 'All', Icon: Search },
  { id: 'nas', label: 'NAS', Icon: HardDrive },
  { id: 'spotify', label: 'Spotify', Icon: Music },
  { id: 'radio', label: 'Radio', Icon: Radio },
]

// ── Source status subtitle helpers ────────────────────────────────────────────

function SpotifyStatusSubtitle() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: api.spotify.getStatus,
    staleTime: 30_000,
    retry: 1,
  })

  if (isLoading) return <p className="text-xs text-caption">Checking…</p>
  if (isError) return (
    <span className="flex items-center gap-1 text-xs text-amber-400">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Unavailable
    </span>
  )
  if (data?.connected) return (
    <span className="flex items-center gap-1 text-xs text-emerald-400">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Connected
    </span>
  )
  if (data && !data.configured) return <p className="text-xs text-caption">Not configured</p>
  return <p className="text-xs text-caption">Not connected</p>
}

function RadioStatusSubtitle() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sonos-radio-stations'],
    queryFn: api.sonos.getRadioStations,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <p className="text-xs text-caption">Checking…</p>
  if (isError) return (
    <span className="flex items-center gap-1 text-xs text-amber-400">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Unavailable
    </span>
  )
  const count = data?.length ?? 0
  return <p className="text-xs text-caption">{count} {count === 1 ? 'station' : 'stations'}</p>
}

function NasStatusSubtitle() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sonos-library-genres'],
    queryFn: api.sonos.getLibraryGenres,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <p className="text-xs text-caption">Checking…</p>
  if (isError) return (
    <span className="flex items-center gap-1 text-xs text-amber-400">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Unavailable
    </span>
  )
  const count = data?.length ?? 0
  if (count === 0) return <p className="text-xs text-caption">Not indexed</p>
  return <p className="text-xs text-caption">{count} genres</p>
}

// ── Source preview card (used in the 'all' view) ──────────────────────────────

function SourcePreviewCard({
  source,
  onClick,
}: {
  source: SourceConfig
  onClick: () => void
}) {
  const { label, Icon, id } = source
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] px-4 py-3',
        'text-left transition-colors hover:bg-[var(--bg-tertiary)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        'min-h-[56px] w-full',
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
        <Icon className="h-5 w-5 text-fairy-400" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium text-heading">{label}</p>
        {id === 'spotify' && <SpotifyStatusSubtitle />}
        {id === 'radio' && <RadioStatusSubtitle />}
        {id === 'nas' && <NasStatusSubtitle />}
      </div>
    </button>
  )
}

// ── All-sources overview ───────────────────────────────────────────────────────

function AllSourcesView({ onSelectSource }: { onSelectSource: (s: SourceFilter) => void }) {
  const sourcesWithoutAll = SOURCES.filter(s => s.id !== 'all')
  return (
    <div className="flex flex-col gap-3">
      {sourcesWithoutAll.map(source => (
        <SourcePreviewCard
          key={source.id}
          source={source}
          onClick={() => onSelectSource(source.id)}
        />
      ))}
    </div>
  )
}

// ── BrowseTab ─────────────────────────────────────────────────────────────────

interface BrowseTabProps {
  targetSpeaker?: string
}

export function BrowseTab({ targetSpeaker }: BrowseTabProps = {}) {
  const [activeSource, setActiveSource] = useState<SourceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const { selectedSpeaker, setSelectedSpeaker } = usePlaybackState()

  // Sync URL-provided speaker into global context so the dropdown reflects it
  useEffect(() => {
    if (targetSpeaker && targetSpeaker !== selectedSpeaker) {
      setSelectedSpeaker(targetSpeaker)
    }
  }, [targetSpeaker]) // eslint-disable-line react-hooks/exhaustive-deps

  // Use context speaker unless a targetSpeaker override is provided
  const effectiveSpeaker = targetSpeaker ?? selectedSpeaker ?? undefined
  const speakerQuery = effectiveSpeaker ? `?speaker=${encodeURIComponent(effectiveSpeaker)}` : ''

  return (
    <div className="flex flex-col gap-4">
      {/* Speaker selector */}
      <div className="flex items-center">
        <SpeakerSelectorDropdown /></div>
      {/* Search bar */}
      <div className="relative flex items-center">
        <Search
          className="pointer-events-none absolute left-3 h-4 w-4 text-caption"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search music…"
          aria-label="Search music"
          className={cn(
            'w-full rounded-xl bg-[var(--bg-secondary)] py-3 pl-9 pr-10',
            'min-h-[44px] text-sm text-body placeholder:text-caption',
            'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-fairy-500',
            'border-none ring-0',
          )}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className={cn(
              'absolute right-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bg-tertiary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fairy-500',
            )}
          >
            <X className="h-3 w-3 text-caption" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Source filter strip */}
      <div
        role="tablist"
        aria-label="Browse by source"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SOURCES.map(({ id, label }) => {
          const isActive = activeSource === id
          return (
            <button
              key={id}
              id={`browse-tab-${id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`browse-panel-${id}`}
              onClick={() => setActiveSource(id)}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                'min-h-[36px]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                isActive
                  ? 'bg-fairy-500 text-white'
                  : 'bg-[var(--bg-secondary)] text-caption hover:text-body',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Source content panel */}
      <div
        id={`browse-panel-${activeSource}`}
        role="tabpanel"
        aria-labelledby={`browse-tab-${activeSource}`}
      >
        {activeSource === 'all' && searchQuery ? (
          <UnifiedSearchResults
            searchQuery={searchQuery}
            targetSpeaker={effectiveSpeaker}
            onSelectNasArtist={(name) => {
              setSearchQuery('')
              navigate(`/sonos/browse/nas/artist/${encodeURIComponent(name)}${speakerQuery}`)
            }}
            onSelectNasAlbum={(album: SonosGenreAlbum) => {
              setSearchQuery('')
              navigate(
                `/sonos/browse/nas/album/${encodeURIComponent(album.artist)}/${encodeURIComponent(album.name)}${speakerQuery}`,
                { state: { objectId: album.objectId } },
              )
            }}
            onSelectSpotifyAlbum={(album: SpotifyAlbum) => {
              setSearchQuery('')
              navigate(`/sonos/browse/spotify/album/${encodeURIComponent(album.id)}${speakerQuery}`)
            }}
            onSelectSpotifyArtist={(artist: SpotifyArtist) => {
              setSearchQuery('')
              navigate(`/sonos/browse/spotify/artist/${encodeURIComponent(artist.id)}${speakerQuery}`)
            }}
            onSelectSpotifyPlaylist={(playlist: SpotifyPlaylist) => {
              setSearchQuery('')
              navigate(`/sonos/browse/spotify/playlist/${encodeURIComponent(playlist.id)}${speakerQuery}`)
            }}
          />
        ) : activeSource === 'all' ? (
          <AllSourcesView onSelectSource={setActiveSource} />
        ) : null}
        {activeSource === 'nas' && (
          <NasBrowseView
            searchQuery={searchQuery}
            targetSpeaker={effectiveSpeaker}
          />
        )}
        {activeSource === 'spotify' && (
          <SpotifyBrowseView
            searchQuery={searchQuery}
            targetSpeaker={effectiveSpeaker}
          />
        )}
        {activeSource === 'radio' && (
          <RadioBrowseView searchQuery={searchQuery} targetSpeaker={effectiveSpeaker} />
        )}
      </div>
    </div>
  )
}
