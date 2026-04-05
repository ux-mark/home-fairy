import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ArtworkImage, type ArtworkImageProps } from './ArtworkImage'
import { MusicItemMenu, type MusicItemMenuProps } from './MusicItemMenu'

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
  /** Disable the play button */
  playDisabled?: boolean
  /** Play mutation is pending */
  playPending?: boolean
  /** Menu props (forwarded to MusicItemMenu) */
  menuProps: Omit<MusicItemMenuProps, 'disabled'>
  /** Disable all interactive controls (no speaker selected) */
  disabled?: boolean
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
  playDisabled = false,
  playPending = false,
  menuProps,
  disabled = false,
}: MusicListItemProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 min-h-[44px]">
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
          <p className="truncate text-sm font-medium text-heading">{title}</p>
          {subtitle && <p className="truncate text-xs text-caption">{subtitle}</p>}
        </div>
      </button>

      {/* Play button + context menu */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={disabled || playDisabled || playPending}
          onClick={onPlay}
          aria-label={`Play ${title}`}
          className={playBtnCls}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>

        <MusicItemMenu {...menuProps} disabled={disabled} />
      </div>
    </li>
  )
}
