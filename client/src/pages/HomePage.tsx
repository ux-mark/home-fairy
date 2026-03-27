import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Thermometer, Sun, Clock, Zap, Cloud, Droplets, Wind, Power, Moon, Users, Train, ArrowDown, ArrowUp, Lock, AlertTriangle, ChevronRight, Activity, Loader2, Volume2, VolumeX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { cn, formatTimeAgo, DEFAULT_MODES } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import type { Room, Scene } from '@/lib/api'
import { getDefaultScene, isSceneInSeason } from '@/lib/scene-utils'
import DeviceOnboarding from '@/components/ui/DeviceOnboarding'
import { EmptyState } from '@/components/ui/EmptyState'

// ── Skeleton loader ──────────────────────────────────────────────────────────

function RoomCardSkeleton() {
  return (
    <div className="card rounded-xl border p-4">
      <div className="animate-pulse space-y-3">
        <div className="surface h-5 w-28 rounded" />
        <div className="surface h-4 w-20 rounded" />
        <div className="flex gap-2">
          <div className="surface h-8 w-16 rounded-lg" />
          <div className="surface h-8 w-16 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

// ── Mode selector ────────────────────────────────────────────────────────────

function ModeSelector({
  currentMode,
  modes,
  onSelect,
  isPending,
}: {
  currentMode: string
  modes: string[]
  onSelect: (mode: string) => void
  isPending: boolean
}) {
  return (
    <section aria-label="System mode" className="mb-6">
      <h2 className="text-heading mb-3 text-sm font-semibold">Current Mode</h2>
      <div className="flex flex-wrap gap-2">
        {modes.map(mode => (
          <button
            key={mode}
            onClick={() => onSelect(mode)}
            disabled={isPending}
            className={cn(
              'rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px]',
              currentMode === mode
                ? 'bg-fairy-500 text-white shadow-lg shadow-fairy-500/25'
                : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
            )}
          >
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
  scenes,
  currentMode,
  defaultScenes,
  onToggleScene,
  onToggleAuto,
  isLocked,
}: {
  room: Room
  scenes: Scene[]
  currentMode: string
  defaultScenes: Record<string, Record<string, string>> | undefined
  onToggleScene: (name: string, isActive: boolean) => void
  onToggleAuto: () => void
  isLocked?: boolean
}) {
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
        <div>
          <h3 className="text-heading text-base font-semibold">
            {room.name}
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

      {/* Sensor data */}
      {(room.temperature !== null || room.lux !== null) && (
        <div className="text-body mb-3 flex items-center gap-4 text-xs">
          {room.temperature !== null && (
            <span className="flex items-center gap-1">
              <Thermometer className="h-3.5 w-3.5" />
              {room.temperature !== null && Math.round(room.temperature * 10) / 10}&deg;C
            </span>
          )}
          {room.lux !== null && (
            <span className="flex items-center gap-1">
              <Sun className="h-3.5 w-3.5" />
              {room.lux} lux
            </span>
          )}
        </div>
      )}

      {/* Last active */}
      <div className="text-caption mb-3 flex items-center gap-1 text-xs">
        <Clock className="h-3 w-3" />
        {formatTimeAgo(room.last_active)}
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
    </div>
  )
}

// ── Weather card ────────────────────────────────────────────────────────────

function WeatherCard() {
  const { data: weather } = useQuery({
    queryKey: ['system', 'weather'],
    queryFn: api.system.getWeather,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

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
  const { data: combinedStatus } = useQuery({
    queryKey: ['mta', 'combined-status'],
    queryFn: api.system.getCombinedMtaStatus,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  if (!combinedStatus || combinedStatus.overallStatus === 'none') return null

  const overallColor = STATUS_DOT_COLORS[combinedStatus.overallStatus]
  const bgClass = STATUS_BG_COLORS[combinedStatus.overallStatus]

  return (
    <div className={cn('card mb-6 rounded-xl border px-4 py-3', bgClass)}>
      {/* Main status header */}
      <div className="mb-3 flex items-center gap-3">
        <span
          className="h-10 w-10 flex-shrink-0 rounded-full"
          style={{ backgroundColor: overallColor }}
          aria-hidden="true"
        />
        <div>
          <p className="text-heading text-base font-semibold">
            {combinedStatus.overallMessage}
          </p>
          <p className="text-caption text-xs">
            {combinedStatus.stops.length} station{combinedStatus.stops.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <Train className="ml-auto h-5 w-5 text-caption" />
      </div>

      {/* Per-stop rows */}
      <div className="space-y-2">
        {combinedStatus.stops.map((stop, i) => {
          const DirIcon = stop.config.direction === 'S' ? ArrowDown : ArrowUp
          const dotColor = STATUS_DOT_COLORS[stop.status]
          const next = stop.nextArrival
          const displayTrain = stop.catchableTrain ?? next
          const buffer = displayTrain ? displayTrain.minutesAway - stop.config.walkTime : 0

          return (
            <div
              key={`${stop.config.stopId}-${stop.config.direction}-${i}`}
              className="surface flex items-center gap-2.5 rounded-lg px-3 py-2"
            >
              {/* Mini status dot */}
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: dotColor }}
                aria-label={`Status: ${stop.status}`}
              />

              {/* Line badges */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {stop.config.routes.slice(0, 3).map(line => (
                  <MtaLineBadge key={line} line={line} />
                ))}
              </div>

              {/* Direction */}
              <span className="flex items-center gap-0.5 text-caption text-xs flex-shrink-0">
                <DirIcon className="h-3 w-3" />
              </span>

              {/* Arrival info */}
              {displayTrain ? (
                <div className="flex-1 min-w-0">
                  {stop.status === 'red' ? (
                    <>
                      <span className="text-heading text-sm font-medium">
                        Next in {next?.minutesAway ?? displayTrain.minutesAway} min
                      </span>
                      <span className="text-caption text-xs ml-1.5">
                        (won't make it in time)
                      </span>
                    </>
                  ) : stop.status === 'green' ? (
                    <>
                      <span className="text-heading text-sm font-medium">
                        {stop.leaveInMinutes != null && stop.leaveInMinutes > 0
                          ? `Leave within ${stop.leaveInMinutes} min`
                          : 'Leave now'}
                      </span>
                      <span className="text-caption text-xs ml-1.5">
                        ({displayTrain.routeId} in {displayTrain.minutesAway} min, {buffer - (stop.leaveInMinutes ?? 0)} min wait at station)
                      </span>
                    </>
                  ) : stop.status === 'orange' ? (
                    <>
                      <span className="text-heading text-sm font-medium">
                        Leave now
                      </span>
                      <span className="text-caption text-xs ml-1.5">
                        ({displayTrain.routeId} in {displayTrain.minutesAway} min — tight!)
                      </span>
                    </>
                  ) : null}
                </div>
              ) : (
                <span className="text-caption text-xs flex-1">No trains</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Music quick action ───────────────────────────────────────────────────────

function MusicQuickAction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: muteStatus } = useQuery({
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

  const { data: rooms, isLoading: roomsLoading, isError: roomsError, refetch: refetchRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: scenes } = useQuery({
    queryKey: ['scenes'],
    queryFn: api.scenes.getAll,
  })

  const { data: system } = useQuery({
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

  return (
    <div>
      <DeviceOnboarding />

      <MtaCard />

      <QuickActions />

      <MusicQuickAction />

      {nightStatus?.active && (
        <div className="card mb-6 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
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
      )}

      <WeatherCard />

      <ModeSelector
        currentMode={currentMode}
        modes={allModes}
        onSelect={mode => setModeMutation.mutate(mode)}
        isPending={setModeMutation.isPending}
      />

      {dashboardData?.insights?.attention?.some(a => a.severity === 'critical') && (
        <Link
          to="/dashboard"
          className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 transition-colors hover:bg-red-500/10 min-h-[44px]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <span className="text-sm text-red-400">
            {dashboardData.insights.attention.filter(a => a.severity === 'critical').length} item{dashboardData.insights.attention.filter(a => a.severity === 'critical').length !== 1 ? 's' : ''} need{dashboardData.insights.attention.filter(a => a.severity === 'critical').length === 1 ? 's' : ''} attention
          </span>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-red-400 opacity-50" aria-hidden="true" />
        </Link>
      )}

      <section aria-label="Rooms">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-heading text-sm font-semibold">Rooms</h2>
          {rooms && (
            <span className="text-caption text-xs">
              {rooms.length} room{rooms.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {roomsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <RoomCardSkeleton key={i} />
            ))}
          </div>
        ) : roomsError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
            <p className="text-zinc-400">Unable to load home data. Check your connection and try again.</p>
            <button
              onClick={() => refetchRooms()}
              className="rounded-lg bg-fairy-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairy-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              Try again
            </button>
          </div>
        ) : rooms && rooms.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms
              .sort((a, b) => a.display_order - b.display_order)
              .map(room => (
                <RoomCard
                  key={room.name}
                  room={room}
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
    </div>
  )
}
