import type { ReactNode } from 'react'
import { ChevronRight, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ArtworkImage, type ArtworkImageProps } from './ArtworkImage'
import { MusicItemMenu, type MusicItemMenuProps } from './MusicItemMenu'
import { ActiveTrackIndicator } from './ActiveTrackIndicator'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MusicListItemProps {
  /** Artwork props forwarded to ArtworkImage */
  artwork: Pick<ArtworkImageProps, 'src' | 'images' | 'size' | 'rounded' | 'fallback'>
  /** Primary text */
  title: string
  /** Secondary text line */
  subtitle: string
  /** Called when the row body is tapped (navigation) */
  onTap: () => void
  /** Called when the play button is tapped */
  onPlay?: () => void
  /** Called when the pause button is tapped (only shown when isCurrentTrack && isPlaying) */
  onPause?: () => void
  /** Disable the play button */
  playDisabled?: boolean
  /** Play mutation is pending */
  playPending?: boolean
  /** Menu props (forwarded to MusicItemMenu) */
  menuProps?: Omit<MusicItemMenuProps, 'disabled'>
  /** When true: hides play/menu buttons; row tap = select */
  pickMode?: boolean
  /** In pick mode: show a drill-down chevron that calls this instead of selecting */
  onDrillDown?: () => void
  /** Disable all interactive controls (no speaker selected) */
  disabled?: boolean
  /** True if this track is the currently loaded track on the selected speaker */
  isCurrentTrack?: boolean
  /** True if the speaker is actively playing (matters only when isCurrentTrack is true) */
  isPlaying?: boolean
  /** Track number shown instead of artwork (album detail view) */
  trackNumber?: number
  /** Optional badge element rendered after subtitle (e.g. SourceBadge) */
  badge?: ReactNode
  /** Optional duration string shown before controls */
  duration?: string
}

// ── Shared styles ────────────────────────────────────────────────────────────

const playBtnCls = cn(
  'flex h-11 w-11 items-center justify-center rounded-lg',
  'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
  'disabled:opacity-40',
)

// ── Component ────────────────────────────────────────────────────────────────

export function MusicListItem({
  artwork,
  title,
  subtitle,
  onTap,
  onPlay,
  onPause,
  playDisabled = false,
  playPending = false,
  menuProps,
  disabled = false,
  isCurrentTrack = false,
  isPlaying = false,
  trackNumber,
  badge,
  duration,
  pickMode = false,
  onDrillDown,
}: MusicListItemProps) {
  const showPause = isCurrentTrack && isPlaying && !!onPause

  const isPickSelected = pickMode && isCurrentTrack

  return (
    <li className={cn(
      'flex items-center gap-3 px-4 py-2.5 min-h-[44px]',
      isPickSelected ? 'border-l-2 border-fairy-500 bg-fairy-500/10 pl-[14px]' :
      isCurrentTrack ? 'bg-fairy-500/5' : '',
    )}>
      {/* Tappable content area */}
      <button
        type="button"
        onClick={onTap}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 text-left',
          'transition-colors hover:opacity-80',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'rounded-md',
        )}
      >
        {trackNumber != null ? (
          <div className="flex w-6 shrink-0 items-center justify-end">
            {isCurrentTrack ? (
              <ActiveTrackIndicator isActive isPlaying={isPlaying} />
            ) : (
              <span className="text-right text-xs tabular-nums text-caption/50" aria-label={`Track ${trackNumber}`}>
                {trackNumber}
              </span>
            )}
          </div>
        ) : (
          <ArtworkImage {...artwork} />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', isCurrentTrack ? 'text-fairy-400' : 'text-heading')}>
            {title}
          </p>
          {(subtitle || badge) && (
            <div className="flex items-center gap-1.5">
              {subtitle && <p className="truncate text-xs text-caption">{subtitle}</p>}
              {badge}
            </div>
          )}
        </div>
      </button>

      {/* Pick mode: chevron drill-down only */}
      {pickMode ? (
        onDrillDown && (
          <button
            type="button"
            onClick={onDrillDown}
            aria-label={`Browse tracks in ${title}`}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
              'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      ) : (
        /* Normal mode: play/pause + context menu */
        <div className="flex shrink-0 items-center gap-1">
          {isCurrentTrack && trackNumber == null && (
            <ActiveTrackIndicator
              isActive={isCurrentTrack}
              isPlaying={isPlaying}
              className="mr-1"
            />
          )}

          {duration && (
            <span className="mr-1 text-xs text-caption/70">{duration}</span>
          )}

          {onPlay && (
            <button
              type="button"
              disabled={disabled || playDisabled || playPending}
              onClick={showPause ? onPause : onPlay}
              aria-label={showPause ? `Pause ${title}` : `Play ${title}`}
              className={playBtnCls}
            >
              {showPause
                ? <Pause className="h-4 w-4" aria-hidden="true" />
                : <Play className="h-4 w-4" aria-hidden="true" />
              }
            </button>
          )}

          {menuProps && <MusicItemMenu {...menuProps} disabled={disabled} />}
        </div>
      )}
    </li>
  )
}
