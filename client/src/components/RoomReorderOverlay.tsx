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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { api, type Room } from '@/lib/api'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { SortableOverlay } from '@/components/ui/SortableOverlay'
import { useOverlaySessionKey } from '@/hooks/useOverlaySessionKey'
import { useToast } from '@/hooks/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoomReorderOverlayProps {
  rooms: Room[]
  open: boolean
  onClose: () => void
  /** Show all rooms including hidden children (for Rooms page). Default: false (homepage mode). */
  showAll?: boolean
}

// ── Sortable room card ────────────────────────────────────────────────────────

function SortableRoomCard({ room, isChild }: { room: Room; isChild?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: room.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={{ ...style, background: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)' }}
      className={[
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 select-none',
        isChild ? 'ml-4' : '',
        isDragging
          ? 'scale-[1.02] shadow-lg shadow-black/40 opacity-95 z-10 relative'
          : 'shadow-sm',
      ].join(' ')}
    >
      {/* Room icon */}
      <span className="shrink-0 text-fairy-400" aria-hidden="true">
        <LucideIcon name={room.icon} className="h-4 w-4" />
      </span>

      {/* Room name */}
      <span className="flex-1 text-sm font-medium text-heading">{room.name}</span>

      {/* Drag handle — 44x44 touch target */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 hover:text-slate-300 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        style={{ touchAction: 'none' }}
        aria-label={`Drag to reorder ${room.name}`}
        tabIndex={0}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Inner content (remounted on each open to reset drag state) ────────────────

interface RoomReorderContentProps {
  initialRooms: Room[]
  onSave: (rooms: Room[]) => void
  open: boolean
  onClose: () => void
  isSaving: boolean
}

function RoomReorderContent({
  initialRooms,
  onSave,
  open,
  onClose,
  isSaving,
}: RoomReorderContentProps) {
  // Initialising state directly from props is the correct React pattern when
  // the component is remounted (via key) each time the session starts.
  const [orderedRooms, setOrderedRooms] = useState(initialRooms)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderedRooms(prev => {
      const oldIndex = prev.findIndex(r => r.name === active.id)
      const newIndex = prev.findIndex(r => r.name === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  return (
    <SortableOverlay
      open={open}
      onClose={onClose}
      onDone={() => onSave(orderedRooms)}
      isSaving={isSaving}
      title="Reorder rooms"
    >
      {/* Instruction hint */}
      <p className="px-4 pt-3 pb-1 text-xs text-caption">
        Drag the handle on the right to reorder rooms.
      </p>

      {/* Sortable list */}
      <div className="px-4 pb-4 pt-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedRooms.map(r => r.name)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2" aria-label="Rooms — drag to reorder">
              {orderedRooms.map(room => (
                <SortableRoomCard key={room.name} room={room} isChild={!!room.parent_room} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </SortableOverlay>
  )
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export default function RoomReorderOverlay({ rooms, open, onClose, showAll }: RoomReorderOverlayProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Each time the overlay opens we generate a new key so RoomReorderContent
  // remounts and its useState re-initialises from the latest sorted rooms.
  const sessionKey = useOverlaySessionKey(open)

  const sortedRooms = showAll
    ? [...rooms].sort((a, b) => a.display_order - b.display_order)
    : [...rooms].filter(r => !r.parent_room || r.promoted).sort((a, b) => a.display_order - b.display_order)

  // Hidden children: non-promoted rooms with a parent (excluded from homepage drag list)
  const hiddenChildren = showAll ? [] : rooms.filter(r => r.parent_room && !r.promoted)

  const saveMutation = useMutation({
    mutationFn: (reorderedRooms: Room[]) => {
      // Build final order: visible rooms with hidden children slotted after their parent
      const items: { name: string; display_order: number }[] = []
      let order = 0
      for (const room of reorderedRooms) {
        items.push({ name: room.name, display_order: order++ })
        // Insert any hidden children right after their parent
        for (const child of hiddenChildren.filter(c => c.parent_room === room.name)) {
          items.push({ name: child.name, display_order: order++ })
        }
      }
      return api.rooms.reorder(items)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast({ message: 'Room order saved' })
      onClose()
    },
    onError: () => {
      toast({ message: 'Failed to save room order. Please try again.', type: 'error' })
    },
  })

  return (
    <RoomReorderContent
      key={sessionKey}
      initialRooms={sortedRooms}
      onSave={reorderedRooms => saveMutation.mutate(reorderedRooms)}
      open={open}
      onClose={onClose}
      isSaving={saveMutation.isPending}
    />
  )
}
