import { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
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

export interface PlayedHistorySectionProps {
  speaker: string
  queue: SonosQueueItem[]
  /** Zero-based index of the currently playing track; history is everything before it */
  currentIndex: number
  onRemove: (index: number) => void
  /** Multi-select state passed through */
  isSelecting: boolean
  isSelected: (index: number) => boolean
  onSelectToggle: (index: number) => void
  onEnterSelectMode: (index: number) => void
  swipedIndex: number | null
  onSwipeOpen: (index: number | null) => void
}

// ── PlayedHistorySection ──────────────────────────────────────────────────────
// Rendered inline above NowPlayingCard so the timeline reads top-down: past →
// now → next. Shows the most recently played tracks (dimmed) with upward
// pagination ("Show 10 earlier") at the top of the list.

export function PlayedHistorySection({
  speaker,
  queue,
  currentIndex,
  onRemove,
  isSelecting,
  isSelected,
  onSelectToggle,
  onEnterSelectMode,
  swipedIndex,
  onSwipeOpen,
}: PlayedHistorySectionProps) {
  // How many tracks from the end of history are currently visible (shows the
  // most recently played first). Increases with "Show 10 earlier".
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // Reset pagination when the current track advances. Using the "store previous
  // value in render" pattern avoids the cascading-effect lint rule.
  const [prevCurrentIndex, setPrevCurrentIndex] = useState(currentIndex)
  if (currentIndex !== prevCurrentIndex) {
    setPrevCurrentIndex(currentIndex)
    setVisibleCount(PAGE_SIZE)
  }

  const historyAll = useMemo(
    () => (currentIndex > 0 ? queue.slice(0, currentIndex) : []),
    [queue, currentIndex],
  )
  const historyCount = historyAll.length

  // Take the last N items so the most recently played sits closest to the
  // now-playing card below it.
  const visibleItems = useMemo(() => {
    if (historyCount === 0) return []
    return historyAll.slice(Math.max(0, historyCount - visibleCount))
  }, [historyAll, historyCount, visibleCount])

  const hiddenEarlier = historyCount - visibleItems.length
  const windowStart = Math.max(0, historyCount - visibleItems.length)

  // Sensors for the (no-op) sortable context so QueueItemRow's useSortable
  // hook has a provider. Cross-window reordering is not supported by design.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Nothing played yet — render nothing at all.
  if (historyCount === 0) return null

  return (
    <div
      id={`queue-history-${speaker}`}
      className="border-b opacity-75"
      style={{ borderColor: 'var(--border-secondary)', background: 'var(--bg-primary)' }}
    >
      {/* Section label */}
      <div
        className="border-b px-4 py-2"
        style={{ borderColor: 'var(--border-secondary)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-caption">
          Recently played
        </p>
        <p className="mt-0.5 text-[11px] text-caption tabular-nums">
          {historyCount} {historyCount === 1 ? 'track' : 'tracks'}
        </p>
      </div>

      {/* Show-earlier sits at the top so scrolling up reveals older tracks */}
      {hiddenEarlier > 0 && (
        <div className="px-4 py-3">
          <button
            onClick={() =>
              setVisibleCount(c => Math.min(c + PAGE_SIZE, historyCount))
            }
            className={cn(
              'flex w-full min-h-[44px] items-center justify-center rounded-lg',
              'border border-[var(--border-primary)] px-4 text-sm font-medium text-body',
              'hover:brightness-95 dark:hover:brightness-110 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            Show {Math.min(PAGE_SIZE, hiddenEarlier)} earlier
            <span className="ml-2 text-xs text-caption">
              ({hiddenEarlier} earlier)
            </span>
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter}>
        <SortableContext
          items={visibleItems.map((item, i) => item.uri + ':' + (windowStart + i))}
          strategy={verticalListSortingStrategy}
        >
          <ul
            className="divide-y divide-[var(--border-secondary)]"
            aria-label="Recently played tracks"
          >
            {visibleItems.map((item, i) => {
              const absIndex = windowStart + i
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
    </div>
  )
}
