import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus,
  Sparkles,
  DoorOpen,
  AlertTriangle,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { EmptyState } from '@/components/ui/EmptyState'

function RoomCardSkeleton() {
  return (
    <div className="card rounded-xl border p-4">
      <div className="animate-pulse space-y-2">
        <div className="surface h-5 w-32 rounded" />
        <div className="surface h-4 w-24 rounded" />
      </div>
    </div>
  )
}

export default function RoomsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')

  const { data: rooms, isLoading, isError, refetch } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: assignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
  })

  const { data: deviceAssignments } = useQuery({
    queryKey: ['hubitat', 'device-rooms'],
    queryFn: api.hubitat.getDeviceRooms,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api.rooms.create({ name, display_order: (rooms?.length ?? 0) + 1, auto: false, timer: 0, tags: [] }),
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

  const sensorDeviceTypes = ['motion', 'sensor', 'contact', 'temperature']

  const devicesPerRoom = (name: string) =>
    deviceAssignments?.filter(a => a.room_name === name && !sensorDeviceTypes.includes(a.device_type)).length ?? 0

  const sensorsPerRoom = (name: string) =>
    rooms?.find(r => r.name === name)?.sensors?.length ?? 0

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading text-sm font-semibold">All Rooms</h2>
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Trigger asChild>
            <button className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-fairy-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
              <Plus className="h-4 w-4" />
              Add Room
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <Dialog.Content className="card fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-xl">
              <Dialog.Title className="text-heading text-lg font-semibold">
                New Room
              </Dialog.Title>
              <Dialog.Description className="text-body mt-1 text-sm">
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
                  className="input-field h-11 w-full rounded-lg border px-3 text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                />
                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="text-body min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
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
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
          <p className="text-zinc-400">Unable to load rooms. Check your connection and try again.</p>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-fairy-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairy-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Try again
          </button>
        </div>
      ) : rooms && rooms.length > 0 ? (
        <div className="space-y-3">
          {rooms
            .sort((a, b) => a.display_order - b.display_order)
            .map(room => (
              <Link
                key={room.name}
                to={`/rooms/${encodeURIComponent(room.name)}`}
                className="card flex items-center gap-4 rounded-xl border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-heading text-base font-semibold">
                    {room.name}
                  </h3>
                  <div className="text-body mt-1 flex flex-wrap items-center gap-3 text-xs">
                    <span>{lightsPerRoom(room.name)} {lightsPerRoom(room.name) === 1 ? 'light' : 'lights'}</span>
                    <span>{devicesPerRoom(room.name)} {devicesPerRoom(room.name) === 1 ? 'device' : 'devices'}</span>
                    <span>{sensorsPerRoom(room.name)} {sensorsPerRoom(room.name) === 1 ? 'sensor' : 'sensors'}</span>
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
                          : 'surface text-caption',
                      )}
                    >
                      {room.auto ? 'Auto' : 'Manual'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
        </div>
      ) : (
        <EmptyState
          icon={DoorOpen}
          message="No rooms yet."
          sub='Tap "Add Room" above to create your first room.'
        />
      )}
    </div>
  )
}
