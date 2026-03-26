import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Plus,
  ChevronRight,
  Sparkles,
  Search,
  CalendarDays,
  Activity,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Scene } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import {
  isSceneInSeason,
  getDefaultScene,
  isStaleScene,
  getModesForRoom,
  formatRelativeTime,
} from '@/lib/scene-utils'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Accordion } from '@/components/ui/Accordion'
import { FilterChip } from '@/components/ui/FilterChip'

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonAccordion() {
  return (
    <div className="card rounded-xl border">
      <div className="flex animate-pulse items-center gap-3 px-4 py-3">
        <div className="surface h-5 w-32 rounded" />
        <div className="surface ml-auto h-4 w-4 rounded" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SceneIcon helper
// ---------------------------------------------------------------------------

function SceneIcon({ icon }: { icon: string }) {
  if (icon && icon.trim()) {
    return (
      <div className="surface flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-lg" aria-hidden="true">
        {icon}
      </div>
    )
  }
  return (
    <div className="surface flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg">
      <Sparkles className="text-caption h-4 w-4" aria-hidden="true" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scene row (compact)
// ---------------------------------------------------------------------------

interface SceneRowProps {
  scene: Scene
  isActive: boolean
  isDefault: boolean
  showRoomBadges?: boolean
}

function SceneRow({ scene, isDefault, isActive, showRoomBadges }: SceneRowProps) {
  const season = isSceneInSeason(scene)
  const roomList = Array.isArray(scene.rooms) ? scene.rooms : []

  return (
    <Link
      to={`/scenes/${encodeURIComponent(scene.name)}`}
      className={cn(
        'group flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        'hover:bg-white/5',
        season.hasSeason && !season.inSeason && 'opacity-50',
      )}
    >
      <SceneIcon icon={scene.icon} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-heading text-sm font-medium">{scene.name}</span>
          {isDefault && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-fairy-400">
              <Activity className="h-3 w-3" aria-hidden="true" />
              Default
            </span>
          )}
          {isActive && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-400">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              Active
            </span>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {showRoomBadges && roomList.filter(r => r?.name).map(r => (
            <span
              key={r.name}
              className="surface text-caption rounded-full px-2 py-0.5 text-[10px] font-medium"
            >
              {r.name}
            </span>
          ))}
          {season.hasSeason && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-[10px] font-medium',
                season.inSeason ? 'text-green-500' : 'text-caption',
              )}
            >
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              {season.label}
            </span>
          )}
        </div>
      </div>

      <ChevronRight
        className="text-caption h-4 w-4 flex-shrink-0 transition-colors group-hover:text-[var(--text-secondary)]"
        aria-hidden="true"
      />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Room accordion
// ---------------------------------------------------------------------------

interface RoomAccordionProps {
  roomName: string
  allScenes: Scene[]
  filteredScenes: Scene[]
  activeSceneNames: Set<string>
  defaultScenes: Record<string, Record<string, string>> | undefined
  systemModes: string[] | undefined
  isOpen: boolean
  onToggle: () => void
}

function RoomAccordion({
  roomName,
  allScenes,
  filteredScenes,
  activeSceneNames,
  defaultScenes,
  systemModes,
  isOpen,
  onToggle,
}: RoomAccordionProps) {
  const [activeMode, setActiveMode] = useState<string>('All')

  // All modes that have scenes in this room (from full data, not filtered)
  // Ordered by display_order from the backend when systemModes is available
  const allModes = useMemo(
    () => getModesForRoom(allScenes, roomName, systemModes),
    [allScenes, roomName, systemModes],
  )

  // Scenes to display: filtered by search, then by mode pill
  const displayScenes = useMemo(() => {
    const inRoom = filteredScenes.filter(s =>
      (Array.isArray(s.rooms) ? s.rooms : []).some(r => r?.name === roomName),
    )
    const byMode =
      activeMode === 'All'
        ? inRoom
        : inRoom.filter(s =>
            (Array.isArray(s.modes) ? s.modes : []).some(
              m => (m ?? '').toLowerCase() === activeMode.toLowerCase(),
            ),
          )
    return [...byMode].sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredScenes, roomName, activeMode])

  const hasActiveScene = displayScenes.some(s => activeSceneNames.has(s.name))

  const sceneCount = filteredScenes.filter(s =>
    (Array.isArray(s.rooms) ? s.rooms : []).some(r => r?.name === roomName),
  ).length

  const accordionId = `room-${roomName.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <Accordion
      id={accordionId}
      title={roomName}
      open={isOpen}
      onToggle={onToggle}
      count={sceneCount}
      trailing={
        hasActiveScene ? (
          <span
            className="inline-block h-2 w-2 rounded-full bg-emerald-400"
            aria-label="Scene active in this room"
          />
        ) : undefined
      }
    >
      {/* Mode pills */}
      {allModes.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 mb-2"
          role="group"
          aria-label="Filter by mode"
        >
          <FilterChip
            label="All"
            active={activeMode === 'All'}
            onClick={() => setActiveMode('All')}
          />
          {allModes.map(mode => (
            <FilterChip
              key={mode}
              label={mode}
              active={activeMode === mode}
              onClick={() => setActiveMode(mode)}
            />
          ))}
        </div>
      )}

      {/* Scene rows */}
      {displayScenes.length > 0 ? (
        displayScenes.map(scene => {
          const defaultSceneName =
            activeMode !== 'All'
              ? getDefaultScene(defaultScenes, roomName, activeMode)
              : null
          const isDefault = defaultSceneName === scene.name
          return (
            <SceneRow
              key={scene.name}
              scene={scene}
              isActive={activeSceneNames.has(scene.name)}
              isDefault={isDefault}
            />
          )
        })
      ) : (
        <p className="text-caption py-4 text-sm">
          No scenes match the selected filter.
        </p>
      )}
    </Accordion>
  )
}

// ---------------------------------------------------------------------------
// Flat scene list row (for Active / Recent / Stale views)
// ---------------------------------------------------------------------------

interface FlatSceneRowProps {
  scene: Scene
  isActive: boolean
  label?: React.ReactNode
}

function FlatSceneRow({ scene, isActive, label }: FlatSceneRowProps) {
  const season = isSceneInSeason(scene)
  const roomList = Array.isArray(scene.rooms) ? scene.rooms : []

  return (
    <Link
      to={`/scenes/${encodeURIComponent(scene.name)}`}
      className={cn(
        'group flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        'hover:bg-white/5',
        season.hasSeason && !season.inSeason && 'opacity-50',
      )}
    >
      <SceneIcon icon={scene.icon} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-heading text-sm font-medium">{scene.name}</span>
          {isActive && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-400">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              Active
            </span>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {roomList.filter(r => r?.name).map(r => (
            <span
              key={r.name}
              className="surface text-caption rounded-full px-2 py-0.5 text-[10px] font-medium"
            >
              {r.name}
            </span>
          ))}
          {label && <span className="text-caption text-[10px]">{label}</span>}
        </div>
      </div>

      <ChevronRight
        className="text-caption h-4 w-4 flex-shrink-0 transition-colors group-hover:text-[var(--text-secondary)]"
        aria-hidden="true"
      />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScenesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('by-room')
  const [openRooms, setOpenRooms] = useState<Set<string>>(new Set())
  const [orphanAccordionOpen, setOrphanAccordionOpen] = useState(true)

  const { data: scenes, isLoading, isError, refetch } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: defaultScenes } = useQuery({
    queryKey: ['room-default-scenes'],
    queryFn: api.roomDefaultScenes.getAll,
  })

  const { data: systemCurrent } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  // Active scene names from room data
  const activeSceneNames = useMemo(
    () => new Set(rooms?.filter(r => r.current_scene).map(r => r.current_scene!) ?? []),
    [rooms],
  )

  // Search filter: applies across all tabs
  const filteredScenes = useMemo(() => {
    if (!scenes) return []
    if (!search.trim()) return scenes
    const q = search.toLowerCase()
    return scenes.filter(s => {
      try {
        const tags = Array.isArray(s.tags) ? s.tags : []
        const sceneRooms = Array.isArray(s.rooms) ? s.rooms : []
        const modes = Array.isArray(s.modes) ? s.modes : []
        return (
          (s.name ?? '').toLowerCase().includes(q) ||
          tags.some(t => (t ?? '').toLowerCase().includes(q)) ||
          sceneRooms.some(r => (r?.name ?? '').toLowerCase().includes(q)) ||
          modes.some(m => (m ?? '').toLowerCase().includes(q))
        )
      } catch {
        return false
      }
    })
  }, [scenes, search])

  // ---- By room data -------------------------------------------------------

  // Unique room names across all scenes, sorted alphabetically
  const allRoomNames = useMemo(() => {
    if (!scenes) return []
    const nameSet = new Set<string>()
    for (const s of scenes) {
      for (const r of Array.isArray(s.rooms) ? s.rooms : []) {
        if (r?.name) nameSet.add(r.name)
      }
    }
    return Array.from(nameSet).sort()
  }, [scenes])

  // When search is active, auto-expand rooms that have matching scenes
  const computedOpenRooms = useMemo(() => {
    if (!search.trim()) return openRooms
    const expanded = new Set(openRooms)
    for (const roomName of allRoomNames) {
      const hasMatch = filteredScenes.some(s =>
        (Array.isArray(s.rooms) ? s.rooms : []).some(r => r?.name === roomName),
      )
      if (hasMatch) expanded.add(roomName)
    }
    return expanded
  }, [search, openRooms, allRoomNames, filteredScenes])

  function toggleRoom(roomName: string) {
    setOpenRooms(prev => {
      const next = new Set(prev)
      if (next.has(roomName)) next.delete(roomName)
      else next.add(roomName)
      return next
    })
  }

  // Orphan scenes: no rooms assigned
  const orphanScenes = useMemo(
    () =>
      filteredScenes.filter(s => {
        const r = Array.isArray(s.rooms) ? s.rooms : []
        return r.length === 0
      }),
    [filteredScenes],
  )

  // ---- Active tab ---------------------------------------------------------

  const activeScenes = useMemo(() => {
    if (!scenes) return []
    return scenes.filter(s => activeSceneNames.has(s.name))
  }, [scenes, activeSceneNames])

  // ---- Recent tab ---------------------------------------------------------

  const recentScenes = useMemo(() => {
    if (!filteredScenes) return []
    return [...filteredScenes].sort((a, b) => {
      if (!a.last_activated_at && !b.last_activated_at) return a.name.localeCompare(b.name)
      if (!a.last_activated_at) return 1
      if (!b.last_activated_at) return -1
      return new Date(b.last_activated_at).getTime() - new Date(a.last_activated_at).getTime()
    })
  }, [filteredScenes])

  // ---- Stale tab ----------------------------------------------------------

  const staleScenes = useMemo(
    () => filteredScenes.filter(s => isStaleScene(s)),
    [filteredScenes],
  )

  // ---- Mutation -----------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: () =>
      api.scenes.create({
        name: `New Scene ${(scenes?.length ?? 0) + 1}`,
        icon: '',
        rooms: [],
        modes: [],
        commands: [],
        tags: [],
      }),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      navigate(`/scenes/${encodeURIComponent(data.name)}`)
    },
    onError: () => toast({ message: 'Failed to create scene', type: 'error' }),
  })

  // ---- Tab counts ---------------------------------------------------------

  const activeCount = activeScenes.length
  const staleCount = staleScenes.length

  // ---- Render -------------------------------------------------------------

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading text-sm font-semibold">Scenes</h2>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-fairy-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Scene
        </button>
      </div>

      {/* Search — always visible */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by name, tag, room, or mode..."
        label="Search scenes"
        className="mb-4"
      />

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonAccordion key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
          <p className="text-zinc-400">Unable to load scenes. Check your connection and try again.</p>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-fairy-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairy-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Try again
          </button>
        </div>
      ) : !scenes || scenes.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          message="No scenes created yet."
          sub='Tap "Create Scene" to build your first lighting scene.'
        />
      ) : (
        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          {/* Tab list */}
          <Tabs.List className="mb-4 flex gap-1 overflow-x-auto rounded-xl card p-1">
            <Tabs.Trigger
              value="by-room"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
              )}
            >
              By room
            </Tabs.Trigger>

            <Tabs.Trigger
              value="active"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
              )}
            >
              Active
              {activeCount > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                    activeTab === 'active'
                      ? 'bg-white/20'
                      : 'bg-fairy-500/15 text-fairy-400',
                  )}
                >
                  {activeCount}
                </span>
              )}
              {activeCount > 0 && (
                <span className="sr-only">({activeCount})</span>
              )}
            </Tabs.Trigger>

            <Tabs.Trigger
              value="recent"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
              )}
            >
              Recent
            </Tabs.Trigger>

            <Tabs.Trigger
              value="stale"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-body data-[state=inactive]:hover:text-heading',
              )}
            >
              Stale
              {staleCount > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                    activeTab === 'stale'
                      ? 'bg-white/20'
                      : 'bg-fairy-500/15 text-fairy-400',
                  )}
                >
                  {staleCount}
                </span>
              )}
              {staleCount > 0 && (
                <span className="sr-only">({staleCount})</span>
              )}
            </Tabs.Trigger>
          </Tabs.List>

          {/* ---- By room view ---- */}
          <Tabs.Content value="by-room" className="space-y-3">
            {search.trim() && filteredScenes.length === 0 ? (
              <EmptyState
                icon={Search}
                message={`No scenes match "${search}".`}
                sub="Try a different search term or clear the filter."
              />
            ) : (
              <>
                {allRoomNames.map(roomName => {
                  // Skip rooms that have no scenes in the filtered set (when searching)
                  const hasFilteredScenes = filteredScenes.some(s =>
                    (Array.isArray(s.rooms) ? s.rooms : []).some(r => r?.name === roomName),
                  )
                  if (search.trim() && !hasFilteredScenes) return null

                  return (
                    <RoomAccordion
                      key={roomName}
                      roomName={roomName}
                      allScenes={scenes}
                      filteredScenes={filteredScenes}
                      activeSceneNames={activeSceneNames}
                      defaultScenes={defaultScenes}
                      systemModes={systemCurrent?.all_modes}
                      isOpen={computedOpenRooms.has(roomName)}
                      onToggle={() => toggleRoom(roomName)}
                    />
                  )
                })}

                {/* Orphan scenes */}
                {orphanScenes.length > 0 && (
                  <Accordion
                    id="orphan-scenes"
                    title="Not assigned to a room"
                    open={orphanAccordionOpen}
                    onToggle={() => setOrphanAccordionOpen(prev => !prev)}
                    count={orphanScenes.length}
                  >
                    {orphanScenes.map(scene => (
                      <SceneRow
                        key={scene.name}
                        scene={scene}
                        isActive={activeSceneNames.has(scene.name)}
                        isDefault={false}
                      />
                    ))}
                  </Accordion>
                )}
              </>
            )}
          </Tabs.Content>

          {/* ---- Active view ---- */}
          <Tabs.Content value="active">
            {activeScenes.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                message="No scenes are currently active."
              />
            ) : (
              <div className="card rounded-xl border">
                <div className="px-4 py-2">
                  {activeScenes.map(scene => {
                    const activeInRooms = rooms
                      ?.filter(r => r.current_scene === scene.name)
                      .map(r => r.name) ?? []
                    return (
                      <FlatSceneRow
                        key={scene.name}
                        scene={scene}
                        isActive
                        label={
                          activeInRooms.length > 0
                            ? (
                                <span className="flex flex-wrap gap-1">
                                  {activeInRooms.map(rn => (
                                    <span
                                      key={rn}
                                      className="surface text-caption rounded-full px-2 py-0.5 text-[10px] font-medium"
                                    >
                                      {rn}
                                    </span>
                                  ))}
                                </span>
                              )
                            : null
                        }
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </Tabs.Content>

          {/* ---- Recent view ---- */}
          <Tabs.Content value="recent">
            {recentScenes.length === 0 ? (
              <EmptyState
                icon={Clock}
                message="No scene activation history yet."
                sub="Scenes will appear here after they are activated."
              />
            ) : (
              <div className="card rounded-xl border">
                <div className="px-4 py-2">
                  {recentScenes.map(scene => (
                    <FlatSceneRow
                      key={scene.name}
                      scene={scene}
                      isActive={activeSceneNames.has(scene.name)}
                      label={
                        scene.last_activated_at
                          ? formatRelativeTime(scene.last_activated_at)
                          : 'Never activated'
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </Tabs.Content>

          {/* ---- Stale view ---- */}
          <Tabs.Content value="stale">
            {staleScenes.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                message="No stale scenes found."
                sub="All your scenes are in active use."
              />
            ) : (
              <div className="card rounded-xl border">
                <div className="px-4 py-2">
                  {staleScenes.map(scene => (
                    <FlatSceneRow
                      key={scene.name}
                      scene={scene}
                      isActive={activeSceneNames.has(scene.name)}
                      label={
                        scene.last_activated_at
                          ? formatRelativeTime(scene.last_activated_at)
                          : 'Never activated'
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </Tabs.Content>
        </Tabs.Root>
      )}
    </div>
  )
}
