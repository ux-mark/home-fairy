import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { ModeWithTriggers, ModeTrigger, SunScheduleEntry } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { SUN_EVENT_LABELS } from './modeUtils'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { SkeletonList } from '@/components/ui/Skeleton'

export { SUN_EVENT_LABELS } from './modeUtils'

// ── Helper: format days array ─────────────────────────────────────────────────

function formatDays(days: number[]): string {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  if (!days || days.length === 0 || days.length === 7) return 'Daily'
  if (days.length === 5 && [0, 1, 2, 3, 4].every(d => days.includes(d)))
    return 'Weekdays'
  if (days.length === 2 && [5, 6].every(d => days.includes(d))) return 'Weekends'
  return days
    .sort((a, b) => a - b)
    .map(d => dayNames[d])
    .join(', ')
}

// ── Helper: format a trigger time string ("HH:MM") in the user's locale ──────

function formatTriggerTime(timeStr: string): string {
  // timeStr is "HH:MM" (24-hour). Build a Date in today's local time.
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ── Helper: build the trigger summary string shown below the mode name ────────

function buildTriggerSummary(triggers: ModeTrigger[]): string {
  const active = triggers.filter(t => t.enabled)
  if (active.length === 0) return 'Manual only'

  const parts = active.map(t => {
    if (t.type === 'sun' && t.sunEvent) {
      const label = SUN_EVENT_LABELS[t.sunEvent] ?? t.sunEvent
      return `Sun: ${label}`
    }
    if (t.type === 'time' && t.time) {
      const days = formatDays(t.days ?? [])
      const formatted = formatTriggerTime(t.time)
      if (days === 'Daily') return `Daily at ${formatted}`
      return `${days} at ${formatted}`
    }
    return null
  })

  return parts.filter(Boolean).join(' · ')
}

// ── Helper: find the next scheduled time across all enabled triggers ──────────

function getNextScheduledTime(
  triggers: ModeTrigger[],
  sunSchedule: SunScheduleEntry[],
): string | null {
  const now = new Date()
  const nowMs = now.getTime()

  let earliest: Date | null = null

  for (const trigger of triggers) {
    if (!trigger.enabled) continue

    if (trigger.type === 'sun' && trigger.sunEvent) {
      // Look up the sun event time from the schedule
      const entry = sunSchedule.find(s => s.sunPhase === trigger.sunEvent)
      if (!entry) continue
      const eventDate = new Date(entry.time)
      if (isNaN(eventDate.getTime())) continue
      if (eventDate.getTime() > nowMs) {
        if (!earliest || eventDate < earliest) earliest = eventDate
      }
    }

    if (trigger.type === 'time' && trigger.time) {
      const [h, m] = trigger.time.split(':').map(Number)
      const candidate = new Date()
      candidate.setHours(h, m, 0, 0)

      // Check if this trigger fires today (matching days)
      const todayDow = (now.getDay() + 6) % 7 // 0=Mon … 6=Sun
      const days = trigger.days ?? []
      const firesOnDay = days.length === 0 || days.length === 7 || days.includes(todayDow)

      if (firesOnDay && candidate.getTime() > nowMs) {
        if (!earliest || candidate < earliest) earliest = candidate
      }
    }
  }

  if (!earliest) return null

  return earliest.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Mode card ─────────────────────────────────────────────────────────────────

interface ModeCardProps {
  mode: ModeWithTriggers
  isActive: boolean
  nextTime: string | null
  onClick: () => void
}

function ModeCard({ mode, isActive, nextTime, onClick }: ModeCardProps) {
  const summary = buildTriggerSummary(mode.triggers)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'surface w-full rounded-lg px-4 py-3 text-left transition-colors',
        'hover:bg-[var(--bg-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fairy-500',
        'min-h-[44px]',
        isActive && 'border-l-2 border-fairy-500',
      )}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <LucideIcon
              name={mode.icon}
              className="h-4 w-4 shrink-0 text-fairy-400"
              aria-hidden="true"
            />
            <span className="text-heading text-sm font-semibold">
              {mode.name}
            </span>
          </div>
          <p className="text-caption mt-0.5 text-xs">{summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {nextTime && (
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              {nextTime}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
        </div>
      </div>
    </button>
  )
}

// ── Add mode form ─────────────────────────────────────────────────────────────

interface AddModeFormProps {
  onAdd: (name: string) => void
  isPending: boolean
}

function AddModeForm({ onAdd, isPending }: AddModeFormProps) {
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }

  return (
    <div className="flex gap-2 pt-1">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="New mode name..."
        aria-label="New mode name"
        className="input-field flex-1 rounded-lg border px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:border-fairy-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!value.trim() || isPending}
        className="flex items-center gap-1.5 rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add
      </button>
    </div>
  )
}

// ── ModesList ─────────────────────────────────────────────────────────────────

export interface ModesListProps {
  onSelectMode: (modeName: string) => void
}

export function ModesList({ onSelectMode }: ModesListProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const {
    data: modes,
    isLoading: modesLoading,
    isError: modesError,
    refetch: refetchModes,
  } = useQuery({
    queryKey: ['system', 'modes'],
    queryFn: api.system.getModes,
  })

  const { data: current } = useQuery({
    queryKey: ['system', 'current'],
    queryFn: api.system.getCurrent,
  })

  const { data: sunSchedule = [] } = useQuery({
    queryKey: ['system', 'sun-schedule'],
    queryFn: api.system.getSunSchedule,
  })

  const addMutation = useMutation({
    mutationFn: api.system.addMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
      toast({ message: 'Mode added' })
    },
    onError: () => toast({ message: 'Failed to add mode', type: 'error' }),
  })

  // ── Loading state ───────────────────────────────────────────────────────────

  if (modesLoading) {
    return (
      <div aria-label="Loading modes" aria-busy="true">
        <SkeletonList count={4} height="h-14" />
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────

  if (modesError) {
    return (
      <div
        role="alert"
        className="surface rounded-lg px-4 py-5 text-center"
      >
        <p className="text-heading text-sm font-medium">
          Could not load modes
        </p>
        <p className="text-caption mt-1 text-xs">
          Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => refetchModes()}
          className="mt-3 rounded-lg bg-fairy-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!modes || modes.length === 0) {
    return (
      <div className="space-y-4">
        <div className="surface rounded-lg px-4 py-6 text-center">
          <p className="text-caption text-sm">
            No modes configured. Add your first mode to organise scenes by time of day.
          </p>
        </div>
        <AddModeForm
          onAdd={name => addMutation.mutate(name)}
          isPending={addMutation.isPending}
        />
      </div>
    )
  }

  // ── Success state ───────────────────────────────────────────────────────────

  const activeModeName = current?.mode ?? null

  return (
    <div className="space-y-2">
      {modes.map(mode => {
        const nextTime = getNextScheduledTime(mode.triggers, sunSchedule as SunScheduleEntry[])
        return (
          <ModeCard
            key={mode.name}
            mode={mode}
            isActive={mode.name === activeModeName}
            nextTime={nextTime}
            onClick={() => onSelectMode(mode.name)}
          />
        )
      })}
      <AddModeForm
        onAdd={name => addMutation.mutate(name)}
        isPending={addMutation.isPending}
      />
    </div>
  )
}
