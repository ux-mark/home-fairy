import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ListMusic,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosQueueItem, SonosPlaybackState } from '@/lib/api'
import { useQueueSync } from '@/hooks/useQueueSync'
import { useUndoableQueueAction } from '@/hooks/useUndoableQueueAction'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { QueueItemRow } from './QueueItemRow'
import { QueueEmptyState } from './QueueEmptyState'
import { QueueHeader } from './QueueHeader'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InlineQueueProps {
  speaker: string
  currentTrackUri: string | null
  expanded: boolean
  onToggle: () => void
  queueLimit?: number
  playbackState?: SonosPlaybackState | null
  onViewFullQueue?: () => void
}

// ── InlineQueue ───────────────────────────────────────────────────────────────

export function InlineQueue({
  speaker,
  currentTrackUri,
  expanded,
  onToggle,
  queueLimit,
  playbackState,
  onViewFullQueue,
}: InlineQueueProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const queueKey = ['sonos', 'queue', speaker]

  const { queue, isLoading, isError, refetch } = useQueueSync({
    speaker,
    enabled: expanded && !!speaker,
  })

  const undo = useUndoableQueueAction()
  const [swipedIndex, setSwipedIndex] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderMutation = useMutation({
    mutationFn: ({ from, to }: { from: number; to: number }) =>
      api.sonos.reorderQueue(speaker, from, to),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queueKey }),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queueKey })
      toast({ message: 'Could not reorder queue', type: 'error' })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (index: number) => api.sonos.removeFromQueue(speaker, index),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queueKey })
      toast({ message: 'Could not remove track', type: 'error' })
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !queue) return

    const items = [...queue]
    const oldIndex = items.findIndex((_, i) => active.id === items[i].uri + ':' + i)
    const newIndex = items.findIndex((_, i) => over.id === items[i].uri + ':' + i)
    if (oldIndex === -1 || newIndex === -1) return

    queryClient.setQueryData<SonosQueueItem[]>(queueKey, arrayMove(items, oldIndex, newIndex))
    reorderMutation.mutate({ from: oldIndex, to: newIndex })
  }

  function handleRemove(index: number) {
    if (!queue) return
    const removedItem = queue[index]
    const snapshot = [...queue]

    queryClient.setQueryData<SonosQueueItem[]>(
      queueKey,
      queue.filter((_, i) => i !== index),
    )

    undo.scheduleAction(
      `Removed "${removedItem.title}"`,
      () => removeMutation.mutate(index),
      () => queryClient.setQueryData<SonosQueueItem[]>(queueKey, snapshot),
    )
  }

  const queueCount = queue?.length ?? 0
  const visibleQueue = queueLimit ? queue?.slice(0, queueLimit) : queue
  const hasMore = queueLimit && queue && queue.length > queueLimit

  return (
    <div className="mt-2 border-t border-[var(--border-secondary)] pt-2">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`inline-queue-${speaker}`}
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-caption transition-colors',
          'min-h-[44px]',
          'hover:bg-[var(--bg-secondary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        )}
      >
        <span className="flex items-center gap-1.5">
          <ListMusic className="h-3 w-3" aria-hidden="true" />
          {expanded && !isLoading && queueCount > 0
            ? `Queue (${queueCount})`
            : 'Queue'}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div id={`inline-queue-${speaker}`} className="relative">
          {/* Queue header */}
          {!isLoading && !isError && queue && queue.length > 0 && (
            <QueueHeader
              speaker={speaker}
              currentPlayMode={playbackState?.currentPlayMode}
              onModeChange={() => {}}
              queue={queue}
            />
          )}

          {isLoading && (
            <div className="flex flex-col gap-2 px-2 py-3" role="status" aria-label="Loading queue">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4 rounded" />
                    <Skeleton className="h-2.5 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center px-4">
              <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-heading">Could not load queue</p>
                <p className="mt-0.5 text-xs text-caption">Check the speaker is reachable.</p>
              </div>
              <button
                onClick={() => refetch()}
                className="rounded-lg border border-[var(--border-primary)] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 min-h-[44px]"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && (!queue || queue.length === 0) && (
            <QueueEmptyState speaker={speaker} compact />
          )}

          {visibleQueue && visibleQueue.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={queue!.map((item, i) => item.uri + ':' + i)}
                strategy={verticalListSortingStrategy}
              >
                <ul
                  className="divide-y divide-[var(--border-secondary)]"
                  aria-label="Queue — drag to reorder"
                >
                  {visibleQueue.map((item, i) => {
                    const isCurrentTrack = currentTrackUri
                      ? item.uri === currentTrackUri
                      : i === 0
                    return (
                      <QueueItemRow
                        key={item.uri + ':' + i}
                        item={item}
                        index={i}
                        isCurrentTrack={isCurrentTrack}
                        speaker={speaker}
                        dndId={item.uri + ':' + i}
                        onRemove={handleRemove}
                        swipedIndex={swipedIndex}
                        onSwipeOpen={setSwipedIndex}
                        isSelecting={false}
                        isSelected={false}
                        onSelect={() => {}}
                        onEnterSelectMode={() => {}}
                        compact
                      />
                    )
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {/* View full queue link */}
          {hasMore && (
            <button
              onClick={onViewFullQueue}
              className={cn(
                'mt-1 flex w-full items-center justify-center rounded-lg px-2 py-2 text-xs text-caption transition-colors',
                'hover:bg-[var(--bg-secondary)] hover:text-body',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
            >
              View all {queue!.length} tracks
            </button>
          )}

          {/* Undo snackbar */}
          {undo.pendingAction && (
            <div
              className="mx-2 mb-2 flex items-center justify-between rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              role="status"
              aria-live="polite"
            >
              <span className="text-xs text-slate-200">{undo.pendingAction.label}</span>
              <button
                onClick={undo.triggerUndo}
                className="text-xs font-semibold text-fairy-400 hover:text-fairy-300 transition-colors ml-3 focus-visible:outline-2 focus-visible:outline-fairy-500 rounded"
              >
                Undo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
