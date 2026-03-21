import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Power } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Room, Scene } from '@/lib/api'

// ── Room scene list ──────────────────────────────────────────────────────────

function WatchRoomView({
  room,
  scenes,
  currentMode,
  onBack,
}: {
  room: Room
  scenes: Scene[]
  currentMode: string
  onBack: () => void
}) {
  const queryClient = useQueryClient()

  const roomScenes = scenes.filter(s => {
    const rooms = Array.isArray(s.rooms) ? s.rooms : []
    const modes = Array.isArray(s.modes) ? s.modes : []
    return (
      rooms.some(r => r?.name === room.name) &&
      modes.some(m => (m ?? '').toLowerCase() === currentMode.toLowerCase())
    )
  })

  const activateMutation = useMutation({
    mutationFn: api.scenes.activate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: api.scenes.deactivate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
  })

  return (
    <div className="flex min-h-svh flex-col">
      <button
        onClick={onBack}
        className="mb-2 flex min-h-[44px] items-center gap-1 self-start rounded-lg px-2 py-2 text-sm text-slate-400 transition-colors active:text-slate-200"
        aria-label="Back to rooms"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <h2 className="mb-3 text-center text-lg font-bold text-slate-100">
        {room.name}
      </h2>

      {room.current_scene && (
        <div className="mb-3 text-center">
          <span className="rounded-full bg-fairy-500/20 px-3 py-1 text-sm font-medium text-fairy-400">
            {room.current_scene}
          </span>
          <button
            onClick={() => deactivateMutation.mutate(room.current_scene!)}
            disabled={deactivateMutation.isPending}
            className="mt-2 block w-full min-h-[44px] rounded-xl bg-slate-800 py-3 text-sm font-medium text-slate-300 transition-colors active:bg-slate-700"
          >
            Turn Off
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2">
        {roomScenes.slice(0, 3).map(scene => (
          <button
            key={scene.name}
            onClick={() => activateMutation.mutate(scene.name)}
            disabled={activateMutation.isPending}
            className={cn(
              'flex min-h-[52px] items-center justify-center rounded-xl px-4 py-3 text-base font-semibold transition-colors',
              'active:scale-[0.98]',
              room.current_scene === scene.name
                ? 'bg-fairy-500 text-white'
                : 'bg-slate-800 text-slate-100 active:bg-slate-700',
            )}
          >
            {scene.icon && <span className="mr-2 text-lg">{scene.icon}</span>}
            {scene.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main watch page ──────────────────────────────────────────────────────────

export default function WatchPage() {
  const queryClient = useQueryClient()
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
    refetchInterval: 10_000,
  })

  const { data: scenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: system } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  const allOffMutation = useMutation({
    mutationFn: () => api.system.setMode('Night'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
    },
  })

  const currentMode = system?.mode ?? 'Evening'
  const currentRoom = rooms?.find(r => r.name === selectedRoom)

  // Show room detail view
  if (selectedRoom && currentRoom) {
    return (
      <WatchRoomView
        room={currentRoom}
        scenes={scenes ?? []}
        currentMode={currentMode}
        onBack={() => setSelectedRoom(null)}
      />
    )
  }

  // Room list view
  return (
    <div className="flex min-h-svh flex-col">
      {/* Mode indicator */}
      <div className="mb-2 text-center">
        <span className="inline-flex rounded-full bg-fairy-500/20 px-3 py-1 text-xs font-medium text-fairy-400">
          {currentMode}
        </span>
      </div>

      {/* Room list */}
      <div className="flex flex-1 flex-col gap-2">
        {rooms
          ?.sort((a, b) => a.display_order - b.display_order)
          .map(room => (
            <button
              key={room.name}
              onClick={() => setSelectedRoom(room.name)}
              className={cn(
                'flex min-h-[52px] items-center justify-between rounded-xl px-4 py-3 text-left transition-colors',
                'active:scale-[0.98]',
                room.current_scene
                  ? 'bg-fairy-500/10 border border-fairy-500/30'
                  : 'bg-slate-800',
              )}
            >
              <span className="text-base font-semibold text-slate-100">
                {room.name}
              </span>
              {room.current_scene && (
                <span className="text-xs text-fairy-400">
                  {room.current_scene}
                </span>
              )}
            </button>
          ))}
      </div>

      {/* All off button */}
      <button
        onClick={() => allOffMutation.mutate()}
        disabled={allOffMutation.isPending}
        className="mt-3 flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-base font-bold text-white transition-colors active:bg-red-700"
      >
        <Power className="h-5 w-5" />
        All Off
      </button>
    </div>
  )
}
