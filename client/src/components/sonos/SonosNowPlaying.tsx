import { ImageOff, Tv } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SonosPlaybackState } from '@/lib/api'

interface SonosNowPlayingProps {
  state: SonosPlaybackState
  className?: string
}

/**
 * Compact "now playing" display: album art + track title + artist.
 * Used inside SonosSpeakerCard.
 */
export function SonosNowPlaying({ state, className }: SonosNowPlayingProps) {
  const { currentTrack, playbackState, inputSource } = state
  const isActive = playbackState === 'PLAYING' || playbackState === 'PAUSED_PLAYBACK'
  const isTv = inputSource === 'tv'
  const isLineIn = inputSource === 'line-in'

  const title = isTv ? 'TV Audio' : (currentTrack.stationName || currentTrack.title || 'Unknown track')
  const subtitle = isTv ? null : (currentTrack.artist || currentTrack.album || null)

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Album art / input source icon */}
      <div
        className={cn(
          'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]',
          !isActive && 'opacity-60',
        )}
        aria-hidden="true"
      >
        {isTv || isLineIn ? (
          <Tv className="h-5 w-5 text-caption" aria-hidden="true" />
        ) : currentTrack.albumArtUri ? (
          <img
            src={currentTrack.albumArtUri}
            alt=""
            className="h-full w-full object-cover"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <ImageOff className="h-5 w-5 text-caption" aria-hidden="true" />
        )}
        {/* Paused overlay */}
        {playbackState === 'PAUSED_PLAYBACK' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
            <div className="h-2 w-2 rounded-full bg-white/80" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="min-w-0 flex-1">
        <p className={cn(
          'truncate text-sm font-medium leading-tight',
          isActive ? 'text-heading' : 'text-caption',
        )}>
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-caption leading-tight">{subtitle}</p>
        )}
        {!isTv && state.elapsedTimeFormatted && playbackState === 'PLAYING' && (
          <p className="mt-0.5 text-[10px] tabular-nums text-caption/70">{state.elapsedTimeFormatted}</p>
        )}
      </div>
    </div>
  )
}
