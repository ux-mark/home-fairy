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
  GripVertical,
  Music2,
  Play,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosQueueItem, SonosPlaybackState } from '@/lib/api'
import { useQueueSync } from '@/hooks/useQueueSync'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { SortableOverlay } from '@/components/ui/SortableOverlay'
import { ArtworkImage } from './ArtworkImage'
import { QueueHeader } from './QueueHeader'
import { MusicItemMenu } from './MusicItemMenu'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueViewProps {
  speaker: string
  open: boolean
  onClose: () => void
  currentTrackUri: string | null
  /** Current playback state — used for QueueHeader mode buttons */
  playbackState?: SonosPlaybackState | null
}

// ── Sortable queue item ───────────────────────────────────────────────────────

interface SortableQueueItemProps {
  item: SonosQueueItem
  index: number
  isCurrentTrack: boolean
  onRemove: (index: number) => void
  onPlayNext: (uri: string) => void
  speaker: string
}

function SortableQueueItem({
  item,
  index,
  isCurrentTrack,
  onRemove,
  onPlayNext,
  speaker,
}: SortableQueueItemProps) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()

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

  const source = item.uri?.startsWith('spotify:') ? 'spotify' : 'nas'

  const playNow = useMutation({
    mutationFn: () => {
      if (item.uri?.startsWith('spotify:')) {
        return api.sonos.playSpotify(speaker, item.uri, 'now')
      }
      return api.sonos.playUri(speaker, item.uri)
    },
    onSuccess: () => toast({ message: `Playing "${item.title}"` }),
    onError: () => toast({ message: 'Failed to play', type: 'error' }),
  })

  const addToQueueMut = useMutation({
    mutationFn: () => api.sonos.addToQueue(speaker, item.uri),
    onSuccess: () => {
      toast({ message: `Added "${item.title}" to queue` })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'queue', speaker] })
    },
    onError: () => toast({ message: 'Failed to add to queue', type: 'error' }),
  })

  const addToFavourites = useMutation({
    mutationFn: () =>
      api.favourites.add({
        source,
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
      <ArtworkImage src={item.albumArtUri} size={40} fallback="disc" />

      {/* Track info — tappable */}
      <button
        onClick={handleTitleClick}
        className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
        aria-label={`View details for ${item.title}`}
      >
        <div className="flex items-center gap-2">
          <p
            className={[
              'truncate text-sm font-medium leading-tight',
              isCurrentTrack ? 'text-fairy-400' : 'text-heading',
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
      </button>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Play now — icon-only acceptable for universally-recognised play symbol */}
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
          onPlayNext={() => onPlayNext(item.uri)}
          onAddToQueue={() => addToQueueMut.mutate()}
          onAddToFavourites={() => addToFavourites.mutate()}
          onRemove={() => onRemove(index)}
          removeLabel="Remove from queue"
          fairylistTrack={{
            source,
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

// ── QueueView ─────────────────────────────────────────────────────────────────

export function QueueView({ speaker, open, onClose, currentTrackUri, playbackState }: QueueViewProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const queueKey = ['sonos', 'queue', speaker]

  const { queue, isLoading, isError, refetch } = useQueueSync({
    speaker,
    enabled: open && !!speaker,
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

    // IDs are item.uri + ':' + originalIndex — search the full queue
    const items = [...queue]
    const oldIndex = items.findIndex((item, i) => active.id === item.uri + ':' + i)
    const newIndex = items.findIndex((item, i) => over.id === item.uri + ':' + i)
    if (oldIndex === -1 || newIndex === -1) return

    // Optimistic update on the full queue
    queryClient.setQueryData<SonosQueueItem[]>(queueKey, arrayMove(items, oldIndex, newIndex))
    reorderMutation.mutate({ from: oldIndex, to: newIndex })
  }

  function handleRemove(originalIndex: number) {
    if (!queue) return
    // Optimistic update on the full queue
    queryClient.setQueryData<SonosQueueItem[]>(
      queueKey,
      queue.filter((_, i) => i !== originalIndex),
    )
    removeMutation.mutate(originalIndex)
  }

  function handlePlayNext(uri: string) {
    playNextMutation.mutate(uri)
  }

  // Compute upcoming tracks (items after the current track)
  const currentIndex =
    queue && currentTrackUri
      ? Math.max(0, queue.findIndex(item => item.uri === currentTrackUri))
      : 0
  const upcomingStartIndex = currentIndex + 1
  const upcomingQueue = queue ? queue.slice(upcomingStartIndex) : []

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

    if (upcomingQueue.length === 0) {
      return (
        <>
          <QueueHeader
            speaker={speaker}
            currentPlayMode={playbackState?.currentPlayMode}
            onModeChange={() => {}}
          />
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
            <Music2 className="h-10 w-10 text-slate-500" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-heading">No more tracks in queue</p>
              <p className="mt-1 text-xs text-caption">
                This is the last track.
              </p>
            </div>
          </div>
        </>
      )
    }

    const sortableIds = upcomingQueue.map((item, i) => item.uri + ':' + (upcomingStartIndex + i))

    return (
      <>
        {/* Queue header — shuffle, repeat all, clear */}
        <QueueHeader
          speaker={speaker}
          currentPlayMode={playbackState?.currentPlayMode}
          onModeChange={() => {}}
        />
        <p className="px-4 pb-1 pt-2 text-xs font-semibold text-caption uppercase tracking-wide">
          Up next
        </p>
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
              {upcomingQueue.map((item, i) => {
                const originalIndex = upcomingStartIndex + i
                return (
                  <SortableQueueItem
                    key={item.uri + ':' + originalIndex}
                    item={item}
                    index={originalIndex}
                    isCurrentTrack={false}
                    onRemove={handleRemove}
                    onPlayNext={handlePlayNext}
                    speaker={speaker}
                  />
                )
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </>
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
