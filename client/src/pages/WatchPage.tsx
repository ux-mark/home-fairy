import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Power, Moon, AlertTriangle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Room, Scene } from '@/lib/api'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { Skeleton } from '@/components/ui/Skeleton'

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
        className="mb-2 flex min-h-[44px] items-center gap-1 self-start rounded-lg px-2 py-2 text-sm text-body transition-colors active:text-heading"
        aria-label="Back to rooms"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <h2 className="mb-3 flex items-center justify-center gap-2 text-center text-lg font-bold text-heading">
        <LucideIcon name={room.icon} className="h-5 w-5 text-fairy-400" aria-hidden="true" />
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
            className="mt-2 block w-full min-h-[44px] rounded-xl surface py-3 text-sm font-medium text-heading transition-colors active:brightness-90 dark:active:brightness-110"
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
                : 'surface text-heading active:brightness-90 dark:active:brightness-110',
            )}
          >
            {scene.icon && <span className="mr-2 text-lg" aria-hidden="true">{scene.icon}</span>}
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

  const { data: rooms, isLoading, isError, refetch } = useQuery({
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
    mutationFn: () => api.system.allOff(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
      queryClient.invalidateQueries({ queryKey: ['lifx'] })
    },
  })

  const nighttimeMutation = useMutation({
    mutationFn: () => api.system.nighttime(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
      queryClient.invalidateQueries({ queryKey: ['lifx'] })
    },
  })

  const currentMode = system?.mode ?? 'Evening'
  const currentRoom = rooms?.find(r => r.name === selectedRoom)

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16" role="status" aria-label="Loading">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
        <p className="text-zinc-400">Unable to load data. Check your connection and try again.</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-fairy-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairy-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          Try again
        </button>
      </div>
    )
  }

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
                  : 'surface',
              )}
            >
              <span className="flex items-center gap-2 text-base font-semibold text-heading">
                <LucideIcon name={room.icon} className="h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
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

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => nighttimeMutation.mutate()}
          disabled={nighttimeMutation.isPending || allOffMutation.isPending}
          className="flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-base font-bold text-white transition-colors active:bg-indigo-700 disabled:opacity-50"
        >
          {nighttimeMutation.isPending
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Moon className="h-5 w-5" />}
          {nighttimeMutation.isPending ? 'Activating...' : 'Nighttime'}
        </button>
        <button
          onClick={() => allOffMutation.mutate()}
          disabled={allOffMutation.isPending || nighttimeMutation.isPending}
          className="flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-base font-bold text-white transition-colors active:bg-red-700 disabled:opacity-50"
        >
          {allOffMutation.isPending
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Power className="h-5 w-5" />}
          {allOffMutation.isPending ? 'Turning off...' : 'All Off'}
        </button>
      </div>
    </div>
  )
}
