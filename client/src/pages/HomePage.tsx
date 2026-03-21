import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Thermometer, Sun, Clock, Sparkles, Zap, Cloud, Droplets, Wind } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatTimeAgo, DEFAULT_MODES } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import type { Room, Scene } from '@/lib/api'
import DeviceOnboarding from '@/components/ui/DeviceOnboarding'

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
      <h2 className="text-body mb-3 text-sm font-medium">Current Mode</h2>
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
  onActivateScene,
}: {
  room: Room
  scenes: Scene[]
  currentMode: string
  onActivateScene: (name: string) => void
}) {
  // Filter scenes: those that include this room AND match current mode
  const roomScenes = scenes.filter(s => {
    const rooms = Array.isArray(s.rooms) ? s.rooms : []
    const modes = Array.isArray(s.modes) ? s.modes : []
    return (
      rooms.some(r => r?.name === room.name) &&
      modes.some(m => (m ?? '').toLowerCase() === currentMode.toLowerCase())
    )
  })
  const displayScenes = roomScenes.slice(0, 4)

  return (
    <div className="card rounded-xl border p-4 transition-colors" style={{ borderColor: 'var(--border-primary)' }}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-heading text-base font-semibold">
            {room.name}
          </h3>
          {room.current_scene ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-fairy-500/15 px-2 py-0.5 text-xs font-medium text-fairy-400">
              <Sparkles className="h-3 w-3" />
              {room.current_scene}
            </span>
          ) : (
            <span className="text-caption mt-1 inline-block text-xs">
              No active scene
            </span>
          )}
        </div>
        <div
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            room.auto
              ? 'bg-fairy-500/15 text-fairy-400'
              : 'surface text-caption',
          )}
        >
          {room.auto ? 'Auto' : 'Manual'}
        </div>
      </div>

      {/* Sensor data */}
      {(room.temperature !== null || room.lux !== null) && (
        <div className="text-body mb-3 flex items-center gap-4 text-xs">
          {room.temperature !== null && (
            <span className="flex items-center gap-1">
              <Thermometer className="h-3.5 w-3.5" />
              {room.temperature !== null && Math.round(room.temperature * 10) / 10}°C
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

      {/* Quick scene buttons */}
      {displayScenes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {displayScenes.map(scene => (
            <button
              key={scene.name}
              onClick={() => onActivateScene(scene.name)}
              className={cn(
                'flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                room.current_scene === scene.name
                  ? 'bg-fairy-500/20 text-fairy-300'
                  : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
              )}
            >
              {scene.icon && <span className="text-sm">{scene.icon}</span>}
              {scene.name}
            </button>
          ))}
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
            {displayTemp}°{unit}
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

// ── Home page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: rooms, isLoading: roomsLoading } = useQuery({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      toast({ message: 'Scene activated' })
    },
    onError: () =>
      toast({ message: 'Failed to activate scene', type: 'error' }),
  })

  const currentMode = system?.mode ?? 'Evening'
  const allModes = system?.all_modes ?? [...DEFAULT_MODES]

  return (
    <div>
      <DeviceOnboarding />

      <WeatherCard />

      <ModeSelector
        currentMode={currentMode}
        modes={allModes}
        onSelect={mode => setModeMutation.mutate(mode)}
        isPending={setModeMutation.isPending}
      />

      <section aria-label="Rooms">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body text-sm font-medium">Rooms</h2>
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
                  onActivateScene={name =>
                    activateSceneMutation.mutate(name)
                  }
                />
              ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed py-12 text-center" style={{ borderColor: 'var(--border-secondary)' }}>
            <Zap className="text-caption mx-auto mb-3 h-8 w-8" />
            <p className="text-body text-sm">No rooms set up yet.</p>
            <p className="text-caption mt-1 text-xs">
              Head to the Rooms tab to get started.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
