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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { AlertTriangle, Heart, Music2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { UserFavourite } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { FavouriteItem } from './FavouriteItem'
import { FairylistAccordion } from './FairylistAccordion'
import { FairylistDetail } from './FairylistDetail'
import { SpeakerSelectorDropdown } from './SpeakerSelectorDropdown'
import { usePlaybackState } from '@/hooks/usePlaybackState'

// ── Props ─────────────────────────────────────────────────────────────────────

interface FavouritesTabProps {
  onNavigateToBrowse?: () => void
  targetSpeaker?: string  // When provided, skip speaker selector and use this speaker
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FavouritesTab({ onNavigateToBrowse, targetSpeaker }: FavouritesTabProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // ── Fairylist detail navigation ───────────────────────────────────────────
  const [fairylistDetailId, setFairylistDetailId] = useState<number | null>(null)

  // ── Swipe tray state (only one item open at a time) ───────────────────────
  const [swipedItemId, setSwipedItemId] = useState<number | null>(null)

  // ── Drag announcement for screen readers ──────────────────────────────────
  const [dragAnnouncement, setDragAnnouncement] = useState('')

  // ── Speaker selection via context ─────────────────────────────────────────
  const { selectedSpeaker: contextSpeaker, isTrackActive, isSelectedPlaying } = usePlaybackState()
  const effectiveSpeaker = targetSpeaker ?? contextSpeaker ?? null

  // ── Favourites query ─────────────────────────────────────────────────────
  const favsKey = ['favourites']

  const {
    data: favourites,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: favsKey,
    queryFn: api.favourites.list,
    staleTime: 30_000,
    retry: 1,
  })

  // ── DnD sensors ──────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Mutations ────────────────────────────────────────────────────────────
  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => api.favourites.reorder(ids),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: favsKey })
      toast({ message: 'Could not save new order', type: 'error' })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: number) => api.favourites.remove(id),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: favsKey })
      toast({ message: 'Could not remove favourite', type: 'error' })
    },
    onSuccess: () => toast({ message: 'Removed from favourites' }),
  })

  const playMutation = useMutation({
    mutationFn: ({ speaker, title }: { speaker: string; title: string }) =>
      api.sonos.playFavourite(speaker, title),
    onSuccess: () => toast({ message: 'Playing now' }),
    onError: () => toast({ message: 'Could not play this item', type: 'error' }),
  })

  const pauseMutation = useMutation({
    mutationFn: (speaker: string) => api.sonos.pause(speaker),
    onError: () => toast({ message: 'Could not pause', type: 'error' }),
  })

  const playNextMutation = useMutation({
    mutationFn: ({ speaker, uri }: { speaker: string; uri: string }) =>
      api.sonos.playNext(speaker, uri),
    onSuccess: () => toast({ message: 'Added to play next' }),
    onError: () => toast({ message: 'Could not add to play next', type: 'error' }),
  })

  const addToQueueMutation = useMutation({
    mutationFn: ({ speaker, uri }: { speaker: string; uri: string }) =>
      api.sonos.addToQueue(speaker, uri),
    onSuccess: () => toast({ message: 'Added to queue' }),
    onError: () => toast({ message: 'Could not add to queue', type: 'error' }),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !favourites) return

    const oldIndex = favourites.findIndex(f => f.id === active.id)
    const newIndex = favourites.findIndex(f => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(favourites, oldIndex, newIndex)
    queryClient.setQueryData<UserFavourite[]>(favsKey, reordered)
    reorderMutation.mutate(reordered.map(f => f.id))

    const movedItem = favourites[oldIndex]
    setDragAnnouncement(
      `${movedItem.title}, moved to position ${newIndex + 1} of ${favourites.length}`,
    )
  }

  function handlePlay(item: UserFavourite) {
    if (!effectiveSpeaker) {
      toast({ message: 'No speaker available', type: 'error' })
      return
    }
    playMutation.mutate({ speaker: effectiveSpeaker, title: item.title })
  }

  function handleRemove(id: number) {
    if (!favourites) return
    queryClient.setQueryData<UserFavourite[]>(favsKey, favourites.filter(f => f.id !== id))
    removeMutation.mutate(id)
  }

  function handlePlayNext(item: UserFavourite) {
    if (!effectiveSpeaker) {
      toast({ message: 'No speaker available', type: 'error' })
      return
    }
    playNextMutation.mutate({ speaker: effectiveSpeaker, uri: item.source_uri })
  }

  function handleAddToQueue(item: UserFavourite) {
    if (!effectiveSpeaker) {
      toast({ message: 'No speaker available', type: 'error' })
      return
    }
    addToQueueMutation.mutate({ speaker: effectiveSpeaker, uri: item.source_uri })
  }

  // ── Fairylist detail view ─────────────────────────────────────────────────
  if (fairylistDetailId !== null) {
    return (
      <FairylistDetail
        fairylistId={fairylistDetailId}
        onBack={() => setFairylistDetailId(null)}
        effectiveSpeaker={effectiveSpeaker}
      />
    )
  }

  // ── States ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-3" role="status" aria-label="Loading favourites">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/4 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-red-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-heading">Could not load favourites</p>
          <p className="mt-1 text-xs text-caption">Check your connection and try again.</p>
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

  const sortableIds = (favourites ?? []).map(f => f.id)

  return (
    <div className="flex flex-col gap-0">
      {/* aria-live region announces drag reorder position to screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {dragAnnouncement}
      </div>

      {/* Speaker selector */}
      {!targetSpeaker && (
        <div className="flex items-center px-0 pb-2">
          <SpeakerSelectorDropdown />
        </div>
      )}

      {/* Fairylists section */}
      <div className="mb-4">
        <FairylistAccordion
          onSelectFairylist={setFairylistDetailId}
          effectiveSpeaker={effectiveSpeaker}
        />
      </div>

      {/* Your favourites section */}
      <h2 className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-caption">
        Your favourites
      </h2>

      {!favourites || favourites.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
          <Heart className="h-8 w-8 text-caption/40" aria-hidden="true" />
          <p className="text-sm text-caption">No favourites yet.</p>
          {onNavigateToBrowse && (
            <button
              onClick={onNavigateToBrowse}
              className="rounded-xl bg-fairy-500 px-4 py-2 text-sm font-semibold text-white hover:bg-fairy-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              Browse music
            </button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ul
              className="divide-y divide-[var(--border-secondary)]"
              aria-label="Favourites — drag to reorder"
              onClick={() => setSwipedItemId(null)}
            >
              {favourites.map(item => (
                <FavouriteItem
                  key={item.id}
                  item={item}
                  onPlay={handlePlay}
                  onPause={effectiveSpeaker ? () => pauseMutation.mutate(effectiveSpeaker) : undefined}
                  onRemove={handleRemove}
                  onPlayNext={handlePlayNext}
                  onAddToQueue={handleAddToQueue}
                  swipedItemId={swipedItemId}
                  onSwipeOpen={setSwipedItemId}
                  isCurrentTrack={isTrackActive(item.source_uri, item.title)}
                  isPlaying={isSelectedPlaying}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Footer CTA */}
      <div className="mt-6 px-4">
        {onNavigateToBrowse && (
          <button
            onClick={onNavigateToBrowse}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] py-3 text-sm font-medium text-slate-300 hover:border-[var(--border-secondary)] hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            <Music2 className="h-4 w-4" aria-hidden="true" />
            Add from Browse
          </button>
        )}
      </div>
    </div>
  )
}
