import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { GripVertical, ImageOff, ListStart, ListEnd, ListPlus, ListMusic, X, Play } from 'lucide-react'
import type { UserFavourite } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AddToFairylistDialog } from './AddToFairylistDialog'
import { AddToSpotifyPlaylistDialog } from './AddToSpotifyPlaylistDialog'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_BADGE: Record<UserFavourite['source'], { label: string; className: string }> = {
  sonos: { label: 'Sonos', className: 'bg-green-900/40 text-green-400' },
  spotify: { label: 'Spotify', className: 'bg-emerald-900/40 text-emerald-400' },
  nas: { label: 'NAS', className: 'bg-blue-900/40 text-blue-400' },
  radio: { label: 'Radio', className: 'bg-orange-900/40 text-orange-400' },
}

const TRAY_WIDTH = 216

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FavouriteItemProps {
  item: UserFavourite
  onPlay: (item: UserFavourite) => void
  onRemove: (id: number) => void
  onPlayNext: (item: UserFavourite) => void
  onAddToQueue: (item: UserFavourite) => void
  /** ID of the currently swiped-open item (lifted state) */
  swipedItemId: number | null
  /** Called when this item wants to open/close the swipe tray */
  onSwipeOpen: (id: number | null) => void
}

// ── Bottom sheet (long-press action menu) ─────────────────────────────────────

interface BottomSheetProps {
  item: UserFavourite
  onClose: () => void
  onPlay: (item: UserFavourite) => void
  onPlayNext: (item: UserFavourite) => void
  onAddToQueue: (item: UserFavourite) => void
  onRemove: (id: number) => void
  onFairylist: () => void
  showSpotifyPlaylist: boolean
  onSpotifyPlaylist: () => void
}

function FavouriteBottomSheet({
  item,
  onClose,
  onPlay,
  onPlayNext,
  onAddToQueue,
  onRemove,
  onFairylist,
  showSpotifyPlaylist,
  onSpotifyPlaylist,
}: BottomSheetProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const [entered, setEntered] = useState(false)
  const badge = SOURCE_BADGE[item.source]

  useEffect(() => {
    // One-frame delay to trigger slide-up animation
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Options for ${item.title}`}
      className="fixed inset-0 z-[200] flex items-end"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        className={cn(
          'relative w-full rounded-t-2xl bg-[var(--bg-secondary)] shadow-xl transition-transform duration-200 ease-out',
          entered ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {/* Item preview header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-primary)] px-4 py-4">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
            {item.album_art_uri && !imgFailed ? (
              <img
                src={item.album_art_uri}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageOff className="h-5 w-5 text-slate-500" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-heading">{item.title}</p>
            <span
              className={cn(
                'mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </div>
        </div>

        {/* Action list */}
        <ul className="py-1">
          <li>
            <button
              onClick={() => { onPlay(item); onClose() }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
            >
              <Play className="h-5 w-5 shrink-0 text-fairy-400" aria-hidden="true" />
              Play now
            </button>
          </li>
          <li>
            <button
              onClick={() => { onAddToQueue(item); onClose() }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
            >
              <ListEnd className="h-5 w-5 shrink-0 text-blue-400" aria-hidden="true" />
              Add to queue
            </button>
          </li>
          <li>
            <button
              onClick={() => { onFairylist(); onClose() }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
            >
              <ListPlus className="h-5 w-5 shrink-0 text-purple-400" aria-hidden="true" />
              Add to Fairylist
            </button>
          </li>
          <li>
            <button
              onClick={() => { onPlayNext(item); onClose() }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
            >
              <ListStart className="h-5 w-5 shrink-0 text-fairy-400" aria-hidden="true" />
              Play next
            </button>
          </li>
          {showSpotifyPlaylist && (
            <li>
              <button
                onClick={() => { onSpotifyPlaylist(); onClose() }}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
              >
                <ListMusic className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
                Add to Spotify Playlist
              </button>
            </li>
          )}
          <li>
            <button
              onClick={() => { onRemove(item.id); onClose() }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-red-400 transition-colors hover:bg-red-950/40 hover:text-red-300"
            >
              <X className="h-5 w-5 shrink-0" aria-hidden="true" />
              Remove from favourites
            </button>
          </li>
        </ul>

        {/* Cancel */}
        <div className="border-t border-[var(--border-primary)] px-4 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-[var(--border-primary)] py-2.5 text-sm font-medium text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── FavouriteItem ─────────────────────────────────────────────────────────────

export function FavouriteItem({
  item,
  onPlay,
  onRemove,
  onPlayNext,
  onAddToQueue,
  swipedItemId,
  onSwipeOpen,
}: FavouriteItemProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [showBottomSheet, setShowBottomSheet] = useState(false)
  const [fairylistOpen, setFairylistOpen] = useState(false)
  const [spotifyPlaylistOpen, setSpotifyPlaylistOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const isSwipeOpen = swipedItemId === item.id

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const contentRef = useRef<HTMLDivElement>(null)

  const { translateX: swipeTranslateX, isGesturing, handleTouchStart, handleTouchEnd } = useSwipeGesture({
    ref: contentRef,
    trayWidth: TRAY_WIDTH,
    isOpen: isSwipeOpen,
    hasOtherOpen: swipedItemId !== null && swipedItemId !== item.id,
    onSwipeOpen: () => onSwipeOpen(item.id),
    onCloseOther: () => onSwipeOpen(null),
    onLongPress: () => setShowBottomSheet(true),
  })

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const badge = SOURCE_BADGE[item.source]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <li
        ref={setNodeRef}
        style={dndStyle}
        className={cn(
          'relative overflow-hidden select-none transition-opacity',
          isDragging ? 'opacity-70 z-10' : '',
        )}
      >
        {/* Swipe action tray — hidden behind content, revealed on left swipe */}
        <div
          className="absolute right-0 top-0 flex h-full"
          style={{ width: `${TRAY_WIDTH}px` }}
          aria-hidden="true"
        >
          <button
            tabIndex={-1}
            onClick={() => { onSwipeOpen(null); onPlayNext(item) }}
            className="flex w-[72px] flex-col items-center justify-center gap-1 bg-fairy-600 text-white active:bg-fairy-700"
          >
            <ListStart className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] font-semibold leading-tight">Play next</span>
          </button>
          <button
            tabIndex={-1}
            onClick={() => { onSwipeOpen(null); onAddToQueue(item) }}
            className="flex w-[72px] flex-col items-center justify-center gap-1 bg-blue-600 text-white active:bg-blue-700"
          >
            <ListEnd className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] font-semibold leading-tight">Add to queue</span>
          </button>
          {/* Remove is last (rightmost) to guard against accidental taps */}
          <button
            tabIndex={-1}
            onClick={() => { onSwipeOpen(null); onRemove(item.id) }}
            className="flex w-[72px] flex-col items-center justify-center gap-1 bg-red-500 text-white active:bg-red-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] font-semibold leading-tight">Remove</span>
          </button>
        </div>

        {/* Content layer — translates left on swipe to reveal tray */}
        <div
          ref={contentRef}
          className="relative flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-primary)]"
          style={{
            transform: `translateX(${swipeTranslateX}px)`,
            transition: isGesturing ? 'none' : 'transform 0.2s ease-out',
            willChange: 'transform',
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag handle */}
          <button
            data-drag-handle=""
            {...attributes}
            {...listeners}
            className="flex h-11 w-6 shrink-0 cursor-grab items-center justify-center rounded text-slate-500 hover:text-slate-400 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            style={{ touchAction: 'none' }}
            aria-label={`Drag to reorder ${item.title}`}
            aria-roledescription="sortable"
            tabIndex={0}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Album art */}
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
            {item.album_art_uri && !imgFailed ? (
              <img
                src={item.album_art_uri}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageOff className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </div>
            )}
          </div>

          {/* Title + badge (tap to play) */}
          <button
            className="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            onClick={() => onPlay(item)}
            aria-label={`Play ${item.title}`}
          >
            <p className="truncate text-sm font-medium leading-tight text-heading">
              {item.title}
            </p>
            <span
              className={cn(
                'mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </button>

          {/* Play button */}
          <button
            onClick={() => onPlay(item)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-fairy-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label={`Play ${item.title}`}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Context menu — keyboard/mouse fallback for swipe actions */}
          <div className="shrink-0">
            <button
              ref={menuBtnRef}
              onClick={() => {
                if (menuOpen) {
                  setMenuOpen(false)
                } else {
                  if (menuBtnRef.current) {
                    const rect = menuBtnRef.current.getBoundingClientRect()
                    const showAbove = rect.bottom + 240 > window.innerHeight
                    setMenuPos({
                      top: showAbove ? rect.top - 240 - 4 : rect.bottom + 4,
                      right: window.innerWidth - rect.right,
                    })
                  }
                  setMenuOpen(true)
                }
              }}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="flex h-11 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              aria-label={`More options for ${item.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="flex flex-col gap-[3px]" aria-hidden="true">
                <span className="block h-[3px] w-[3px] rounded-full bg-current" />
                <span className="block h-[3px] w-[3px] rounded-full bg-current" />
                <span className="block h-[3px] w-[3px] rounded-full bg-current" />
              </span>
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
                    onClick={() => { setMenuOpen(false); onAddToQueue(item) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                  >
                    <ListEnd className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Add to queue
                  </button>
                </li>
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setFairylistOpen(true)
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                  >
                    <ListPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Add to Fairylist
                  </button>
                </li>
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onPlayNext(item) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                  >
                    <ListStart className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Play next
                  </button>
                </li>
                {item.source === 'spotify' && (
                  <li role="none">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        setSpotifyPlaylistOpen(true)
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
                    >
                      <ListMusic className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Add to Spotify Playlist
                    </button>
                  </li>
                )}
                <li role="none">
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onRemove(item.id) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-red-950/40 hover:text-red-300"
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Remove
                  </button>
                </li>
              </ul>,
              document.body,
            )}
          </div>
        </div>
      </li>

      {showBottomSheet && (
        <FavouriteBottomSheet
          item={item}
          onClose={() => setShowBottomSheet(false)}
          onPlay={onPlay}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onRemove={onRemove}
          onFairylist={() => { setShowBottomSheet(false); setFairylistOpen(true) }}
          showSpotifyPlaylist={item.source === 'spotify'}
          onSpotifyPlaylist={() => { setShowBottomSheet(false); setSpotifyPlaylistOpen(true) }}
        />
      )}

      <AddToFairylistDialog
        open={fairylistOpen}
        onOpenChange={setFairylistOpen}
        track={{
          source: item.source,
          source_uri: item.source_uri,
          title: item.title,
          album_art_uri: item.album_art_uri ?? undefined,
        }}
      />

      {item.source === 'spotify' && (
        <AddToSpotifyPlaylistDialog
          open={spotifyPlaylistOpen}
          onOpenChange={setSpotifyPlaylistOpen}
          trackUri={item.source_uri}
          trackName={item.title}
        />
      )}
    </>
  )
}
