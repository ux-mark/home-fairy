import { useState } from 'react'
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
} from 'lucide-react'
import { api } from '@/lib/api'
import type { SunScheduleEntry } from '@/lib/api'
import { cn } from '@/lib/utils'
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
      <h3 className="text-caption mb-4 text-sm font-semibold uppercase tracking-wider">
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

  return (
    <Section title="General">
      <div className="flex items-center justify-between">
        <span className="text-heading text-sm">Temperature Unit</span>
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
    </Section>
  )
}

// ── Modes section ───────────────────────────────────────────────────────────

function ModesSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [newMode, setNewMode] = useState('')

  const { data: modes } = useQuery({
    queryKey: ['system', 'modes'],
    queryFn: api.system.getModes,
  })

  const addMutation = useMutation({
    mutationFn: api.system.addMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
      setNewMode('')
      toast({ message: 'Mode added' })
    },
    onError: () => toast({ message: 'Failed to add mode', type: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: api.system.deleteMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
      toast({ message: 'Mode removed' })
    },
    onError: () => toast({ message: 'Failed to remove mode', type: 'error' }),
  })

  const handleAdd = () => {
    const trimmed = newMode.trim()
    if (!trimmed) return
    addMutation.mutate(trimmed)
  }

  const handleDelete = (mode: string) => {
    if (!confirm(`Remove mode "${mode}"?`)) return
    deleteMutation.mutate(mode)
  }

  return (
    <Section title="Modes">
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={newMode}
          onChange={e => setNewMode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="New mode name..."
          className="input-field flex-1 rounded-lg border px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:border-fairy-500 focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newMode.trim() || addMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {modes?.map(mode => (
          <span
            key={mode}
            className="surface inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-heading"
          >
            {mode}
            <button
              onClick={() => handleDelete(mode)}
              className="rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {modes?.length === 0 && (
          <p className="text-caption text-sm">No modes configured.</p>
        )}
      </div>
    </Section>
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

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.system.setPreference(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] })
      toast({ message: 'Night mode settings saved' })
    },
    onError: () => toast({ message: 'Failed to save settings', type: 'error' }),
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
        <div>
          <p className="text-heading text-sm mb-1">Nighttime excluded rooms</p>
          <p className="text-caption text-xs mb-3">
            These rooms keep their lights on when you tap Nighttime.
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

        <div className="border-t border-[var(--border-secondary)] pt-5">
          <p className="text-heading text-sm mb-1">Guest night excluded rooms</p>
          <p className="text-caption text-xs mb-3">
            These rooms keep their lights on when you tap Guest Night.
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
      </div>
    </Section>
  )
}

// ── Sun Schedule section ────────────────────────────────────────────────────

function SunScheduleSection() {
  const { data: schedule } = useQuery({
    queryKey: ['system', 'sun-schedule'],
    queryFn: api.system.getSunSchedule,
    refetchInterval: 60_000,
  })

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const formatPhase = (phase: string) =>
    phase.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())

  return (
    <Section title="Sun Schedule">
      {schedule && schedule.length > 0 ? (
        <div className="space-y-2">
          {schedule.map((entry: SunScheduleEntry) => (
            <div
              key={entry.sunPhase}
              className={cn(
                'surface flex items-center justify-between rounded-lg px-3 py-2',
                entry.isPast && 'opacity-40',
              )}
            >
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-400" />
                <div>
                  <p className="text-heading text-sm">{entry.mode}</p>
                  <p className="text-caption text-xs">{formatPhase(entry.sunPhase)}</p>
                </div>
              </div>
              <span className="font-mono text-sm text-[var(--text-secondary)]">
                {formatTime(entry.time)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-caption">
          <Sun className="h-4 w-4" />
          No sun schedule available
        </div>
      )}
    </Section>
  )
}

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

// ── Settings page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Settings className="h-5 w-5 text-fairy-400" />
        <h1 className="text-heading text-lg font-semibold">Settings</h1>
      </div>

      <div className="space-y-4">
        <ThemeSection />
        <GeneralSection />
        <ModesSection />
        <NightModeSection />
        <SunScheduleSection />
        <DevicesSection />
        <TimersSection />
        <SystemSection />
      </div>
    </div>
  )
}
