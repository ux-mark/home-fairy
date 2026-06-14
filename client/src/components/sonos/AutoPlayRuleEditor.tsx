import { useEffect, useState, type ReactNode } from 'react'
import { CirclePause, CircleSlash, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import type { AutoPlayRule, ModeWithTriggers } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FavouriteSelector } from '@/components/sonos/FavouriteSelector'
import { ScheduleFields, type ScheduleValue } from '@/components/sonos/ScheduleFields'
import { PillSelect } from '@/components/ui/PillSelect'
import { CardRadioGroup } from '@/components/ui/CardRadioGroup'

type TriggerType = AutoPlayRule['trigger_type']

/**
 * Payload the editor emits on save. Mirrors the columns the API accepts
 * for both create and update — the parent decides which mutation to fire.
 */
export type AutoPlayRulePayload = Omit<AutoPlayRule, 'id' | 'enabled'>

export interface AutoPlayRuleEditorProps {
  mode: 'add' | 'edit'
  /** The rule being edited. Required when `mode === 'edit'`. */
  rule?: AutoPlayRule
  /**
   * When provided, the room picker is hidden and the rule is fixed to
   * this room. Pass `null` to fix to "whole house". When undefined the
   * picker is shown and the user picks from `availableRooms`.
   */
  fixedRoom?: string | null
  /** Rooms shown in the picker. Ignored when `fixedRoom` is provided. */
  availableRooms?: string[]
  availableModes: ModeWithTriggers[]
  availableSources: string[]
  /** Stable prefix for ids so multiple editors can co-exist on one page. */
  idPrefix: string
  /** Extra className for the outer container. */
  className?: string
  onSave: (payload: AutoPlayRulePayload) => void
  onCancel: () => void
  onDelete?: () => void
  isSaving: boolean
  isDeleting?: boolean
}

export function AutoPlayRuleEditor({
  mode,
  rule,
  fixedRoom,
  availableRooms = [],
  availableModes,
  availableSources,
  idPrefix,
  className,
  onSave,
  onCancel,
  onDelete,
  isSaving,
  isDeleting = false,
}: AutoPlayRuleEditorProps): ReactNode {
  const isEdit = mode === 'edit'

  // ── Initial values ─────────────────────────────────────────────────────────
  const initialRoom = isEdit && rule ? (rule.room_name ?? '') : ''
  const initialFavourite = isEdit && rule ? rule.favourite_name : ''
  const initialNasUri = isEdit && rule ? (rule.nas_uri ?? null) : null
  const initialSpotifyUri = isEdit && rule ? (rule.spotify_uri ?? null) : null
  const initialBasis: 'mode' | 'time' =
    isEdit && rule ? (rule.mode_name ? 'mode' : 'time') : 'mode'
  const initialMode = isEdit && rule ? (rule.mode_name ?? '') : (availableModes[0]?.name ?? '')
  const initialTriggerType: TriggerType = isEdit && rule ? rule.trigger_type : 'if_not_playing'
  const initialSourceValue = isEdit && rule ? (rule.trigger_value ?? '') : ''
  const initialMaxPlays = isEdit && rule && rule.max_plays !== null ? String(rule.max_plays) : ''
  const initialPodcastFeedUrl = isEdit && rule ? (rule.podcast_feed_url ?? null) : null
  const initialSchedule: ScheduleValue = isEdit && rule
    ? { daysOfWeek: rule.days_of_week, timeStart: rule.time_start, timeEnd: rule.time_end }
    : { daysOfWeek: null, timeStart: null, timeEnd: null }

  // ── State ──────────────────────────────────────────────────────────────────
  const [targetRoom, setTargetRoom] = useState<string>(initialRoom)
  const [favourite, setFavourite] = useState<string>(initialFavourite)
  const [nasUri, setNasUri] = useState<string | null>(initialNasUri)
  const [spotifyUri, setSpotifyUri] = useState<string | null>(initialSpotifyUri)
  const [triggerBasis, setTriggerBasis] = useState<'mode' | 'time'>(initialBasis)
  const [selectedMode, setSelectedMode] = useState<string>(initialMode)
  const [triggerType, setTriggerType] = useState<TriggerType>(initialTriggerType)
  const [sourceValue, setSourceValue] = useState<string>(initialSourceValue)
  const [maxPlays, setMaxPlays] = useState<string>(initialMaxPlays)
  const [podcastFeedUrl, setPodcastFeedUrl] = useState<string | null>(initialPodcastFeedUrl)
  const [podcastResolving, setPodcastResolving] = useState(false)
  const [podcastFailed, setPodcastFailed] = useState(false)
  const [manualFeedUrl, setManualFeedUrl] = useState('')
  const [schedule, setSchedule] = useState<ScheduleValue>(initialSchedule)
  const [scheduleValid, setScheduleValid] = useState(true)

  // ── Podcast auto-detect when favourite changes ─────────────────────────────
  useEffect(() => {
    if (!favourite || favourite === '__continue__') {
      setPodcastFeedUrl(null)
      setPodcastFailed(false)
      setManualFeedUrl('')
      return
    }
    let cancelled = false
    setPodcastResolving(true)
    setPodcastFailed(false)
    api.sonos.resolvePodcast(favourite).then(result => {
      if (cancelled) return
      setPodcastResolving(false)
      if (result.isPodcast) {
        if (result.feedUrl) {
          // Preserve a previously-saved feed URL on edit if the lookup races.
          setPodcastFeedUrl(prev => prev ?? result.feedUrl)
        } else {
          setPodcastFailed(true)
          if (!isEdit) setPodcastFeedUrl(null)
        }
      } else {
        setPodcastFeedUrl(null)
      }
    }).catch(() => {
      if (!cancelled) setPodcastResolving(false)
    })
    return () => { cancelled = true }
  }, [favourite, isEdit])

  // ── Derived ────────────────────────────────────────────────────────────────
  const effectiveTrigger: TriggerType = favourite === '__continue__'
    ? 'mode_change'
    : triggerBasis === 'time' && triggerType === 'mode_change'
      ? 'if_not_playing'
      : triggerType
  const resolvedFeedUrl = podcastFeedUrl ?? (podcastFailed && manualFeedUrl ? manualFeedUrl : null)
  const basisValid =
    triggerBasis === 'mode'
      ? !!selectedMode
      : !!schedule.timeStart && !!schedule.timeEnd
  const sourceFieldNeeded =
    triggerType === 'if_source_not' && favourite !== '__continue__'
  const isValid =
    !!favourite &&
    basisValid &&
    !(sourceFieldNeeded && !sourceValue) &&
    (!podcastFailed || !!manualFeedUrl) &&
    scheduleValid

  function handleSave() {
    if (!isValid) return
    const roomForPayload =
      fixedRoom !== undefined ? fixedRoom : (targetRoom || null)
    onSave({
      room_name: roomForPayload,
      mode_name: triggerBasis === 'mode' ? selectedMode : null,
      favourite_name: favourite,
      trigger_type: effectiveTrigger,
      trigger_value: effectiveTrigger === 'if_source_not' ? sourceValue : null,
      max_plays: maxPlays ? Number(maxPlays) : null,
      podcast_feed_url: resolvedFeedUrl,
      nas_uri: nasUri,
      spotify_uri: spotifyUri,
      days_of_week: schedule.daysOfWeek,
      time_start: triggerBasis === 'time' ? schedule.timeStart : null,
      time_end: triggerBasis === 'time' ? schedule.timeEnd : null,
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const conditionOptions = [
    {
      value: 'if_not_playing',
      label: 'Only if nothing is playing',
      description: 'Skipped when music is already playing.',
      icon: CirclePause,
    },
    ...(triggerBasis === 'mode'
      ? [{
          value: 'mode_change',
          label: 'Always when mode changes',
          description: 'Starts playback every time this mode activates.',
          icon: Zap,
        }]
      : []),
    {
      value: 'if_source_not',
      label: 'Only if a source is not active',
      description: 'Skipped when a specific source is playing.',
      icon: CircleSlash,
    },
  ]

  // The condition radio's displayed value coerces mode_change back to
  // if_not_playing when the user has switched to a time-window basis, so
  // the radio never highlights an option that isn't in the list.
  const conditionDisplayValue =
    triggerType === 'mode_change' && triggerBasis === 'time'
      ? 'if_not_playing'
      : triggerType

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-heading text-sm font-medium">
        {isEdit ? 'Edit auto-play rule' : 'New auto-play rule'}
      </p>

      {/* Room */}
      <div>
        <p className="text-heading text-sm mb-1.5">Room</p>
        {fixedRoom !== undefined ? (
          <span className="inline-flex items-center rounded-full bg-fairy-500/10 px-3 py-1.5 text-sm font-medium text-fairy-400">
            {fixedRoom ?? 'Whole house'}
          </span>
        ) : (
          <PillSelect
            id={`${idPrefix}-room`}
            options={[
              { value: '', label: 'Whole house' },
              ...availableRooms.map(r => ({ value: r, label: r })),
            ]}
            value={targetRoom}
            onChange={setTargetRoom}
            aria-label="Select a room"
          />
        )}
      </div>

      {/* Favourite */}
      <div>
        <label htmlFor={`${idPrefix}-favourite`} className="sr-only">What to play</label>
        <FavouriteSelector
          value={favourite}
          onChange={setFavourite}
          id={`${idPrefix}-favourite`}
          nasUri={nasUri}
          onNasUriChange={setNasUri}
          spotifyUri={spotifyUri}
          onSpotifyUriChange={setSpotifyUri}
        />
        {podcastResolving && (
          <p className="text-caption text-xs mt-1">Detecting podcast...</p>
        )}
        {podcastFeedUrl && !podcastResolving && (
          <p className="text-xs mt-1 text-fairy-400">Podcast detected. The latest episode will play automatically.</p>
        )}
        {podcastFailed && !podcastResolving && (
          <div className="mt-2">
            <p className="text-xs text-amber-400 mb-1">Podcast detected, but we could not find its feed automatically.</p>
            <input
              type="url"
              value={manualFeedUrl}
              onChange={e => setManualFeedUrl(e.target.value)}
              placeholder="Paste the podcast RSS feed URL"
              className="w-full h-11 rounded-lg border border-[var(--border-secondary)] surface px-3 text-sm text-heading placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            />
          </div>
        )}
      </div>

      {/* Trigger basis */}
      <div>
        <p className="text-heading text-sm mb-1.5">Trigger by</p>
        {!isEdit && (
          <p className="text-caption text-xs mb-2">
            Tie this rule to a mode, or to a time window. Days are an extra refinement on either.
          </p>
        )}
        <PillSelect
          id={`${idPrefix}-basis`}
          options={[
            { value: 'mode', label: 'Mode' },
            { value: 'time', label: 'Time window' },
          ]}
          value={triggerBasis}
          onChange={(v) => setTriggerBasis(v as 'mode' | 'time')}
          aria-label="Trigger basis"
        />
      </div>

      {triggerBasis === 'mode' && (
        <div>
          <p className="text-heading text-sm mb-1.5">Mode</p>
          <PillSelect
            id={`${idPrefix}-mode`}
            options={availableModes.map(m => ({ value: m.name, label: m.name, icon: m.icon ?? undefined }))}
            value={selectedMode}
            onChange={setSelectedMode}
            placeholder="Select a mode"
            aria-label="Select a mode"
          />
        </div>
      )}

      {/* Condition */}
      {favourite !== '__continue__' && (
        <div>
          <p className="text-heading text-sm mb-2">Condition</p>
          <CardRadioGroup
            name={`${idPrefix}-trigger-type`}
            options={conditionOptions}
            value={conditionDisplayValue}
            onChange={(v) => setTriggerType(v as TriggerType)}
            aria-label="Trigger condition"
          />
          {triggerType === 'if_source_not' && (
            <div className="mt-3">
              <label htmlFor={`${idPrefix}-source`} className="text-caption text-xs mb-1.5 block">
                Source
              </label>
              <PillSelect
                id={`${idPrefix}-source`}
                options={availableSources.map(s => ({ value: s, label: s }))}
                value={sourceValue}
                onChange={setSourceValue}
                aria-label="Select a source"
              />
            </div>
          )}
        </div>
      )}

      {/* Repeat limit */}
      <div>
        <p className="text-heading text-sm mb-1.5">Repeat limit</p>
        <p className="text-caption text-xs mb-2">
          {triggerBasis === 'mode'
            ? 'How many times this rule fires per mode change.'
            : 'How many times this rule fires per day.'}
        </p>
        <PillSelect
          id={`${idPrefix}-max-plays`}
          options={[
            { value: '', label: 'Unlimited' },
            { value: '1', label: 'Once' },
            { value: '2', label: '2 times' },
            { value: '3', label: '3 times' },
            { value: '5', label: '5 times' },
          ]}
          value={maxPlays}
          onChange={setMaxPlays}
        />
      </div>

      {/* Schedule */}
      <ScheduleFields
        idPrefix={`${idPrefix}-schedule`}
        variant={triggerBasis === 'mode' ? 'days-only' : 'days-and-time'}
        value={schedule}
        onChange={setSchedule}
        onValidityChange={setScheduleValid}
      />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!isValid || isSaving}
          className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Save rule'}
        </button>
        <button
          onClick={onCancel}
          className={
            isEdit
              ? 'rounded-lg px-4 py-2 min-h-[44px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-heading text-sm hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500'
              : 'rounded-lg px-4 py-2 min-h-[44px] surface text-heading text-sm hover:brightness-95 dark:hover:brightness-110 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500'
          }
        >
          Cancel
        </button>
      </div>

      {/* Danger zone — edit mode only */}
      {isEdit && onDelete && (
        <div className="border-t border-red-500/20 pt-4 mt-4">
          <p className="text-sm font-medium text-red-400 mb-2">Danger zone</p>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className={cn(
              'rounded-lg px-4 py-2 min-h-[44px] text-sm font-medium transition-colors',
              'border border-red-500/30 text-red-400 hover:bg-red-500/10',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {isDeleting ? 'Deleting...' : 'Delete this rule'}
          </button>
        </div>
      )}
    </div>
  )
}
