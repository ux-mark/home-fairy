import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Moon, AlertTriangle, ChevronRight, Settings2, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState, useMemo, useCallback, Fragment } from 'react'
import { api } from '@/lib/api'
import { DEFAULT_MODES } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import type { Room } from '@/lib/api'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton, SkeletonGrid } from '@/components/ui/Skeleton'
import RoomReorderOverlay from '@/components/RoomReorderOverlay'
import HomeSectionEditor from '@/components/HomeSectionEditor'
import { DEFAULT_SECTION_ORDER, type SectionOrderItem } from '@/lib/homepage-sections'
import { ModeSelector } from '@/components/home/ModeSelector'
import { RoomCard } from '@/components/home/RoomCard'
import { WeatherCard } from '@/components/home/WeatherCard'
import { QuickActions } from '@/components/home/QuickActions'
import { MtaCard } from '@/components/home/MtaCard'
import { MusicQuickAction } from '@/components/home/MusicQuickAction'
import { HushingQuickAction } from '@/components/home/HushingQuickAction'
import DeviceOnboarding from '@/components/ui/DeviceOnboarding'

// ── Home page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [reorderOpen, setReorderOpen] = useState(false)
  const [sectionEditorOpen, setSectionEditorOpen] = useState(false)
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(new Set())

  const toggleChild = useCallback((name: string) => {
    setExpandedChildren(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const { data: rooms, isLoading: roomsLoading, isError: roomsError, refetch: refetchRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: scenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: system, isLoading: systemLoading } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  const { data: nightStatus } = useQuery({
    queryKey: ['system', 'night-status'],
    queryFn: api.system.getNightStatus,
    refetchInterval: 10_000,
  })

  const { data: defaultScenes } = useQuery({
    queryKey: ['room-default-scenes'],
    queryFn: api.roomDefaultScenes.getAll,
  })

  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: api.dashboard.getSummary,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  // Parse the stored section order, filling in any sections added after the pref was saved
  const sectionOrder = useMemo<SectionOrderItem[]>(() => {
    const raw = prefs?.homepage_section_order
    if (!raw) return DEFAULT_SECTION_ORDER
    try {
      const parsed = JSON.parse(raw) as SectionOrderItem[]
      const knownIds = DEFAULT_SECTION_ORDER.map(s => s.id)
      const result = parsed.filter(s => knownIds.includes(s.id))
      for (const def of DEFAULT_SECTION_ORDER) {
        if (!result.find(s => s.id === def.id)) result.push({ ...def })
      }
      return result
    } catch {
      return DEFAULT_SECTION_ORDER
    }
  }, [prefs?.homepage_section_order])

  const unlockMutation = useMutation({
    mutationFn: api.system.unlockNight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'night-status'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast({ message: 'All rooms unlocked' })
    },
    onError: () => toast({ message: 'Failed to unlock rooms', type: 'error' }),
  })

  const setModeMutation = useMutation({
    mutationFn: api.system.setMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system'] })
      toast({ message: 'Mode updated' })
    },
    onError: () => toast({ message: 'Failed to update mode', type: 'error' }),
  })

  const activateSceneMutation = useMutation({
    mutationFn: api.scenes.activate,
    onMutate: async (sceneName) => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      const scene = scenes?.find(s => s.name === sceneName)
      const sceneRoomNames = scene?.rooms?.map(r => r.name) ?? []
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(room =>
          sceneRoomNames.includes(room.name)
            ? { ...room, current_scene: sceneName }
            : room
        )
      )
      return { previous }
    },
    onSuccess: () => {
      // The server emits `scene:change` after the scene runs, which the
      // socket handler turns into the same ['rooms'] + ['scenes'] invalidation.
      // Doing it here too triggers up to three back-to-back refetches of the
      // rooms list. Trust the socket.
      toast({ message: 'Scene activated' })
    },
    onError: (_err, _name, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to activate scene', type: 'error' })
    },
  })

  const deactivateSceneMutation = useMutation({
    mutationFn: api.scenes.deactivate,
    onMutate: async (sceneName) => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      const scene = scenes?.find(s => s.name === sceneName)
      const sceneRoomNames = scene?.rooms?.map(r => r.name) ?? []
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(room =>
          sceneRoomNames.includes(room.name) && room.current_scene === sceneName
            ? { ...room, current_scene: null }
            : room
        )
      )
      return { previous }
    },
    onSuccess: () => {
      // Socket-driven invalidation handles ['rooms'] / ['scenes'] — see comment
      // on activateSceneMutation.onSuccess above.
      toast({ message: 'Scene deactivated' })
    },
    onError: (_err, _name, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to deactivate scene', type: 'error' })
    },
  })

  const toggleAutoMutation = useMutation({
    mutationFn: ({ name, auto }: { name: string; auto: boolean }) =>
      api.rooms.update(name, { auto }),
    onMutate: async ({ name, auto }) => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(room => room.name === name ? { ...room, auto } : room)
      )
      return { previous }
    },
    onSuccess: (_data, { auto }) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast({ message: auto ? 'Automation enabled' : 'Automation disabled' })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to update room', type: 'error' })
    },
  })

  const currentMode = system?.mode ?? 'Evening'
  const allModes = system?.all_modes ?? [...DEFAULT_MODES]
  const modeIcons = system?.mode_icons ?? {}

  // Stable callbacks so React.memo on RoomCard can actually skip re-renders
  // when only unrelated state (sonos poll, foreign socket events) changes.
  const handleToggleScene = useCallback(
    (name: string, isActive: boolean) => {
      if (isActive) deactivateSceneMutation.mutate(name)
      else activateSceneMutation.mutate(name)
    },
    [activateSceneMutation, deactivateSceneMutation],
  )
  const handleToggleAuto = useCallback(
    (roomName: string, currentAuto: boolean) => {
      toggleAutoMutation.mutate({ name: roomName, auto: !currentAuto })
    },
    [toggleAutoMutation],
  )

  // Render a single section by ID
  function renderSection(id: string): React.ReactNode {
    switch (id) {
      case 'mta':
        return <MtaCard key="mta" />
      case 'quick-actions':
        return <QuickActions key="quick-actions" />
      case 'music':
        return <MusicQuickAction key="music" />
      case 'hushing-home':
        return <HushingQuickAction key="hushing-home" />
      case 'weather':
        return <WeatherCard key="weather" />
      case 'mode-selector':
        return systemLoading ? (
          <div key="mode-selector" className="mb-6 flex gap-2 overflow-hidden" role="status" aria-label="Loading mode selector">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-full" />
            ))}
          </div>
        ) : (
          <ModeSelector
            key="mode-selector"
            currentMode={currentMode}
            modes={allModes}
            modeIcons={modeIcons}
            onSelect={mode => setModeMutation.mutate(mode)}
            isPending={setModeMutation.isPending}
          />
        )
      case 'rooms':
        return (
          <section key="rooms" aria-label="Rooms">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-heading text-sm font-semibold">Rooms</h2>
              {rooms && (
                <div className="flex items-center gap-2">
                  <span className="text-caption text-xs">
                    {rooms.filter(r => !r.parent_room || r.promoted).length} room{rooms.filter(r => !r.parent_room || r.promoted).length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setReorderOpen(true)}
                    className="flex items-center gap-1 text-xs text-fairy-400 hover:text-fairy-300 transition-colors min-h-[44px] min-w-[44px] justify-center"
                    aria-label="Reorder rooms"
                  >
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                </div>
              )}
            </div>

            {roomsLoading ? (
              <div role="status" aria-label="Loading rooms">
                <SkeletonGrid count={6} />
              </div>
            ) : roomsError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
                <p className="text-zinc-400">Unable to load home data. Check your connection and try again.</p>
                <button
                  onClick={() => refetchRooms()}
                  className="rounded-lg bg-fairy-600 px-4 py-2 min-h-[44px] text-sm font-medium text-white hover:bg-fairy-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  Try again
                </button>
              </div>
            ) : rooms && rooms.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rooms
                  .filter(room => !room.parent_room || room.promoted)
                  .sort((a, b) => a.display_order - b.display_order)
                  .map(room => (
                    <RoomCard
                      key={room.name}
                      room={room}
                      allRooms={rooms}
                      scenes={scenes ?? []}
                      currentMode={currentMode}
                      defaultScenes={defaultScenes}
                      onToggleScene={handleToggleScene}
                      onToggleAuto={handleToggleAuto}
                      isLocked={nightStatus?.lockedRooms.includes(room.name)}
                      expandedChildren={expandedChildren}
                      onToggleChild={toggleChild}
                    />
                  ))}
              </div>
            ) : (
              <EmptyState
                icon={Zap}
                message="No rooms set up yet."
                sub="Head to the Rooms tab to get started."
              />
            )}
          </section>
        )
      default:
        return null
    }
  }

  const hasAttention = dashboardData?.insights?.attention?.some(a => a.severity === 'critical') ?? false
  const criticalCount = dashboardData?.insights?.attention?.filter(a => a.severity === 'critical').length ?? 0

  return (
    <div>
      {/* Device onboarding always renders first */}
      <DeviceOnboarding />

      {/* Sections rendered in user-defined order */}
      {sectionOrder
        .filter(s => s.visible || s.id === 'rooms')
        .map(section => {
          const elements: React.ReactNode[] = []

          // System alerts always inject before the rooms section
          if (section.id === 'rooms') {
            if (nightStatus?.active) {
              elements.push(
                <div key="night-alert" className="card mb-6 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Moon className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-heading text-sm font-medium">Night mode active</p>
                      <p className="text-caption text-xs">
                        {nightStatus.lockedRooms.length} room{nightStatus.lockedRooms.length !== 1 ? 's' : ''} locked until {nightStatus.wakeMode}
                      </p>
                    </div>
                    <button
                      onClick={() => unlockMutation.mutate()}
                      disabled={unlockMutation.isPending}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
                    >
                      Unlock
                    </button>
                  </div>
                </div>
              )
            }
            if (hasAttention) {
              elements.push(
                <Link
                  key="attention-alert"
                  to="/dashboard"
                  className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 transition-colors hover:bg-red-500/10 min-h-[44px]"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                  <span className="text-sm text-red-400">
                    {criticalCount} item{criticalCount !== 1 ? 's' : ''} need{criticalCount === 1 ? 's' : ''} attention
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-red-400 opacity-50" aria-hidden="true" />
                </Link>
              )
            }
          }

          elements.push(renderSection(section.id))
          return <Fragment key={section.id}>{elements}</Fragment>
        })}

      {/* Customise button */}
      <div className="mt-8 mb-2 flex justify-center">
        <button
          onClick={() => setSectionEditorOpen(true)}
          className="flex items-center gap-1.5 text-xs text-caption hover:text-body transition-colors min-h-[44px]"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Customise home screen
        </button>
      </div>

      <RoomReorderOverlay
        rooms={rooms ?? []}
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
      />

      <HomeSectionEditor
        open={sectionEditorOpen}
        onClose={() => setSectionEditorOpen(false)}
      />
    </div>
  )
}
