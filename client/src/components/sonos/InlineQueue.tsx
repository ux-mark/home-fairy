import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListMusic,
  Music,
  Music2,
  Play,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosQueueItem, SonosPlaybackState } from '@/lib/api'
import { useQueueSync } from '@/hooks/useQueueSync'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { ArtworkImage } from './ArtworkImage'
import { MusicItemMenu } from './MusicItemMenu'
import { QueueHeader } from './QueueHeader'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InlineQueueProps {
  speaker: string
  currentTrackUri: string | null
  expanded: boolean
  onToggle: () => void
  /** If set, only show the first N items in the list (shows a link to full queue if more exist) */
  queueLimit?: number
  /** The current playback state — needed for QueueHeader play mode buttons */
  playbackState?: SonosPlaybackState | null
  /** If true, show the full QueueView trigger link when limit is exceeded */
  onViewFullQueue?: () => void
}

// ── Sortable queue item ───────────────────────────────────────────────────────

interface SortableQueueItemProps {
  item: SonosQueueItem
  index: number
  isCurrentTrack: boolean
  onRemove: (index: number) => void
  speaker: string
}

function SortableQueueItem({
  item,
  index,
  isCurrentTrack,
  onRemove,
  speaker,
}: SortableQueueItemProps) {
  const navigate = useNavigate()
  const { toast } = useToast()

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

  const playNow = useMutation({
    mutationFn: () => api.sonos.seekToTrack(speaker, index + 1),
    onSuccess: () => toast({ message: `Playing "${item.title}"` }),
    onError: () => toast({ message: 'Failed to play', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () => api.favourites.add({
      source: item.uri?.startsWith('spotify:') ? 'spotify' : 'nas',
      source_uri: item.uri,
      title: item.title,
      album_art_uri: item.albumArtUri ?? undefined,
    }),
    onSuccess: () => toast({ message: `Added "${item.title}" to favourites` }),
    onError: () => toast({ message: 'Failed to add to favourites', type: 'error' }),
  })

  function handleTitleClick() {
    if (item.uri) {
      navigate(`/sonos/track?uri=${encodeURIComponent(item.uri)}&speaker=${encodeURIComponent(speaker)}`)
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 py-2 select-none transition-opacity',
        isCurrentTrack ? 'border-l-2 border-fairy-500 pl-[6px]' : 'pl-2',
        isDragging ? 'opacity-80 z-10 relative' : '',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-11 w-5 shrink-0 cursor-grab items-center justify-center rounded text-slate-500 hover:text-slate-400 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        style={{ touchAction: 'none' }}
        aria-label={`Drag to reorder ${item.title}`}
        tabIndex={0}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      <ArtworkImage src={item.albumArtUri} size={40} />

      {/* Track info — tappable */}
      <button
        onClick={handleTitleClick}
        className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
        aria-label={`View details for ${item.title}`}
      >
        <div className="flex items-center gap-1.5">
          <p
            className={cn(
              'truncate text-sm font-medium leading-tight',
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

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={playNow.isPending}
          onClick={() => playNow.mutate()}
          aria-label={`Play ${item.title}`}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg',
            'text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>
        <MusicItemMenu
          label={item.title}
          onAddToFavourites={() => addToFavourites.mutate()}
          onRemove={() => onRemove(index)}
          removeLabel="Remove from queue"
          fairylistTrack={{
            source: item.uri?.startsWith('spotify:') ? 'spotify' : 'nas',
            source_uri: item.uri,
            title: item.title,
            artist: item.artist,
            album_art_uri: item.albumArtUri ?? undefined,
          }}
          spotifyTrack={
            item.uri?.startsWith('spotify:')
              ? { trackUri: item.uri, trackName: item.title }
              : undefined
          }
        />
      </div>
    </li>
  )
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const queueKey = ['sonos', 'queue', speaker]

  const { queue, isLoading, isError, refetch } = useQueueSync({
    speaker,
    enabled: expanded && !!speaker,
  })

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queueKey }),
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
    queryClient.setQueryData<SonosQueueItem[]>(
      queueKey,
      queue.filter((_, i) => i !== index),
    )
    removeMutation.mutate(index)
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
        <div id={`inline-queue-${speaker}`}>
          {/* Queue header — shuffle, repeat all, clear */}
          {!isLoading && !isError && queue && queue.length > 0 && (
            <QueueHeader
              speaker={speaker}
              currentPlayMode={playbackState?.currentPlayMode}
              onModeChange={() => {}}
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
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center px-4">
              <Music2 className="h-8 w-8 text-slate-500" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-heading">Queue is empty</p>
                <p className="mt-0.5 text-xs text-caption">Start playing music to build a queue.</p>
              </div>
              <button
                onClick={() => navigate(`/sonos/browse?speaker=${encodeURIComponent(speaker)}`)}
                className={cn(
                  'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                  'surface text-body hover:brightness-95 dark:hover:brightness-110',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
                aria-label="Browse music"
              >
                <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
                Browse music
              </button>
            </div>
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
                      <SortableQueueItem
                        key={item.uri + ':' + i}
                        item={item}
                        index={i}
                        isCurrentTrack={isCurrentTrack}
                        onRemove={handleRemove}
                        speaker={speaker}
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
        </div>
      )}
    </div>
  )
}
