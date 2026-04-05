import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Music2, Tv, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import type { SonosPlaybackState, SonosGroupInfo, SonosNowPlayingEntry } from '@/lib/api'
import { ProgressBar } from './ProgressBar'
import { PlaybackControls } from './PlaybackControls'
import { SonosVolumeControl } from './SonosVolumeControl'
import { VolumeGroupPopover } from './VolumeGroupPopover'
import { InlineQueue } from './InlineQueue'
import { QueueView } from './QueueView'
import { GroupSpeakersPanel } from './GroupSpeakersPanel'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface UnifiedPlaybackCardProps {
  speaker: string
  roomName: string
  state: SonosPlaybackState | null
  group?: SonosGroupInfo | null
  allSpeakers: SonosNowPlayingEntry[]
  error?: boolean
  loading?: boolean
  onRefresh: () => void
  /**
   * 'card'  — compact layout for speaker/group cards.
   * 'full'  — large artwork layout for the Playing page.
   */
  variant: 'card' | 'full'
  /** Show volume slider (default: false — card variant handles volume separately) */
  showVolume?: boolean
  /** Show full QueueView trigger in the queue section (default: false) */
  showFullQueue?: boolean
  /** Show the grouped speakers panel at the bottom (default: true) */
  showGroupSpeakers?: boolean
  /** Limit visible queue items (only used when showFullQueue is false) */
  queueLimit?: number
  /** Additional className for the root element */
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Shared playback card component used by both SpeakerCards and the Playing page.
 *
 * Configurable via props:
 * - variant='card'  → compact artwork, no progress bar, limited queue, no volume
 * - variant='full'  → large artwork, progress bar, full queue trigger, volume with group popover
 */
export function UnifiedPlaybackCard({
  speaker,
  roomName,
  state,
  group,
  allSpeakers,
  error,
  loading,
  onRefresh,
  variant,
  showVolume = false,
  showFullQueue = false,
  showGroupSpeakers = true,
  queueLimit = 5,
  className,
}: UnifiedPlaybackCardProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [failedArtUri, setFailedArtUri] = useState<string | null>(null)
  const [queueExpanded, setQueueExpanded] = useState(false)
  const [queueViewOpen, setQueueViewOpen] = useState(false)

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sonos', 'now-playing'] })
  }, [queryClient])

  const volumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speaker, level),
    onError: () => toast({ message: 'Could not update volume', type: 'error' }),
  })

  const seekMutation = useMutation({
    mutationFn: (seconds: number) => api.sonos.seek(speaker, seconds),
    onSuccess: invalidate,
    onError: () => toast({ message: 'Could not seek', type: 'error' }),
  })

  // ── Loading ─────────────────────────────────────────────────────────────

  if (loading) {
    if (variant === 'full') {
      return (
        <div className={cn('flex flex-col gap-6 px-1 py-4', className)}>
          <Skeleton className="mx-auto aspect-square w-full max-w-xs rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-3/4 rounded-lg" />
            <Skeleton className="h-4 w-1/2 rounded-lg" />
            <Skeleton className="h-4 w-2/5 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      )
    }
    return null
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className={cn('rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400', className)}>
        Could not reach this speaker.{' '}
        <button
          onClick={onRefresh}
          className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Empty ────────────────────────────────────────────────────────────────

  if (!state || (state.playbackState === 'STOPPED' && !state.currentTrack.title && !state.currentTrack.stationName)) {
    if (variant === 'full') {
      return (
        <div className={cn('flex flex-col items-center justify-center gap-6 py-12 text-center', className)}>
          <Music2 className="h-16 w-16 text-caption/30" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-heading">Nothing playing</h2>
            <p className="mt-1 max-w-xs text-sm text-caption">
              Start playing music from the Favourites tab or your Sonos app.
            </p>
          </div>
        </div>
      )
    }
    return (
      <p className={cn('text-sm text-caption', className)}>Nothing playing</p>
    )
  }

  if (!state) return null

  const { currentTrack } = state
  const isTv = state.inputSource === 'tv'
  const isLineIn = state.inputSource === 'line-in'
  const isLineSource = isTv || isLineIn
  const isPlaying = state.playbackState === 'PLAYING'

  const title = isTv
    ? 'TV Audio'
    : currentTrack.stationName || currentTrack.title || 'Unknown track'
  const artist = isTv ? null : currentTrack.artist || null
  const album = isTv ? null : currentTrack.album || null
  const artUri = currentTrack.albumArtUri
  const showArt = !isLineSource && artUri && artUri !== failedArtUri
  const elapsed = state.elapsedTime ?? 0
  const duration = state.duration ?? 0
  const trackUri = currentTrack.uri

  function handleArtworkClick() {
    if (trackUri && !isLineSource) {
      navigate(`/sonos/track?uri=${encodeURIComponent(trackUri)}&speaker=${encodeURIComponent(speaker)}`)
    }
  }

  // ── Full variant ─────────────────────────────────────────────────────────

  if (variant === 'full') {
    return (
      <div className={cn('flex flex-col gap-5', className)}>
        {/* Large album art — tappable */}
        <button
          onClick={handleArtworkClick}
          disabled={isLineSource || !trackUri}
          aria-label={trackUri && !isLineSource ? `View details for ${title}` : undefined}
          className={cn(
            'mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-xl',
            'bg-[var(--bg-secondary)] flex items-center justify-center',
            !isPlaying && 'opacity-80',
            (isLineSource || !trackUri) && 'cursor-default',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          {isLineSource ? (
            <Tv className="h-16 w-16 text-caption" aria-hidden="true" />
          ) : showArt ? (
            <img
              src={artUri}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setFailedArtUri(artUri ?? null)}
            />
          ) : (
            <ImageOff className="h-16 w-16 text-caption" aria-hidden="true" />
          )}
        </button>

        {/* Track metadata — title tappable */}
        <div className="min-w-0 text-center">
          <button
            onClick={handleArtworkClick}
            disabled={isLineSource || !trackUri}
            className={cn(
              'text-xl font-semibold leading-tight text-heading',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded',
              (isLineSource || !trackUri) && 'cursor-default',
            )}
          >
            {title}
          </button>
          {artist && (
            <p className="mt-1 text-base text-caption">{artist}</p>
          )}
          {album && (
            <p className="mt-0.5 text-sm text-caption/70">{album}</p>
          )}
        </div>

        {/* Progress bar */}
        <ProgressBar
          elapsed={elapsed}
          duration={duration}
          playing={isPlaying}
          onSeek={seconds => seekMutation.mutate(seconds)}
        />

        {/* Playback controls */}
        <PlaybackControls
          speaker={speaker}
          state={state}
          onInvalidate={invalidate}
        />

        {/* Volume — with group popover */}
        {showVolume && (
          <div>
            <p className="mb-2 text-xs font-medium text-caption">Volume</p>
            <VolumeGroupPopover
              speaker={speaker}
              value={state.volume}
              onChange={level => volumeMutation.mutate(level)}
              group={group}
              allSpeakers={allSpeakers}
              label={`${roomName} volume`}
            />
          </div>
        )}

        {/* Queue section */}
        {showFullQueue ? (
          <>
            <InlineQueue
              speaker={speaker}
              currentTrackUri={trackUri ?? null}
              expanded={queueExpanded}
              onToggle={() => setQueueExpanded(v => !v)}
              playbackState={state}
              onViewFullQueue={() => setQueueViewOpen(true)}
            />
            <QueueView
              speaker={speaker}
              open={queueViewOpen}
              onClose={() => setQueueViewOpen(false)}
              currentTrackUri={trackUri ?? null}
              playbackState={state}
            />
          </>
        ) : (
          <InlineQueue
            speaker={speaker}
            currentTrackUri={trackUri ?? null}
            expanded={queueExpanded}
            onToggle={() => setQueueExpanded(v => !v)}
            queueLimit={queueLimit}
            playbackState={state}
          />
        )}

        {/* Group speakers panel */}
        {showGroupSpeakers && (
          <GroupSpeakersPanel
            coordinatorSpeaker={speaker}
            group={group}
            allSpeakers={allSpeakers}
          />
        )}
      </div>
    )
  }

  // ── Card variant ─────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Compact now-playing row: artwork + track info — tappable */}
      <button
        onClick={handleArtworkClick}
        disabled={isLineSource || !trackUri}
        aria-label={trackUri && !isLineSource ? `View details for ${title}` : undefined}
        className={cn(
          'flex items-center gap-3 w-full text-left rounded-lg',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          (isLineSource || !trackUri) && 'cursor-default',
        )}
      >
        {/* Album art */}
        <div
          className={cn(
            'relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]',
            !isPlaying && 'opacity-60',
          )}
          aria-hidden="true"
        >
          {isLineSource ? (
            <Tv className="h-6 w-6 text-caption" aria-hidden="true" />
          ) : showArt ? (
            <img
              src={artUri}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setFailedArtUri(artUri ?? null)}
            />
          ) : (
            <ImageOff className="h-6 w-6 text-caption" aria-hidden="true" />
          )}
        </div>

        {/* Track info */}
        <div className="min-w-0 flex-1">
          <p className={cn(
            'truncate text-sm font-semibold leading-tight',
            isPlaying ? 'text-heading' : 'text-caption',
          )}>
            {title}
          </p>
          {artist && (
            <p className="mt-0.5 truncate text-xs text-caption">{artist}</p>
          )}
          {album && (
            <p className="mt-0.5 truncate text-[11px] text-caption/70">{album}</p>
          )}
        </div>
      </button>

      {/* Playback controls */}
      <PlaybackControls
        speaker={speaker}
        state={state}
        onInvalidate={invalidate}
      />

      {/* Volume (card variant — optional, usually false) */}
      {showVolume && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-caption">Volume</p>
          <SonosVolumeControl
            value={state.volume}
            onChange={level => volumeMutation.mutate(level)}
            label={`${roomName} volume`}
          />
        </div>
      )}

      {/* Queue with optional limit */}
      <InlineQueue
        speaker={speaker}
        currentTrackUri={trackUri ?? null}
        expanded={queueExpanded}
        onToggle={() => setQueueExpanded(v => !v)}
        queueLimit={queueLimit}
        playbackState={state}
        onViewFullQueue={showFullQueue ? () => setQueueViewOpen(true) : undefined}
      />
      {showFullQueue && (
        <QueueView
          speaker={speaker}
          open={queueViewOpen}
          onClose={() => setQueueViewOpen(false)}
          currentTrackUri={trackUri ?? null}
          playbackState={state}
        />
      )}

      {/* Group speakers panel */}
      {showGroupSpeakers && (
        <GroupSpeakersPanel
          coordinatorSpeaker={speaker}
          group={group}
          allSpeakers={allSpeakers}
        />
      )}
    </div>
  )
}
