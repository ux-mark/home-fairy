import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { api } from '@/lib/api'
import type { FairylistItem } from '@/lib/api'
import { invalidateQueue } from '@/lib/queueCache'
import { useToast } from '@/hooks/useToast'

// ── useFairylistEditor ────────────────────────────────────────────────────────

interface UseFairylistEditorOptions {
  fairylistId: number
  effectiveSpeaker: string | null
  onDeleteSuccess?: () => void
}

interface FairylistData {
  fairylist: {
    id: number
    name: string
    item_count: number
  }
  items: FairylistItem[]
}

export function useFairylistEditor({
  fairylistId,
  effectiveSpeaker,
  onDeleteSuccess,
}: UseFairylistEditorOptions) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [dragAnnouncement, setDragAnnouncement] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  const deleteMutation = useMutation({
    mutationFn: () => api.fairylists.remove(fairylistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fairylists'] })
      toast({ message: 'Fairylist deleted' })
      onDeleteSuccess?.()
    },
    onError: () => toast({ message: 'Could not delete Fairylist', type: 'error' }),
  })

  const removeMutation = useMutation<unknown, unknown, number, { prev?: FairylistData }>({
    mutationFn: (itemId: number) => api.fairylists.removeItem(fairylistId, itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const prev = queryClient.getQueryData<FairylistData>(detailKey)
      if (prev) {
        queryClient.setQueryData(detailKey, {
          ...prev,
          items: prev.items.filter((i: FairylistItem) => i.id !== itemId),
          fairylist: { ...prev.fairylist, item_count: prev.fairylist.item_count - 1 },
        })
      }
      return { prev }
    },
    onError: (_err: unknown, _id: unknown, ctx: { prev?: FairylistData } | undefined) => {
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
    onSuccess: () => {
      const name = data?.fairylist.name
      toast({ message: name ? `Playing "${name}" — replaced queue` : 'Playing Fairylist — replaced queue' })
      invalidateQueue(queryClient, effectiveSpeaker)
    },
    onError: () => toast({ message: 'Could not play Fairylist', type: 'error' }),
  })

  const queueMutation = useMutation({
    mutationFn: (mode: 'append' | 'next') => api.fairylists.queue(fairylistId, effectiveSpeaker!, mode),
    onSuccess: (_data, mode) => {
      const name = data?.fairylist.name ?? 'Fairylist'
      toast({ message: mode === 'next' ? `"${name}" will play next` : `Added "${name}" to queue` })
      invalidateQueue(queryClient, effectiveSpeaker)
    },
    onError: () => toast({ message: 'Could not queue Fairylist', type: 'error' }),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !data) return

    const oldIndex = data.items.findIndex((i: FairylistItem) => i.id === active.id)
    const newIndex = data.items.findIndex((i: FairylistItem) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(data.items, oldIndex, newIndex)
    queryClient.setQueryData(detailKey, { ...data, items: reordered })
    reorderMutation.mutate(reordered.map((i: FairylistItem) => i.id))

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

  return {
    // Data
    data,
    isLoading,
    isError,
    refetch,
    // UI state
    editing,
    setEditing,
    nameValue,
    setNameValue,
    dragAnnouncement,
    showDeleteConfirm,
    setShowDeleteConfirm,
    // DnD
    sensors,
    handleDragEnd,
    // Mutations
    renameMutation,
    deleteMutation,
    removeMutation,
    reorderMutation,
    playMutation,
    queueMutation,
    // Handlers
    handleSaveName,
    startEditing,
  }
}
