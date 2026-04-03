import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { GripVertical, ImageOff, ListStart, ListEnd, X, Play } from 'lucide-react'
import type { UserFavourite } from '@/lib/api'
import { cn } from '@/lib/utils'

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
}

function FavouriteBottomSheet({
  item,
  onClose,
  onPlay,
  onPlayNext,
  onAddToQueue,
  onRemove,
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
              onClick={() => { onPlayNext(item); onClose() }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-body transition-colors hover:bg-[var(--bg-tertiary)] hover:text-heading"
            >
              <ListStart className="h-5 w-5 shrink-0 text-fairy-400" aria-hidden="true" />
              Play next
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
  const [showBottomSheet, setShowBottomSheet] = useState(false)
  // liveX only meaningful during an active gesture; at rest, position is derived
  // from isSwipeOpen so no effect-based sync is needed
  const [liveX, setLiveX] = useState(0)
  const [isGesturing, setIsGesturing] = useState(false)
  const translateX = isGesturing ? liveX : (isSwipeOpen ? -TRAY_WIDTH : 0)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const isSwipeOpen = swipedItemId === item.id

  const contentRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const gestureTypeRef = useRef<'none' | 'horizontal' | 'vertical'>('none')
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref mirrors isGesturing for use inside the native event handler closure
  const isGesturingRef = useRef(false)

  // Non-passive touchmove listener so we can preventDefault during horizontal swipe
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    function onTouchMove(e: TouchEvent) {
      if (!touchStartRef.current) return

      const touch = e.touches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      // Cancel long-press on any significant movement
      if ((absDx > 5 || absDy > 5) && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }

      // Determine gesture direction (first one to exceed threshold wins)
      if (gestureTypeRef.current === 'none') {
        if (absDx > 5 && absDx >= absDy) {
          gestureTypeRef.current = 'horizontal'
          isGesturingRef.current = true
          setIsGesturing(true)
        } else if (absDy > 5 && absDy > absDx) {
          gestureTypeRef.current = 'vertical'
        }
      }

      // Horizontal swipe: follow finger, clamped to tray bounds
      if (gestureTypeRef.current === 'horizontal') {
        e.preventDefault()
        // swipedItemId and item.id are captured from the effect closure,
        // which re-runs whenever swipedItemId changes
        const baseX = swipedItemId === item.id ? -TRAY_WIDTH : 0
        const newX = Math.max(-TRAY_WIDTH, Math.min(0, baseX + dx))
        setLiveX(newX)
      }
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [item.id, swipedItemId])

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const badge = SOURCE_BADGE[item.source]

  // ── Touch handlers (synthetic, on content layer) ──────────────────────────

  function handleTouchStart(e: React.TouchEvent) {
    // Don't intercept touches that begin on the drag handle
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) return

    // Close any other item's tray when we start a gesture here
    if (swipedItemId !== null && swipedItemId !== item.id) {
      onSwipeOpen(null)
    }

    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    gestureTypeRef.current = 'none'
    // Seed liveX so drag starts from the item's current resting position
    setLiveX(isSwipeOpen ? -TRAY_WIDTH : 0)

    // Long-press fires after 500 ms of stillness
    longPressTimerRef.current = setTimeout(() => {
      if (gestureTypeRef.current === 'none') {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50)
        }
        setShowBottomSheet(true)
      }
    }, 500)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (gestureTypeRef.current === 'horizontal' && touchStartRef.current) {
      const changedTouch = e.changedTouches[0]
      const dx = changedTouch.clientX - touchStartRef.current.x
      const baseX = isSwipeOpen ? -TRAY_WIDTH : 0
      const finalX = baseX + dx

      // Snap: open if past halfway, else close
      if (finalX < -(TRAY_WIDTH / 2)) {
        onSwipeOpen(item.id)
        setLiveX(-TRAY_WIDTH)
      } else {
        onSwipeOpen(null)
        setLiveX(0)
      }
    }

    isGesturingRef.current = false
    setIsGesturing(false)
    touchStartRef.current = null
    gestureTypeRef.current = 'none'
  }

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
            transform: `translateX(${translateX}px)`,
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
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(v => !v)}
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

            {menuOpen && (
              <ul
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg"
              >
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
                    onClick={() => { setMenuOpen(false); onRemove(item.id) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-red-950/40 hover:text-red-300"
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Remove
                  </button>
                </li>
              </ul>
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
        />
      )}
    </>
  )
}
