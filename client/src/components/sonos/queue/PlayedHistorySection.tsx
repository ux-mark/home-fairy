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
import { ChevronDown, ChevronUp } from 'lucide-react'
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
// Collapsed by default. When expanded, shows the most recent N played tracks
// with upward pagination ("Show 10 earlier"). Rows are rendered dimmed.

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
  const [expanded, setExpanded] = useState(false)
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

  // Sensors for the (no-op) sortable context so QueueItemRow's useSortable
  // hook has a provider. Cross-window reordering is not supported by design.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Nothing played yet — render nothing at all.
  if (historyCount === 0) return null

  const toggleLabel = expanded
    ? `Hide played tracks`
    : `Show ${historyCount} played ${historyCount === 1 ? 'track' : 'tracks'}`

  return (
    <div
      className="border-b"
      style={{ borderColor: 'var(--border-secondary)' }}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls={`queue-history-${speaker}`}
        className={cn(
          'flex min-h-[44px] w-full items-center justify-between px-4 py-2 text-xs font-medium text-caption',
          'hover:text-body transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        )}
      >
        <span>{toggleLabel}</span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div
          id={`queue-history-${speaker}`}
          className="opacity-75"
          style={{ background: 'var(--bg-primary)' }}
        >
          {hiddenEarlier > 0 && (
            <div className="px-4 py-2">
              <button
                onClick={() =>
                  setVisibleCount(c => Math.min(c + PAGE_SIZE, historyCount))
                }
                className={cn(
                  'flex w-full min-h-[40px] items-center justify-center rounded-lg px-3 text-xs text-caption',
                  'hover:bg-[var(--bg-tertiary)] hover:text-body transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
              >
                Show {Math.min(PAGE_SIZE, hiddenEarlier)} earlier
                <span className="ml-2 text-caption">({hiddenEarlier} earlier)</span>
              </button>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter}>
            <SortableContext
              items={visibleItems.map((item, i) => {
                const windowStart = Math.max(0, historyCount - visibleItems.length)
                return item.uri + ':' + (windowStart + i)
              })}
              strategy={verticalListSortingStrategy}
            >
              <ul
                className="divide-y divide-[var(--border-secondary)]"
                aria-label="Recently played tracks"
              >
                {visibleItems.map((item, i) => {
                  // Absolute queue index = (start of window) + i
                  const windowStart = Math.max(0, historyCount - visibleItems.length)
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
      )}
    </div>
  )
}
