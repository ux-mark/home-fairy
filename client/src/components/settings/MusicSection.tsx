import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle, AlertCircle, AlertTriangle, Pencil } from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import { api } from '@/lib/api'
import type { AutoPlayRule } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { AutoPlayRuleEditor, type AutoPlayRulePayload } from '@/components/sonos/AutoPlayRuleEditor'
import { describeRule } from '@/lib/auto-play-description'
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
        to="/sonos/setup"
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

// ── Spotify connection ───────────────────────────────────────────────────────

function SpotifyConnectionSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const location = useLocation()

  // Handle ?spotify=connected redirect from OAuth
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('spotify') === 'connected') {
      toast({ message: 'Spotify connected successfully' })
      window.history.replaceState({}, '', location.pathname)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: status, isLoading } = useQuery({
    queryKey: ['spotify', 'status'],
    queryFn: api.spotify.getStatus,
    retry: false,
  })

  const disconnectMutation = useMutation({
    mutationFn: api.spotify.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spotify', 'status'] })
      toast({ message: 'Spotify disconnected' })
    },
    onError: () => toast({ message: 'Failed to disconnect Spotify', type: 'error' }),
  })

  return (
    <Section title="Spotify">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-caption">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--bg-tertiary)]" aria-hidden="true" />
          Checking Spotify connection...
        </div>
      ) : status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-400" aria-hidden="true" />
            <span className="text-heading">
              Connected{status.display_name ? ` as ${status.display_name}` : ''}
            </span>
          </div>
          {status.needs_reauth && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Additional permissions needed. Reconnect Spotify to grant the required access.</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/spotify/auth"
              className={
                status.needs_reauth
                  ? 'inline-flex items-center rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500'
                  : 'inline-flex items-center rounded-lg px-4 py-2 min-h-[44px] border border-[var(--border-secondary)] surface text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500'
              }
            >
              Reconnect Spotify
            </a>
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="rounded-lg px-4 py-2 min-h-[44px] border border-[var(--border-secondary)] surface text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            >
              {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect Spotify'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-caption text-sm">
            Connect your Spotify account to browse playlists and control playback.
          </p>
          <a
            href="/api/spotify/auth"
            className="inline-flex items-center rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Connect Spotify
          </a>
        </div>
      )}
    </Section>
  )
}

// ── Main MusicSection ────────────────────────────────────────────────────────

export function MusicSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)

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
      setEditingRuleId(null)
    },
    onError: () => toast({ message: 'Failed to update rule', type: 'error' }),
  })

  function openEditRule(rule: AutoPlayRule) {
    setShowAddForm(false)
    setEditingRuleId(rule.id)
  }

  const { data: availableSources } = useQuery({
    queryKey: ['sonos', 'services'],
    queryFn: api.sonos.getServices,
    staleTime: 60_000,
  })

  const assignedRooms = speakers?.map((s) => s.room_name) ?? []
  const speakerCount = speakers?.length ?? 0

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <Section title="Sonos">
        <SonosConnectionStatus />
      </Section>

      {/* Spotify connection */}
      <SpotifyConnectionSection />

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
          to="/sonos/setup"
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
              const { main, condition } = describeRule(rule, { includeRoom: true })
              const isEditing = editingRuleId === rule.id

              if (isEditing) {
                return (
                  <AutoPlayRuleEditor
                    key={rule.id}
                    mode="edit"
                    rule={rule}
                    availableRooms={assignedRooms}
                    availableModes={modes ?? []}
                    availableSources={availableSources ?? []}
                    idPrefix={`settings-edit-rule-${rule.id}`}
                    className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-4"
                    onSave={(data: AutoPlayRulePayload) => editRuleMutation.mutate({
                      id: rule.id,
                      data: { ...data },
                    })}
                    onCancel={() => setEditingRuleId(null)}
                    onDelete={() => deleteRuleMutation.mutate(rule.id)}
                    isSaving={editRuleMutation.isPending}
                    isDeleting={deleteRuleMutation.isPending}
                  />
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
            <AutoPlayRuleEditor
              mode="add"
              availableRooms={assignedRooms}
              availableModes={modes ?? []}
              availableSources={availableSources ?? []}
              idPrefix="settings-add-rule"
              className="surface rounded-lg border border-[var(--border-secondary)] p-4"
              onSave={(data: AutoPlayRulePayload) => createRuleMutation.mutate({ ...data, enabled: 1 })}
              onCancel={() => setShowAddForm(false)}
              isSaving={createRuleMutation.isPending}
            />
          ) : !editingRuleId && (
            <button
              onClick={() => { setEditingRuleId(null); setShowAddForm(true) }}
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
