import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Music2, Tv, ImageOff, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import type { SonosPlaybackState } from '@/lib/api'
import { ProgressBar } from './ProgressBar'
import { PlaybackControls } from './PlaybackControls'
import { SonosVolumeControl } from './SonosVolumeControl'
import { SpeakerSelector } from './SpeakerSelector'

interface NowPlayingFullViewProps {
  speaker: string
  state: SonosPlaybackState | null
  allSpeakers: string[]
  selectedSpeaker: string
  onSpeakerChange: (name: string) => void
  loading: boolean
  error: boolean
}

/**
 * Full-screen now-playing view for a single speaker.
 * Shows: large album art, track metadata, progress bar,
 * playback controls, volume slider, and speaker selector.
 */
export function NowPlayingFullView({
  speaker,
  state,
  allSpeakers,
  selectedSpeaker,
  onSpeakerChange,
  loading,
  error,
}: NowPlayingFullViewProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [failedArtUri, setFailedArtUri] = useState<string | null>(null)

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

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-1 py-4">
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

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-red-400" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold text-heading">Cannot reach this speaker</h2>
          <p className="mt-1 max-w-xs text-sm text-caption">
            Check that your Sonos system is powered on and reachable.
          </p>
        </div>
        {allSpeakers.length > 1 && (
          <SpeakerSelector
            speakers={allSpeakers.map(n => ({ name: n }))}
            selectedSpeaker={selectedSpeaker}
            onSpeakerChange={onSpeakerChange}
            className="w-full max-w-xs"
          />
        )}
      </div>
    )
  }

  // ── Empty — no track ──────────────────────────────────────────────────────

  if (!state || state.playbackState === 'STOPPED') {
    const hasContent = state && (state.currentTrack.title || state.currentTrack.stationName)

    if (!hasContent) {
      return (
        <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
          <Music2 className="h-16 w-16 text-caption/30" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-heading">Nothing playing</h2>
            <p className="mt-1 max-w-xs text-sm text-caption">
              Start playing music from the Favourites tab or your Sonos app.
            </p>
          </div>
          {allSpeakers.length > 1 && (
            <SpeakerSelector
              speakers={allSpeakers.map(n => ({ name: n }))}
              selectedSpeaker={selectedSpeaker}
              onSpeakerChange={onSpeakerChange}
              className="w-full max-w-xs"
            />
          )}
        </div>
      )
    }
  }

  if (!state) return null

  const { currentTrack } = state
  const isTv = state.inputSource === 'tv'
  const isLineIn = state.inputSource === 'line-in'
  const isLineSource = isTv || isLineIn

  const title = isTv
    ? 'TV Audio'
    : currentTrack.stationName || currentTrack.title || 'Unknown track'
  const artist = isTv ? null : currentTrack.artist || null
  const album = isTv ? null : currentTrack.album || null

  const artUri = currentTrack.albumArtUri
  const showArt = !isLineSource && artUri && artUri !== failedArtUri
  const elapsed = state.elapsedTime ?? 0
  const duration = state.duration ?? 0
  const isPlaying = state.playbackState === 'PLAYING'

  return (
    <div className="flex flex-col gap-5">
      {/* Album art */}
      <div
        className={cn(
          'mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-xl',
          'bg-[var(--bg-secondary)] flex items-center justify-center',
          !isPlaying && 'opacity-80',
        )}
        aria-hidden="true"
      >
        {isLineSource ? (
          <Tv className="h-16 w-16 text-caption" />
        ) : showArt ? (
          <img
            src={artUri}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setFailedArtUri(artUri ?? null)}
          />
        ) : (
          <ImageOff className="h-16 w-16 text-caption" />
        )}
      </div>

      {/* Track metadata */}
      <div className="min-w-0 text-center">
        <p
          className="text-xl font-semibold leading-tight text-heading"
          title={title}
        >
          {title}
        </p>
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

      {/* Volume */}
      <div>
        <p className="mb-2 text-xs font-medium text-caption">Volume</p>
        <SonosVolumeControl
          value={state.volume}
          onChange={level => volumeMutation.mutate(level)}
          label={`${selectedSpeaker} volume`}
        />
      </div>

      {/* Speaker selector */}
      {allSpeakers.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-medium text-caption">Speaker</p>
          <SpeakerSelector
            speakers={allSpeakers.map(n => ({ name: n }))}
            selectedSpeaker={selectedSpeaker}
            onSpeakerChange={onSpeakerChange}
          />
        </div>
      )}
    </div>
  )
}
