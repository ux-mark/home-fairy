import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as Switch from '@radix-ui/react-switch'
import { Trash2 } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import { api, type Room, type AutoPlayRule } from '@/lib/api'
import { cn } from '@/lib/utils'
import { BackLink } from '@/components/ui/BackLink'
import { Accordion } from '@/components/ui/Accordion'
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

function formatRuleSentence(rule: AutoPlayRule): string {
  return `Play "${rule.favourite_name}" when mode changes to "${rule.mode_name}"`
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

  // Favourite dropdown state
  const [favDropdownOpen, setFavDropdownOpen] = useState(false)
  const favDropdownRef = useRef<HTMLDivElement>(null)

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

  // Derived
  const speakerMapping = speakers?.find(s => s.speaker_name === speaker)
  const assignedRoom: Room | undefined = rooms?.find(r => r.name === speakerMapping?.room_name)
  const assignedRoomRules = autoPlayRules?.filter(r => r.room_name === assignedRoom?.name) ?? []

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

  useEffect(() => {
    if (!favDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (favDropdownRef.current && !favDropdownRef.current.contains(e.target as Node)) {
        setFavDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [favDropdownOpen])

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
    mutationFn: (data: { sonos_follow_me?: boolean; sonos_auto_start?: boolean }) =>
      api.rooms.update(assignedRoom!.name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: () => toast({ message: 'Failed to update room settings', type: 'error' }),
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
    },
    onError: () => toast({ message: 'Failed to delete rule', type: 'error' }),
  })

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
            <div className="flex items-center gap-3 pt-1">
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
              <span className="text-caption text-xs">
                Volume: {playbackState.volume}%
              </span>
              {playbackState.mute && (
                <span className="text-xs text-amber-400">Muted</span>
              )}
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
              Assign this speaker to a room to enable follow-me and auto-start music.
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
            <p className="text-caption text-xs mb-3">Volume applied when auto-start music begins playing.</p>
            <input
              id="default-volume"
              type="range"
              min={0}
              max={100}
              value={effectiveVolume}
              onChange={e => handleVolumeChange(Number(e.target.value))}
              disabled={!speakerMapping}
              className={cn(
                'h-11 w-full cursor-pointer appearance-none rounded-lg',
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
              <SwitchRow
                id="auto-start"
                label="Auto-start music"
                description="Start playing music automatically when the room becomes active."
                checked={assignedRoom.sonos_auto_start}
                onCheckedChange={checked =>
                  updateRoomMutation.mutate({ sonos_auto_start: checked })
                }
                disabled={updateRoomMutation.isPending}
              />
            </div>
          ) : (
            <p className="text-caption text-xs border-t border-[var(--border-secondary)] pt-4">
              Assign this speaker to a room to configure follow-me and auto-start music.
            </p>
          )}

          {/* Room favourite */}
          <div>
            <p className="text-heading text-sm font-medium mb-1">Room favourite</p>
            <p className="text-caption text-xs mb-3">
              The track or playlist to play when auto-start triggers for this room.
            </p>
            <div ref={favDropdownRef} className="relative inline-flex">
              <button
                onClick={() => setFavDropdownOpen(v => !v)}
                disabled={!speakerMapping}
                aria-label={
                  speakerMapping?.favourite
                    ? `Change favourite (currently ${speakerMapping.favourite})`
                    : 'Select a favourite'
                }
                className={cn(
                  'min-h-[44px] rounded-lg border px-4 py-2 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  speakerMapping?.favourite
                    ? 'border-fairy-500/30 bg-fairy-500/10 text-fairy-400 hover:bg-fairy-500/20'
                    : 'border-dashed border-[var(--border-secondary)] text-caption hover:border-fairy-500/40 hover:text-fairy-400',
                )}
              >
                {speakerMapping?.favourite ?? 'Select a favourite'}
              </button>
              {favDropdownOpen && favourites && favourites.length > 0 && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-64 overflow-y-auto rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] shadow-lg">
                  <button
                    onClick={() => {
                      updateSpeakerMutation.mutate({ favourite: null })
                      setFavDropdownOpen(false)
                    }}
                    className="flex w-full min-h-[44px] items-center px-3 py-2 text-left text-sm text-caption hover:bg-fairy-500/10 hover:text-heading transition-colors"
                  >
                    No favourite
                  </button>
                  {favourites.map(fav => (
                    <button
                      key={fav.title}
                      onClick={() => {
                        updateSpeakerMutation.mutate({ favourite: fav.title })
                        setFavDropdownOpen(false)
                      }}
                      disabled={fav.title === speakerMapping?.favourite}
                      className={cn(
                        'flex w-full min-h-[44px] items-center px-3 py-2 text-left text-sm transition-colors',
                        fav.title === speakerMapping?.favourite
                          ? 'bg-fairy-500/5 font-medium text-fairy-400'
                          : 'text-body hover:bg-fairy-500/10 hover:text-heading',
                      )}
                    >
                      {fav.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!favourites?.length && (
              <p className="mt-2 text-caption text-xs">
                No Sonos favourites found. Add favourites in the Sonos app and they will appear here.
              </p>
            )}
          </div>
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
          {assignedRoomRules.length === 0 ? (
            <p className="text-body text-sm">
              No auto-play rules for {assignedRoom.name}. Rules can be created on the{' '}
              <a
                href="/sonos"
                className="text-fairy-400 underline underline-offset-2 hover:text-fairy-300"
              >
                Sonos settings page
              </a>
              .
            </p>
          ) : (
            <ul className="space-y-3" role="list">
              {assignedRoomRules.map(rule => (
                <li
                  key={rule.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', rule.enabled ? 'text-body' : 'text-caption line-through')}>
                      {formatRuleSentence(rule)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch.Root
                      checked={!!rule.enabled}
                      onCheckedChange={checked =>
                        toggleRuleMutation.mutate({ id: rule.id, enabled: checked })
                      }
                      disabled={toggleRuleMutation.isPending}
                      aria-label={`${rule.enabled ? 'Disable' : 'Enable'} rule: ${formatRuleSentence(rule)}`}
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
                      onClick={() => deleteRuleMutation.mutate(rule.id)}
                      disabled={deleteRuleMutation.isPending}
                      aria-label={`Delete rule: ${formatRuleSentence(rule)}`}
                      className={cn(
                        'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg',
                        'text-caption transition-colors hover:bg-red-500/10 hover:text-red-400',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                      )}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Delete rule</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Accordion>
      )}
    </div>
  )
}
