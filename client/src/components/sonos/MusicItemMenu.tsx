import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Heart, ListEnd, ListPlus, ListStart, ListMusic, MoreVertical, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AddToFairylistDialog } from './AddToFairylistDialog'
import { AddToSpotifyPlaylistDialog } from './AddToSpotifyPlaylistDialog'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FairylistTrackData {
  source: 'sonos' | 'spotify' | 'nas' | 'radio'
  source_uri: string
  title: string
  artist?: string
  album_art_uri?: string
}

export interface SpotifyPlaylistTrackData {
  trackUri: string
  trackName: string
}

export interface MusicItemMenuProps {
  /** Label for accessibility */
  label: string
  /** Handler for "Play next" — omit to hide this option */
  onPlayNext?: () => void
  /** Handler for "Add to queue" — omit to hide this option */
  onAddToQueue?: () => void
  /** Data for the Fairylist dialog */
  fairylistTrack: FairylistTrackData
  /** If provided, shows "Add to Spotify Playlist" option */
  spotifyTrack?: SpotifyPlaylistTrackData
  /** If provided, shows "Add to favourites" option */
  onAddToFavourites?: () => void
  /** If provided, shows a red "Remove" option at the bottom */
  onRemove?: () => void
  /** Remove label override */
  removeLabel?: string
  /** Disable the menu button */
  disabled?: boolean
  /** Extra class for the wrapper */
  className?: string
}

// ── Shared styles ────────────────────────────────────────────────────────────

const menuBtnCls = cn(
  'flex h-11 w-11 items-center justify-center rounded-lg',
  'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
  'disabled:opacity-40',
)

const menuItemCls =
  'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading'

// ── Component ────────────────────────────────────────────────────────────────

export function MusicItemMenu({
  label,
  onPlayNext,
  onAddToQueue,
  fairylistTrack,
  spotifyTrack,
  onAddToFavourites,
  onRemove,
  removeLabel = 'Remove',
  disabled = false,
  className,
}: MusicItemMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [fairylistOpen, setFairylistOpen] = useState(false)
  const [spotifyPlaylistOpen, setSpotifyPlaylistOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  // Count menu items for height estimation
  let itemCount = 1 // Add to Fairylist (always shown)
  if (onAddToQueue) itemCount++
  if (onPlayNext) itemCount++
  if (spotifyTrack) itemCount++
  if (onAddToFavourites) itemCount++
  if (onRemove) itemCount++
  const estimatedHeight = itemCount * 44 + 8 // 44px per item + padding

  const handleOpen = () => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      const showAbove = rect.bottom + estimatedHeight > window.innerHeight
      setMenuPos({
        top: showAbove ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setMenuOpen(true)
  }

  return (
    <>
      <div className={cn('shrink-0', className)}>
        <button
          ref={menuBtnRef}
          type="button"
          disabled={disabled}
          onClick={handleOpen}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          aria-label={`More options for ${label}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={menuBtnCls}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        {menuOpen &&
          menuPos &&
          createPortal(
            <ul
              role="menu"
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
              className="z-[200] min-w-[200px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
            >
              {onAddToQueue && (
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onAddToQueue()
                    }}
                    className={menuItemCls}
                  >
                    <ListEnd className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Add to queue
                  </button>
                </li>
              )}
              <li role="none">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setFairylistOpen(true)
                  }}
                  className={menuItemCls}
                >
                  <ListPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Add to Fairylist
                </button>
              </li>
              {onAddToFavourites && (
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onAddToFavourites()
                    }}
                    className={menuItemCls}
                  >
                    <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Add to favourites
                  </button>
                </li>
              )}
              {onPlayNext && (
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onPlayNext()
                    }}
                    className={menuItemCls}
                  >
                    <ListStart className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Play next
                  </button>
                </li>
              )}
              {spotifyTrack && (
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setSpotifyPlaylistOpen(true)
                    }}
                    className={menuItemCls}
                  >
                    <ListMusic className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Add to Spotify Playlist
                  </button>
                </li>
              )}
              {onRemove && (
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onRemove()
                    }}
                    className={cn(menuItemCls, 'text-red-400 hover:text-red-300')}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {removeLabel}
                  </button>
                </li>
              )}
            </ul>,
            document.body,
          )}
      </div>

      <AddToFairylistDialog
        open={fairylistOpen}
        onOpenChange={setFairylistOpen}
        track={fairylistTrack}
      />

      {spotifyTrack && (
        <AddToSpotifyPlaylistDialog
          open={spotifyPlaylistOpen}
          onOpenChange={setSpotifyPlaylistOpen}
          trackUri={spotifyTrack.trackUri}
          trackName={spotifyTrack.trackName}
        />
      )}
    </>
  )
}
