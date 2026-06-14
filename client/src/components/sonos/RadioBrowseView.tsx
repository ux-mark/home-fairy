import { useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import {
  AlertTriangle,
  Play,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosRadioStation } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { useDebounce } from '@/hooks/useBrowseShared'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { ArtworkImage } from './ArtworkImage'
import { MusicItemMenu } from './MusicItemMenu'
import { ActiveTrackIndicator } from './ActiveTrackIndicator'
import { usePlaybackState } from '@/hooks/usePlaybackState'

// ── Skeleton ─────────────────────────────────────────────────────────────────

function StationListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading stations">
      {Array.from({ length: 5 }).map((_, i) => (
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
  title = 'Radio stations unavailable',
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

// ── Station row ───────────────────────────────────────────────────────────────

function StationRow({
  station,
  speaker,
  isActive = false,
  isPlaying = false,
  onPick,
  selectedTitle,
}: {
  station: SonosRadioStation
  speaker: string | null
  isActive?: boolean
  isPlaying?: boolean
  onPick?: (station: SonosRadioStation) => void
  selectedTitle?: string
}) {
  const { toast } = useToast()

  const play = useMutation({
    mutationFn: () => api.sonos.playFavourite(speaker!, station.title),
    onSuccess: () => toast({ message: `Playing ${station.title}` }),
    onError: () => toast({ message: `Failed to play ${station.title}`, type: 'error' }),
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

  // Returns the row body without an outer wrapper element so the caller can
  // pick (`<li>`, `<div role="listitem">`, an absolutely-positioned virtual
  // row) without nesting elements.
  if (onPick) {
    const isSelected = selectedTitle === station.title
    return (
      <button
        type="button"
        onClick={() => onPick(station)}
        aria-label={`Select ${station.title}`}
        aria-pressed={isSelected}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
          'min-h-[44px] hover:bg-[var(--bg-tertiary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          isSelected ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[14px]' : 'border-l-2 border-transparent',
        )}
      >
        <ArtworkImage src={station.albumArtUri} size={40} fallback="disc" />
        <span className={cn('truncate text-sm font-medium', isSelected ? 'text-fairy-400' : 'text-heading')}>
          {station.title}
        </span>
      </button>
    )
  }

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5', isActive && 'bg-fairy-500/5')}>
      <div className="relative shrink-0">
        <ArtworkImage src={station.albumArtUri} size={40} fallback="disc" />
        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40">
            <ActiveTrackIndicator isActive={isActive} isPlaying={isPlaying} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', isActive ? 'text-fairy-400' : 'text-heading')}>
          {station.title}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={!speaker || play.isPending}
          onClick={() => play.mutate()}
          aria-label={`Play ${station.title}`}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Radio streams can't sit on a Sonos queue — no queue actions here */}
        <MusicItemMenu
          label={station.title}
          disabled={!speaker}
          onAddToFavourites={() => addToFavourites.mutate()}
          fairylistTrack={{
            source: 'radio',
            source_uri: station.uri,
            title: station.title,
            album_art_uri: station.albumArtUri,
          }}
        />
      </div>
    </div>
  )
}

// ── RadioBrowseView ───────────────────────────────────────────────────────────

interface RadioBrowseViewProps {
  searchQuery: string
  targetSpeaker?: string | null
  onPick?: (station: SonosRadioStation) => void
  selectedTitle?: string
}

export function RadioBrowseView({ searchQuery, targetSpeaker, onPick, selectedTitle }: RadioBrowseViewProps) {
  const { selectedSpeaker, isTrackActive, isSelectedPlaying } = usePlaybackState()
  const speaker = targetSpeaker ?? selectedSpeaker
  const debouncedQuery = useDebounce(searchQuery.trim(), 300)
  const parentRef = useRef<HTMLDivElement>(null)

  const { data: stations, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sonos-radio-stations'],
    queryFn: api.sonos.getRadioStations,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <StationListSkeleton />

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message ?? 'Failed to load radio stations'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!stations || stations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Radio className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No stations found</p>
          <p className="mt-1 max-w-xs text-xs text-caption">
            Add radio stations to your Sonos favourites to see them here.
          </p>
        </div>
      </div>
    )
  }

  const filtered = debouncedQuery
    ? stations.filter(s => s.title.toLowerCase().includes(debouncedQuery.toLowerCase()))
    : stations

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Radio className="h-10 w-10 text-caption/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-heading">No stations match</p>
          <p className="mt-1 text-xs text-caption">Try a different search term</p>
        </div>
      </div>
    )
  }

  return (
    <VirtualisedStationList
      filtered={filtered}
      speaker={speaker}
      isTrackActive={isTrackActive}
      isSelectedPlaying={isSelectedPlaying}
      onPick={onPick}
      selectedTitle={selectedTitle}
      parentRef={parentRef}
    />
  )
}

// ── Virtualised list ──────────────────────────────────────────────────────────
// Long lists of radio stations on iOS Safari blow the DOM out and slow scroll.
// useWindowVirtualizer renders only the rows currently in (or near) the
// viewport against the document scroll, with a tall sized container so the
// scrollbar reflects total list height.

interface VirtualisedStationListProps {
  filtered: SonosRadioStation[]
  speaker: string | null
  isTrackActive: (uri: string | undefined, title: string) => boolean
  isSelectedPlaying: boolean
  onPick?: (station: SonosRadioStation) => void
  selectedTitle?: string
  parentRef: React.RefObject<HTMLDivElement | null>
}

function VirtualisedStationList({
  filtered,
  speaker,
  isTrackActive,
  isSelectedPlaying,
  onPick,
  selectedTitle,
  parentRef,
}: VirtualisedStationListProps) {
  const virtualizer = useWindowVirtualizer({
    count: filtered.length,
    estimateSize: () => 60,
    overscan: 6,
    // scrollMargin ensures absolute positions are relative to the parent's
    // top in the document, not to the window itself.
    scrollMargin: parentRef.current?.offsetTop ?? 0,
    getItemKey: i => filtered[i].uri + ':' + i,
  })

  return (
    <div
      ref={parentRef}
      role="list"
      className="-mx-4"
      style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
    >
      {virtualizer.getVirtualItems().map(item => {
        const station = filtered[item.index]
        const isActive = isTrackActive(station.uri, station.title)
        return (
          <div
            key={item.key}
            role="listitem"
            data-index={item.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <StationRow
              station={station}
              speaker={speaker}
              isActive={isActive}
              isPlaying={isActive && isSelectedPlaying}
              onPick={onPick}
              selectedTitle={selectedTitle}
            />
          </div>
        )
      })}
    </div>
  )
}
