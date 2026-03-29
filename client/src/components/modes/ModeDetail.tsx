import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Sun, Clock, Trash2, Plus, Moon, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import type { ModeWithTriggers, ModeTrigger } from '@/lib/api'
import { cn, formatTime } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { SUN_EVENT_LABELS } from './ModesList'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconPicker } from '@/components/ui/IconPicker'

// ── Props ─────────────────────────────────────────────────────────────────────

interface ModeDetailProps {
  modeName: string
  onBack: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatDays(days: number[]): string {
  if (!days || days.length === 0 || days.length === 7) return 'Daily'
  if (days.length === 5 && [0, 1, 2, 3, 4].every(d => days.includes(d))) return 'Weekdays'
  if (days.length === 2 && [5, 6].every(d => days.includes(d))) return 'Weekends'
  return days
    .sort((a, b) => a - b)
    .map(d => DAY_LABELS[d])
    .join(', ')
}

function formatTriggerTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel: string
}

function Toggle({ checked, onChange, disabled, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
        'disabled:opacity-50',
        checked ? 'bg-fairy-500' : 'bg-[var(--bg-tertiary)]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )}
        aria-hidden="true"
      />
    </button>
  )
}

// ── Trigger card ──────────────────────────────────────────────────────────────

interface TriggerCardProps {
  trigger: ModeTrigger
  modeName: string
  sunTimes: Record<string, string>
  onToggle: () => void
  onDelete: () => void
  isUpdating: boolean
  isDeleting: boolean
  isConfirming: boolean
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

function TriggerCard({
  trigger,
  sunTimes,
  onToggle,
  onDelete,
  isUpdating,
  isDeleting,
  isConfirming,
  onConfirmDelete,
  onCancelDelete,
}: TriggerCardProps) {
  let label = ''
  let detail = ''

  if (trigger.type === 'sun' && trigger.sunEvent) {
    const eventLabel = SUN_EVENT_LABELS[trigger.sunEvent] ?? trigger.sunEvent
    label = `Sun: ${eventLabel}`
    const rawTime = sunTimes[trigger.sunEvent]
    detail = rawTime ? `Today at ${formatTime(rawTime)}` : ''
  } else if (trigger.type === 'time' && trigger.time) {
    const days = formatDays(trigger.days ?? [])
    const formattedTime = formatTriggerTime(trigger.time)
    label = days === 'Daily' ? `Daily at ${formattedTime}` : `${days} at ${formattedTime}`
    detail = ''
  }

  return (
    <div
      className={cn(
        'surface rounded-lg px-4 py-3',
        !trigger.enabled && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 pt-0.5">
          {trigger.type === 'sun' ? (
            <Sun className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          ) : (
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
          )}
          <div>
            <p className="text-heading text-sm font-medium">{label}</p>
            {detail && <p className="text-caption mt-0.5 text-xs">{detail}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Toggle
            checked={trigger.enabled}
            onChange={onToggle}
            disabled={isUpdating}
            ariaLabel={trigger.enabled ? `Disable trigger: ${label}` : `Enable trigger: ${label}`}
          />
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label={`Delete trigger: ${label}`}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-red-400 transition-colors hover:text-red-300 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {isConfirming && (
        <div className="mt-3 flex items-center gap-3 border-t border-[var(--border-secondary)] pt-3">
          <p className="flex-1 text-xs text-caption">Remove this trigger?</p>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {isDeleting ? 'Removing...' : 'Remove'}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="text-xs text-caption hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add trigger form ──────────────────────────────────────────────────────────

interface AddTriggerFormProps {
  modeName: string
  allModes: ModeWithTriggers[]
  sunTimes: Record<string, string>
  onSaved: () => void
  onCancel: () => void
}

function AddTriggerForm({
  modeName,
  allModes,
  sunTimes,
  onSaved,
  onCancel,
}: AddTriggerFormProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [step, setStep] = useState<'choose' | 'sun' | 'time'>('choose')
  const [selectedSunEvent, setSelectedSunEvent] = useState<string | null>(null)
  const [timeValue, setTimeValue] = useState('08:00')
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])

  // Build a map of sunEvent → mode name for events already claimed
  const usedSunEvents = new Map<string, string>()
  for (const m of allModes) {
    for (const t of m.triggers) {
      if (t.type === 'sun' && t.sunEvent && m.name !== modeName) {
        usedSunEvents.set(t.sunEvent, m.name)
      }
    }
  }

  const addMutation = useMutation({
    mutationFn: (vars: Parameters<typeof api.system.addTrigger>[1]) =>
      api.system.addTrigger(modeName, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'sun-schedule'] })
      toast({ message: 'Trigger added' })
      onSaved()
    },
    onError: () => toast({ message: 'Failed to add trigger', type: 'error' }),
  })

  const handleSave = () => {
    if (step === 'sun') {
      if (!selectedSunEvent) return
      addMutation.mutate({
        type: 'sun',
        sunEvent: selectedSunEvent,
        priority: 10,
      })
    } else if (step === 'time') {
      addMutation.mutate({
        type: 'time',
        time: timeValue,
        days: selectedDays,
        priority: 20,
      })
    }
  }

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    )
  }

  if (step === 'choose') {
    return (
      <div className="space-y-3">
        <p className="text-heading text-sm font-medium">Choose trigger type</p>

        <button
          type="button"
          onClick={() => setStep('sun')}
          className="surface w-full rounded-lg p-4 text-left transition-colors hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 min-h-[44px]"
        >
          <div className="flex items-start gap-3">
            <Sun className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
            <div>
              <p className="text-heading text-sm font-medium">Solar event</p>
              <p className="text-caption mt-0.5 text-xs">
                Activate when the sun reaches a specific position
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('time')}
          className="surface w-full rounded-lg p-4 text-left transition-colors hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 min-h-[44px]"
        >
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />
            <div>
              <p className="text-heading text-sm font-medium">Scheduled time</p>
              <p className="text-caption mt-0.5 text-xs">
                Activate at a specific time, daily or on certain days
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="text-caption text-sm hover:text-[var(--text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (step === 'sun') {
    return (
      <div className="space-y-3">
        <p className="text-heading text-sm font-medium">Choose a solar event</p>

        <div className="space-y-1.5">
          {Object.entries(SUN_EVENT_LABELS).map(([key, label]) => {
            const usedBy = usedSunEvents.get(key)
            const isUsed = Boolean(usedBy)
            const isSelected = selectedSunEvent === key
            const rawTime = sunTimes[key]
            const timeLabel = rawTime ? formatTime(rawTime) : null

            return (
              <button
                key={key}
                type="button"
                disabled={isUsed}
                onClick={() => !isUsed && setSelectedSunEvent(key)}
                aria-pressed={isSelected}
                className={cn(
                  'w-full rounded-lg px-4 py-3 text-left transition-colors min-h-[44px]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isSelected
                    ? 'bg-fairy-500/15 text-fairy-400 ring-1 ring-fairy-500/30'
                    : isUsed
                    ? 'surface text-[var(--text-muted)] cursor-not-allowed opacity-60'
                    : 'surface hover:bg-[var(--bg-tertiary)]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-sm', isSelected ? 'text-fairy-400 font-medium' : 'text-heading')}>
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {timeLabel && (
                      <span className="font-mono text-xs text-[var(--text-muted)]">{timeLabel}</span>
                    )}
                    {isUsed && (
                      <span className="text-xs text-[var(--text-muted)]">used by {usedBy}</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedSunEvent || addMutation.isPending}
            className="rounded-lg bg-fairy-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            {addMutation.isPending ? 'Saving...' : 'Save trigger'}
          </button>
          <button
            type="button"
            onClick={() => setStep('choose')}
            className="text-caption text-sm hover:text-[var(--text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // step === 'time'
  return (
    <div className="space-y-4">
      <p className="text-heading text-sm font-medium">Set a scheduled time</p>

      <div>
        <label htmlFor="trigger-time" className="text-caption mb-1.5 block text-xs">
          Time
        </label>
        <input
          id="trigger-time"
          type="time"
          value={timeValue}
          onChange={e => setTimeValue(e.target.value)}
          className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 min-h-[44px]"
        />
      </div>

      <div>
        <p className="text-caption mb-2 text-xs">Days</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
          {DAY_LABELS.map((day, index) => {
            const isSelected = selectedDays.includes(index)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleDay(index)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  isSelected
                    ? 'bg-fairy-500 text-white'
                    : 'surface text-body hover:bg-[var(--bg-tertiary)]',
                )}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={selectedDays.length === 0 || addMutation.isPending}
          className="rounded-lg bg-fairy-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          {addMutation.isPending ? 'Saving...' : 'Save trigger'}
        </button>
        <button
          type="button"
          onClick={() => setStep('choose')}
          className="text-caption text-sm hover:text-[var(--text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
        >
          Back
        </button>
      </div>
    </div>
  )
}

// ── Delete confirmation ────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  modeName: string
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
}

function DeleteConfirm({ modeName, onConfirm, onCancel, isDeleting }: DeleteConfirmProps) {
  const { data: deps, isLoading } = useQuery({
    queryKey: ['system', 'modes', modeName, 'dependencies'],
    queryFn: () => api.system.getModeDependencies(modeName),
  })

  if (isLoading) {
    return (
      <div
        className="surface rounded-lg p-4 space-y-3"
        aria-busy="true"
        aria-label="Loading dependency information"
      >
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
    )
  }

  return (
    <div className="surface rounded-lg p-4 space-y-3" role="alert">
      <p className="text-heading text-sm font-semibold">Delete this mode?</p>

      {deps?.isCurrentMode && (
        <p className="text-sm text-amber-400">
          This is the currently active mode. Removing it will switch to another mode.
        </p>
      )}

      {deps?.isWakeMode && (
        <p className="text-sm text-amber-400">
          This mode is configured as the wake mode for night lockout.
        </p>
      )}

      {deps?.isSleepMode && (
        <p className="text-sm text-amber-400">
          This is the sleep mode. Automatic triggers will not be scheduled until a new sleep mode is set.
        </p>
      )}

      {deps && deps.scenes.length > 0 && (
        <div>
          <p className="text-caption text-xs">
            Removing this mode will affect {deps.scenes.length}{' '}
            {deps.scenes.length === 1 ? 'scene' : 'scenes'}. These scenes will no longer activate
            during this mode.
          </p>
          <ul className="mt-1.5 space-y-0.5 pl-3">
            {deps.scenes.map(s => (
              <li key={s.name} className="text-caption text-xs">
                {s.icon} {s.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {deps && deps.scenes.length === 0 && !deps.isCurrentMode && !deps.isWakeMode && !deps.isSleepMode && (
        <p className="text-caption text-xs">
          No scenes are assigned to this mode. It is safe to remove.
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isDeleting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
        >
          {isDeleting ? 'Deleting...' : 'Delete mode'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-caption text-sm hover:text-[var(--text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── ModeDetail ─────────────────────────────────────────────────────────────────

export default function ModeDetail({ modeName, onBack }: ModeDetailProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // ── Local state ─────────────────────────────────────────────────────────────

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(modeName)
  const [nameError, setNameError] = useState<string | null>(null)
  const [showAddTrigger, setShowAddTrigger] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [confirmingTriggerId, setConfirmingTriggerId] = useState<number | null>(null)
  const [showIconPicker, setShowIconPicker] = useState(false)

  // Track the "live" name — it changes after a successful rename
  const [currentName, setCurrentName] = useState(modeName)

  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [editingName])

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: modes = [], isLoading: modesLoading, isError: modesError } = useQuery({
    queryKey: ['system', 'modes'],
    queryFn: api.system.getModes,
  })

  const { data: sunTimes = {} } = useQuery({
    queryKey: ['system', 'sun-times'],
    queryFn: api.system.getSunTimes,
  })

  // Find this mode from the list
  const modeData: ModeWithTriggers | undefined = modes.find(m => m.name === currentName)

  // ── Rename mutation ─────────────────────────────────────────────────────────

  const renameMutation = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      api.system.renameMode(oldName, newName),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
      const sceneMsg =
        data.updatedScenes === 1
          ? '1 scene updated.'
          : data.updatedScenes > 1
          ? `${data.updatedScenes} scenes updated.`
          : ''
      toast({
        message: sceneMsg ? `Mode renamed. ${sceneMsg}` : 'Mode renamed.',
      })
      setEditingName(false)
      setNameError(null)
      // Update local tracking name, then navigate back so the list refreshes
      setCurrentName(data.name)
      onBack()
    },
    onError: (error: Error) => {
      if (error.message.includes('409') || error.message.toLowerCase().includes('already exists') || error.message.toLowerCase().includes('duplicate')) {
        setNameError('A mode with this name already exists.')
      } else {
        toast({ message: 'Failed to rename mode', type: 'error' })
      }
    },
  })

  const handleRenameCommit = useCallback(() => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === currentName) {
      setEditingName(false)
      setNameError(null)
      return
    }
    setNameError(null)
    renameMutation.mutate({ oldName: currentName, newName: trimmed })
  }, [nameValue, currentName, renameMutation])

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRenameCommit()
    } else if (e.key === 'Escape') {
      setNameValue(currentName)
      setNameError(null)
      setEditingName(false)
    }
  }

  // ── Update icon mutation ─────────────────────────────────────────────────────

  const updateIconMutation = useMutation({
    mutationFn: (icon: string) =>
      fetch(`/api/system/modes/${encodeURIComponent(currentName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icon }),
      }).then(async res => {
        if (!res.ok) throw new Error(await res.text().catch(() => 'API error'))
        return res.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
    },
    onError: () => toast({ message: 'Failed to update icon', type: 'error' }),
  })

  const handleIconSelect = (iconName: string) => {
    setShowIconPicker(false)
    updateIconMutation.mutate(iconName)
  }

  // ── Delete mode mutation ────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: () => api.system.deleteMode(currentName),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
      const sceneMsg =
        data.affectedScenes === 1
          ? '1 scene updated.'
          : data.affectedScenes > 1
          ? `${data.affectedScenes} scenes updated.`
          : ''
      toast({
        message: sceneMsg ? `Mode deleted. ${sceneMsg}` : 'Mode deleted.',
      })
      onBack()
    },
    onError: () => toast({ message: 'Failed to delete mode', type: 'error' }),
  })

  // ── Trigger mutations ───────────────────────────────────────────────────────

  const updateTriggerMutation = useMutation({
    mutationFn: ({ triggerId, enabled }: { triggerId: number; enabled: boolean }) =>
      api.system.updateTrigger(currentName, triggerId, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
    },
    onError: () => toast({ message: 'Failed to update trigger', type: 'error' }),
  })

  const deleteTriggerMutation = useMutation({
    mutationFn: (triggerId: number) =>
      api.system.deleteTrigger(currentName, triggerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'sun-schedule'] })
      toast({ message: 'Trigger removed' })
    },
    onError: () => toast({ message: 'Failed to remove trigger', type: 'error' }),
  })

  const handleDeleteTrigger = (triggerId: number) => {
    deleteTriggerMutation.mutate(triggerId, {
      onSuccess: () => setConfirmingTriggerId(null),
    })
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (modesLoading) {
    return (
      <div
        className="space-y-4"
        aria-busy="true"
        aria-label="Loading mode details"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="surface rounded-lg px-4 py-3 space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-52" />
        </div>
        <div className="surface rounded-lg px-4 py-3 space-y-2">
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────────

  if (modesError || !modeData) {
    return (
      <div role="alert" className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-caption text-sm transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to modes
        </button>
        <div className="surface rounded-lg px-4 py-5 text-center">
          <p className="text-heading text-sm font-medium">Could not load mode details</p>
          <p className="text-caption mt-1 text-xs">
            The mode may have been deleted, or there was a connection error.
          </p>
        </div>
      </div>
    )
  }

  const triggers = modeData.triggers

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to modes list"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-caption transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1 pt-1">
            {editingName ? (
              <div>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameValue}
                  onChange={e => {
                    setNameValue(e.target.value)
                    setNameError(null)
                  }}
                  onBlur={handleRenameCommit}
                  onKeyDown={handleNameKeyDown}
                  aria-label="Mode name"
                  aria-describedby={nameError ? 'name-error' : undefined}
                  aria-invalid={Boolean(nameError)}
                  disabled={renameMutation.isPending}
                  className={cn(
                    'w-full rounded-lg border px-3 py-1.5 text-base font-semibold text-heading',
                    'bg-[var(--bg-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    nameError
                      ? 'border-red-500'
                      : 'border-[var(--border-secondary)]',
                    'disabled:opacity-50',
                  )}
                />
                {nameError && (
                  <p
                    id="name-error"
                    role="alert"
                    className="mt-1 text-xs text-red-400"
                  >
                    {nameError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* Icon picker trigger */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowIconPicker(prev => !prev)}
                    aria-label={modeData.icon ? `Change icon: ${modeData.icon.replace(/-/g, ' ')}` : 'Add an icon'}
                    aria-expanded={showIconPicker}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                      'hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      modeData.icon ? 'text-fairy-400' : 'text-[var(--text-muted)]',
                    )}
                  >
                    {modeData.icon ? (
                      <LucideIcon name={modeData.icon} className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                  {showIconPicker && (
                    <div className="absolute left-0 top-full z-50 pt-1">
                      <IconPicker
                        value={modeData.icon ?? null}
                        onChange={handleIconSelect}
                        onClose={() => setShowIconPicker(false)}
                      />
                    </div>
                  )}
                </div>

                {/* Mode name / rename trigger */}
                <button
                  type="button"
                  onClick={() => {
                    setNameValue(currentName)
                    setEditingName(true)
                  }}
                  aria-label={`Rename mode: ${currentName}`}
                  className="group flex items-center gap-1.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  <h2 className="text-base font-semibold text-heading">
                    {currentName}
                  </h2>
                  <Pencil
                    className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              </div>
            )}
          </div>
        </div>

        {!showDeleteConfirm && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="mt-2 shrink-0 rounded text-xs text-red-400 transition-colors hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Delete mode
          </button>
        )}
      </div>

      {/* ── Sleep mode badge ────────────────────────────────────────────────── */}
      {modeData.isSleepMode && (
        <div className="surface rounded-lg px-4 py-3 flex items-start gap-2.5">
          <Moon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" aria-hidden="true" />
          <p className="text-caption text-xs">
            This is the sleep mode. Automatic triggers will not override this mode until the wake mode is reached.
          </p>
        </div>
      )}

      {/* ── Triggers section ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-heading">Triggers</h3>
          {!showAddTrigger && (
            <button
              type="button"
              onClick={() => setShowAddTrigger(true)}
              className="flex items-center gap-1.5 rounded-lg bg-fairy-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-fairy-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 min-h-[44px]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add trigger
            </button>
          )}
        </div>

        {triggers.length === 0 && !showAddTrigger && (
          <div className="surface rounded-lg px-4 py-4 text-center">
            <p className="text-caption text-sm">
              No triggers configured. This mode can only be activated manually from the home screen.
            </p>
          </div>
        )}

        {triggers.map(trigger => (
          <TriggerCard
            key={trigger.id}
            trigger={trigger}
            modeName={currentName}
            sunTimes={sunTimes}
            onToggle={() =>
              updateTriggerMutation.mutate({
                triggerId: trigger.id,
                enabled: !trigger.enabled,
              })
            }
            onDelete={() => setConfirmingTriggerId(trigger.id)}
            onConfirmDelete={() => handleDeleteTrigger(trigger.id)}
            onCancelDelete={() => setConfirmingTriggerId(null)}
            isConfirming={confirmingTriggerId === trigger.id}
            isUpdating={
              updateTriggerMutation.isPending &&
              updateTriggerMutation.variables?.triggerId === trigger.id
            }
            isDeleting={
              deleteTriggerMutation.isPending &&
              deleteTriggerMutation.variables === trigger.id
            }
          />
        ))}

        {showAddTrigger && (
          <div className="surface rounded-lg p-4">
            <AddTriggerForm
              modeName={currentName}
              allModes={modes}
              sunTimes={sunTimes}
              onSaved={() => setShowAddTrigger(false)}
              onCancel={() => setShowAddTrigger(false)}
            />
          </div>
        )}
      </div>

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <DeleteConfirm
          modeName={currentName}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
