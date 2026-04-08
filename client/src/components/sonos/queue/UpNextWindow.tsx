import { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { SonosQueueItem } from '@/lib/api'
import { cn } from '@/lib/utils'
import { QueueItemRow } from '../QueueItemRow'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

// ── Props ─────────────────────────────────────────────────────────────────────

export interface UpNextWindowProps {
  speaker: string
  /** The full queue (we slice it internally) */
  queue: SonosQueueItem[]
  /** Zero-based index of the currently playing track; -1 if nothing playing */
  currentIndex: number
  /** Called when a row is removed (caller handles undo + optimistic update) */
  onRemove: (index: number) => void
  /** Called with absolute (from, to) queue indices after a drag reorder within Up Next */
  onReorder: (from: number, to: number) => void
  /** Multi-select state passed through to QueueItemRow */
  isSelecting: boolean
  isSelected: (index: number) => boolean
  onSelectToggle: (index: number) => void
  onEnterSelectMode: (index: number) => void
  swipedIndex: number | null
  onSwipeOpen: (index: number | null) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRemaining(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `about ${h}h ${m}m left`
  if (m > 0) return `about ${m}m left`
  return 'less than a minute left'
}

// ── UpNextWindow ──────────────────────────────────────────────────────────────

export function UpNextWindow({
  speaker,
  queue,
  currentIndex,
  onRemove,
  onReorder,
  isSelecting,
  isSelected,
  onSelectToggle,
  onEnterSelectMode,
  swipedIndex,
  onSwipeOpen,
}: UpNextWindowProps) {
  // ── Pagination state ──────────────────────────────────────────────────────
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // Reset pagination when the current track advances. Using the "store previous
  // value in render" pattern avoids the cascading-effect lint rule.
  const [prevCurrentIndex, setPrevCurrentIndex] = useState(currentIndex)
  if (currentIndex !== prevCurrentIndex) {
    setPrevCurrentIndex(currentIndex)
    setVisibleCount(PAGE_SIZE)
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const upNextStart = currentIndex < 0 ? 0 : currentIndex + 1
  const upNextAll = useMemo(() => queue.slice(upNextStart), [queue, upNextStart])
  const visibleItems = useMemo(
    () => upNextAll.slice(0, visibleCount),
    [upNextAll, visibleCount],
  )
  const remainingAfterVisible = upNextAll.length - visibleItems.length

  // Position indicator: "Track 7 of 47 · about 2h 18m left"
  const trackPosition = currentIndex >= 0 ? currentIndex + 1 : 0
  const totalTracks = queue.length
  const remainingSeconds = useMemo(
    () => upNextAll.reduce((sum, t) => sum + (t.duration ?? 0), 0),
    [upNextAll],
  )
  const remainingLabel = formatRemaining(remainingSeconds)

  // ── DnD sensors (scoped to this window) ──────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    // dndId format: `${uri}:${absoluteIndex}` — parse the absolute index
    const from = Number(String(active.id).split(':').pop())
    const to = Number(String(over.id).split(':').pop())
    if (Number.isNaN(from) || Number.isNaN(to)) return
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8)
    onReorder(from, to)
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (upNextAll.length === 0) {
    return (
      <div
        className="border-b px-4 py-6 text-center"
        style={{ borderColor: 'var(--border-secondary)' }}
      >
        <p className="text-xs text-caption">Nothing queued after this.</p>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const sortableIds = visibleItems.map((_, i) => {
    const absIndex = upNextStart + i
    return upNextAll[i].uri + ':' + absIndex
  })

  return (
    <div>
      {/* Position indicator header */}
      <div
        className="border-b px-4 py-2"
        style={{ borderColor: 'var(--border-secondary)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-caption">
          Up next
        </p>
        <p className="mt-0.5 text-[11px] text-caption tabular-nums">
          {trackPosition > 0
            ? `Track ${trackPosition} of ${totalTracks}`
            : `${totalTracks} ${totalTracks === 1 ? 'track' : 'tracks'}`}
          {remainingLabel && ` · ${remainingLabel}`}
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <ul
            className="divide-y divide-[var(--border-secondary)]"
            aria-label="Up next — drag to reorder"
          >
            {visibleItems.map((item, i) => {
              const absIndex = upNextStart + i
              return (
                <QueueItemRow
                  key={item.uri + ':' + absIndex}
                  item={item}
                  index={absIndex}
                  isCurrentTrack={false}
                  speaker={speaker}
                  dndId={item.uri + ':' + absIndex}
                  onRemove={onRemove}
                  swipedIndex={swipedIndex}
                  onSwipeOpen={onSwipeOpen}
                  isSelecting={isSelecting}
                  isSelected={isSelected(absIndex)}
                  onSelect={onSelectToggle}
                  onEnterSelectMode={onEnterSelectMode}
                />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {/* Show more button */}
      {remainingAfterVisible > 0 && (
        <div className="px-4 py-3">
          <button
            onClick={() =>
              setVisibleCount(c => Math.min(c + PAGE_SIZE, upNextAll.length))
            }
            className={cn(
              'flex w-full min-h-[44px] items-center justify-center rounded-lg',
              'border border-[var(--border-primary)] px-4 text-sm font-medium text-body',
              'hover:brightness-95 dark:hover:brightness-110 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            Show {Math.min(PAGE_SIZE, remainingAfterVisible)} more
            <span className="ml-2 text-xs text-caption">
              ({remainingAfterVisible} remaining)
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
