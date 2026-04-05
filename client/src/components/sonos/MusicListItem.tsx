import { Pause, Play } from 'lucide-react'
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
  onPlay: () => void
  /** Called when the pause button is tapped (only shown when isCurrentTrack && isPlaying) */
  onPause?: () => void
  /** Disable the play button */
  playDisabled?: boolean
  /** Play mutation is pending */
  playPending?: boolean
  /** Menu props (forwarded to MusicItemMenu) */
  menuProps: Omit<MusicItemMenuProps, 'disabled'>
  /** Disable all interactive controls (no speaker selected) */
  disabled?: boolean
  /** True if this track is the currently loaded track on the selected speaker */
  isCurrentTrack?: boolean
  /** True if the speaker is actively playing (matters only when isCurrentTrack is true) */
  isPlaying?: boolean
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
}: MusicListItemProps) {
  const showPause = isCurrentTrack && isPlaying && !!onPause

  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5 min-h-[44px]', isCurrentTrack && 'bg-fairy-500/5')}>
      {/* Tappable content area — navigates to detail */}
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
        <ArtworkImage {...artwork} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', isCurrentTrack ? 'text-fairy-400' : 'text-heading')}>
            {title}
          </p>
          {subtitle && <p className="truncate text-xs text-caption">{subtitle}</p>}
        </div>
      </button>

      {/* Active track indicator + play/pause button + context menu */}
      <div className="flex shrink-0 items-center gap-1">
        {isCurrentTrack && (
          <ActiveTrackIndicator
            isActive={isCurrentTrack}
            isPlaying={isPlaying}
            className="mr-1"
          />
        )}

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

        <MusicItemMenu {...menuProps} disabled={disabled} />
      </div>
    </li>
  )
}
