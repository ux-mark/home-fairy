import { forwardRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Music } from 'lucide-react'
import type { SonosQueueItem, SonosPlaybackState } from '@/lib/api'
import { api } from '@/lib/api'
import { toSpotifyUri } from '@/lib/normalizeUri'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { ArtworkImage } from '../ArtworkImage'
import { MusicItemMenu } from '../MusicItemMenu'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface NowPlayingCardProps {
  speaker: string
  /** The queue item that is currently playing, or null if nothing is playing / unknown */
  item: SonosQueueItem | null
  /** Zero-based index of the currently playing item, or -1 if none */
  currentIndex: number
  playbackState?: SonosPlaybackState | null
  /** Called when the user removes the current track */
  onRemove: (index: number) => void
  /** Position within the scroll area — "sticky" pins the card, "static" is for compact contexts */
  variant?: 'sticky' | 'static'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSeconds(totalSeconds: number | undefined): string {
  if (!totalSeconds || totalSeconds < 0) return '0:00'
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function sourceLabel(uri: string | undefined): string {
  return toSpotifyUri(uri) ? 'Spotify' : 'Library'
}

// ── NowPlayingCard ────────────────────────────────────────────────────────────

export const NowPlayingCard = forwardRef<HTMLDivElement, NowPlayingCardProps>(
  function NowPlayingCard(
    { speaker, item, currentIndex, playbackState, onRemove, variant = 'sticky' },
    ref,
  ) {
    const navigate = useNavigate()
    const { toast } = useToast()

    const spotifyUri = toSpotifyUri(item?.uri)
    const source: 'spotify' | 'nas' = spotifyUri ? 'spotify' : 'nas'
    const sourceUri = spotifyUri ?? item?.uri ?? ''

    const addToFavourites = useMutation({
      mutationFn: async () => {
        if (!item) return
        await api.favourites.add({
          source,
          source_uri: sourceUri,
          title: item.title,
          album_art_uri: item.albumArtUri ?? undefined,
        })
      },
      onSuccess: () => toast({ message: `Added "${item?.title ?? 'track'}" to favourites` }),
      onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
    })

    const elapsed = playbackState?.elapsedTime ?? 0
    const duration = playbackState?.duration ?? item?.duration ?? 0
    const progressPct = useMemo(() => {
      if (!duration || duration <= 0) return 0
      return Math.min(100, Math.max(0, (elapsed / duration) * 100))
    }, [elapsed, duration])

    const stateLabel = useMemo(() => {
      const s = playbackState?.playbackState
      if (s === 'PAUSED_PLAYBACK') return 'Paused'
      if (s === 'STOPPED') return 'Stopped'
      if (s === 'TRANSITIONING') return 'Loading…'
      return 'Now playing'
    }, [playbackState?.playbackState])

    // ── Empty / unknown state ────────────────────────────────────────────────
    if (!item || currentIndex < 0) {
      return (
        <div
          ref={ref}
          className={cn(
            'flex items-center gap-3 border-y px-4 py-4',
            variant === 'sticky' && 'sticky top-0 z-20',
          )}
          style={{
            background: 'var(--bg-secondary)',
            borderColor: 'var(--border-secondary)',
          }}
          aria-label="Nothing playing"
        >
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--bg-tertiary)' }}
            aria-hidden="true"
          >
            <Music className="h-5 w-5 text-caption" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-caption">
              Nothing playing
            </p>
            <p className="mt-0.5 text-sm text-body">Pick a track below to start the queue</p>
          </div>
        </div>
      )
    }

    function handleTitleClick() {
      if (item?.uri) {
        navigate(
          `/sonos/track?uri=${encodeURIComponent(item.uri)}&speaker=${encodeURIComponent(speaker)}`,
        )
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          'border-y',
          variant === 'sticky' && 'sticky top-0 z-20',
        )}
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-secondary)',
        }}
        tabIndex={-1}
        aria-label={`${stateLabel}: ${item.title}`}
      >
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          {/* Album art — larger than a row */}
          <div className="relative shrink-0">
            <ArtworkImage src={item.albumArtUri} size={56} fallback="disc" />
            {/* Source chip overlay */}
            <span
              className={cn(
                'absolute -bottom-1 -right-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none shadow',
                source === 'spotify'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-600 text-white',
              )}
              aria-hidden="true"
            >
              {sourceLabel(item.uri)}
            </span>
          </div>

          {/* Track info */}
          <button
            onClick={handleTitleClick}
            className="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label={`View details for ${item.title}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fairy-400">
              {stateLabel}
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-tight text-heading">
              {item.title || 'Unknown track'}
            </p>
            <p className="mt-0.5 text-xs text-caption">
              {[item.artist, item.album].filter(Boolean).join(' · ')}
            </p>
          </button>

          {/* Overflow menu */}
          <div className="flex shrink-0">
            <MusicItemMenu
              label={item.title}
              onAddToFavourites={() => addToFavourites.mutate()}
              onRemove={() => onRemove(currentIndex)}
              removeLabel="Remove from queue"
              fairylistTrack={{
                source,
                source_uri: sourceUri,
                title: item.title,
                artist: item.artist,
                album_art_uri: item.albumArtUri ?? undefined,
              }}
              spotifyTrack={
                spotifyUri
                  ? { trackUri: spotifyUri, trackName: item.title }
                  : undefined
              }
            />
          </div>
        </div>

        {/* Progress bar — only if we have a duration */}
        {duration > 0 && (
          <div className="flex items-center gap-2 px-4 pb-3">
            <span className="text-[10px] tabular-nums text-caption">
              {formatSeconds(elapsed)}
            </span>
            <div
              className="h-1 flex-1 overflow-hidden rounded-full"
              style={{ background: 'var(--bg-tertiary)' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={elapsed}
              aria-label={`${formatSeconds(elapsed)} of ${formatSeconds(duration)}`}
            >
              <div
                className="h-full bg-fairy-500 transition-[width] duration-500 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-caption">
              {formatSeconds(duration)}
            </span>
          </div>
        )}
      </div>
    )
  },
)
