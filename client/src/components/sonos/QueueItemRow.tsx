import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { Check, GripVertical, Play, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosQueueItem } from '@/lib/api'
import { toSpotifyUri } from '@/lib/normalizeUri'
import { useToast } from '@/hooks/useToast'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { cn } from '@/lib/utils'
import { ArtworkImage } from './ArtworkImage'
import { MusicItemMenu } from './MusicItemMenu'

// ── Constants ─────────────────────────────────────────────────────────────────

const TRAY_WIDTH = 72

// ── Props ─────────────────────────────────────────────────────────────────────

export interface QueueItemRowProps {
  item: SonosQueueItem
  index: number
  isCurrentTrack: boolean
  speaker: string
  /** dnd-kit sortable id — unique per position */
  dndId: string
  /** Ref for IntersectionObserver to detect whether now-playing row is visible */
  nowPlayingRef?: React.RefCallback<HTMLLIElement>
  /** Called when user initiates a remove (undoable, caller handles optimistic update) */
  onRemove: (index: number) => void
  /** Index of the currently swipe-open row (lifted state) */
  swipedIndex: number | null
  onSwipeOpen: (index: number | null) => void
  /** Multi-select mode */
  isSelecting: boolean
  isSelected: boolean
  onSelect: (index: number) => void
  onEnterSelectMode: (index: number) => void
  /** Compact layout for InlineQueue */
  compact?: boolean
}

// ── QueueItemRow ──────────────────────────────────────────────────────────────

export function QueueItemRow({
  item,
  index,
  isCurrentTrack,
  speaker,
  dndId,
  nowPlayingRef,
  onRemove,
  swipedIndex,
  onSwipeOpen,
  isSelecting,
  isSelected,
  onSelect,
  onEnterSelectMode,
  compact = false,
}: QueueItemRowProps) {
  const navigate = useNavigate()
  const { toast } = useToast()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({ id: dndId })

  const contentRef = useRef<HTMLDivElement>(null)
  const isSwipeOpen = swipedIndex === index

  const { translateX, isGesturing, handleTouchStart, handleTouchEnd } = useSwipeGesture({
    ref: contentRef,
    trayWidth: TRAY_WIDTH,
    isOpen: isSwipeOpen,
    hasOtherOpen: swipedIndex !== null && swipedIndex !== index,
    onSwipeOpen: () => onSwipeOpen(index),
    onCloseOther: () => onSwipeOpen(null),
    onLongPress: () => {
      if (!isSelecting) {
        onEnterSelectMode(index)
      }
    },
  })

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Queue URIs come wrapped (x-sonos-spotify:spotify%3atrack%3a…) — classify
  // via the normalised form and store the bare spotify: URI where applicable.
  const spotifyUri = toSpotifyUri(item.uri)
  const source = spotifyUri ? 'spotify' : 'nas'
  const sourceUri = spotifyUri ?? item.uri

  const playNow = useMutation({
    mutationFn: () => api.sonos.seekToTrack(speaker, index + 1),
    onSuccess: () => {
      // Haptic feedback on successful seek
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(8)
      }
      toast({ message: `Playing "${item.title}"` })
    },
    onError: () => toast({ message: 'Failed to play', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () =>
      api.favourites.add({
        source,
        source_uri: sourceUri,
        title: item.title,
        album_art_uri: item.albumArtUri ?? undefined,
      }),
    onSuccess: () => toast({ message: `Added "${item.title}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  function handleTitleClick() {
    if (item.uri) {
      navigate(
        `/sonos/track?uri=${encodeURIComponent(item.uri)}&speaker=${encodeURIComponent(speaker)}`,
      )
    }
  }

  function handleRowClick() {
    if (isSelecting) {
      onSelect(index)
    }
  }

  // ── Aria-live drag announcement ────────────────────────────────────────────

  const px = compact ? 'pl-2 pr-1' : 'px-4'
  const py = compact ? 'py-2' : 'py-2.5'

  return (
    <li
      ref={el => {
        setNodeRef(el)
        if (nowPlayingRef && isCurrentTrack) nowPlayingRef(el)
      }}
      style={dndStyle}
      className={cn(
        'relative overflow-hidden select-none',
        isDragging ? 'z-10' : '',
      )}
      aria-label={isCurrentTrack ? `${item.title} — now playing` : item.title}
    >
      {/* Swipe action tray — revealed on left swipe */}
      <div
        className="absolute right-0 top-0 flex h-full"
        style={{ width: `${TRAY_WIDTH}px` }}
        aria-hidden="true"
      >
        <button
          tabIndex={-1}
          onClick={() => {
            onSwipeOpen(null)
            onRemove(index)
          }}
          className="flex w-full flex-col items-center justify-center gap-1 bg-red-500 text-white active:bg-red-600"
        >
          <Trash2 className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-semibold leading-tight">Remove</span>
        </button>
      </div>

      {/* Content layer — translates left on swipe */}
      <div
        ref={contentRef}
        className={cn(
          `relative flex items-center gap-${compact ? '2' : '3'} ${px} ${py}`,
          'bg-[var(--bg-primary)] transition-opacity',
          isDragging ? 'opacity-80' : '',
          isSelecting && isSelected ? 'bg-fairy-500/5' : '',
        )}
        style={{
          transform: isSelecting ? undefined : `translateX(${translateX}px)`,
          transition: isGesturing || isSorting ? 'none' : 'transform 0.2s ease-out',
          willChange: 'transform',
          borderLeft: isCurrentTrack ? '2px solid var(--fairy-500, #10b981)' : undefined,
          paddingLeft: isCurrentTrack && !compact ? '14px' : isCurrentTrack && compact ? '6px' : undefined,
        }}
        onTouchStart={isSelecting ? undefined : handleTouchStart}
        onTouchEnd={isSelecting ? undefined : handleTouchEnd}
        onClick={isSelecting ? handleRowClick : undefined}
      >
        {/* Select checkbox (multi-select mode) */}
        {isSelecting ? (
          <button
            onClick={() => onSelect(index)}
            aria-label={isSelected ? `Deselect ${item.title}` : `Select ${item.title}`}
            aria-pressed={isSelected}
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              isSelected
                ? 'border-fairy-500 bg-fairy-500 text-white'
                : 'border-slate-500 text-transparent',
            )}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          /* Drag handle */
          <button
            data-drag-handle=""
            {...attributes}
            {...listeners}
            className={cn(
              'flex shrink-0 cursor-grab items-center justify-center rounded text-slate-500',
              'hover:text-slate-400 active:cursor-grabbing',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              compact ? 'h-11 w-5' : 'h-11 w-6',
            )}
            style={{ touchAction: 'none' }}
            aria-label={`Drag to reorder ${item.title}`}
            tabIndex={0}
            onClick={e => {
              // On drag start, add brief haptic
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(8)
              }
              e.stopPropagation()
            }}
          >
            <GripVertical className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
          </button>
        )}

        {/* Album art */}
        <ArtworkImage src={item.albumArtUri} size={compact ? 36 : 40} fallback="disc" />

        {/* Track info — tappable */}
        <button
          onClick={isSelecting ? handleRowClick : handleTitleClick}
          className="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={isSelecting ? (isSelected ? `Deselect ${item.title}` : `Select ${item.title}`) : `View details for ${item.title}`}
          tabIndex={isSelecting ? -1 : 0}
        >
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                'truncate font-medium leading-tight',
                compact ? 'text-sm' : 'text-sm',
                isCurrentTrack ? 'text-fairy-400' : 'text-heading',
              )}
            >
              {item.title || 'Unknown track'}
            </p>
            {isCurrentTrack && (
              <span className="shrink-0 rounded-full bg-fairy-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-fairy-400">
                Now playing
              </span>
            )}
          </div>
          <p className="truncate text-xs text-caption">
            {[item.artist, item.album].filter(Boolean).join(' · ')}
          </p>
        </button>

        {/* Actions — hidden in select mode */}
        {!isSelecting && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={playNow.isPending}
              onClick={() => playNow.mutate()}
              aria-label={`Play ${item.title}`}
              className={cn(
                'flex items-center justify-center rounded-lg',
                'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'disabled:opacity-40',
                compact ? 'h-9 w-9' : 'h-11 w-11',
              )}
            >
              <Play className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
            </button>

            <MusicItemMenu
              label={item.title}
              onAddToFavourites={() => addToFavourites.mutate()}
              onRemove={() => onRemove(index)}
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
        )}
      </div>
    </li>
  )
}
