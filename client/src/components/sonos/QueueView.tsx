import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  GripVertical,
  ImageOff,
  ListStart,
  Music2,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosQueueItem } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { SortableOverlay } from '@/components/ui/SortableOverlay'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueViewProps {
  speaker: string
  open: boolean
  onClose: () => void
  currentTrackUri: string | null
}

// ── Sortable queue item ───────────────────────────────────────────────────────

interface SortableQueueItemProps {
  item: SonosQueueItem
  index: number
  isCurrentTrack: boolean
  onRemove: (index: number) => void
  onPlayNext: (uri: string) => void
  isFirst: boolean
}

function SortableQueueItem({
  item,
  index,
  isCurrentTrack,
  onRemove,
  onPlayNext,
  isFirst,
}: SortableQueueItemProps) {
  const [imgFailed, setImgFailed] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.uri + ':' + index })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 px-4 py-2.5 select-none transition-opacity',
        isCurrentTrack ? 'border-l-2 border-fairy-500 pl-[14px]' : '',
        isDragging ? 'opacity-80 z-10 relative' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-11 w-6 shrink-0 cursor-grab items-center justify-center rounded text-slate-500 hover:text-slate-400 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        style={{ touchAction: 'none' }}
        aria-label={`Drag to reorder ${item.title}`}
        tabIndex={0}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Album art */}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
        {item.albumArtUri && !imgFailed ? (
          <img
            src={item.albumArtUri}
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

      {/* Track info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={[
              'truncate text-sm font-medium leading-tight',
              isCurrentTrack ? 'text-fairy-300' : 'text-heading',
            ].join(' ')}
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
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Play Next — not shown for the currently-playing first item */}
        {!isFirst && (
          <button
            onClick={() => onPlayNext(item.uri)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label={`Play ${item.title} next`}
          >
            <ListStart className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {/* Remove */}
        <button
          onClick={() => onRemove(index)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:text-red-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={`Remove ${item.title} from queue`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

// ── QueueView ─────────────────────────────────────────────────────────────────

export function QueueView({ speaker, open, onClose, currentTrackUri }: QueueViewProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const queueKey = ['sonos', 'queue', speaker]

  const {
    data: queue,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queueKey,
    queryFn: () => api.sonos.getQueue(speaker),
    refetchInterval: 5_000,
    staleTime: 4_000,
    enabled: open && !!speaker,
    retry: 1,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderMutation = useMutation({
    mutationFn: ({ from, to }: { from: number; to: number }) =>
      api.sonos.reorderQueue(speaker, from, to),
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

  const playNextMutation = useMutation({
    mutationFn: (uri: string) => api.sonos.playNext(speaker, uri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKey })
      toast({ message: 'Added to play next' })
    },
    onError: () => toast({ message: 'Could not add to play next', type: 'error' }),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !queue) return

    const items = [...queue]
    const oldIndex = items.findIndex((_, i) => active.id === items[i].uri + ':' + i)
    const newIndex = items.findIndex((_, i) => over.id === items[i].uri + ':' + i)
    if (oldIndex === -1 || newIndex === -1) return

    // Optimistic update
    queryClient.setQueryData<SonosQueueItem[]>(queueKey, arrayMove(items, oldIndex, newIndex))
    reorderMutation.mutate({ from: oldIndex, to: newIndex })
  }

  function handleRemove(index: number) {
    if (!queue) return
    // Optimistic update
    queryClient.setQueryData<SonosQueueItem[]>(
      queueKey,
      queue.filter((_, i) => i !== index),
    )
    removeMutation.mutate(index)
  }

  function handlePlayNext(uri: string) {
    playNextMutation.mutate(uri)
  }

  // ── Content ───────────────────────────────────────────────────────────────

  function renderContent() {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-2 px-4 py-3" role="status" aria-label="Loading queue">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-4">
          <AlertTriangle className="h-10 w-10 text-red-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-heading">Could not load queue</p>
            <p className="mt-1 text-xs text-caption">Check the speaker is reachable.</p>
          </div>
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-[var(--border-primary)] px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Retry
          </button>
        </div>
      )
    }

    if (!queue || queue.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
          <Music2 className="h-10 w-10 text-slate-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-heading">Queue is empty</p>
            <p className="mt-1 text-xs text-caption">
              Start playing music to build a queue.
            </p>
          </div>
        </div>
      )
    }

    const sortableIds = queue.map((item, i) => item.uri + ':' + i)

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <ul
            className="divide-y divide-[var(--border-secondary)]"
            aria-label="Queue — drag to reorder"
          >
            {queue.map((item, i) => {
              const isCurrentTrack =
                currentTrackUri ? item.uri === currentTrackUri : i === 0
              return (
                <SortableQueueItem
                  key={item.uri + ':' + i}
                  item={item}
                  index={i}
                  isCurrentTrack={isCurrentTrack}
                  onRemove={handleRemove}
                  onPlayNext={handlePlayNext}
                  isFirst={i === 0}
                />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>
    )
  }

  return (
    <SortableOverlay
      open={open}
      onClose={onClose}
      onDone={onClose}
      isSaving={false}
      title="Queue"
    >
      {renderContent()}
    </SortableOverlay>
  )
}
