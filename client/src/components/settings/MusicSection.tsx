import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle, AlertCircle, ChevronDown, Pencil } from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import { api } from '@/lib/api'
import type { AutoPlayRule, SonosFavourite } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { FavouriteSelector } from '@/components/sonos/FavouriteSelector'
import { Section } from './Section'

// ── Connection status ────────────────────────────────────────────────────────

function SonosConnectionStatus() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['sonos', 'health'],
    queryFn: api.sonos.health,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-caption">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--bg-tertiary)]" aria-hidden="true" />
        Checking Sonos connection...
      </div>
    )
  }

  if (health?.available) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle className="h-4 w-4 text-green-400" aria-hidden="true" />
        <span className="text-heading">Sonos connected</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <AlertCircle className="h-4 w-4 text-amber-400" aria-hidden="true" />
      <span className="text-heading">Sonos unavailable</span>
      <Link
        to="/sonos-setup"
        className="text-fairy-400 underline underline-offset-2 hover:text-fairy-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
      >
        Set up Sonos
      </Link>
    </div>
  )
}

// ── Toggle switch ────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 disabled:cursor-not-allowed disabled:opacity-50',
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

// ── Auto-play rule display ───────────────────────────────────────────────────

function ruleDescription(rule: AutoPlayRule): { main: string; condition?: string } {
  const room = rule.room_name ?? 'whole house'
  const isContinue = rule.favourite_name === '__continue__'
  const action = isContinue
    ? `Continue what's already playing in ${room}`
    : `Play "${rule.favourite_name}" in ${room}`
  const main = `${action} when mode changes to "${rule.mode_name}".`

  let condition: string | undefined
  if (rule.trigger_type === 'if_not_playing') {
    condition = 'Only if nothing is playing.'
  } else if (rule.trigger_type === 'if_source_not') {
    const source = rule.trigger_value ? ` "${rule.trigger_value}"` : ''
    condition = `Only if source${source} is not active.`
  }
  return { main, condition }
}

// ── Add rule form ────────────────────────────────────────────────────────────

type TriggerType = AutoPlayRule['trigger_type']

function AddRuleForm({
  onSave,
  onCancel,
  rooms,
  favourites,
  modes,
  isSaving,
}: {
  onSave: (data: Omit<AutoPlayRule, 'id'>) => void
  onCancel: () => void
  rooms: string[]
  favourites: SonosFavourite[]
  modes: string[]
  isSaving: boolean
}) {
  const [targetRoom, setTargetRoom] = useState<string>('')
  const [favourite, setFavourite] = useState<string>('')
  const [mode, setMode] = useState<string>(modes[0] ?? '')
  const [triggerType, setTriggerType] = useState<TriggerType>('mode_change')
  const [sourceValue, setSourceValue] = useState<string>('')

  const effectiveTrigger = favourite === '__continue__' ? 'mode_change' : triggerType
  const isValid = favourite && mode && !(triggerType === 'if_source_not' && favourite !== '__continue__' && !sourceValue)

  const handleSave = () => {
    if (!isValid) return
    onSave({
      room_name: targetRoom || null,
      mode_name: mode,
      favourite_name: favourite,
      trigger_type: effectiveTrigger,
      trigger_value: effectiveTrigger === 'if_source_not' ? sourceValue : null,
      enabled: 1,
    })
  }

  const selectClass =
    'surface w-full appearance-none rounded-lg border px-3 py-2 text-sm text-heading min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500'

  return (
    <div className="surface rounded-lg border p-4 space-y-4" style={{ borderColor: 'var(--border-secondary)' }}>
      <p className="text-heading text-sm font-medium">New auto-play rule</p>

      {/* Target room */}
      <div>
        <label htmlFor="rule-room" className="text-heading text-sm mb-1.5 block">
          Room
        </label>
        <div className="relative">
          <select
            id="rule-room"
            value={targetRoom}
            onChange={(e) => setTargetRoom(e.target.value)}
            className={selectClass}
          >
            <option value="">Whole house</option>
            {rooms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
        </div>
      </div>

      {/* Favourite */}
      <div>
        <label htmlFor="rule-favourite" className="text-heading text-sm mb-1.5 block">
          Favourite
        </label>
        <FavouriteSelector
          favourites={favourites}
          value={favourite}
          onChange={setFavourite}
          id="rule-favourite"
        />
      </div>

      {/* Mode */}
      <div>
        <label htmlFor="rule-mode" className="text-heading text-sm mb-1.5 block">
          Mode
        </label>
        <div className="relative">
          <select
            id="rule-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className={selectClass}
          >
            <option value="">Select a mode</option>
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
        </div>
      </div>

      {/* Condition — hidden when __continue__ (only mode_change makes sense) */}
      {favourite !== '__continue__' && (
        <fieldset>
          <legend className="text-heading text-sm mb-2">Condition</legend>
          <div className="space-y-2">
            {(
              [
                { value: 'mode_change', label: 'Always when mode changes' },
                { value: 'if_not_playing', label: 'Only if nothing is playing' },
                { value: 'if_source_not', label: 'Only if a source is not active' },
              ] as { value: TriggerType; label: string }[]
            ).map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="trigger-type"
                  value={value}
                  checked={triggerType === value}
                  onChange={() => setTriggerType(value)}
                  className="h-4 w-4 accent-fairy-500"
                />
                <span className="text-heading text-sm">{label}</span>
              </label>
            ))}
          </div>
          {triggerType === 'if_source_not' && (
            <div className="mt-3">
              <label htmlFor="rule-source" className="text-caption text-xs mb-1.5 block">
                Source name
              </label>
              <input
                id="rule-source"
                type="text"
                value={sourceValue}
                onChange={(e) => setSourceValue(e.target.value)}
                placeholder="e.g. Spotify"
                className="w-full rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-heading min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
          )}
        </fieldset>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!isValid || isSaving}
          className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          {isSaving ? 'Saving...' : 'Save rule'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 min-h-[44px] surface text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main MusicSection ────────────────────────────────────────────────────────

export function MusicSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [editFavourite, setEditFavourite] = useState('')
  const [editMode, setEditMode] = useState('')
  const [editTriggerType, setEditTriggerType] = useState<AutoPlayRule['trigger_type']>('mode_change')
  const [editSourceValue, setEditSourceValue] = useState('')

  // Preferences
  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  const prefMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.system.setPreference(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] })
      toast({ message: 'Setting saved' })
    },
    onError: () => toast({ message: 'Failed to save setting', type: 'error' }),
  })

  const followMeEnabled = prefs?.sonos_follow_me === 'true'

  // Sonos data
  const { data: favourites } = useQuery({
    queryKey: ['sonos', 'favourites'],
    queryFn: api.sonos.getFavourites,
    retry: false,
  })

  const { data: speakers } = useQuery({
    queryKey: ['sonos', 'speakers'],
    queryFn: api.sonos.getSpeakers,
    retry: false,
  })

  const { data: rules } = useQuery({
    queryKey: ['sonos', 'auto-play'],
    queryFn: api.sonos.getAutoPlayRules,
    retry: false,
  })

  const { data: modes } = useQuery({
    queryKey: ['system', 'modes'],
    queryFn: api.system.getModes,
  })

  // Auto-play mutations
  const createRuleMutation = useMutation({
    mutationFn: api.sonos.createAutoPlayRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Auto-play rule added' })
      setShowAddForm(false)
    },
    onError: () => toast({ message: 'Failed to add rule', type: 'error' }),
  })

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AutoPlayRule> }) =>
      api.sonos.updateAutoPlayRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Rule updated' })
    },
    onError: () => toast({ message: 'Failed to update rule', type: 'error' }),
  })

  const deleteRuleMutation = useMutation({
    mutationFn: api.sonos.deleteAutoPlayRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Rule deleted' })
      setEditingRuleId(null)
    },
    onError: () => toast({ message: 'Failed to delete rule', type: 'error' }),
  })

  const editRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AutoPlayRule> }) =>
      api.sonos.updateAutoPlayRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Rule updated' })
      resetEditForm()
    },
    onError: () => toast({ message: 'Failed to update rule', type: 'error' }),
  })

  function resetEditForm() {
    setEditingRuleId(null)
    setEditFavourite('')
    setEditMode('')
    setEditTriggerType('mode_change')
    setEditSourceValue('')
  }

  function openEditRule(rule: AutoPlayRule) {
    setShowAddForm(false)
    setEditingRuleId(rule.id)
    setEditFavourite(rule.favourite_name)
    setEditMode(rule.mode_name)
    setEditTriggerType(rule.trigger_type)
    setEditSourceValue(rule.trigger_value ?? '')
  }

  const modeNames = modes?.map((m) => m.name) ?? []
  const assignedRooms = speakers?.map((s) => s.room_name) ?? []
  const speakerCount = speakers?.length ?? 0

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <Section title="Sonos">
        <SonosConnectionStatus />
      </Section>

      {/* Follow-me toggle */}
      <Section title="Follow-me music">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-heading text-sm">Follow-me music</p>
              <p className="text-caption text-xs mt-1">
                Music follows you from room to room based on motion sensors.
              </p>
            </div>
            <ToggleSwitch
              checked={followMeEnabled}
              label={followMeEnabled ? 'Disable follow-me music' : 'Enable follow-me music'}
              onChange={(value) =>
                prefMutation.mutate({ key: 'sonos_follow_me', value: String(value) })
              }
              disabled={prefMutation.isPending}
            />
          </div>

        </div>
      </Section>

      {/* Speaker assignments */}
      <Section title="Speaker assignments">
        <Link
          to="/sonos-setup"
          className="surface flex items-center justify-between rounded-lg border px-3 py-2.5 text-heading text-sm transition-colors hover:brightness-95 dark:hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <span>Manage speaker assignments</span>
          <span className="text-caption text-xs">
            {speakerCount === 0
              ? 'No speakers assigned'
              : `${speakerCount} speaker${speakerCount !== 1 ? 's' : ''} assigned`}
          </span>
        </Link>
      </Section>

      {/* Auto-play rules */}
      <Section title="Auto-play rules">
        <div className="space-y-3">
          {rules && rules.length > 0 ? (
            rules.map((rule) => {
              const { main, condition } = ruleDescription(rule)
              const isEditing = editingRuleId === rule.id

              if (isEditing) {
                const selectClass = 'w-full appearance-none rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-heading min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500'
                const effectiveTrigger = editFavourite === '__continue__' ? 'mode_change' : editTriggerType
                const isValid = editFavourite && editMode && !(editTriggerType === 'if_source_not' && editFavourite !== '__continue__' && !editSourceValue)

                return (
                  <div key={rule.id} className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-4 space-y-4">
                    <p className="text-heading text-sm font-medium">Edit auto-play rule</p>

                    <div>
                      <label htmlFor="settings-edit-rule-room" className="text-heading text-sm mb-1.5 block">Room</label>
                      <div className="relative">
                        <select id="settings-edit-rule-room" value={rule.room_name ?? ''} disabled className={cn(selectClass, 'opacity-70')}>
                          <option value="">Whole house</option>
                          {assignedRooms.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="settings-edit-favourite" className="text-heading text-sm mb-1.5 block">Favourite</label>
                      <FavouriteSelector favourites={favourites ?? []} value={editFavourite} onChange={setEditFavourite} id="settings-edit-favourite" />
                    </div>

                    <div>
                      <label htmlFor="settings-edit-mode" className="text-heading text-sm mb-1.5 block">Mode</label>
                      <div className="relative">
                        <select id="settings-edit-mode" value={editMode} onChange={e => setEditMode(e.target.value)} className={selectClass}>
                          <option value="">Select a mode</option>
                          {modeNames.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                      </div>
                    </div>

                    {editFavourite !== '__continue__' && (
                      <fieldset>
                        <legend className="text-heading text-sm mb-2">Condition</legend>
                        <div className="space-y-2">
                          {([
                            { value: 'mode_change' as const, label: 'Always when mode changes' },
                            { value: 'if_not_playing' as const, label: 'Only if nothing is playing' },
                            { value: 'if_source_not' as const, label: 'Only if a source is not active' },
                          ]).map(({ value, label }) => (
                            <label key={value} className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                              <input type="radio" name="settings-edit-trigger-type" value={value} checked={editTriggerType === value} onChange={() => setEditTriggerType(value)} className="h-4 w-4 accent-fairy-500" />
                              <span className="text-heading text-sm">{label}</span>
                            </label>
                          ))}
                        </div>
                        {editTriggerType === 'if_source_not' && (
                          <div className="mt-3">
                            <label htmlFor="settings-edit-source" className="text-caption text-xs mb-1.5 block">Source name</label>
                            <input id="settings-edit-source" type="text" value={editSourceValue} onChange={e => setEditSourceValue(e.target.value)} placeholder="e.g. Spotify" className="w-full rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-heading min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500" />
                          </div>
                        )}
                      </fieldset>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          if (!isValid) return
                          editRuleMutation.mutate({
                            id: rule.id,
                            data: {
                              mode_name: editMode,
                              favourite_name: editFavourite,
                              trigger_type: effectiveTrigger,
                              trigger_value: effectiveTrigger === 'if_source_not' ? editSourceValue : null,
                            },
                          })
                        }}
                        disabled={!isValid || editRuleMutation.isPending}
                        className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                      >
                        {editRuleMutation.isPending ? 'Saving...' : 'Save changes'}
                      </button>
                      <button onClick={resetEditForm} className="rounded-lg px-4 py-2 min-h-[44px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-heading text-sm hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500">
                        Cancel
                      </button>
                    </div>

                    <div className="border-t border-red-500/20 pt-4 mt-4">
                      <p className="text-sm font-medium text-red-400 mb-2">Danger zone</p>
                      <button
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                        disabled={deleteRuleMutation.isPending}
                        className={cn(
                          'rounded-lg px-4 py-2 min-h-[44px] text-sm font-medium transition-colors',
                          'border border-red-500/30 text-red-400 hover:bg-red-500/10',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500',
                          'disabled:cursor-not-allowed disabled:opacity-40',
                        )}
                      >
                        {deleteRuleMutation.isPending ? 'Deleting...' : 'Delete this rule'}
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', rule.enabled ? 'text-body' : 'text-caption line-through')}>
                      {main}
                    </p>
                    {condition && (
                      <p className={cn('text-xs mt-0.5', rule.enabled ? 'text-caption' : 'text-caption line-through')}>
                        {condition}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch.Root
                      checked={!!rule.enabled}
                      onCheckedChange={checked =>
                        updateRuleMutation.mutate({
                          id: rule.id,
                          data: { enabled: checked ? 1 : 0 },
                        })
                      }
                      disabled={updateRuleMutation.isPending}
                      aria-label={`${rule.enabled ? 'Disable' : 'Enable'} rule for ${rule.mode_name}`}
                      className={cn(
                        'relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                        rule.enabled ? 'bg-fairy-500' : 'bg-[var(--border-secondary)]',
                      )}
                    >
                      <Switch.Thumb
                        className={cn(
                          'block h-4 w-4 rounded-full bg-white shadow transition-transform',
                          rule.enabled ? 'translate-x-5' : 'translate-x-1',
                        )}
                      />
                    </Switch.Root>
                    <button
                      onClick={() => openEditRule(rule)}
                      aria-label={`Edit rule for ${rule.mode_name}`}
                      className={cn(
                        'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg',
                        'text-caption transition-colors hover:bg-fairy-500/10 hover:text-fairy-400',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                      )}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Edit rule</span>
                    </button>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-caption text-sm">
              No auto-play rules yet. Add a rule to automatically start music when a mode activates.
            </p>
          )}

          {showAddForm ? (
            <AddRuleForm
              onSave={(data) => createRuleMutation.mutate(data)}
              onCancel={() => setShowAddForm(false)}
              rooms={assignedRooms}
              favourites={favourites ?? []}
              modes={modeNames}
              isSaving={createRuleMutation.isPending}
            />
          ) : !editingRuleId && (
            <button
              onClick={() => { resetEditForm(); setShowAddForm(true) }}
              className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              Add auto-play rule
            </button>
          )}
        </div>
      </Section>
    </div>
  )
}
