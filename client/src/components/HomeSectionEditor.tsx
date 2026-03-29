import { useState, useMemo } from 'react'
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
import { Eye, EyeOff, GripVertical, Lock } from 'lucide-react'
import { api } from '@/lib/api'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { SortableOverlay } from '@/components/ui/SortableOverlay'
import { useOverlaySessionKey } from '@/hooks/useOverlaySessionKey'
import { useToast } from '@/hooks/useToast'

// ── Section definitions ───────────────────────────────────────────────────────

const HOMEPAGE_SECTIONS = [
  { id: 'mta', label: 'Train times', icon: 'train-front' },
  { id: 'quick-actions', label: 'Quick actions', icon: 'zap' },
  { id: 'music', label: 'Speaker controls', icon: 'volume2' },
  { id: 'weather', label: 'Weather', icon: 'cloud-sun' },
  { id: 'mode-selector', label: 'Mode selector', icon: 'sun' },
  { id: 'rooms', label: 'Rooms', icon: 'door-open' },
] as const

type SectionId = (typeof HOMEPAGE_SECTIONS)[number]['id']

import { DEFAULT_SECTION_ORDER, type SectionOrderItem } from '@/lib/homepage-sections'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HomeSectionEditorProps {
  open: boolean
  onClose: () => void
}

// ── Sortable section card ─────────────────────────────────────────────────────

interface SortableSectionCardProps {
  item: SectionOrderItem
  onToggleVisible: (id: string) => void
}

function SortableSectionCard({ item, onToggleVisible }: SortableSectionCardProps) {
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

  const section = HOMEPAGE_SECTIONS.find(s => s.id === item.id)
  if (!section) return null

  const isRooms = item.id === 'rooms'
  const isHidden = !item.visible

  return (
    <li
      ref={setNodeRef}
      style={{ ...style, background: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)' }}
      className={[
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 select-none transition-opacity',
        isDragging
          ? 'scale-[1.02] shadow-lg shadow-black/40 opacity-95 z-10 relative'
          : 'shadow-sm',
        isHidden ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Section icon */}
      <span className="shrink-0 text-fairy-400" aria-hidden="true">
        <LucideIcon name={section.icon} className="h-4 w-4" />
      </span>

      {/* Section label */}
      <span className="flex-1 text-sm font-medium text-heading">{section.label}</span>

      {/* Always-visible lock for Rooms, or eye toggle for others */}
      {isRooms ? (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500"
          aria-label="Rooms is always visible"
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : (
        <button
          onClick={() => onToggleVisible(item.id)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label={isHidden ? `Show ${section.label}` : `Hide ${section.label}`}
          aria-pressed={item.visible}
        >
          {isHidden
            ? <EyeOff className="h-4 w-4" aria-hidden="true" />
            : <Eye className="h-4 w-4" aria-hidden="true" />
          }
        </button>
      )}

      {/* Drag handle — 44x44 touch target */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 hover:text-slate-300 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        style={{ touchAction: 'none' }}
        aria-label={`Drag to reorder ${section.label}`}
        tabIndex={0}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Inner content (remounted on each open) ────────────────────────────────────

interface HomeSectionEditorContentProps {
  initialOrder: SectionOrderItem[]
  onSave: (order: SectionOrderItem[]) => void
  open: boolean
  onClose: () => void
  isSaving: boolean
}

function HomeSectionEditorContent({
  initialOrder,
  onSave,
  open,
  onClose,
  isSaving,
}: HomeSectionEditorContentProps) {
  const [sectionOrder, setSectionOrder] = useState(initialOrder)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSectionOrder(prev => {
      const oldIndex = prev.findIndex(s => s.id === active.id)
      const newIndex = prev.findIndex(s => s.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function handleToggleVisible(id: string) {
    setSectionOrder(prev =>
      prev.map(s => (s.id === id && s.id !== 'rooms' ? { ...s, visible: !s.visible } : s)),
    )
  }

  return (
    <SortableOverlay
      open={open}
      onClose={onClose}
      onDone={() => onSave(sectionOrder)}
      isSaving={isSaving}
      title="Edit home screen"
    >
      {/* Instruction hint */}
      <p className="px-4 pt-3 pb-1 text-xs text-caption">
        Drag to reorder sections. Tap the eye to show or hide.
      </p>

      {/* Sortable list */}
      <div className="px-4 pb-4 pt-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sectionOrder.map(s => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2" aria-label="Home screen sections — drag to reorder">
              {sectionOrder.map(item => (
                <SortableSectionCard
                  key={item.id}
                  item={item}
                  onToggleVisible={handleToggleVisible}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </SortableOverlay>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeSectionEditor({ open, onClose }: HomeSectionEditorProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const sessionKey = useOverlaySessionKey(open)

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  // Parse + validate the stored section order, filling in any missing sections
  const initialOrder = useMemo<SectionOrderItem[]>(() => {
    const raw = prefs?.homepage_section_order
    if (!raw) return DEFAULT_SECTION_ORDER
    try {
      const parsed = JSON.parse(raw) as SectionOrderItem[]
      const knownIds = DEFAULT_SECTION_ORDER.map(s => s.id) as SectionId[]
      const result = parsed.filter(s => knownIds.includes(s.id as SectionId))
      for (const def of DEFAULT_SECTION_ORDER) {
        if (!result.find(s => s.id === def.id)) result.push({ ...def })
      }
      return result
    } catch {
      return DEFAULT_SECTION_ORDER
    }
  }, [prefs?.homepage_section_order])

  const saveMutation = useMutation({
    mutationFn: (order: SectionOrderItem[]) =>
      api.system.setPreference('homepage_section_order', JSON.stringify(order)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] })
      toast({ message: 'Home screen layout saved' })
      onClose()
    },
    onError: () => {
      toast({ message: 'Failed to save layout. Please try again.', type: 'error' })
    },
  })

  return (
    <HomeSectionEditorContent
      key={sessionKey}
      initialOrder={initialOrder}
      onSave={order => saveMutation.mutate(order)}
      open={open}
      onClose={onClose}
      isSaving={saveMutation.isPending}
    />
  )
}
