import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
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
  ArrowLeft,
  GripVertical,
  Loader2,
  Play,
  Radio,
  Trash2,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { FairylistItem } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { Skeleton } from '@/components/ui/Skeleton'
import { ArtworkImage } from './ArtworkImage'
import { cn } from '@/lib/utils'

// ── Props ─────────────────────────────────────────────────────────────────────

interface FairylistDetailProps {
  fairylistId: number
  onBack: () => void
  effectiveSpeaker: string | null
}

// ── Source badge ──────────────────────────────────────────────────────────────

const sourceBadgeClass: Record<string, string> = {
  spotify: 'bg-green-500/15 text-green-400',
  nas: 'bg-blue-500/15 text-blue-400',
  radio: 'bg-amber-500/15 text-amber-400',
  sonos: 'bg-purple-500/15 text-purple-400',
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        sourceBadgeClass[source] ?? 'bg-[var(--bg-tertiary)] text-caption',
      )}
    >
      {source}
    </span>
  )
}

// ── Sortable item row ─────────────────────────────────────────────────────────

function SortableItemRow({
  item,
  onRemove,
  isRemoving,
}: {
  item: FairylistItem
  onRemove: (id: number) => void
  isRemoving: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const artSrc = item.source === 'radio' ? undefined : item.album_art_uri ?? undefined

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 transition-opacity',
        isDragging && 'opacity-50',
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${item.title}`}
        className={cn(
          'touch-none p-1 text-caption/40 transition-colors hover:text-caption',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'cursor-grab active:cursor-grabbing',
        )}
      >
        <GripVertical className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>

      {/* Artwork */}
      {item.source === 'radio' ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bg-secondary)]">
          <Radio className="h-5 w-5 text-caption" aria-hidden="true" />
        </div>
      ) : (
        <ArtworkImage src={artSrc} fallback="disc" />
      )}

      {/* Track info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{item.title}</p>
        <div className="flex items-center gap-1.5">
          {item.artist && (
            <p className="truncate text-xs text-caption">{item.artist}</p>
          )}
          <SourceBadge source={item.source} />
        </div>
      </div>

      {/* Remove button */}
      <button
        type="button"
        disabled={isRemoving}
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.title} from Fairylist`}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-caption',
          'transition-colors hover:bg-red-500/10 hover:text-red-400',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'disabled:opacity-40',
        )}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── FairylistDetail ───────────────────────────────────────────────────────────

export function FairylistDetail({ fairylistId, onBack, effectiveSpeaker }: FairylistDetailProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [dragAnnouncement, setDragAnnouncement] = useState('')

  const detailKey = ['fairylists', fairylistId]

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: detailKey,
    queryFn: () => api.fairylists.get(fairylistId),
    staleTime: 30_000,
    retry: 1,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const renameMutation = useMutation({
    mutationFn: (name: string) => api.fairylists.rename(fairylistId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      queryClient.invalidateQueries({ queryKey: detailKey })
      setEditing(false)
    },
    onError: () => toast({ message: 'Could not rename Fairylist', type: 'error' }),
  })

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => api.fairylists.remove(fairylistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      toast({ message: 'Fairylist deleted' })
      onBack()
    },
    onError: () => toast({ message: 'Could not delete Fairylist', type: 'error' }),
  })

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => api.fairylists.removeItem(fairylistId, itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const prev = queryClient.getQueryData<typeof data>(detailKey)
      if (prev) {
        queryClient.setQueryData(detailKey, {
          ...prev,
          items: prev.items.filter(i => i.id !== itemId),
          fairylist: { ...prev.fairylist, item_count: prev.fairylist.item_count - 1 },
        })
      }
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(detailKey, ctx.prev)
      toast({ message: 'Could not remove track', type: 'error' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: detailKey })
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => api.fairylists.reorder(fairylistId, ids),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: detailKey })
      toast({ message: 'Could not save new order', type: 'error' })
    },
  })

  const playMutation = useMutation({
    mutationFn: () => api.fairylists.play(fairylistId, effectiveSpeaker!),
    onSuccess: () => toast({ message: 'Playing Fairylist' }),
    onError: () => toast({ message: 'Could not play Fairylist', type: 'error' }),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !data) return

    const oldIndex = data.items.findIndex(i => i.id === active.id)
    const newIndex = data.items.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(data.items, oldIndex, newIndex)
    queryClient.setQueryData(detailKey, { ...data, items: reordered })
    reorderMutation.mutate(reordered.map(i => i.id))

    const movedItem = data.items[oldIndex]
    setDragAnnouncement(
      `${movedItem.title}, moved to position ${newIndex + 1} of ${data.items.length}`,
    )
  }

  function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || !data) return
    if (trimmed === data.fairylist.name) {
      setEditing(false)
      return
    }
    renameMutation.mutate(trimmed)
  }

  function startEditing() {
    if (data) setNameValue(data.fairylist.name)
    setEditing(true)
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col gap-0" role="status" aria-label="Loading Fairylist">
        <div className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-48 rounded" />
        </div>
        <div className="divide-y divide-[var(--border-secondary)]">
          {Array.from({ length: 4 }).map((_, i) => (
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
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-red-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-heading">Could not load Fairylist</p>
          <p className="mt-1 text-xs text-caption">Check your connection and try again.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border border-[var(--border-primary)] px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Go back
          </button>
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-[var(--border-primary)] px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const { fairylist, items } = data
  const sortableIds = items.map(i => i.id)

  return (
    <div className="flex flex-col gap-0">
      {/* aria-live region for drag announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {dragAnnouncement}
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Fairylists"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-caption',
            'transition-colors hover:bg-[var(--bg-secondary)] hover:text-body',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Editable name */}
        {editing ? (
          <input
            type="text"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveName()
              if (e.key === 'Escape') setEditing(false)
            }}
            autoFocus
            aria-label="Fairylist name"
            className={cn(
              'min-w-0 flex-1 rounded-lg border border-fairy-500/50 bg-[var(--bg-secondary)]',
              'px-2 py-1 text-sm font-semibold text-heading',
              'focus:outline-2 focus:outline-fairy-500',
            )}
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            title="Click to rename"
            className={cn(
              'min-w-0 flex-1 rounded-lg px-2 py-1 text-left',
              'text-sm font-semibold text-heading',
              'hover:bg-[var(--bg-secondary)] transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            <span className="truncate block">{fairylist.name}</span>
          </button>
        )}

        <span className="shrink-0 text-xs text-caption">
          {fairylist.item_count} {fairylist.item_count === 1 ? 'track' : 'tracks'}
        </span>

        {/* Play all button */}
        <button
          type="button"
          disabled={!effectiveSpeaker || items.length === 0 || playMutation.isPending}
          onClick={() => playMutation.mutate()}
          aria-label={`Play all tracks in ${fairylist.name}`}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            'bg-fairy-500 text-white transition-colors hover:bg-fairy-400',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'disabled:opacity-40',
          )}
        >
          {playMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          aria-label={`Delete ${fairylist.name}`}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-caption',
            'transition-colors hover:bg-red-500/10 hover:text-red-400',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
          <p className="text-sm font-semibold text-heading">This Fairylist is empty</p>
          <p className="max-w-xs text-xs text-caption">
            Search for tracks in the Browse tab and use the menu on any track to add it to this Fairylist.
          </p>
        </div>
      )}

      {/* Track list */}
      {items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ul
              className="divide-y divide-[var(--border-secondary)]"
              aria-label={`Tracks in ${fairylist.name} — drag to reorder`}
            >
              {items.map(item => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  onRemove={(id) => removeMutation.mutate(id)}
                  isRemoving={removeMutation.isPending && removeMutation.variables === item.id}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Add more hint */}
      <div className="mt-4 px-4">
        <p className="text-center text-xs text-caption">
          To add more tracks, search in Browse and use the track menu to add to this Fairylist.
        </p>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog.Root open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl',
              'bg-[var(--bg-primary)] shadow-xl px-4 py-6',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
              'focus:outline-none',
            )}
            aria-describedby="delete-fairylist-detail-desc"
          >
            <Dialog.Title className="text-base font-semibold text-heading mb-1">
              Delete Fairylist
            </Dialog.Title>
            <p id="delete-fairylist-detail-desc" className="text-sm text-caption mb-6">
              Delete &ldquo;{fairylist.name}&rdquo;? This will remove the Fairylist and all its tracks for everyone in the household.
            </p>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button
                  className={cn(
                    'flex-1 rounded-xl border border-[var(--border-primary)] py-3 text-sm font-medium text-caption',
                    'transition-colors hover:text-body',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'min-h-[44px]',
                  )}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                className={cn(
                  'flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white',
                  'transition-colors hover:bg-red-500',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'disabled:opacity-40',
                  'min-h-[44px]',
                )}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
