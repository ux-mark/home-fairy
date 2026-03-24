import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Search,
  CalendarDays,
  Star,
  Clock,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Scene } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import {
  isSceneInSeason,
  getDefaultScene,
  isStaleScene,
  sortScenesByPriority,
  getModesForRoom,
  formatRelativeTime,
} from '@/lib/scene-utils'

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
      <div className="surface flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-lg">
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

function SceneRow({ scene, isActive, isDefault, showRoomBadges }: SceneRowProps) {
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
            <span className="flex items-center gap-0.5 text-xs font-medium text-amber-400">
              <Star className="h-3 w-3" fill="currentColor" aria-hidden="true" />
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
  isOpen: boolean
  onToggle: () => void
}

function RoomAccordion({
  roomName,
  allScenes,
  filteredScenes,
  activeSceneNames,
  isOpen,
  onToggle,
}: RoomAccordionProps) {
  const [activeMode, setActiveMode] = useState<string>('All')

  // All modes that have scenes in this room (from full data, not filtered)
  const allModes = useMemo(
    () => getModesForRoom(allScenes, roomName),
    [allScenes, roomName],
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
    return sortScenesByPriority(byMode, roomName)
  }, [filteredScenes, roomName, activeMode])

  const hasActiveScene = displayScenes.some(s => activeSceneNames.has(s.name))

  const headingId = `room-heading-${roomName.replace(/\s+/g, '-').toLowerCase()}`
  const panelId = `room-panel-${roomName.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="card rounded-xl border">
      <button
        id={headingId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          'flex w-full min-h-[44px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded-xl',
          'hover:bg-white/5',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-heading text-sm font-semibold">{roomName}</span>
          <span className="surface text-caption rounded-full px-2 py-0.5 text-[10px] font-medium">
            {filteredScenes.filter(s =>
              (Array.isArray(s.rooms) ? s.rooms : []).some(r => r?.name === roomName),
            ).length}
          </span>
          {hasActiveScene && (
            <span
              className="inline-block h-2 w-2 rounded-full bg-emerald-400"
              aria-label="Scene active in this room"
            />
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-[var(--text-secondary)] transition-transform duration-300 flex-shrink-0',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        className="grid transition-all duration-300"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-2 pb-2">
            {/* Mode pills */}
            {allModes.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1"
                role="group"
                aria-label="Filter by mode"
              >
                <button
                  aria-pressed={activeMode === 'All'}
                  onClick={() => setActiveMode('All')}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    activeMode === 'All'
                      ? 'bg-fairy-500 text-white'
                      : 'surface text-body hover:text-heading',
                  )}
                >
                  All
                </button>
                {allModes.map(mode => (
                  <button
                    key={mode}
                    aria-pressed={activeMode === mode}
                    onClick={() => setActiveMode(mode)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      activeMode === mode
                        ? 'bg-fairy-500 text-white'
                        : 'surface text-body hover:text-heading',
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}

            {/* Scene rows */}
            {displayScenes.length > 0 ? (
              displayScenes.map(scene => {
                const defaultScene =
                  activeMode !== 'All'
                    ? getDefaultScene(allScenes, roomName, activeMode)
                    : null
                const isDefault = defaultScene?.name === scene.name
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
              <p className="text-caption px-3 py-4 text-sm">
                No scenes match the selected filter.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
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
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, message, sub }: {
  icon: React.ElementType
  message: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-dashed py-12 text-center" style={{ borderColor: 'var(--border-secondary)' }}>
      <Icon className="text-caption mx-auto mb-3 h-8 w-8" aria-hidden="true" />
      <p className="text-body text-sm">{message}</p>
      {sub && <p className="text-caption mt-1 text-xs">{sub}</p>}
    </div>
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

  const { data: scenes, isLoading } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
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
        <h2 className="text-heading text-base font-semibold">Scenes</h2>
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
      <div className="relative mb-4">
        <Search
          className="text-caption absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search by name, tag, room, or mode..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search scenes"
          className="input-field h-11 w-full rounded-lg border pl-10 pr-3 text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="text-caption absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            ×
          </button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonAccordion key={i} />
          ))}
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
                      isOpen={computedOpenRooms.has(roomName)}
                      onToggle={() => toggleRoom(roomName)}
                    />
                  )
                })}

                {/* Orphan scenes */}
                {orphanScenes.length > 0 && (
                  <div className="card rounded-xl border">
                    <div className="border-b border-[var(--border-secondary)] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-heading text-sm font-semibold">
                          Not assigned to a room
                        </span>
                        <span className="surface text-caption rounded-full px-2 py-0.5 text-[10px] font-medium">
                          {orphanScenes.length}
                        </span>
                      </div>
                    </div>
                    <div className="px-2 py-2">
                      {orphanScenes.map(scene => (
                        <SceneRow
                          key={scene.name}
                          scene={scene}
                          isActive={activeSceneNames.has(scene.name)}
                          isDefault={false}
                        />
                      ))}
                    </div>
                  </div>
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
                <div className="px-2 py-2">
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
                <div className="px-2 py-2">
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
                <div className="px-2 py-2">
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
