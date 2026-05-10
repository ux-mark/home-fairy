import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
  const { toast } = useToast()

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

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addToQueue(speaker!, station.uri),
    onSuccess: () => {
      toast({ message: `Added "${station.title}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos-queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
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

  if (onPick) {
    const isSelected = selectedTitle === station.title
    return (
      <li>
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
      </li>
    )
  }

  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', isActive && 'bg-fairy-500/5')}>
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

        <MusicItemMenu
          label={station.title}
          disabled={!speaker}
          onPlayNext={() => playNext.mutate()}
          onAddToQueue={() => addToQueue.mutate()}
          onAddToFavourites={() => addToFavourites.mutate()}
          fairylistTrack={{
            source: 'radio',
            source_uri: station.uri,
            title: station.title,
            album_art_uri: station.albumArtUri,
          }}
        />
      </div>
    </li>
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
    <ul className="-mx-4">
      {filtered.map((station, i) => {
        const isActive = isTrackActive(station.uri, station.title)
        return (
          <StationRow
            key={station.uri + ':' + i}
            station={station}
            speaker={speaker}
            isActive={isActive}
            isPlaying={isActive && isSelectedPlaying}
            onPick={onPick}
            selectedTitle={selectedTitle}
          />
        )
      })}
    </ul>
  )
}
