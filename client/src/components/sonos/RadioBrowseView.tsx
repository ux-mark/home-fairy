import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Heart,
  ListStart,
  MoreVertical,
  Play,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosRadioStation } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { ArtworkImage } from './ArtworkImage'

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
}: {
  station: SonosRadioStation
  speaker: string | null
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

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
    <li className="flex items-center gap-3 px-4 py-2.5">
      <ArtworkImage src={station.albumArtUri} size={40} fallback="disc" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{station.title}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Play now — universally recognisable icon, icon-only acceptable */}
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

        {/* Three-dot menu */}
        <div className="shrink-0">
          <button
            ref={menuBtnRef}
            type="button"
            disabled={!speaker}
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false)
              } else {
                if (menuBtnRef.current) {
                  const rect = menuBtnRef.current.getBoundingClientRect()
                  const showAbove = rect.bottom + 120 > window.innerHeight
                  setMenuPos({
                    top: showAbove ? rect.top - 120 - 4 : rect.bottom + 4,
                    right: window.innerWidth - rect.right,
                  })
                }
                setMenuOpen(true)
              }
            }}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            aria-label={`More options for ${station.title}`}
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

          {menuOpen && menuPos && createPortal(
            <ul
              role="menu"
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
              className="z-[200] min-w-[160px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
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
                  onClick={() => { setMenuOpen(false); addToFavourites.mutate() }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                >
                  <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add to favourites
                </button>
              </li>
            </ul>,
            document.body,
          )}
        </div>
      </div>
    </li>
  )
}

// ── RadioBrowseView ───────────────────────────────────────────────────────────

interface RadioBrowseViewProps {
  searchQuery: string
  targetSpeaker?: string | null
}

export function RadioBrowseView({ searchQuery, targetSpeaker }: RadioBrowseViewProps) {
  const firstSpeaker = useFirstSpeaker()
  const speaker = targetSpeaker ?? firstSpeaker
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
      {filtered.map((station, i) => (
        <StationRow key={station.uri + ':' + i} station={station} speaker={speaker} />
      ))}
    </ul>
  )
}
