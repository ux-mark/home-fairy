import { useState, useCallback, useMemo } from 'react'
import { ModesList } from '@/components/modes/ModesList'
import ModeDetail from '@/components/modes/ModeDetail'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Settings,
  Plus,
  X,
  RefreshCw,
  Timer,
  FileText,
  Trash2,
  CheckCircle,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
  Train,
  Search,
  Minus,
  ChevronDown,
  ArrowDown,
  ArrowUp,
  Lightbulb,
  Play,
  Cloud,
  Palette,
  RotateCcw,
  Lock,
  Unlock,
} from 'lucide-react'
import { HsvColorPicker } from 'react-colorful'
import { api } from '@/lib/api'
import type { ConfiguredStop, MtaStop, MtaIndicatorConfig, WeatherIndicatorConfig, DashboardStats } from '@/lib/api'
import { cn, hsbToHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { useTheme } from '@/hooks/useTheme'
import type { Theme } from '@/hooks/useTheme'

// ── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="card rounded-xl border p-5">
      <h3 className="text-caption mb-4 text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  )
}

// ── Theme section ───────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function ThemeSection() {
  const { theme, setTheme } = useTheme()

  return (
    <Section title="Appearance">
      <div className="flex items-center justify-between">
        <span className="text-heading text-sm">Theme</span>
        <div className="surface flex rounded-lg border" style={{ borderColor: 'var(--border-secondary)' }}>
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
                theme === value
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── General section ─────────────────────────────────────────────────────────

function GeneralSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.system.setPreference(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] })
      toast({ message: 'Preference saved' })
    },
    onError: () => toast({ message: 'Failed to save preference', type: 'error' }),
  })

  const tempUnit = prefs?.temp_unit ?? 'C'
  const energyRate = prefs?.energy_rate ?? ''

  return (
    <Section title="General">
      <div className="flex items-center justify-between">
        <span className="text-heading text-sm">Temperature unit</span>
        <div className="surface flex rounded-lg border" style={{ borderColor: 'var(--border-secondary)' }}>
          {(['C', 'F'] as const).map(unit => (
            <button
              key={unit}
              onClick={() => mutation.mutate({ key: 'temp_unit', value: unit })}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                tempUnit === unit
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              °{unit}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-heading text-sm">Energy rate</span>
          <p className="text-caption text-xs">Cost per kWh for energy estimates</p>
        </div>
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="0.30"
          value={energyRate}
          onChange={(e) => mutation.mutate({ key: 'energy_rate', value: e.target.value })}
          className="w-24 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-right text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label="Energy rate per kWh"
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-heading text-sm">Currency symbol</span>
          <p className="text-caption text-xs">Used for energy cost displays</p>
        </div>
        <input
          type="text"
          maxLength={3}
          placeholder="$"
          value={prefs?.currency_symbol ?? ''}
          onChange={(e) => mutation.mutate({ key: 'currency_symbol', value: e.target.value })}
          className="w-16 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-center text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          aria-label="Currency symbol"
        />
      </div>
    </Section>
  )
}

// ── Modes section (uses new ModesList/ModeDetail components) ────────────────

function ModesSection() {
  const [selectedMode, setSelectedMode] = useState<string | null>(null)

  if (selectedMode) {
    return (
      <ModeDetail
        modeName={selectedMode}
        onBack={() => setSelectedMode(null)}
      />
    )
  }

  return (
    <ModesList onSelectMode={setSelectedMode} />
  )
}

// ── Night Mode section ─────────────────────────────────────────────────────

function NightModeSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
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

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.system.setPreference(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] })
      toast({ message: 'Night mode settings saved' })
    },
    onError: () => toast({ message: 'Failed to save settings', type: 'error' }),
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

  const nightExclude: string[] = (() => {
    try {
      return prefs?.night_exclude_rooms ? JSON.parse(prefs.night_exclude_rooms) : ['Bedroom']
    } catch { return ['Bedroom'] }
  })()

  const guestExclude: string[] = (() => {
    try {
      return prefs?.guest_night_exclude_rooms ? JSON.parse(prefs.guest_night_exclude_rooms) : ['Bedroom']
    } catch { return ['Bedroom'] }
  })()

  const wakeMode = prefs?.night_wake_mode || 'Morning'
  const allModes = system?.all_modes ?? []
  const roomNames = (rooms ?? []).sort((a, b) => a.display_order - b.display_order).map(r => r.name)

  const toggleRoom = (prefKey: string, current: string[], roomName: string) => {
    const next = current.includes(roomName)
      ? current.filter(r => r !== roomName)
      : [...current, roomName]
    mutation.mutate({ key: prefKey, value: JSON.stringify(next) })
  }

  return (
    <Section title="Night Mode">
      <div className="space-y-5">
        <p className="text-caption text-xs">
          When you activate Nighttime or Guest Night, rooms will turn off and stay off until the wake mode is reached.
        </p>

        {/* Wake mode selector */}
        <div>
          <label htmlFor="wake-mode-select" className="text-heading text-sm mb-1 block">
            Wake mode
          </label>
          <p className="text-caption text-xs mb-2">
            Rooms unlock when this mode is reached.
          </p>
          <select
            id="wake-mode-select"
            value={wakeMode}
            onChange={(e) => mutation.mutate({ key: 'night_wake_mode', value: e.target.value })}
            disabled={mutation.isPending}
            className={cn(
              'surface rounded-lg border border-[var(--border-primary)] px-3 py-2 text-sm text-heading',
              'min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
            )}
          >
            {allModes.map(mode => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
        </div>

        {/* Nighttime exclusions */}
        <div className="border-t border-[var(--border-secondary)] pt-5">
          <p className="text-heading text-sm mb-1">Nighttime -- rooms that stay on</p>
          <p className="text-caption text-xs mb-3">
            These rooms keep their lights on when you tap Nighttime. All other rooms will lock.
          </p>
          <div className="flex flex-wrap gap-2">
            {roomNames.map(name => {
              const checked = nightExclude.includes(name)
              return (
                <button
                  key={name}
                  onClick={() => toggleRoom('night_exclude_rooms', nightExclude, name)}
                  disabled={mutation.isPending}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
                    checked
                      ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'
                      : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                  )}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Guest Night exclusions */}
        <div className="border-t border-[var(--border-secondary)] pt-5">
          <p className="text-heading text-sm mb-1">Guest Night -- rooms that stay on for guests</p>
          <p className="text-caption text-xs mb-3">
            These rooms keep their lights on when you tap Guest Night. All other rooms will lock.
          </p>
          <div className="flex flex-wrap gap-2">
            {roomNames.map(name => {
              const checked = guestExclude.includes(name)
              return (
                <button
                  key={name}
                  onClick={() => toggleRoom('guest_night_exclude_rooms', guestExclude, name)}
                  disabled={mutation.isPending}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
                    checked
                      ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30'
                      : 'surface text-body hover:brightness-95 dark:hover:brightness-110',
                  )}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Current lockout status */}
        {nightStatus?.active && (
          <div className="border-t border-[var(--border-secondary)] pt-5">
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <Lock className="h-4 w-4 text-indigo-400" />
                <p className="text-heading text-sm font-medium">
                  {nightStatus.lockedRooms.length} room{nightStatus.lockedRooms.length !== 1 ? 's' : ''} locked
                </p>
              </div>
              <p className="text-caption text-xs mb-3">
                {nightStatus.lockedRooms.join(', ')} -- unlocks at {nightStatus.wakeMode}
              </p>
              <button
                onClick={() => unlockMutation.mutate()}
                disabled={unlockMutation.isPending}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
                  'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
                  'disabled:opacity-50',
                )}
              >
                <Unlock className="h-4 w-4" />
                Unlock now
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// SunScheduleSection removed — sun schedule is now shown per-mode in ModeDetail triggers

// ── Devices section ─────────────────────────────────────────────────────────

function DevicesSection() {
  const { toast } = useToast()

  const { data: lights, isLoading: lifxLoading } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    retry: false,
  })

  const syncMutation = useMutation({
    mutationFn: api.hubitat.syncDevices,
    onSuccess: () => toast({ message: 'Hubitat devices synced' }),
    onError: () => toast({ message: 'Sync failed', type: 'error' }),
  })

  return (
    <Section title="Devices">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-heading text-sm">Hubitat</p>
            <p className="text-caption text-xs">Sync devices from Hubitat hub</p>
          </div>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="surface flex items-center gap-1.5 rounded-lg px-3 py-2 text-heading text-sm transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-4 w-4', syncMutation.isPending && 'animate-spin')}
            />
            Sync Devices
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-heading text-sm">LIFX</p>
            <p className="text-caption text-xs">
              {lifxLoading
                ? 'Checking...'
                : lights
                  ? `${lights.length} light${lights.length !== 1 ? 's' : ''} connected`
                  : 'Unable to connect'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            {lifxLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin text-caption" />
            ) : lights ? (
              <CheckCircle className="h-4 w-4 text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-400" />
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Timers section ──────────────────────────────────────────────────────────

function TimersSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: timers } = useQuery({
    queryKey: ['system', 'timers'],
    queryFn: api.system.getTimers,
    refetchInterval: 1000,
  })

  const cancelMutation = useMutation({
    mutationFn: api.system.cancelTimer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'timers'] })
      toast({ message: 'Timer cancelled' })
    },
    onError: () => toast({ message: 'Failed to cancel timer', type: 'error' }),
  })

  const cancelAllMutation = useMutation({
    mutationFn: api.system.cancelAllTimers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'timers'] })
      toast({ message: 'All timers cancelled' })
    },
    onError: () => toast({ message: 'Failed to cancel timers', type: 'error' }),
  })

  const formatRemaining = (startedAt: number, durationMs: number) => {
    const remaining = Math.max(0, startedAt + durationMs - Date.now())
    const secs = Math.ceil(remaining / 1000)
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    return `${mins}:${String(s).padStart(2, '0')}`
  }

  return (
    <Section title="Timers">
      {timers && timers.length > 0 ? (
        <div className="space-y-3">
          {timers.map(timer => (
            <div
              key={timer.id}
              className="surface flex items-center justify-between rounded-lg px-3 py-2"
            >
              <div>
                <p className="text-heading text-sm">
                  {timer.sceneName} → {timer.targetScene}
                </p>
                <p className="font-mono text-xs text-fairy-400">
                  {formatRemaining(timer.startedAt, timer.durationMs)}
                </p>
              </div>
              <button
                onClick={() => cancelMutation.mutate(timer.id)}
                disabled={cancelMutation.isPending}
                className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => cancelAllMutation.mutate()}
            disabled={cancelAllMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Cancel All
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-caption">
          <Timer className="h-4 w-4" />
          No active timers
        </div>
      )}
    </Section>
  )
}

// ── MTA line colour helpers ──────────────────────────────────────────────────

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

function LineBadge({ line, size = 'md' }: { line: string; size?: 'sm' | 'md' }) {
  const bg = MTA_LINE_COLORS[line] || '#808183'
  const textColor = ['N', 'Q', 'R', 'W'].includes(line) ? '#000' : '#fff'
  const dims = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs'
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full font-bold flex-shrink-0', dims)}
      style={{ backgroundColor: bg, color: textColor }}
      aria-label={`${line} train`}
    >
      {line}
    </span>
  )
}

// ── Subway section ──────────────────────────────────────────────────────────

function SubwaySection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showAddFlow, setShowAddFlow] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStop, setSelectedStop] = useState<MtaStop | null>(null)
  const [addDirection, setAddDirection] = useState<'N' | 'S'>('S')
  const [addWalkTime, setAddWalkTime] = useState(5)

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  const prefMutation = useMutation({
    mutationFn: (data: { key: string; value: string }) => api.system.setPreference(data.key, data.value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] }),
  })

  const { data: configuredStops = [] } = useQuery({
    queryKey: ['mta', 'configured'],
    queryFn: api.system.getMtaConfigured,
  })

  const { data: availableStops = [] } = useQuery({
    queryKey: ['mta', 'stops', searchQuery],
    queryFn: () => api.system.getMtaStops(searchQuery || undefined),
    enabled: showAddFlow,
  })

  const saveMutation = useMutation({
    mutationFn: (stops: ConfiguredStop[]) => api.system.saveMtaConfigured(stops),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mta'] })
      toast({ message: 'Subway stops saved' })
    },
    onError: () => toast({ message: 'Failed to save subway stops', type: 'error' }),
  })

  const updateStops = useCallback((newStops: ConfiguredStop[]) => {
    saveMutation.mutate(newStops)
  }, [saveMutation])

  const handleToggle = (index: number) => {
    const next = [...configuredStops]
    next[index] = { ...next[index], enabled: !next[index].enabled }
    updateStops(next)
  }

  const handleDelete = (index: number) => {
    const stop = configuredStops[index]
    if (!confirm(`Remove ${stop.name}?`)) return
    const next = configuredStops.filter((_, i) => i !== index)
    updateStops(next)
  }

  const handleWalkTimeChange = (index: number, delta: number) => {
    const next = [...configuredStops]
    const newTime = Math.max(1, Math.min(30, next[index].walkTime + delta))
    next[index] = { ...next[index], walkTime: newTime }
    updateStops(next)
  }

  const handleAddStop = () => {
    if (!selectedStop) return
    const newStop: ConfiguredStop = {
      stopId: selectedStop.stopId,
      name: selectedStop.name,
      direction: addDirection,
      routes: selectedStop.lines,
      feedGroup: selectedStop.feedGroup,
      walkTime: addWalkTime,
      enabled: true,
    }
    updateStops([...configuredStops, newStop])
    setShowAddFlow(false)
    setSelectedStop(null)
    setSearchQuery('')
    setAddWalkTime(5)
  }

  // Group search results by borough
  const groupedStops = useMemo(() => {
    const groups: Record<string, MtaStop[]> = {}
    for (const stop of availableStops) {
      if (!groups[stop.borough]) groups[stop.borough] = []
      groups[stop.borough].push(stop)
    }
    return groups
  }, [availableStops])

  return (
    <Section title="My Stations">
      {/* Configured stops list */}
      {configuredStops.length > 0 ? (
        <div className="space-y-3 mb-4">
          {configuredStops.map((stop, index) => (
            <div
              key={`${stop.stopId}-${stop.direction}-${index}`}
              className={cn(
                'surface rounded-lg border px-3 py-3 transition-opacity',
                !stop.enabled && 'opacity-40',
              )}
              style={{ borderColor: 'var(--border-secondary)' }}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Station info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-heading text-sm font-semibold truncate">
                      {stop.name}
                    </span>
                    <span className="flex items-center gap-0.5 text-caption text-xs flex-shrink-0">
                      {stop.direction === 'S' ? (
                        <><ArrowDown className="h-3 w-3" /> Downtown</>
                      ) : (
                        <><ArrowUp className="h-3 w-3" /> Uptown</>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {stop.routes.map(line => (
                      <LineBadge key={line} line={line} size="sm" />
                    ))}
                  </div>
                </div>

                {/* Walk time stepper */}
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleWalkTimeChange(index, -1)}
                    disabled={stop.walkTime <= 1}
                    className="surface flex h-8 w-8 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
                    style={{ borderColor: 'var(--border-secondary)' }}
                    aria-label="Decrease walk time"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-12 text-center text-sm font-medium text-heading">
                    {stop.walkTime} min
                  </span>
                  <button
                    onClick={() => handleWalkTimeChange(index, 1)}
                    disabled={stop.walkTime >= 30}
                    className="surface flex h-8 w-8 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
                    style={{ borderColor: 'var(--border-secondary)' }}
                    aria-label="Increase walk time"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-caption text-[10px]">walk</span>
                </div>

                {/* Toggle + Delete */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(index)}
                    className={cn(
                      'relative h-6 w-11 rounded-full transition-colors',
                      stop.enabled ? 'bg-fairy-500' : 'bg-[var(--bg-tertiary)]',
                    )}
                    role="switch"
                    aria-checked={stop.enabled}
                    aria-label={`${stop.enabled ? 'Disable' : 'Enable'} ${stop.name}`}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                        stop.enabled && 'translate-x-5',
                      )}
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-red-400"
                    aria-label={`Remove ${stop.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-sm text-caption">
          <Train className="h-4 w-4" />
          No stations configured. Add one below.
        </div>
      )}

      {/* Add station flow */}
      {showAddFlow ? (
        <div className="surface rounded-lg border p-4" style={{ borderColor: 'var(--border-secondary)' }}>
          {!selectedStop ? (
            <>
              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search stations..."
                  autoFocus
                  className="input-field w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:border-fairy-500 focus:outline-none"
                />
              </div>

              {/* Results grouped by borough */}
              <div className="max-h-64 overflow-y-auto space-y-3">
                {Object.entries(groupedStops).map(([borough, stops]) => (
                  <div key={borough}>
                    <p className="text-caption text-xs font-semibold tracking-wider mb-1.5">
                      {borough}
                    </p>
                    <div className="space-y-1">
                      {stops.map(stop => (
                        <button
                          key={stop.stopId}
                          onClick={() => setSelectedStop(stop)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-tertiary)] min-h-[44px]"
                        >
                          <div className="flex items-center gap-1">
                            {stop.lines.map(line => (
                              <LineBadge key={line} line={line} size="sm" />
                            ))}
                          </div>
                          <span className="text-heading text-sm">{stop.name}</span>
                          <span className="ml-auto text-caption text-xs">{stop.stopId}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {availableStops.length === 0 && searchQuery && (
                  <p className="text-caption text-sm py-4 text-center">No stations found</p>
                )}
              </div>

              <button
                onClick={() => { setShowAddFlow(false); setSearchQuery('') }}
                className="mt-3 w-full rounded-lg px-3 py-2 text-sm text-caption transition-colors hover:text-heading"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Configure selected stop */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  {selectedStop.lines.map(line => (
                    <LineBadge key={line} line={line} />
                  ))}
                  <span className="text-heading text-base font-semibold">{selectedStop.name}</span>
                </div>
                <p className="text-caption text-xs">Stop ID: {selectedStop.stopId}</p>
              </div>

              {/* Direction */}
              <div className="mb-4">
                <p className="text-heading text-sm mb-2">Direction</p>
                <div className="surface flex rounded-lg border" style={{ borderColor: 'var(--border-secondary)' }}>
                  {([
                    { value: 'S' as const, label: 'Downtown', icon: ArrowDown },
                    { value: 'N' as const, label: 'Uptown', icon: ArrowUp },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAddDirection(opt.value)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
                        addDirection === opt.value
                          ? 'bg-fairy-500 text-white'
                          : 'text-caption hover:text-[var(--text-primary)]',
                      )}
                    >
                      <opt.icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Walk time */}
              <div className="mb-4">
                <p className="text-heading text-sm mb-1">How long does it take you to walk there?</p>
                <p className="text-caption text-xs mb-2">We'll use this to tell you when to leave</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAddWalkTime(w => Math.max(1, w - 1))}
                    disabled={addWalkTime <= 1}
                    className="surface flex h-10 w-10 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
                    style={{ borderColor: 'var(--border-secondary)' }}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-16 text-center text-lg font-semibold text-heading">
                    {addWalkTime} min
                  </span>
                  <button
                    onClick={() => setAddWalkTime(w => Math.min(30, w + 1))}
                    disabled={addWalkTime >= 30}
                    className="surface flex h-10 w-10 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
                    style={{ borderColor: 'var(--border-secondary)' }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedStop(null)}
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm font-medium text-caption transition-colors hover:text-heading min-h-[44px]"
                >
                  Back
                </button>
                <button
                  onClick={handleAddStop}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-fairy-500 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-fairy-600 min-h-[44px]"
                >
                  <Plus className="h-4 w-4" />
                  Add Station
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowAddFlow(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-3 text-sm font-medium text-caption transition-colors hover:border-fairy-500 hover:text-fairy-400 min-h-[44px]"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <Plus className="h-4 w-4" />
          Add Station
        </button>
      )}

      {/* Max wait threshold */}
      <div className="mt-4 surface rounded-lg border px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-heading text-sm">How long will you wait?</p>
            <p className="text-caption text-xs">If the next train is further away than this, we'll let you know it's a long wait</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const cur = Number(prefs?.mta_max_wait || 6)
                if (cur > 1) prefMutation.mutate({ key: 'mta_max_wait', value: String(cur - 1) })
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg surface border text-heading"
            >
              -
            </button>
            <span className="text-heading text-sm font-medium w-12 text-center">
              {prefs?.mta_max_wait || '6'} min
            </span>
            <button
              onClick={() => {
                const cur = Number(prefs?.mta_max_wait || 6)
                prefMutation.mutate({ key: 'mta_max_wait', value: String(cur + 1) })
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg surface border text-heading"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-caption">
        <Train className="h-3.5 w-3.5" />
        We'll tell you when to leave based on your walk time
      </div>
    </Section>
  )
}

// ── Indicator Light section ─────────────────────────────────────────────────

function IndicatorSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: indicatorConfig } = useQuery({
    queryKey: ['mta', 'indicator'],
    queryFn: api.system.getMtaIndicator,
  })

  const { data: lights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    retry: false,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const saveMutation = useMutation({
    mutationFn: (config: MtaIndicatorConfig) => api.system.saveMtaIndicator(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mta', 'indicator'] })
      toast({ message: 'Indicator settings saved' })
    },
    onError: () => toast({ message: 'Failed to save indicator settings', type: 'error' }),
  })

  const testMutation = useMutation({
    mutationFn: api.system.testMtaIndicator,
    onSuccess: (data) => {
      const statusLabels: Record<string, string> = {
        green: 'Green — leave soon',
        orange: 'Orange — leave now',
        red: 'Red — no good trains soon',
        none: 'No data',
      }
      toast({ message: `Indicator test: ${statusLabels[data.status] || data.status} (updating for ${data.windowMinutes} min)` })
    },
    onError: () => toast({ message: 'Indicator test failed', type: 'error' }),
  })

  const config: MtaIndicatorConfig = indicatorConfig ?? {
    enabled: false,
    lightId: '',
    lightLabel: '',
    sensorName: '',
  }

  const updateConfig = (patch: Partial<MtaIndicatorConfig>) => {
    saveMutation.mutate({ ...config, ...patch })
  }

  // Extract all sensors from rooms
  const allSensors = useMemo(() => {
    if (!rooms) return []
    const sensors: { name: string; room: string }[] = []
    for (const room of rooms) {
      if (room.sensors) {
        for (const sensor of room.sensors) {
          sensors.push({ name: sensor.name, room: room.name })
        }
      }
    }
    return sensors
  }, [rooms])

  const canTest = config.enabled && config.lightId

  return (
    <Section title="Indicator Light">
      <p className="text-caption text-xs mb-4">
        When a sensor triggers, a light changes colour to show your subway status.
      </p>

      {/* Status preview dots */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#22c55e' }} />
          <span className="text-xs text-caption">Leave soon</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#f97316' }} />
          <span className="text-xs text-caption">Leave now</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
          <span className="text-xs text-caption">Too late</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Light selector */}
        <div>
          <label htmlFor="indicator-light" className="text-heading text-sm mb-1.5 block">
            Light
          </label>
          <div className="relative">
            <Lightbulb className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <select
              id="indicator-light"
              value={config.lightId}
              onChange={(e) => {
                const light = lights?.find(l => l.id === e.target.value)
                updateConfig({
                  lightId: e.target.value,
                  lightLabel: light?.label ?? '',
                })
              }}
              className="input-field h-11 w-full appearance-none rounded-lg border py-2 pl-9 pr-8 text-sm focus:border-fairy-500 focus:outline-none"
            >
              <option value="">Select a light</option>
              {lights?.map(light => (
                <option key={light.id} value={light.id}>
                  {light.label}{light.group?.name ? ` (${light.group.name})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>

        {/* Sensor selector */}
        <div>
          <label htmlFor="indicator-sensor" className="text-heading text-sm mb-1.5 block">
            Trigger sensor
          </label>
          <div className="relative">
            <select
              id="indicator-sensor"
              value={config.sensorName}
              onChange={(e) => updateConfig({ sensorName: e.target.value })}
              className="input-field h-11 w-full appearance-none rounded-lg border py-2 pl-3 pr-8 text-sm focus:border-fairy-500 focus:outline-none"
            >
              <option value="">Select a sensor</option>
              {allSensors
                .filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i)
                .map(sensor => (
                <option key={`${sensor.name}-${sensor.room}`} value={sensor.name}>
                  {sensor.name} ({sensor.room})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>

        {/* Enable toggle + Test button */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateConfig({ enabled: !config.enabled })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                config.enabled ? 'bg-fairy-500' : 'bg-[var(--bg-tertiary)]',
              )}
              role="switch"
              aria-checked={config.enabled}
              aria-label={config.enabled ? 'Disable indicator' : 'Enable indicator'}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                  config.enabled && 'translate-x-5',
                )}
              />
            </button>
            <span className="text-heading text-sm">{config.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>

          <button
            onClick={() => testMutation.mutate()}
            disabled={!canTest || testMutation.isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
              canTest
                ? 'bg-fairy-500 text-white hover:bg-fairy-600'
                : 'surface text-caption opacity-50 cursor-not-allowed',
            )}
          >
            <Play className="h-4 w-4" />
            {testMutation.isPending ? 'Testing...' : 'Test'}
          </button>
        </div>
      </div>
    </Section>
  )
}

// ── Weather Indicator section ────────────────────────────────────────────────

function WeatherIndicatorSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: weatherConfig } = useQuery({
    queryKey: ['weather', 'indicator'],
    queryFn: api.system.getWeatherIndicator,
  })

  const { data: weatherColors } = useQuery({
    queryKey: ['weather', 'colors'],
    queryFn: api.system.getWeatherColors,
  })

  const { data: lights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    retry: false,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const saveMutation = useMutation({
    mutationFn: (config: WeatherIndicatorConfig) => api.system.saveWeatherIndicator(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weather', 'indicator'] })
      toast({ message: 'Weather light settings saved' })
    },
    onError: () => toast({ message: 'Failed to save weather light settings', type: 'error' }),
  })

  const testMutation = useMutation({
    mutationFn: api.system.testWeatherIndicator,
    onSuccess: (data) => {
      const colorEntry = weatherColors?.[data.condition]
      toast({ message: `Weather light: ${colorEntry?.name || data.condition}` })
    },
    onError: () => toast({ message: 'Weather light test failed', type: 'error' }),
  })

  const config: WeatherIndicatorConfig = weatherConfig ?? {
    enabled: false,
    lightId: '',
    lightLabel: '',
    intervalMinutes: 15,
    mode: 'always',
    brightness: 0.5,
  }

  // Local brightness state for smooth slider without toast spam
  const [localBrightness, setLocalBrightness] = useState<number | null>(null)
  const displayBrightness = localBrightness ?? Math.round(config.brightness * 100)

  const updateConfig = (patch: Partial<WeatherIndicatorConfig>) => {
    saveMutation.mutate({ ...config, ...patch })
  }

  // Extract all sensors from rooms
  const allSensors = useMemo(() => {
    if (!rooms) return []
    const sensors: { name: string; room: string }[] = []
    for (const room of rooms) {
      if (room.sensors) {
        for (const sensor of room.sensors) {
          sensors.push({ name: sensor.name, room: room.name })
        }
      }
    }
    return sensors
  }, [rooms])

  // ── Custom colour state ──────────────────────────────────────────────────
  const { data: customColors } = useQuery({
    queryKey: ['weather', 'custom-colors'],
    queryFn: api.system.getWeatherCustomColors,
  })

  const [editingCondition, setEditingCondition] = useState<string | null>(null)
  const [editColor, setEditColor] = useState<{ h: number; s: number; v: number }>({ h: 0, s: 100, v: 100 })
  const [previewingCondition, setPreviewingCondition] = useState<string | null>(null)

  const previewMutation = useMutation({
    mutationFn: (params: { color: string; conditionKey: string; name: string }) =>
      api.system.previewWeatherColor(params.color),
    onMutate: (params) => {
      setPreviewingCondition(params.conditionKey)
      setTimeout(() => setPreviewingCondition(null), 5000)
    },
    onSuccess: (_data, params) => {
      toast({ message: `Previewing ${params.name} on ${config.lightLabel || 'light'}` })
    },
    onError: () => {
      setPreviewingCondition(null)
      toast({ message: 'Could not preview colour', type: 'error' })
    },
  })

  const saveCustomColorMutation = useMutation({
    mutationFn: (params: { condition: string; color: string; hex: string }) =>
      api.system.saveWeatherCustomColor(params.condition, params.color, params.hex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weather', 'custom-colors'] })
      setEditingCondition(null)
      toast({ message: 'Custom colour saved' })
    },
    onError: () => toast({ message: 'Failed to save custom colour', type: 'error' }),
  })

  const resetAllColorsMutation = useMutation({
    mutationFn: api.system.resetWeatherCustomColors,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weather', 'custom-colors'] })
      toast({ message: 'Colours reset to defaults' })
    },
    onError: () => toast({ message: 'Failed to reset colours', type: 'error' }),
  })

  const handleStartEdit = useCallback((key: string, currentHex: string) => {
    // Parse hex to approximate HSV for the picker initial state
    const r = parseInt(currentHex.slice(1, 3), 16) / 255
    const g = parseInt(currentHex.slice(3, 5), 16) / 255
    const b = parseInt(currentHex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    let h = 0
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
      else if (max === g) h = ((b - r) / d + 2) * 60
      else h = ((r - g) / d + 4) * 60
    }
    const s = max === 0 ? 0 : (d / max) * 100
    const v = max * 100
    setEditColor({ h, s, v })
    setEditingCondition(key)
  }, [])

  const handleSaveCustomColor = useCallback(() => {
    if (!editingCondition) return
    const lifxColor = `hue:${editColor.h.toFixed(1)} saturation:${(editColor.s / 100).toFixed(2)}`
    const hex = hsbToHex(editColor.h, editColor.s / 100, editColor.v / 100)
    saveCustomColorMutation.mutate({ condition: editingCondition, color: lifxColor, hex })
  }, [editingCondition, editColor, saveCustomColorMutation])

  const handleResetSingleColor = useCallback((condition: string) => {
    if (!customColors) return
    const updated = { ...customColors }
    delete updated[condition]
    // Reset all, then re-save the remaining custom colours
    api.system.resetWeatherCustomColors().then(() => {
      const remaining = Object.entries(updated)
      const saveRemaining = async () => {
        for (const [key, val] of remaining) {
          await api.system.saveWeatherCustomColor(key, val.color, val.hex)
        }
      }
      saveRemaining().then(() => {
        queryClient.invalidateQueries({ queryKey: ['weather', 'custom-colors'] })
        setEditingCondition(null)
        toast({ message: 'Colour reset to default' })
      })
    })
  }, [customColors, queryClient, toast])

  const hasAnyCustomColors = customColors && Object.keys(customColors).length > 0

  const canTest = config.enabled && config.lightId

  return (
    <Section title="Weather Light">
      <p className="text-caption text-xs mb-4">
        A light changes colour to match the current weather forecast
      </p>

      <div className="space-y-4">
        {/* Light selector */}
        <div>
          <label htmlFor="weather-light" className="text-heading text-sm mb-1.5 block">
            Light
          </label>
          <div className="relative">
            <Cloud className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <select
              id="weather-light"
              value={config.lightId}
              onChange={(e) => {
                const light = lights?.find(l => l.id === e.target.value)
                updateConfig({
                  lightId: e.target.value,
                  lightLabel: light?.label ?? '',
                })
              }}
              className="input-field h-11 w-full appearance-none rounded-lg border py-2 pl-9 pr-8 text-sm focus:border-fairy-500 focus:outline-none"
            >
              <option value="">Select a light</option>
              {lights?.map(light => (
                <option key={light.id} value={light.id}>
                  {light.label}{light.group?.name ? ` (${light.group.name})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>

        {/* Mode selector */}
        <div>
          <p className="text-heading text-sm mb-1.5">Mode</p>
          <div className="surface flex rounded-lg border" style={{ borderColor: 'var(--border-secondary)' }}>
            <button
              onClick={() => updateConfig({ mode: 'always' })}
              aria-pressed={config.mode === 'always'}
              className={cn(
                'flex-1 px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] rounded-l-lg',
                config.mode === 'always'
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              Always on
            </button>
            <button
              onClick={() => updateConfig({ mode: 'sensor' })}
              aria-pressed={config.mode === 'sensor'}
              className={cn(
                'flex-1 px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] rounded-r-lg',
                config.mode === 'sensor'
                  ? 'bg-fairy-500 text-white'
                  : 'text-caption hover:text-[var(--text-primary)]',
              )}
            >
              Sensor trigger
            </button>
          </div>
        </div>

        {/* Sensor selector (only in sensor mode) */}
        {config.mode === 'sensor' && (
          <div>
            <label htmlFor="weather-sensor" className="text-heading text-sm mb-1.5 block">
              Trigger sensor
            </label>
            <div className="relative">
              <select
                id="weather-sensor"
                value={config.sensorName ?? ''}
                onChange={(e) => updateConfig({ sensorName: e.target.value })}
                className="input-field h-11 w-full appearance-none rounded-lg border py-2 pl-3 pr-8 text-sm focus:border-fairy-500 focus:outline-none"
              >
                <option value="">Select a sensor</option>
                {allSensors
                  .filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i)
                  .map(sensor => (
                  <option key={`${sensor.name}-${sensor.room}`} value={sensor.name}>
                    {sensor.name} ({sensor.room})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>
          </div>
        )}

        {/* Brightness slider */}
        <div>
          <label htmlFor="weather-brightness" className="text-heading text-sm mb-1.5 block">
            Brightness
          </label>
          <div className="flex items-center gap-3">
            <input
              id="weather-brightness"
              type="range"
              min={5}
              max={100}
              step={5}
              value={displayBrightness}
              onChange={(e) => setLocalBrightness(Number(e.target.value))}
              onPointerUp={() => {
                if (localBrightness !== null) {
                  updateConfig({ brightness: localBrightness / 100 })
                  setLocalBrightness(null)
                }
              }}
              onKeyUp={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  updateConfig({ brightness: displayBrightness / 100 })
                  setLocalBrightness(null)
                }
              }}
              className="fairy-slider flex-1"
              style={{ background: `linear-gradient(to right, var(--bg-tertiary), #ffd919)` }}
              aria-label="Weather light brightness"
            />
            <span className="w-10 text-right text-sm font-medium text-heading">
              {displayBrightness}%
            </span>
          </div>
        </div>

        {/* Check interval stepper */}
        <div>
          <p className="text-heading text-sm mb-1.5">Check every</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateConfig({ intervalMinutes: Math.max(5, config.intervalMinutes - 5) })}
              disabled={config.intervalMinutes <= 5}
              className="surface flex h-11 w-11 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
              style={{ borderColor: 'var(--border-secondary)' }}
              aria-label="Decrease check interval"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-16 text-center text-sm font-medium text-heading">
              {config.intervalMinutes} min
            </span>
            <button
              onClick={() => updateConfig({ intervalMinutes: Math.min(60, config.intervalMinutes + 5) })}
              disabled={config.intervalMinutes >= 60}
              className="surface flex h-11 w-11 items-center justify-center rounded-lg border text-heading transition-colors hover:brightness-95 dark:hover:brightness-110 disabled:opacity-30"
              style={{ borderColor: 'var(--border-secondary)' }}
              aria-label="Increase check interval"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Enable toggle + Test button */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateConfig({ enabled: !config.enabled })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                config.enabled ? 'bg-fairy-500' : 'bg-[var(--bg-tertiary)]',
              )}
              role="switch"
              aria-checked={config.enabled}
              aria-label={config.enabled ? 'Disable weather light' : 'Enable weather light'}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                  config.enabled && 'translate-x-5',
                )}
              />
            </button>
            <span className="text-heading text-sm">{config.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>

          <button
            onClick={() => testMutation.mutate()}
            disabled={!canTest || testMutation.isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
              canTest
                ? 'bg-fairy-500 text-white hover:bg-fairy-600'
                : 'surface text-caption opacity-50 cursor-not-allowed',
            )}
          >
            <Play className="h-4 w-4" />
            {testMutation.isPending ? 'Testing...' : 'Test'}
          </button>
        </div>

        {/* Colour Reference — interactive preview + customisation */}
        {weatherColors && (
          <div className="mt-2 rounded-lg border p-4" style={{ borderColor: 'var(--border-secondary)' }}>
            <p className="text-caption text-xs font-semibold mb-3">
              Colour reference
            </p>

            {!config.lightId && (
              <p className="text-caption text-xs mb-3 italic">
                Select a light above to preview colours
              </p>
            )}

            <div className="space-y-1">
              {Object.entries(weatherColors).map(([key, entry]) => {
                const custom = customColors?.[key]
                const displayHex = custom?.hex || entry.hex
                const displayColor = custom?.color || entry.color
                const isCustomised = !!custom
                const isPreviewing = previewingCondition === key
                const isEditing = editingCondition === key

                return (
                  <div key={key}>
                    <div className="flex items-center gap-3 py-1.5">
                      {/* Colour swatch — tappable for preview */}
                      <div className="relative shrink-0">
                        <button
                          onClick={() => {
                            if (!config.lightId) return
                            previewMutation.mutate({ color: displayColor, conditionKey: key, name: entry.name })
                          }}
                          disabled={!config.lightId}
                          className={cn(
                            'h-10 w-10 rounded-full shrink-0 transition-all active:scale-90',
                            'ring-2 ring-offset-2 ring-offset-[var(--bg-primary)]',
                            isPreviewing
                              ? 'ring-fairy-500 scale-95'
                              : config.lightId
                                ? 'ring-transparent hover:ring-fairy-500/50'
                                : 'ring-transparent opacity-80 cursor-default',
                          )}
                          style={{ backgroundColor: displayHex }}
                          title={config.lightId ? `Preview ${entry.name} on light` : 'Select a light to preview'}
                          aria-label={`Preview ${entry.name}`}
                        />
                        {/* Custom colour indicator dot */}
                        {isCustomised && (
                          <span
                            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-fairy-500 border-2 border-[var(--bg-primary)]"
                            aria-label="Customised"
                          />
                        )}
                      </div>

                      {/* Label + description */}
                      <div className="flex-1 min-w-0">
                        <p className="text-heading text-sm leading-tight truncate">
                          {entry.name}
                          {isPreviewing && (
                            <span className="ml-1.5 text-fairy-500 text-xs font-normal">Previewing</span>
                          )}
                        </p>
                        <p className="text-caption text-[11px] leading-tight">{entry.description}</p>
                      </div>

                      {/* Edit button */}
                      <button
                        onClick={() => {
                          if (isEditing) {
                            setEditingCondition(null)
                          } else {
                            handleStartEdit(key, displayHex)
                          }
                        }}
                        className={cn(
                          'p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center',
                          isEditing
                            ? 'text-fairy-500 bg-fairy-500/10'
                            : 'text-caption hover:text-heading hover:bg-[var(--bg-tertiary)]',
                        )}
                        aria-label={isEditing ? `Close ${entry.name} editor` : `Edit ${entry.name} colour`}
                      >
                        <Palette className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Inline colour picker when editing */}
                    {isEditing && (
                      <div className="mt-1 mb-3 ml-[52px] rounded-lg border p-3" style={{ borderColor: 'var(--border-secondary)' }}>
                        <div className="weather-color-picker">
                          <HsvColorPicker
                            color={editColor}
                            onChange={setEditColor}
                          />
                        </div>

                        {/* Preview of chosen colour */}
                        <div className="mt-3 flex items-center gap-2">
                          <span
                            className="h-6 w-6 rounded-full shrink-0"
                            style={{ backgroundColor: hsbToHex(editColor.h, editColor.s / 100, editColor.v / 100) }}
                            aria-hidden="true"
                          />
                          <span className="text-caption text-xs">
                            H:{Math.round(editColor.h)} S:{Math.round(editColor.s)}% V:{Math.round(editColor.v)}%
                          </span>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={handleSaveCustomColor}
                            disabled={saveCustomColorMutation.isPending}
                            className="flex-1 rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 min-h-[44px]"
                          >
                            {saveCustomColorMutation.isPending ? 'Saving...' : 'Save colour'}
                          </button>
                          <button
                            onClick={() => setEditingCondition(null)}
                            className="rounded-lg px-3 py-2 text-sm font-medium text-caption transition-colors hover:text-heading hover:bg-[var(--bg-tertiary)] min-h-[44px]"
                          >
                            Cancel
                          </button>
                          {isCustomised && (
                            <button
                              onClick={() => handleResetSingleColor(key)}
                              className="rounded-lg px-3 py-2 text-sm font-medium text-caption transition-colors hover:text-heading hover:bg-[var(--bg-tertiary)] min-h-[44px]"
                              title="Reset to default colour"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Reset all button */}
            {hasAnyCustomColors && (
              <button
                onClick={() => resetAllColorsMutation.mutate()}
                disabled={resetAllColorsMutation.isPending}
                className="mt-3 flex items-center gap-1.5 text-caption text-xs transition-colors hover:text-heading"
              >
                <RotateCcw className="h-3 w-3" />
                {resetAllColorsMutation.isPending ? 'Resetting...' : 'Reset all to defaults'}
              </button>
            )}

            {/* Scoped styles for the compact weather colour picker */}
            <style>{`
              .weather-color-picker .react-colorful {
                width: 100% !important;
                height: auto !important;
                gap: 12px;
              }
              .weather-color-picker .react-colorful__saturation {
                min-height: 160px;
                border-radius: 10px !important;
                border-bottom: none !important;
              }
              .weather-color-picker .react-colorful__last-control,
              .weather-color-picker .react-colorful__hue {
                height: 28px !important;
                border-radius: 14px !important;
              }
              .weather-color-picker .react-colorful__interactive {
                outline: none;
              }
              .weather-color-picker .react-colorful__pointer {
                width: 26px !important;
                height: 26px !important;
                border: 3px solid white !important;
                box-shadow: 0 0 0 1.5px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.35) !important;
              }
              .weather-color-picker .react-colorful__hue-pointer {
                width: 30px !important;
                height: 30px !important;
              }
              .weather-color-picker .react-colorful__interactive:focus .react-colorful__pointer {
                box-shadow: 0 0 0 2px #10b981, 0 0 0 4px rgba(16,185,129,0.3), 0 2px 8px rgba(0,0,0,0.35) !important;
              }
            `}</style>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Data management section ──────────────────────────────────────────────────

type DeleteConfirmState =
  | { type: 'all' }
  | { type: 'older-than'; label: string; isoDate: string }
  | { type: 'by-source'; source: string }
  | null

const AGE_OPTIONS: { label: string; months: number }[] = [
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
]

function getIsoDateMonthsAgo(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString()
}

function formatOldestRecord(value: string | null): string {
  if (!value) return 'No data collected yet'
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function DataManagementSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [confirmState, setConfirmState] = useState<DeleteConfirmState>(null)
  const [selectedAge, setSelectedAge] = useState(AGE_OPTIONS[0])
  const [selectedSource, setSelectedSource] = useState<string>('')

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: api.dashboard.getStats,
    refetchOnWindowFocus: false,
  })

  // Keep selectedSource in sync when sources load
  const sources = stats?.sources ?? []
  const resolvedSource = selectedSource || sources[0]?.source || ''

  const deleteMutation = useMutation({
    mutationFn: api.dashboard.deleteHistory,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
      setConfirmState(null)
      const count = result.deleted
      toast({
        message: count > 0 ? `Deleted ${count.toLocaleString()} record${count === 1 ? '' : 's'}` : 'No records matched',
      })
    },
    onError: () => toast({ message: 'Failed to delete records', type: 'error' }),
  })

  const handleConfirm = () => {
    if (!confirmState) return
    if (confirmState.type === 'all') {
      deleteMutation.mutate({ all: true })
    } else if (confirmState.type === 'older-than') {
      deleteMutation.mutate({ olderThan: confirmState.isoDate })
    } else if (confirmState.type === 'by-source') {
      deleteMutation.mutate({ source: confirmState.source })
    }
  }

  const totalRows = stats?.totalRows ?? 0

  return (
    <Section title="Data management">
      {/* Database info */}
      <div className="mb-5 space-y-2">
        {statsLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-secondary)]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-secondary)]" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--bg-secondary)]" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Database size</span>
              <span className="text-heading">{stats ? `${stats.dbSizeMB.toFixed(1)} MB` : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Historical readings</span>
              <span className="text-heading">{stats ? `${totalRows.toLocaleString()} records` : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Data since</span>
              <span className="text-heading">{formatOldestRecord(stats?.oldestRecord ?? null)}</span>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="mb-4 border-t" style={{ borderColor: 'var(--border-secondary)' }} />

      <div className="space-y-4">
        {/* Clear all */}
        <div className="space-y-2">
          <button
            onClick={() => setConfirmState({ type: 'all' })}
            disabled={deleteMutation.isPending || totalRows === 0}
            className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
          >
            Clear all historical data
          </button>
          {confirmState?.type === 'all' && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
              <p className="mb-3 text-red-400">
                This will permanently delete all {totalRows.toLocaleString()} records. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50 min-h-[44px]"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Confirm delete'}
                </button>
                <button
                  onClick={() => setConfirmState(null)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50 min-h-[44px]"
                  style={{ borderColor: 'var(--border-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clear older than */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor="data-age-select" className="text-sm text-[var(--text-secondary)]">
              Clear data older than
            </label>
            <select
              id="data-age-select"
              value={selectedAge.months}
              onChange={e => {
                const months = Number(e.target.value)
                setSelectedAge(AGE_OPTIONS.find(o => o.months === months) ?? AGE_OPTIONS[0])
              }}
              className="rounded-lg border bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] min-h-[44px]"
              style={{ borderColor: 'var(--border-secondary)' }}
            >
              {AGE_OPTIONS.map(o => (
                <option key={o.months} value={o.months}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const isoDate = getIsoDateMonthsAgo(selectedAge.months)
                setConfirmState({ type: 'older-than', label: selectedAge.label, isoDate })
              }}
              disabled={deleteMutation.isPending || totalRows === 0}
              className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
            >
              Delete
            </button>
          </div>
          {confirmState?.type === 'older-than' && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
              <p className="mb-3 text-red-400">
                This will permanently delete all records older than {confirmState.label}. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50 min-h-[44px]"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Confirm delete'}
                </button>
                <button
                  onClick={() => setConfirmState(null)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50 min-h-[44px]"
                  style={{ borderColor: 'var(--border-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clear by source */}
        {sources.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="data-source-select" className="text-sm text-[var(--text-secondary)]">
                Clear data by type
              </label>
              <select
                id="data-source-select"
                value={resolvedSource}
                onChange={e => setSelectedSource(e.target.value)}
                className="rounded-lg border bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] min-h-[44px]"
                style={{ borderColor: 'var(--border-secondary)' }}
              >
                {sources.map(s => (
                  <option key={s.source} value={s.source}>
                    {s.source} ({s.count.toLocaleString()} records)
                  </option>
                ))}
              </select>
              <button
                onClick={() => setConfirmState({ type: 'by-source', source: resolvedSource })}
                disabled={deleteMutation.isPending || !resolvedSource}
                className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
              >
                Delete
              </button>
            </div>
            {confirmState?.type === 'by-source' && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                <p className="mb-3 text-red-400">
                  This will permanently delete all records with source "{confirmState.source}". This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirm}
                    disabled={deleteMutation.isPending}
                    className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50 min-h-[44px]"
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Confirm delete'}
                  </button>
                  <button
                    onClick={() => setConfirmState(null)}
                    disabled={deleteMutation.isPending}
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50 min-h-[44px]"
                    style={{ borderColor: 'var(--border-secondary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

// ── System section ──────────────────────────────────────────────────────────

function SystemSection() {
  const { data: health } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: api.system.health,
  })

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <Section title="System">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Version</span>
          <span className="text-heading">3.0.0</span>
        </div>
        {health && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Uptime</span>
              <span className="text-heading">{formatUptime(health.uptime)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Database</span>
              <span
                className={cn(
                  'text-sm',
                  health.db === 'connected' ? 'text-green-400' : 'text-red-400',
                )}
              >
                {health.db}
              </span>
            </div>
          </>
        )}
        <div className="pt-2">
          <Link
            to="/settings/logs"
            className="surface flex items-center gap-2 rounded-lg px-3 py-2.5 text-heading text-sm transition-colors hover:brightness-95 dark:hover:brightness-110"
          >
            <FileText className="h-4 w-4" />
            View System Logs
          </Link>
        </div>
      </div>
    </Section>
  )
}

// ── Category accordion ───────────────────────────────────────────────────────

type CategoryId = 'preferences' | 'modes-and-schedule' | 'public-transport' | 'weather' | 'system'

function CategoryAccordion({
  categoryId,
  label,
  isOpen,
  onToggle,
  children,
}: {
  categoryId: CategoryId
  label: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const headingId = `category-heading-${categoryId}`
  const panelId = `category-panel-${categoryId}`

  return (
    <div>
      <button
        id={headingId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className={cn(
          'flex w-full items-center justify-between py-3 text-left transition-colors',
          'min-h-[44px]',
          !isOpen && 'border-b border-[var(--border-secondary)]',
        )}
      >
        <span className="text-heading text-base font-semibold">{label}</span>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-[var(--text-secondary)] transition-transform duration-300',
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
          <div className="space-y-4 pt-3 pb-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Settings page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [openCategory, setOpenCategory] = useState<CategoryId | null>('preferences')

  const handleToggle = (id: CategoryId) => {
    setOpenCategory(prev => (prev === id ? null : id))
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Settings className="h-5 w-5 text-fairy-400" />
        <h1 className="text-heading text-lg font-semibold">Settings</h1>
      </div>

      <div className="divide-y divide-[var(--border-secondary)]">
        <CategoryAccordion
          categoryId="preferences"
          label="Preferences"
          isOpen={openCategory === 'preferences'}
          onToggle={() => handleToggle('preferences')}
        >
          <ThemeSection />
          <GeneralSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="modes-and-schedule"
          label="Modes and schedule"
          isOpen={openCategory === 'modes-and-schedule'}
          onToggle={() => handleToggle('modes-and-schedule')}
        >
          <ModesSection />
          <NightModeSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="public-transport"
          label="Public transport"
          isOpen={openCategory === 'public-transport'}
          onToggle={() => handleToggle('public-transport')}
        >
          <SubwaySection />
          <IndicatorSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="weather"
          label="Weather"
          isOpen={openCategory === 'weather'}
          onToggle={() => handleToggle('weather')}
        >
          <WeatherIndicatorSection />
        </CategoryAccordion>

        <CategoryAccordion
          categoryId="system"
          label="System"
          isOpen={openCategory === 'system'}
          onToggle={() => handleToggle('system')}
        >
          <DevicesSection />
          <TimersSection />
          <DataManagementSection />
          <SystemSection />
        </CategoryAccordion>
      </div>
    </div>
  )
}
