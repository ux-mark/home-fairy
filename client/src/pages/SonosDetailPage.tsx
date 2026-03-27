import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as Switch from '@radix-ui/react-switch'
import { Pencil, Volume2, VolumeX, Zap, CirclePause, CircleSlash } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import { api, type Room, type AutoPlayRule } from '@/lib/api'
import { cn } from '@/lib/utils'
import { BackLink } from '@/components/ui/BackLink'
import { Accordion } from '@/components/ui/Accordion'
import { PillSelect } from '@/components/ui/PillSelect'
import { CardRadioGroup } from '@/components/ui/CardRadioGroup'
import { FavouriteSelector } from '@/components/sonos/FavouriteSelector'
import { useToast } from '@/hooks/useToast'

// ── Socket singleton (reuse the same pattern as useSocket.ts) ─────────────────

let _socket: Socket | null = null

function getSocket(): Socket {
  if (!_socket) {
    const url = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
    _socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    })
  }
  return _socket
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPlaybackState(state: string): string {
  switch (state) {
    case 'PLAYING': return 'Playing'
    case 'PAUSED_PLAYBACK': return 'Paused'
    case 'STOPPED': return 'Stopped'
    case 'TRANSITIONING': return 'Loading…'
    default: return state
  }
}

function formatRuleSentence(rule: AutoPlayRule): { main: string; condition?: string } {
  const action = rule.favourite_name === '__continue__'
    ? "Continue what's already playing"
    : `Play "${rule.favourite_name}"`
  const main = `${action} when mode changes to "${rule.mode_name}".`
  let condition: string | undefined
  if (rule.trigger_type === 'if_not_playing') {
    condition = 'Only if nothing is playing.'
  } else if (rule.trigger_type === 'if_source_not' && rule.trigger_value) {
    condition = `Only if "${rule.trigger_value}" is not active.`
  }
  return { main, condition }
}

function formatRuleAccessible(rule: AutoPlayRule): string {
  const { main, condition } = formatRuleSentence(rule)
  return condition ? `${main} ${condition}` : main
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading speaker details">
      <div className="space-y-3">
        <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="card rounded-xl border p-5 space-y-3">
          <div className="h-5 w-32 animate-pulse rounded bg-[var(--bg-tertiary)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--bg-tertiary)]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-tertiary)]" />
        </div>
      ))}
    </div>
  )
}

// ── SwitchRow subcomponent ────────────────────────────────────────────────────

interface SwitchRowProps {
  id: string
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}

function SwitchRow({ id, label, description, checked, disabled, onCheckedChange }: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-heading text-sm font-medium cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-caption text-xs mt-0.5">{description}</p>
        )}
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          'disabled:cursor-not-allowed disabled:opacity-40',
          checked ? 'bg-fairy-500' : 'bg-[var(--border-secondary)]',
        )}
      >
        <Switch.Thumb
          className={cn(
            'block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </Switch.Root>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SonosDetailPage() {
  const { speaker } = useParams<{ speaker: string }>()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Accordion open states (all open by default)
  const [nowPlayingOpen, setNowPlayingOpen] = useState(true)
  const [configOpen, setConfigOpen] = useState(true)
  const [rulesOpen, setRulesOpen] = useState(true)

  // Room dropdown state
  const [roomDropdownOpen, setRoomDropdownOpen] = useState(false)
  const roomDropdownRef = useRef<HTMLDivElement>(null)

  // Inline add/edit rule form state
  const [showAddRuleForm, setShowAddRuleForm] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [newRuleFavourite, setNewRuleFavourite] = useState('')
  const [newRuleMode, setNewRuleMode] = useState('')
  const [newRuleTriggerType, setNewRuleTriggerType] = useState<AutoPlayRule['trigger_type']>('if_not_playing')
  const [newRuleSourceValue, setNewRuleSourceValue] = useState('')

  // Local default volume (slider) -- tracked as delta from server value
  const [volumeDelta, setVolumeDelta] = useState<number | null>(null)
  const volumeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: playbackState, isLoading: playbackLoading } = useQuery({
    queryKey: ['sonos', 'state', speaker],
    queryFn: () => api.sonos.getState(speaker!),
    enabled: !!speaker,
    staleTime: 10_000,
  })

  const { data: speakers, isLoading: speakersLoading } = useQuery({
    queryKey: ['sonos', 'speakers'],
    queryFn: api.sonos.getSpeakers,
    staleTime: 30_000,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
    staleTime: 60_000,
  })

  const { data: favourites } = useQuery({
    queryKey: ['sonos', 'favourites'],
    queryFn: api.sonos.getFavourites,
    staleTime: 60_000,
  })

  const { data: autoPlayRules } = useQuery({
    queryKey: ['sonos', 'auto-play'],
    queryFn: api.sonos.getAutoPlayRules,
    staleTime: 30_000,
  })

  const { data: modes } = useQuery({
    queryKey: ['system', 'modes'],
    queryFn: api.system.getModes,
    staleTime: 60_000,
  })

  // Derived
  const speakerMapping = speakers?.find(s => s.speaker_name === speaker)
  const assignedRoom: Room | undefined = rooms?.find(r => r.name === speakerMapping?.room_name)
  const assignedRoomRules = autoPlayRules?.filter(r => r.room_name === assignedRoom?.name) ?? []
  const { data: availableSources } = useQuery({
    queryKey: ['sonos', 'services'],
    queryFn: api.sonos.getServices,
    staleTime: 60_000,
  })

  // ── Socket subscription ──────────────────────────────────────────────────────

  useEffect(() => {
    const s = getSocket()

    function handlePlaybackUpdate() {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'state', speaker] })
    }

    s.on('sonos:playback-update', handlePlaybackUpdate)
    return () => {
      s.off('sonos:playback-update', handlePlaybackUpdate)
    }
  }, [queryClient, speaker])

  // ── Dropdown outside-click handlers ─────────────────────────────────────────

  useEffect(() => {
    if (!roomDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (roomDropdownRef.current && !roomDropdownRef.current.contains(e.target as Node)) {
        setRoomDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [roomDropdownOpen])

  // ── Mutations ────────────────────────────────────────────────────────────────

  const assignRoomMutation = useMutation({
    mutationFn: (roomName: string) =>
      api.sonos.setSpeaker({ room_name: roomName, speaker_name: speaker! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'speakers'] })
      setRoomDropdownOpen(false)
      toast({ message: 'Speaker assigned to room' })
    },
    onError: () => toast({ message: 'Failed to assign speaker to room', type: 'error' }),
  })

  const updateSpeakerMutation = useMutation({
    mutationFn: (data: { favourite?: string | null; default_volume?: number }) =>
      api.sonos.updateSpeaker(speakerMapping!.room_name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'speakers'] })
    },
    onError: () => toast({ message: 'Failed to update speaker settings', type: 'error' }),
  })

  const updateRoomMutation = useMutation({
    mutationFn: (data: { sonos_follow_me?: boolean }) =>
      api.rooms.update(assignedRoom!.name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: () => toast({ message: 'Failed to update room settings', type: 'error' }),
  })

  const createRuleMutation = useMutation({
    mutationFn: api.sonos.createAutoPlayRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Auto-play rule added' })
      resetRuleForm()
    },
    onError: () => toast({ message: 'Failed to add rule', type: 'error' }),
  })

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.sonos.updateAutoPlayRule(id, { enabled: enabled ? 1 : 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
    },
    onError: () => toast({ message: 'Failed to update rule', type: 'error' }),
  })

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => api.sonos.deleteAutoPlayRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Auto-play rule deleted' })
      setEditingRuleId(null)
    },
    onError: () => toast({ message: 'Failed to delete rule', type: 'error' }),
  })

  const editRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AutoPlayRule> }) =>
      api.sonos.updateAutoPlayRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'auto-play'] })
      toast({ message: 'Auto-play rule updated' })
      resetRuleForm()
    },
    onError: () => toast({ message: 'Failed to update rule', type: 'error' }),
  })

  function resetRuleForm() {
    setShowAddRuleForm(false)
    setEditingRuleId(null)
    setNewRuleFavourite('')
    setNewRuleMode('')
    setNewRuleTriggerType('if_not_playing')
    setNewRuleSourceValue('')
  }

  function openEditRule(rule: AutoPlayRule) {
    setShowAddRuleForm(false)
    setEditingRuleId(rule.id)
    setNewRuleFavourite(rule.favourite_name)
    setNewRuleMode(rule.mode_name)
    setNewRuleTriggerType(rule.trigger_type)
    setNewRuleSourceValue(rule.trigger_value ?? '')
  }

  // ── Live volume + mute mutations ────────────────────────────────────────────

  const [liveVolume, setLiveVolume] = useState<number | null>(null)
  const liveVolumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setLiveVolumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speaker!, level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'state', speaker] })
    },
    onError: () => toast({ message: 'Failed to set volume', type: 'error' }),
  })

  const setMuteMutation = useMutation({
    mutationFn: (muted: boolean) => api.sonos.setMute(speaker!, muted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sonos', 'state', speaker] })
    },
    onError: () => toast({ message: 'Failed to toggle mute', type: 'error' }),
  })

  function handleLiveVolumeChange(value: number) {
    setLiveVolume(value)
    if (liveVolumeTimer.current) clearTimeout(liveVolumeTimer.current)
    liveVolumeTimer.current = setTimeout(() => {
      // Auto-unmute when slider moves while muted
      if (playbackState?.mute) {
        setMuteMutation.mutate(false)
      }
      setLiveVolumeMutation.mutate(value)
      setLiveVolume(null)
    }, 300)
  }

  function handleMuteToggle() {
    if (!playbackState) return
    setMuteMutation.mutate(!playbackState.mute)
  }

  // ── Volume save on debounce ──────────────────────────────────────────────────

  function handleVolumeChange(value: number) {
    setVolumeDelta(value)
    if (volumeSaveTimer.current) clearTimeout(volumeSaveTimer.current)
    volumeSaveTimer.current = setTimeout(() => {
      if (speakerMapping) {
        updateSpeakerMutation.mutate({ default_volume: value })
      }
    }, 600)
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (speakersLoading) {
    return <PageSkeleton />
  }

  // ── Not found ────────────────────────────────────────────────────────────────

  if (!speaker) {
    return (
      <div>
        <BackLink to="/devices" label="All devices" />
        <div className="card rounded-xl border p-5" role="alert">
          <p className="text-sm text-body">Speaker not found.</p>
        </div>
      </div>
    )
  }

  const isLineIn = playbackState?.currentTrack?.type === 'line_in'
  // volumeDelta is null until the user moves the slider; fall back to server value
  const effectiveVolume = volumeDelta ?? speakerMapping?.default_volume ?? 30

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <BackLink to="/devices" label="All devices" />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-heading text-lg font-semibold">{speaker}</h1>
          {assignedRoom && (
            <span className="rounded-full bg-fairy-500/10 px-2.5 py-0.5 text-xs font-medium text-fairy-400">
              {assignedRoom.name}
            </span>
          )}
        </div>
      </header>

      {/* Now Playing */}
      <Accordion
        id="now-playing"
        title="Now playing"
        open={nowPlayingOpen}
        onToggle={() => setNowPlayingOpen(v => !v)}
      >
        {playbackLoading ? (
          <div className="space-y-3" role="status" aria-label="Loading playback state">
            <div className="flex gap-4">
              <div className="h-[120px] w-[120px] shrink-0 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--bg-tertiary)]" />
              </div>
            </div>
          </div>
        ) : playbackState ? (
          <div className="space-y-3">
            {isLineIn ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-sm font-medium text-amber-400">External audio source active</p>
                <p className="mt-1 text-xs text-caption">
                  Line-in source detected. Follow-me is automatically skipped while an external source is playing.
                </p>
              </div>
            ) : (
              <div className="flex gap-4">
                {playbackState.currentTrack?.albumArtUri ? (
                  <img
                    src={playbackState.currentTrack.albumArtUri}
                    alt={
                      playbackState.currentTrack.album
                        ? `Album art for ${playbackState.currentTrack.album}`
                        : 'Album art'
                    }
                    width={120}
                    height={120}
                    className="h-[120px] w-[120px] shrink-0 rounded-lg object-cover border border-[var(--border-secondary)]"
                  />
                ) : (
                  <div
                    className="h-[120px] w-[120px] shrink-0 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <span className="text-caption text-xs">No art</span>
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1 pt-1">
                  {playbackState.currentTrack?.title ? (
                    <p className="text-heading text-sm font-semibold leading-snug">
                      {playbackState.currentTrack.title}
                    </p>
                  ) : (
                    <p className="text-caption text-sm italic">No title</p>
                  )}
                  {playbackState.currentTrack?.artist && (
                    <p className="text-body text-sm">{playbackState.currentTrack.artist}</p>
                  )}
                  {playbackState.currentTrack?.album && (
                    <p className="text-caption text-xs">{playbackState.currentTrack.album}</p>
                  )}
                  {playbackState.currentTrack?.stationName && (
                    <p className="text-caption text-xs">{playbackState.currentTrack.stationName}</p>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2 pt-1">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  playbackState.playbackState === 'PLAYING'
                    ? 'bg-fairy-500/15 text-fairy-400'
                    : 'bg-[var(--bg-tertiary)] text-caption',
                )}
              >
                {formatPlaybackState(playbackState.playbackState)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMuteToggle}
                  disabled={setMuteMutation.isPending}
                  aria-label={playbackState.mute ? `Unmute ${speaker}` : `Mute ${speaker}`}
                  className={cn(
                    'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    playbackState.mute
                      ? 'text-amber-400 hover:bg-amber-500/10'
                      : 'text-body hover:bg-fairy-500/10',
                  )}
                >
                  {playbackState.mute
                    ? <VolumeX className="h-5 w-5" aria-hidden="true" />
                    : <Volume2 className="h-5 w-5" aria-hidden="true" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={liveVolume ?? playbackState.volume}
                  onChange={e => handleLiveVolumeChange(Number(e.target.value))}
                  aria-label={`Volume for ${speaker}`}
                  className={cn(
                    'fairy-slider flex-1',
                    playbackState.mute && 'opacity-40',
                  )}
                />
                <span className={cn(
                  'w-10 text-right text-sm tabular-nums',
                  playbackState.mute ? 'text-amber-400' : 'text-body',
                )}>
                  {liveVolume ?? playbackState.volume}%
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-body text-sm">
            Could not load playback state. The speaker may be offline or unavailable.
          </p>
        )}
      </Accordion>

      {/* Speaker Configuration */}
      <Accordion
        id="speaker-config"
        title="Speaker configuration"
        open={configOpen}
        onToggle={() => setConfigOpen(v => !v)}
      >
        <div className="space-y-5">
          {/* Room assignment */}
          <div>
            <p className="text-heading text-sm font-medium mb-1">Room assignment</p>
            <p className="text-caption text-xs mb-3">
              Assign this speaker to a room to enable follow-me music.
            </p>
            <div ref={roomDropdownRef} className="relative inline-flex">
              <button
                onClick={() => setRoomDropdownOpen(v => !v)}
                aria-label={
                  speakerMapping
                    ? `Change room for ${speaker} (currently ${speakerMapping.room_name})`
                    : `Assign ${speaker} to a room`
                }
                className={cn(
                  'min-h-[44px] rounded-lg border px-4 py-2 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  speakerMapping
                    ? 'border-fairy-500/30 bg-fairy-500/10 text-fairy-400 hover:bg-fairy-500/20'
                    : 'border-dashed border-[var(--border-secondary)] text-caption hover:border-fairy-500/40 hover:text-fairy-400',
                )}
              >
                {speakerMapping?.room_name ?? 'Assign to room'}
              </button>
              {roomDropdownOpen && rooms && rooms.length > 0 && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-48 overflow-y-auto rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] shadow-lg">
                  {rooms.map(room => (
                    <button
                      key={room.name}
                      onClick={() => assignRoomMutation.mutate(room.name)}
                      disabled={assignRoomMutation.isPending || room.name === speakerMapping?.room_name}
                      className={cn(
                        'flex w-full min-h-[44px] items-center px-3 py-2 text-left text-sm transition-colors',
                        room.name === speakerMapping?.room_name
                          ? 'bg-fairy-500/5 font-medium text-fairy-400'
                          : 'text-body hover:bg-fairy-500/10 hover:text-heading',
                      )}
                    >
                      {room.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Default volume */}
          <div>
            <label
              htmlFor="default-volume"
              className="text-heading text-sm font-medium flex items-center justify-between"
            >
              <span>Default volume</span>
              <span className="text-body text-sm font-normal">{effectiveVolume}%</span>
            </label>
            <p className="text-caption text-xs mb-3">Volume level used when follow-me joins this speaker to a group.</p>
            <input
              id="default-volume"
              type="range"
              min={0}
              max={100}
              value={effectiveVolume}
              onChange={e => handleVolumeChange(Number(e.target.value))}
              disabled={!speakerMapping}
              className={cn(
                'fairy-slider w-full',
                !speakerMapping && 'cursor-not-allowed opacity-40',
              )}
              aria-label={`Default volume for ${speaker}`}
            />
          </div>

          {/* Toggles -- only if assigned to a room */}
          {assignedRoom ? (
            <div className="space-y-3 border-t border-[var(--border-secondary)] pt-4">
              <SwitchRow
                id="follow-me"
                label="Follow-me music"
                description="Music follows you as you move between rooms."
                checked={assignedRoom.sonos_follow_me}
                onCheckedChange={checked =>
                  updateRoomMutation.mutate({ sonos_follow_me: checked })
                }
                disabled={updateRoomMutation.isPending}
              />
            </div>
          ) : (
            <p className="text-caption text-xs border-t border-[var(--border-secondary)] pt-4">
              Assign this speaker to a room to configure follow-me music.
            </p>
          )}
        </div>
      </Accordion>

      {/* Auto-Play Rules -- only if assigned to a room */}
      {assignedRoom && (
        <Accordion
          id="auto-play-rules"
          title="Auto-play rules"
          count={assignedRoomRules.length}
          open={rulesOpen}
          onToggle={() => setRulesOpen(v => !v)}
        >
          <div className="space-y-3">
            {assignedRoomRules.length > 0 && (
              <ul className="space-y-3" role="list">
                {assignedRoomRules.map(rule => {
                  const { main, condition } = formatRuleSentence(rule)
                  const isEditing = editingRuleId === rule.id

                  if (isEditing) {
                    return (
                      <li key={rule.id} className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-4 space-y-4">
                        <p className="text-heading text-sm font-medium">Edit auto-play rule</p>

                        {/* Room — read-only */}
                        <div>
                          <p className="text-heading text-sm mb-1.5">Room</p>
                          <span className="inline-flex items-center rounded-full bg-fairy-500/10 px-3 py-1.5 text-sm font-medium text-fairy-400">{assignedRoom.name}</span>
                        </div>

                        {/* Favourite */}
                        <div>
                          <label htmlFor="edit-rule-favourite" className="text-heading text-sm mb-1.5 block">Favourite</label>
                          <FavouriteSelector
                            favourites={favourites ?? []}
                            value={newRuleFavourite}
                            onChange={setNewRuleFavourite}
                            id="edit-rule-favourite"
                          />
                        </div>

                        {/* Mode */}
                        <div>
                          <p className="text-heading text-sm mb-1.5">Mode</p>
                          <PillSelect
                            id="edit-rule-mode"
                            options={modes?.map(m => ({ value: m.name, label: m.name })) ?? []}
                            value={newRuleMode}
                            onChange={setNewRuleMode}
                            placeholder="Select a mode"
                            aria-label="Select a mode"
                          />
                        </div>

                        {/* Condition */}
                        {newRuleFavourite !== '__continue__' && (
                          <div>
                            <p className="text-heading text-sm mb-2">Condition</p>
                            <CardRadioGroup
                              name="edit-trigger-type"
                              options={[
                                { value: 'if_not_playing', label: 'Only if nothing is playing', description: 'Skipped when music is already playing.', icon: CirclePause },
                                { value: 'mode_change', label: 'Always when mode changes', description: 'Starts playback every time this mode activates.', icon: Zap },
                                { value: 'if_source_not', label: 'Only if a source is not active', description: 'Skipped when a specific source is playing.', icon: CircleSlash },
                              ]}
                              value={newRuleTriggerType}
                              onChange={(v) => setNewRuleTriggerType(v as AutoPlayRule['trigger_type'])}
                              aria-label="Trigger condition"
                            />
                            {newRuleTriggerType === 'if_source_not' && (
                              <div className="mt-3">
                                <label htmlFor="edit-rule-source" className="text-caption text-xs mb-1.5 block">Source</label>
                                <PillSelect
                                  id="edit-rule-source"
                                  options={(availableSources ?? []).map(s => ({ value: s, label: s }))}
                                  value={newRuleSourceValue}
                                  onChange={setNewRuleSourceValue}
                                  aria-label="Select a source"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Save / Cancel */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => {
                              if (!newRuleFavourite || !newRuleMode) return
                              const effectiveTrigger = newRuleFavourite === '__continue__' ? 'mode_change' : newRuleTriggerType
                              editRuleMutation.mutate({
                                id: rule.id,
                                data: {
                                  mode_name: newRuleMode,
                                  favourite_name: newRuleFavourite,
                                  trigger_type: effectiveTrigger,
                                  trigger_value: effectiveTrigger === 'if_source_not' ? newRuleSourceValue : null,
                                },
                              })
                            }}
                            disabled={!newRuleFavourite || !newRuleMode || (newRuleTriggerType === 'if_source_not' && newRuleFavourite !== '__continue__' && !newRuleSourceValue) || editRuleMutation.isPending}
                            className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                          >
                            {editRuleMutation.isPending ? 'Saving...' : 'Save changes'}
                          </button>
                          <button
                            onClick={resetRuleForm}
                            className="rounded-lg px-4 py-2 min-h-[44px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-heading text-sm hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                          >
                            Cancel
                          </button>
                        </div>

                        {/* Danger zone */}
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
                      </li>
                    )
                  }

                  return (
                    <li
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
                            toggleRuleMutation.mutate({ id: rule.id, enabled: checked })
                          }
                          disabled={toggleRuleMutation.isPending}
                          aria-label={`${rule.enabled ? 'Disable' : 'Enable'} rule: ${formatRuleAccessible(rule)}`}
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
                          aria-label={`Edit rule: ${formatRuleAccessible(rule)}`}
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
                    </li>
                  )
                })}
              </ul>
            )}

            {showAddRuleForm ? (
              <div className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-4 space-y-4">
                <p className="text-heading text-sm font-medium">New auto-play rule</p>

                {/* Room — read-only */}
                <div>
                  <p className="text-heading text-sm mb-1.5">Room</p>
                  <span className="inline-flex items-center rounded-full bg-fairy-500/10 px-3 py-1.5 text-sm font-medium text-fairy-400">{assignedRoom.name}</span>
                </div>

                {/* Favourite */}
                <div>
                  <label htmlFor="detail-rule-favourite" className="text-heading text-sm mb-1.5 block">
                    Favourite
                  </label>
                  <FavouriteSelector
                    favourites={favourites ?? []}
                    value={newRuleFavourite}
                    onChange={setNewRuleFavourite}
                    id="detail-rule-favourite"
                  />
                </div>

                {/* Mode */}
                <div>
                  <p className="text-heading text-sm mb-1.5">Mode</p>
                  <PillSelect
                    id="detail-rule-mode"
                    options={modes?.map(m => ({ value: m.name, label: m.name })) ?? []}
                    value={newRuleMode}
                    onChange={setNewRuleMode}
                    placeholder="Select a mode"
                    aria-label="Select a mode"
                  />
                </div>

                {/* Condition — hidden when __continue__ (only mode_change makes sense) */}
                {newRuleFavourite !== '__continue__' && (
                  <div>
                    <p className="text-heading text-sm mb-2">Condition</p>
                    <CardRadioGroup
                      name="detail-trigger-type"
                      options={[
                        { value: 'if_not_playing', label: 'Only if nothing is playing', description: 'Skipped when music is already playing.', icon: CirclePause },
                        { value: 'mode_change', label: 'Always when mode changes', description: 'Starts playback every time this mode activates.', icon: Zap },
                        { value: 'if_source_not', label: 'Only if a source is not active', description: 'Skipped when a specific source is playing.', icon: CircleSlash },
                      ]}
                      value={newRuleTriggerType}
                      onChange={(v) => setNewRuleTriggerType(v as AutoPlayRule['trigger_type'])}
                      aria-label="Trigger condition"
                    />
                    {newRuleTriggerType === 'if_source_not' && (
                      <div className="mt-3">
                        <label htmlFor="detail-rule-source" className="text-caption text-xs mb-1.5 block">
                          Source
                        </label>
                        <PillSelect
                          id="detail-rule-source"
                          options={(availableSources ?? []).map(s => ({ value: s, label: s }))}
                          value={newRuleSourceValue}
                          onChange={setNewRuleSourceValue}
                          aria-label="Select a source"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      if (!newRuleFavourite || !newRuleMode) return
                      const effectiveTrigger = newRuleFavourite === '__continue__' ? 'mode_change' : newRuleTriggerType
                      createRuleMutation.mutate({
                        room_name: assignedRoom.name,
                        mode_name: newRuleMode,
                        favourite_name: newRuleFavourite,
                        trigger_type: effectiveTrigger,
                        trigger_value: effectiveTrigger === 'if_source_not' ? newRuleSourceValue : null,
                        enabled: 1,
                      })
                    }}
                    disabled={!newRuleFavourite || !newRuleMode || (newRuleTriggerType === 'if_source_not' && newRuleFavourite !== '__continue__' && !newRuleSourceValue) || createRuleMutation.isPending}
                    className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                  >
                    {createRuleMutation.isPending ? 'Saving...' : 'Save rule'}
                  </button>
                  <button
                    onClick={resetRuleForm}
                    className="rounded-lg px-4 py-2 min-h-[44px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-heading text-sm hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : !editingRuleId && (
              <button
                onClick={() => { resetRuleForm(); setShowAddRuleForm(true) }}
                className="rounded-lg px-4 py-2 min-h-[44px] bg-fairy-500 text-white text-sm font-medium hover:bg-fairy-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                Add auto-play rule
              </button>
            )}

            {assignedRoomRules.length === 0 && !showAddRuleForm && (
              <p className="text-body text-sm">
                No auto-play rules for {assignedRoom.name} yet. Add a rule to automatically start music when a mode activates.
              </p>
            )}
          </div>
        </Accordion>
      )}
    </div>
  )
}
