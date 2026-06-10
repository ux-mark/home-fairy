import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Radio, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidateQueue } from '@/lib/queueCache'
import type { SonosRadioStation } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { Accordion } from '@/components/ui/Accordion'
import { cn } from '@/lib/utils'
import { MusicListItem } from '../MusicListItem'
import { SourceBadge } from '../SourceBadge'

// ── Skeleton / Error ──────────────────────────────────────────────────────────

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

// ── RadioStationRow ───────────────────────────────────────────────────────────

function RadioStationRow({
  station,
  speaker,
}: {
  station: SonosRadioStation
  speaker: string | null
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
      invalidateQueue(queryClient, speaker)
    },
    onError: () => toast({ message: `Failed to queue ${station.title}`, type: 'error' }),
  })

  const addToQueue = useMutation({
    mutationFn: () => api.sonos.addToQueue(speaker!, station.uri),
    onSuccess: () => {
      toast({ message: `Added "${station.title}" to queue` })
      invalidateQueue(queryClient, speaker)
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

  return (
    <MusicListItem
      artwork={{ src: station.albumArtUri, fallback: 'disc' }}
      title={station.title}
      subtitle=""
      badge={<SourceBadge source="radio" />}
      onTap={() => play.mutate()}
      onPlay={() => play.mutate()}
      playDisabled={!speaker}
      playPending={play.isPending}
      disabled={!speaker}
      menuProps={{
        label: station.title,
        onPlayNext: () => playNext.mutate(),
        onAddToQueue: () => addToQueue.mutate(),
        onAddToFavourites: () => addToFavourites.mutate(),
        fairylistTrack: {
          source: 'radio',
          source_uri: station.uri,
          title: station.title,
          album_art_uri: station.albumArtUri,
        },
      }}
    />
  )
}

// ── RadioSearchSection ────────────────────────────────────────────────────────

interface RadioSearchSectionProps {
  query: string
  speaker: string | null
}

export function RadioSearchSection({ query, speaker }: RadioSearchSectionProps) {
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
