import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Thermometer, Zap, Cloud, Droplets, Wind, Power, Moon, Users, Train, Lock, AlertTriangle, ChevronRight, ArrowUp, ArrowDown, Activity, Loader2, Volume2, VolumeX, Footprints, Settings2, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo, Fragment } from 'react'
import { api } from '@/lib/api'
import { cn, formatTimeAgo, DEFAULT_MODES } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import type { Room, Scene } from '@/lib/api'
import { getDefaultScene, isSceneInSeason } from '@/lib/scene-utils'
import DeviceOnboarding from '@/components/ui/DeviceOnboarding'
import { EmptyState } from '@/components/ui/EmptyState'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { Accordion } from '@/components/ui/Accordion'
import { Skeleton, SkeletonGrid } from '@/components/ui/Skeleton'
import RoomReorderOverlay from '@/components/RoomReorderOverlay'
import HomeSectionEditor from '@/components/HomeSectionEditor'
import { DEFAULT_SECTION_ORDER, type SectionOrderItem } from '@/lib/homepage-sections'

// ── Visual state helpers ──────────────────────────────────────────────────────

function getLuxIcon(lux: number): { icon: string; className: string; label: string } {
  if (lux >= 1000) return { icon: 'sun', className: 'text-amber-400', label: 'Bright' }
  if (lux >= 400) return { icon: 'sun-dim', className: 'text-yellow-400', label: 'Moderate light' }
  if (lux >= 50) return { icon: 'cloud-sun', className: 'text-slate-400', label: 'Low light' }
  if (lux >= 5) return { icon: 'cloud-moon', className: 'text-slate-500', label: 'Dim' }
  return { icon: 'moon', className: 'text-indigo-400', label: 'Dark' }
}

function getTempColor(temp: number): string {
  if (temp >= 28) return 'text-red-400'
  if (temp >= 24) return 'text-amber-400'
  if (temp >= 20) return 'text-emerald-400'
  if (temp >= 16) return 'text-sky-400'
  return 'text-blue-400'
}

function getActivityColor(lastActive: string | null): string {
  if (!lastActive) return 'text-slate-500 dark:text-slate-400'
  const minutesAgo = (Date.now() - new Date(lastActive).getTime()) / 60000
  if (minutesAgo < 5) return 'text-slate-700 dark:text-slate-300'
  if (minutesAgo < 30) return 'text-slate-600 dark:text-slate-400'
  return 'text-slate-500 dark:text-slate-400'
}

// ── Mode selector ────────────────────────────────────────────────────────────

function ModeSelector({
  currentMode,
  modes,
  modeIcons,
  onSelect,
  isPending,
}: {
  currentMode: string
  modes: string[]
  modeIcons: Record<string, string | null>
  onSelect: (mode: string) => void
  isPending: boolean
}) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [currentMode])

  return (
    <section aria-label="System mode" className="mb-6">
      <h2 className="text-heading mb-3 text-sm font-semibold">Current Mode</h2>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {modes.map(mode => (
          <button
            key={mode}
            ref={currentMode === mode ? activeRef : undefined}
            onClick={() => onSelect(mode)}
            disabled={isPending}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
              currentMode === mode
                ? 'bg-fairy-500 text-white shadow-lg shadow-fairy-500/25'
                : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
            )}
          >
            <LucideIcon name={modeIcons[mode]} className="h-4 w-4" aria-hidden="true" />
            {mode}
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Room card ────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  allRooms,
  scenes,
  currentMode,
  defaultScenes,
  onToggleScene,
  onToggleAuto,
  isLocked,
  expandedChildren,
  onToggleChild,
}: {
  room: Room
  allRooms: Room[]
  scenes: Scene[]
  currentMode: string
  defaultScenes: Record<string, Record<string, string>> | undefined
  onToggleScene: (name: string, isActive: boolean) => void
  onToggleAuto: () => void
  isLocked?: boolean
  expandedChildren: Set<string>
  onToggleChild: (childName: string) => void
}) {
  const childRooms = allRooms
    .filter(r => r.parent_room === room.name && !r.promoted)
    .sort((a, b) => a.name.localeCompare(b.name))
  const parentRoom = room.parent_room
    ? allRooms.find(r => r.name === room.parent_room) ?? null
    : null
  // Show ALL scenes for room + mode, in season
  const roomScenes = scenes.filter(s => {
    const rooms = Array.isArray(s.rooms) ? s.rooms : []
    const modes = Array.isArray(s.modes) ? s.modes : []
    const { inSeason } = isSceneInSeason(s)
    if (!inSeason) return false
    return (
      rooms.some(r => r?.name === room.name) &&
      modes.some(m => (m ?? '').toLowerCase() === currentMode.toLowerCase())
    )
  })

  const defaultSceneName = getDefaultScene(defaultScenes, room.name, currentMode)

  // Sort: default scene first, then alphabetical
  const sortedScenes = [...roomScenes].sort((a, b) => {
    if (a.name === defaultSceneName) return -1
    if (b.name === defaultSceneName) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="card rounded-xl border p-4 transition-colors" style={{ borderColor: 'var(--border-primary)' }}>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-start gap-2">
          <LucideIcon name={room.icon} className="mt-0.5 h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
          <h3 className="text-heading text-base font-semibold">
            {room.name}
            {room.parent_room && room.promoted && parentRoom && (
              <>
                {' '}
                <Link
                  to={`/rooms/${encodeURIComponent(room.parent_room)}`}
                  className="text-xs font-normal text-fairy-400 hover:text-fairy-300 transition-colors"
                  aria-label={`Part of ${room.parent_room}`}
                >
                  in {room.parent_room}
                </Link>
              </>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isLocked && (
            <Lock className="h-3.5 w-3.5 text-indigo-400" aria-label="Room locked" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleAuto() }}
            aria-label={`Switch to ${room.auto ? 'manual' : 'auto'} mode`}
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              room.auto
                ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25'
                : 'surface text-caption hover:brightness-95 dark:hover:brightness-110',
            )}
          >
            {room.auto ? 'Auto' : 'Manual'}
          </button>
        </div>
      </div>

      {/* Environmental indicators + activity */}
      <div className="text-body mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {room.lux !== null && (() => {
          const { icon, className, label } = getLuxIcon(room.lux)
          return (
            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
              <LucideIcon name={icon} className={cn('h-3.5 w-3.5', className)} aria-label={label} />
              {room.lux} lux
            </span>
          )
        })()}
        {room.temperature !== null && (
          <span className={cn('flex items-center gap-1', getTempColor(room.temperature))}>
            <Thermometer className="h-3.5 w-3.5" />
            {Math.round(room.temperature * 10) / 10}&deg;C
          </span>
        )}
        <span className={cn('flex items-center gap-1', getActivityColor(room.last_active))}>
          <Footprints className="h-3 w-3" />
          {formatTimeAgo(room.last_active)}
        </span>
      </div>

      {/* Quick scene buttons — all scenes, no limit */}
      {sortedScenes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sortedScenes.map(scene => {
            const isActive = room.current_scene === scene.name
            const isDefault = scene.name === defaultSceneName
            return (
              <button
                key={scene.name}
                onClick={() => onToggleScene(scene.name, isActive)}
                aria-pressed={isActive}
                className={cn(
                  'flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isActive
                    ? 'bg-fairy-500/20 text-fairy-700 dark:text-fairy-300'
                    : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                )}
              >
                {isDefault && (
                  <Activity className="h-3 w-3 text-fairy-400" aria-label="Default scene for this mode" />
                )}
                {scene.icon && <span className="text-sm" aria-hidden="true">{scene.icon}</span>}
                {scene.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Sub-spaces — each child renders in place as either a pill or expanded content */}
      {childRooms.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border-secondary)] pt-3">
          {childRooms.map(child => {
            const isExpanded = expandedChildren.has(child.name)

            if (!isExpanded) {
              return (
                <button
                  key={child.name}
                  onClick={() => onToggleChild(child.name)}
                  aria-expanded={false}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors min-h-[44px]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'surface text-body hover:text-heading',
                  )}
                >
                  <LucideIcon name={child.icon} className="h-3.5 w-3.5 shrink-0 text-fairy-400" aria-hidden="true" />
                  {child.name}
                </button>
              )
            }

            const childScenes = scenes.filter(s => {
              const rooms = Array.isArray(s.rooms) ? s.rooms : []
              const modes = Array.isArray(s.modes) ? s.modes : []
              const { inSeason } = isSceneInSeason(s)
              if (!inSeason) return false
              return (
                rooms.some(r => r?.name === child.name) &&
                modes.some(m => (m ?? '').toLowerCase() === currentMode.toLowerCase())
              )
            })
            const childDefault = getDefaultScene(defaultScenes, child.name, currentMode)
            const sortedChildScenes = [...childScenes].sort((a, b) => {
              if (a.name === childDefault) return -1
              if (b.name === childDefault) return 1
              return a.name.localeCompare(b.name)
            })

            return (
              <div key={child.name} className="w-full rounded-lg bg-[var(--bg-secondary)] p-3">
                <button
                  onClick={() => onToggleChild(child.name)}
                  className="mb-2 flex items-center gap-1.5 min-h-[44px] text-left"
                  aria-expanded={true}
                  aria-label={`Collapse ${child.name}`}
                >
                  <LucideIcon name={child.icon} className="h-3.5 w-3.5 text-fairy-400" aria-hidden="true" />
                  <span className="text-xs font-medium text-heading">{child.name}</span>
                </button>

                {/* Child environmental indicators */}
                <div className="text-body mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {child.lux !== null && (() => {
                    const { icon, className, label } = getLuxIcon(child.lux)
                    return (
                      <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                        <LucideIcon name={icon} className={cn('h-3.5 w-3.5', className)} aria-label={label} />
                        {child.lux} lux
                      </span>
                    )
                  })()}
                  {child.temperature !== null && (
                    <span className={cn('flex items-center gap-1', getTempColor(child.temperature))}>
                      <Thermometer className="h-3.5 w-3.5" />
                      {Math.round(child.temperature * 10) / 10}&deg;C
                    </span>
                  )}
                  <span className={cn('flex items-center gap-1', getActivityColor(child.last_active))}>
                    <Footprints className="h-3 w-3" />
                    {formatTimeAgo(child.last_active)}
                  </span>
                </div>

                {/* Child scene buttons */}
                {sortedChildScenes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {sortedChildScenes.map(scene => {
                      const isActive = child.current_scene === scene.name
                      const isDefault = scene.name === childDefault
                      return (
                        <button
                          key={scene.name}
                          onClick={() => onToggleScene(scene.name, isActive)}
                          aria-pressed={isActive}
                          className={cn(
                            'flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                            isActive
                              ? 'bg-fairy-500/20 text-fairy-700 dark:text-fairy-300'
                              : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                          )}
                        >
                          {isDefault && (
                            <Activity className="h-3 w-3 text-fairy-400" aria-label="Default scene for this mode" />
                          )}
                          {scene.icon && <span className="text-sm" aria-hidden="true">{scene.icon}</span>}
                          {scene.name}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-caption">No scenes for this mode</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Weather card ────────────────────────────────────────────────────────────

function WeatherCard() {
  const { data: weather, isError, isLoading } = useQuery({
    queryKey: ['system', 'weather'],
    queryFn: api.system.getWeather,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  if (isLoading) {
    return (
      <div className="card mb-6 flex items-center gap-4 rounded-xl border px-4 py-3">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="card mb-6 rounded-xl border px-4 py-3">
        <p className="text-caption text-sm">Weather unavailable</p>
      </div>
    )
  }

  if (!weather) return null

  const useFahrenheit = prefs?.temp_unit === 'F'
  const displayTemp = useFahrenheit
    ? Math.round(weather.temp * 9 / 5 + 32)
    : Math.round(weather.temp)
  const unit = useFahrenheit ? 'F' : 'C'

  return (
    <div className="card mb-6 flex items-center gap-4 rounded-xl border px-4 py-3">
      {weather.icon ? (
        <img
          src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
          alt={weather.description}
          className="h-12 w-12"
        />
      ) : (
        <Cloud className="text-body h-8 w-8" />
      )}
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-heading text-2xl font-semibold">
            {displayTemp}&deg;{unit}
          </span>
          <span className="text-body text-sm capitalize">
            {weather.description}
          </span>
        </div>
        <div className="text-caption mt-1 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <Droplets className="h-3 w-3" />
            {weather.humidity}%
          </span>
          <span className="flex items-center gap-1">
            <Wind className="h-3 w-3" />
            {Math.round(weather.wind_speed)} m/s
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Quick actions ────────────────────────────────────────────────────────────

function QuickActions() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const allOffMutation = useMutation({
    mutationFn: api.system.allOff,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(r => ({ ...r, current_scene: null }))
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
      queryClient.invalidateQueries({ queryKey: ['lifx'] })
      toast({ message: 'All devices turned off' })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to turn off devices', type: 'error' })
    },
  })

  const nighttimeMutation = useMutation({
    mutationFn: api.system.nighttime,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(r => ({ ...r, current_scene: null }))
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
      queryClient.invalidateQueries({ queryKey: ['lifx'] })
      toast({ message: 'Nighttime mode activated' })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to set nighttime', type: 'error' })
    },
  })

  const guestNightMutation = useMutation({
    mutationFn: api.system.guestNight,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] })
      const previous = queryClient.getQueryData<Room[]>(['rooms'])
      queryClient.setQueryData<Room[]>(['rooms'], old =>
        old?.map(r => ({ ...r, current_scene: null }))
      )
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
      queryClient.invalidateQueries({ queryKey: ['lifx'] })
      toast({ message: 'Guest night mode activated' })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['rooms'], context.previous)
      toast({ message: 'Failed to set guest night', type: 'error' })
    },
  })

  const anyPending = allOffMutation.isPending || nighttimeMutation.isPending || guestNightMutation.isPending

  return (
    <section className="mb-6" aria-label="Quick actions">
      <div className="flex gap-2">
        <button
          onClick={() => allOffMutation.mutate()}
          disabled={anyPending}
          className={cn(
            'flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all',
            'bg-red-500/15 text-red-400 active:scale-[0.97]',
            'hover:bg-red-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500',
            'disabled:opacity-50',
          )}
        >
          {allOffMutation.isPending
            ? <Loader2 className="h-4.5 w-4.5 animate-spin" />
            : <Power className="h-4.5 w-4.5" />}
          {allOffMutation.isPending ? 'Turning off...' : 'All Off'}
        </button>
        <button
          onClick={() => nighttimeMutation.mutate()}
          disabled={anyPending}
          className={cn(
            'flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all',
            'bg-indigo-500/15 text-indigo-400 active:scale-[0.97]',
            'hover:bg-indigo-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
            'disabled:opacity-50',
          )}
        >
          {nighttimeMutation.isPending
            ? <Loader2 className="h-4.5 w-4.5 animate-spin" />
            : <Moon className="h-4.5 w-4.5" />}
          {nighttimeMutation.isPending ? 'Activating...' : 'Nighttime'}
        </button>
        <button
          onClick={() => guestNightMutation.mutate()}
          disabled={anyPending}
          className={cn(
            'flex flex-1 min-h-[52px] items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all',
            'bg-purple-500/15 text-purple-400 active:scale-[0.97]',
            'hover:bg-purple-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500',
            'disabled:opacity-50',
          )}
        >
          {guestNightMutation.isPending
            ? <Loader2 className="h-4.5 w-4.5 animate-spin" />
            : <><Moon className="h-4 w-4" /><Users className="h-4 w-4" /></>}
          {guestNightMutation.isPending ? 'Activating...' : 'Guest'}
        </button>
      </div>
    </section>
  )
}

// ── MTA subway card ─────────────────────────────────────────────────────────

const MTA_LINE_COLORS: Record<string, string> = {
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  '7': '#B933AD',
  'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
  'G': '#6CBE45',
  'J': '#996633', 'Z': '#996633',
  'L': '#A7A9AC',
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  'S': '#808183',
}

const STATUS_DOT_COLORS: Record<string, string> = {
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  none: '#6b7280',
}

const STATUS_BG_COLORS: Record<string, string> = {
  green: 'bg-green-500/10',
  orange: 'bg-orange-500/10',
  red: 'bg-red-500/10',
  none: '',
}

function MtaLineBadge({ line }: { line: string }) {
  const bg = MTA_LINE_COLORS[line] || '#808183'
  const textColor = ['N', 'Q', 'R', 'W'].includes(line) ? '#000' : '#fff'
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {line}
    </span>
  )
}

function MtaCard() {
  const [open, setOpen] = useState(false)

  const { data: combinedStatus, isError, isLoading } = useQuery({
    queryKey: ['mta', 'combined-status'],
    queryFn: api.system.getCombinedMtaStatus,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="card mb-6 rounded-xl border px-4 py-3">
        <Skeleton className="h-5 w-48" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="card mb-6 rounded-xl border px-4 py-3">
        <p className="text-caption text-sm">Train times unavailable</p>
      </div>
    )
  }

  if (!combinedStatus || combinedStatus.overallStatus === 'none') return null

  const overallColor = STATUS_DOT_COLORS[combinedStatus.overallStatus]
  const bgClass = STATUS_BG_COLORS[combinedStatus.overallStatus]

  // Build accordion summary — only show the catchable train, not just the next arrival
  const soonestStop = combinedStatus.overallStatus === 'green' || combinedStatus.overallStatus === 'orange'
    ? combinedStatus.stops.reduce<typeof combinedStatus.stops[0] | null>((best, stop) => {
        if (!stop.catchableTrain) return best
        if (!best || !best.catchableTrain) return stop
        return stop.catchableTrain.minutesAway < best.catchableTrain.minutesAway ? stop : best
      }, null)
    : null

  const accordionTitle: React.ReactNode = soonestStop?.catchableTrain ? (
    <span className="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: overallColor }}
        aria-hidden="true"
      />
      <MtaLineBadge line={soonestStop.catchableTrain.routeId} />
      {soonestStop.config.direction === 'N'
        ? <ArrowUp className="h-3.5 w-3.5 shrink-0 text-caption" aria-label="Uptown" />
        : <ArrowDown className="h-3.5 w-3.5 shrink-0 text-caption" aria-label="Downtown" />
      }
      <span>at {soonestStop.config.name} in {soonestStop.catchableTrain.minutesAway} min</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: overallColor }}
        aria-hidden="true"
      />
      {combinedStatus.overallStatus === 'red'
        ? 'Nothing catchable right now'
        : combinedStatus.overallMessage
      }
    </span>
  )

  return (
    <div className={cn('card mb-6 rounded-xl border', bgClass)}>
      <Accordion
        id="mta"
        title={accordionTitle}
        open={open}
        onToggle={() => setOpen(o => !o)}
        card={false}
        trailing={<Train className="h-4 w-4 text-caption" aria-hidden="true" />}
      >
        {/* Per-stop rows */}
        <div className="space-y-1 px-4">
          {combinedStatus.stops.map((stop, i) => {
            const dotColor = STATUS_DOT_COLORS[stop.status]
            const next = stop.nextArrival
            const displayTrain = stop.catchableTrain ?? next
            const buffer = displayTrain ? displayTrain.minutesAway - stop.config.walkTime : 0

            // Build the helpful message
            let message = ''
            if (!displayTrain) {
              message = 'No trains'
            } else if (stop.status === 'red') {
              message = `in ${next?.minutesAway ?? displayTrain.minutesAway} min — won't make it in time`
            } else if (stop.status === 'green') {
              const leaveMsg = stop.leaveInMinutes != null && stop.leaveInMinutes > 0
                ? `Leave within ${stop.leaveInMinutes} min`
                : 'Leave now'
              message = `in ${displayTrain.minutesAway} min — ${leaveMsg}, ${buffer - (stop.leaveInMinutes ?? 0)} min wait at station`
            } else if (stop.status === 'orange') {
              message = `in ${displayTrain.minutesAway} min — Leave now, tight!`
            }

            const dirLabel = stop.config.direction === 'N' ? 'Uptown' : 'Downtown'
            const DirArrow = stop.config.direction === 'N' ? ArrowUp : ArrowDown

            return (
              <div
                key={`${stop.config.stopId}-${stop.config.direction}-${i}`}
                className="flex items-center gap-2 py-1.5 text-sm"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-label={`Status: ${stop.status}`}
                />
                {displayTrain
                  ? <MtaLineBadge line={displayTrain.routeId} />
                  : <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#808183]/40 text-[10px] text-caption" aria-hidden="true">—</span>
                }
                <DirArrow className="h-3.5 w-3.5 shrink-0 text-caption" aria-label={dirLabel} />
                {/* Station name + message inline, wrapping */}
                <p className="min-w-0 flex-1 text-heading font-medium leading-snug">
                  {stop.config.name} {message && <span className="font-normal text-body text-xs">{message}</span>}
                </p>
              </div>
            )
          })}
        </div>
      </Accordion>
    </div>
  )
}

// ── Music quick action ───────────────────────────────────────────────────────

function MusicQuickAction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: muteStatus, isLoading: muteLoading } = useQuery({
    queryKey: ['sonos', 'mute-status'],
    queryFn: api.sonos.getMuteStatus,
    staleTime: 10_000,
    retry: false,
  })

  const muteAllMutation = useMutation({
    mutationFn: (muted: boolean) => api.sonos.muteAll(muted),
    onMutate: async (muted) => {
      await queryClient.cancelQueries({ queryKey: ['sonos', 'mute-status'] })
      const previous = queryClient.getQueryData<{ allMuted: boolean; mutedCount: number; totalSpeakers: number }>(['sonos', 'mute-status'])
      if (previous) {
        queryClient.setQueryData(['sonos', 'mute-status'], {
          ...previous,
          allMuted: muted,
          mutedCount: muted ? previous.totalSpeakers : 0,
        })
      }
      return { previous }
    },
    onSuccess: (_data, muted) => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'mute-status'] })
      toast({ message: muted ? 'All speakers muted' : 'All speakers unmuted' })
    },
    onError: (_err, _muted, context) => {
      if (context?.previous) queryClient.setQueryData(['sonos', 'mute-status'], context.previous)
      toast({ message: 'Failed to update speakers', type: 'error' })
    },
  })

  if (muteLoading) {
    return (
      <section className="mb-6" aria-label="Music controls">
        <Skeleton className="h-12 w-full rounded-xl" />
      </section>
    )
  }

  // Don't render if no speakers are configured
  if (!muteStatus || muteStatus.totalSpeakers === 0) return null

  const isMuted = muteStatus.allMuted
  const speakerLabel = muteStatus.totalSpeakers === 1
    ? '1 speaker'
    : `${muteStatus.totalSpeakers} speakers`

  return (
    <section className="mb-6" aria-label="Music controls">
      <button
        onClick={() => muteAllMutation.mutate(!isMuted)}
        disabled={muteAllMutation.isPending}
        className={cn(
          'flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
          'active:scale-[0.98]',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:opacity-50',
          isMuted
            ? 'bg-fairy-500/15 text-fairy-400 hover:bg-fairy-500/25 focus-visible:outline-fairy-500'
            : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 focus-visible:outline-amber-500',
        )}
      >
        {muteAllMutation.isPending ? (
          <Loader2 className="h-4.5 w-4.5 animate-spin" />
        ) : isMuted ? (
          <VolumeX className="h-4.5 w-4.5" />
        ) : (
          <Volume2 className="h-4.5 w-4.5" />
        )}
        {muteAllMutation.isPending
          ? (isMuted ? 'Unmuting...' : 'Muting...')
          : isMuted
            ? 'Unmute all speakers'
            : 'Mute all speakers'}
        <span className={cn(
          'ml-1 text-xs font-normal',
          isMuted ? 'text-fairy-400/60' : 'text-amber-400/60',
        )}>
          ({speakerLabel})
        </span>
      </button>
    </section>
  )
}

// ── Home page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [reorderOpen, setReorderOpen] = useState(false)
  const [sectionEditorOpen, setSectionEditorOpen] = useState(false)
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(new Set())

  function toggleChild(name: string) {
    setExpandedChildren(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
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
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
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

  // Render a single section by ID
  function renderSection(id: string): React.ReactNode {
    switch (id) {
      case 'mta':
        return <MtaCard key="mta" />
      case 'quick-actions':
        return <QuickActions key="quick-actions" />
      case 'music':
        return <MusicQuickAction key="music" />
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
                      onToggleScene={(name, isActive) =>
                        isActive
                          ? deactivateSceneMutation.mutate(name)
                          : activateSceneMutation.mutate(name)
                      }
                      onToggleAuto={() =>
                        toggleAutoMutation.mutate({ name: room.name, auto: !room.auto })
                      }
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
