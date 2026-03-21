import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus,
  ChevronRight,
  Lightbulb,
  Sparkles,
  DoorOpen,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

function RoomCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="animate-pulse space-y-2">
        <div className="h-5 w-32 rounded bg-slate-800" />
        <div className="h-4 w-24 rounded bg-slate-800" />
      </div>
    </div>
  )
}

export default function RoomsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')

  const { data: rooms, isLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: assignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api.rooms.create({ name, display_order: (rooms?.length ?? 0) + 1, auto: false, timer: 0, sensors: [], tags: [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setDialogOpen(false)
      setNewRoomName('')
      toast({ message: 'Room created' })
    },
    onError: () => toast({ message: 'Failed to create room', type: 'error' }),
  })

  const lightsPerRoom = (name: string) =>
    assignments?.filter(a => a.room_name === name).length ?? 0

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-400">All Rooms</h2>
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Trigger asChild>
            <button className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-fairy-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
              <Plus className="h-4 w-4" />
              Add Room
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
              <Dialog.Title className="text-lg font-semibold text-slate-100">
                New Room
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-400">
                Give your room a name. You can assign lights and configure automation later.
              </Dialog.Description>
              <form
                onSubmit={e => {
                  e.preventDefault()
                  if (newRoomName.trim()) createMutation.mutate(newRoomName.trim())
                }}
                className="mt-4 space-y-4"
              >
                <input
                  type="text"
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder="Room name"
                  autoFocus
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    >
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    type="submit"
                    disabled={!newRoomName.trim() || createMutation.isPending}
                    className="min-h-[44px] rounded-lg bg-fairy-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create Room'}
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </div>
      ) : rooms && rooms.length > 0 ? (
        <div className="space-y-3">
          {rooms
            .sort((a, b) => a.display_order - b.display_order)
            .map(room => (
              <Link
                key={room.name}
                to={`/rooms/${encodeURIComponent(room.name)}`}
                className="group flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-slate-100">
                    {room.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" />
                      {lightsPerRoom(room.name)} light
                      {lightsPerRoom(room.name) !== 1 ? 's' : ''}
                    </span>
                    {room.current_scene && (
                      <span className="flex items-center gap-1 text-fairy-400">
                        <Sparkles className="h-3 w-3" />
                        {room.current_scene}
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        room.auto
                          ? 'bg-fairy-500/15 text-fairy-400'
                          : 'bg-slate-800 text-slate-500',
                      )}
                    >
                      {room.auto ? 'Auto' : 'Manual'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400" />
              </Link>
            ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
          <DoorOpen className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">No rooms yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Tap "Add Room" above to create your first room.
          </p>
        </div>
      )}
    </div>
  )
}
