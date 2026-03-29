import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Speaker, Wifi, WifiOff, Trash2, Plus, Plug, Link2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { SonosZone, SonosSpeakerMapping, Room, KasaDevice } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { BackLink } from '@/components/ui/BackLink'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'

// ── Helpers ───────────────────────────────────────────────────────────────────

function playbackLabel(state: string): string {
  switch (state) {
    case 'PLAYING':
      return 'Playing'
    case 'PAUSED_PLAYBACK':
      return 'Paused'
    case 'STOPPED':
      return 'Stopped'
    case 'TRANSITIONING':
      return 'Connecting'
    default:
      return state
  }
}

function playbackBadgeClass(state: string): string {
  switch (state) {
    case 'PLAYING':
      return 'bg-green-500/10 text-green-400'
    case 'PAUSED_PLAYBACK':
      return 'bg-yellow-500/10 text-yellow-400'
    default:
      return 'bg-slate-500/10 text-slate-400'
  }
}

// ── Connection status bar ─────────────────────────────────────────────────────

function ConnectionStatus() {
  const { data: health, isError, isLoading } = useQuery({
    queryKey: ['sonos', 'health'],
    queryFn: api.sonos.health,
    refetchInterval: 30_000,
  })

  if (isLoading) return null

  if (isError || !health) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm">
        <WifiOff className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
        <span className="text-red-400">
          Sonos API is unreachable. Make sure node-sonos-http-api is running and try again.
        </span>
      </div>
    )
  }

  const isAvailable = health.available

  return (
    <div
      className={cn(
        'mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
        isAvailable
          ? 'border border-green-500/20 bg-green-500/10'
          : 'border border-red-500/20 bg-red-500/10',
      )}
    >
      {isAvailable ? (
        <Wifi className="h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
      ) : (
        <WifiOff className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
      )}
      <span className={cn('font-medium', isAvailable ? 'text-green-400' : 'text-red-400')}>
        Sonos API {isAvailable ? 'connected' : 'unavailable'}
      </span>
    </div>
  )
}

// ── Assign speaker form ───────────────────────────────────────────────────────

function AssignSpeakerCard({
  zone,
  rooms,
  assignedRoomNames,
  onAssigned,
}: {
  zone: SonosZone
  rooms: Room[]
  assignedRoomNames: Set<string>
  onAssigned: (roomName: string) => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const speakerName = zone.coordinator.roomName
  const playbackState = zone.coordinator.state?.playbackState ?? 'STOPPED'

  const [selectedRoom, setSelectedRoom] = useState('')
  const [defaultVolume, setDefaultVolume] = useState(30)

  const availableRooms = rooms.filter(r => !assignedRoomNames.has(r.name))

  const assignMutation = useMutation({
    mutationFn: () =>
      api.sonos.setSpeaker({
        room_name: selectedRoom,
        speaker_name: speakerName,
        default_volume: defaultVolume,
      }),
    onSuccess: () => {
      toast({ message: `"${speakerName}" assigned to ${selectedRoom}.` })
      const assignedRoomName = selectedRoom
      setSelectedRoom('')
      setDefaultVolume(30)
      queryClient.invalidateQueries({ queryKey: ['sonos', 'speakers'] })
      onAssigned(assignedRoomName)
    },
    onError: () => {
      toast({
        message: `Failed to assign "${speakerName}". Make sure the room is not already taken and try again.`,
        type: 'error',
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRoom) return
    assignMutation.mutate()
  }

  return (
    <div className="card rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="rounded-full bg-fairy-500/10 p-1.5 text-fairy-400" aria-hidden="true">
          <Speaker className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium text-heading">{speakerName}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            playbackBadgeClass(playbackState),
          )}
        >
          {playbackLabel(playbackState)}
        </span>
        {zone.members.length > 1 && (
          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] text-slate-400">
            {zone.members.length} speakers in group
          </span>
        )}
      </div>

      {availableRooms.length === 0 ? (
        <p className="text-xs text-caption">All rooms are already assigned to a speaker.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor={`room-select-${speakerName}`}
              className="mb-1 block text-xs font-medium text-body"
            >
              Assign to room
            </label>
            <select
              id={`room-select-${speakerName}`}
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              required
              className={cn(
                'surface w-full rounded-lg border px-3 py-2 text-sm text-heading',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
            >
              <option value="">Select a room...</option>
              {availableRooms.map(room => (
                <option key={room.name} value={room.name}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`volume-slider-${speakerName}`}
              className="mb-1 flex items-center justify-between text-xs font-medium text-body"
            >
              Default volume
              <span className="tabular-nums text-caption">{defaultVolume}%</span>
            </label>
            <input
              id={`volume-slider-${speakerName}`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={defaultVolume}
              onChange={e => setDefaultVolume(Number(e.target.value))}
              className="w-full accent-fairy-500"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={defaultVolume}
              aria-valuetext={`${defaultVolume} percent`}
            />
          </div>

          <button
            type="submit"
            disabled={!selectedRoom || assignMutation.isPending}
            className={cn(
              'flex min-h-[44px] items-center gap-1.5 rounded-lg bg-fairy-500 px-4 py-2 text-sm font-medium text-white',
              'transition-colors hover:bg-fairy-600',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              (!selectedRoom || assignMutation.isPending) && 'cursor-not-allowed opacity-50',
            )}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {assignMutation.isPending ? 'Assigning...' : 'Assign speaker'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Assigned speaker card ─────────────────────────────────────────────────────

function AssignedSpeakerCard({
  mapping,
  onRemoved,
}: {
  mapping: SonosSpeakerMapping
  onRemoved: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const removeMutation = useMutation({
    mutationFn: () => api.sonos.removeSpeaker(mapping.room_name),
    onSuccess: () => {
      toast({ message: `Speaker removed from "${mapping.room_name}".` })
      queryClient.invalidateQueries({ queryKey: ['sonos', 'speakers'] })
      onRemoved()
    },
    onError: () => {
      toast({
        message: `Failed to remove speaker from "${mapping.room_name}". Try again.`,
        type: 'error',
      })
    },
  })

  return (
    <div className="card rounded-xl border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-full bg-fairy-500/10 p-1.5 text-fairy-400 shrink-0" aria-hidden="true">
          <Speaker className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-heading">{mapping.speaker_name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="text-xs text-caption">Room: {mapping.room_name}</span>
            <span className="text-xs text-caption">Default volume: {mapping.default_volume}%</span>
          </div>
        </div>

        <button
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium',
            'bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            removeMutation.isPending && 'cursor-not-allowed opacity-50',
          )}
          aria-label={`Remove speaker from ${mapping.room_name}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {removeMutation.isPending ? 'Removing...' : 'Remove'}
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SonosSetupPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const {
    data: zones,
    isLoading: zonesLoading,
    isError: zonesError,
    refetch: refetchZones,
  } = useQuery({
    queryKey: ['sonos', 'zones'],
    queryFn: api.sonos.getZones,
  })

  const {
    data: speakers,
    isLoading: speakersLoading,
    isError: speakersError,
  } = useQuery({
    queryKey: ['sonos', 'speakers'],
    queryFn: api.sonos.getSpeakers,
  })

  const { data: rooms, isLoading: roomsLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sonos'] })
  }

  // Track which room was just assigned so we can suggest linking a smart plug
  const [suggestPlugForRoom, setSuggestPlugForRoom] = useState<string | null>(null)
  const [plugSuggestionDismissed, setPlugSuggestionDismissed] = useState(false)

  const { data: kasaDevices } = useQuery({
    queryKey: ['kasa', 'devices'],
    queryFn: api.kasa.getDevices,
    enabled: !!suggestPlugForRoom && !plugSuggestionDismissed,
    staleTime: 60_000,
  })

  const linkPlugMutation = useMutation({
    mutationFn: (kasaId: string) =>
      api.deviceLinks.create({
        source_type: 'sonos',
        source_id: suggestPlugForRoom!,
        target_type: 'kasa',
        target_id: kasaId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-links'] })
      setPlugSuggestionDismissed(true)
      toast({ message: 'Smart plug linked as power source' })
    },
    onError: () => toast({ message: 'Failed to link plug. You can do this later from the speaker settings.', type: 'error' }),
  })

  const isLoading = zonesLoading || speakersLoading || roomsLoading

  const assignedRoomNames = new Set(speakers?.map(s => s.room_name) ?? [])
  const assignedSpeakerNames = new Set(speakers?.map(s => s.speaker_name) ?? [])

  // Only show zones not already assigned
  const unassignedZones = zones?.filter(z => !assignedSpeakerNames.has(z.coordinator.roomName)) ?? []

  return (
    <div>
      {/* Back link */}
      <BackLink to="/devices" label="Devices" />

      {/* Page header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-full bg-fairy-500/10 p-1.5 text-fairy-400" aria-hidden="true">
          <Speaker className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-heading">Sonos speakers</h2>
      </div>

      {/* Connection status */}
      <ConnectionStatus />

      {/* Loading skeleton */}
      {isLoading ? (
        <div role="status" aria-label="Loading Sonos speakers">
          <SkeletonList count={4} height="h-24" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Assigned speakers ─────────────────────────────── */}
          <section aria-labelledby="assigned-heading">
            <h3 id="assigned-heading" className="mb-3 text-sm font-medium text-body">
              Assigned speakers
            </h3>

            {speakersError ? (
              <EmptyState
                icon={WifiOff}
                message="Could not load assigned speakers."
                sub="Check that the server is running, then try again."
              >
                <button
                  onClick={handleRefresh}
                  className="mt-3 text-xs text-fairy-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  Retry
                </button>
              </EmptyState>
            ) : !speakers || speakers.length === 0 ? (
              <EmptyState
                icon={Speaker}
                message="No speakers assigned yet."
                sub="Discover your speakers below and assign each one to a room."
              />
            ) : (
              <div className="space-y-2">
                {speakers.map(mapping => (
                  <AssignedSpeakerCard
                    key={mapping.id}
                    mapping={mapping}
                    onRemoved={handleRefresh}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Discovered speakers ───────────────────────────── */}
          <section aria-labelledby="discovered-heading">
            <h3 id="discovered-heading" className="mb-3 text-sm font-medium text-body">
              Discovered speakers
            </h3>

            {zonesError ? (
              <EmptyState
                icon={WifiOff}
                message="Could not reach the Sonos API."
                sub="Make sure node-sonos-http-api is running and your speakers are online."
              >
                <button
                  onClick={() => refetchZones()}
                  className="mt-3 text-xs text-fairy-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                >
                  Retry
                </button>
              </EmptyState>
            ) : !zones || zones.length === 0 ? (
              <EmptyState
                icon={Speaker}
                message="No Sonos speakers found."
                sub="Make sure node-sonos-http-api is running and your speakers are online."
              />
            ) : unassignedZones.length === 0 ? (
              <EmptyState
                icon={Speaker}
                message="All discovered speakers are already assigned."
                sub="Remove an existing assignment above to reassign a speaker to a different room."
              />
            ) : (
              <div className="space-y-2">
                {unassignedZones.map(zone => (
                  <AssignSpeakerCard
                    key={zone.coordinator.uuid}
                    zone={zone}
                    rooms={rooms ?? []}
                    assignedRoomNames={assignedRoomNames}
                    onAssigned={(roomName) => {
                      setSuggestPlugForRoom(roomName)
                      setPlugSuggestionDismissed(false)
                      handleRefresh()
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Smart plug suggestion ──────────────────────────────── */}
      {suggestPlugForRoom && !plugSuggestionDismissed && (
        <section
          aria-labelledby="plug-suggestion-heading"
          className="rounded-xl border border-fairy-500/30 bg-fairy-500/5 p-4"
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="rounded-full bg-fairy-500/10 p-1.5 text-fairy-400 shrink-0" aria-hidden="true">
              <Plug className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="plug-suggestion-heading" className="text-sm font-medium text-heading">
                Track energy use for {suggestPlugForRoom}
              </h3>
              <p className="mt-0.5 text-xs text-caption">
                Link a Kasa smart plug to see how much power this speaker uses and its running cost.
              </p>

              {kasaDevices && kasaDevices.filter(d => d.has_emeter && !d.parent_id).length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {kasaDevices
                    .filter((d: KasaDevice) => d.has_emeter && !d.parent_id)
                    .map((plug: KasaDevice) => (
                      <button
                        key={plug.id}
                        onClick={() => linkPlugMutation.mutate(plug.id)}
                        disabled={linkPlugMutation.isPending}
                        className="flex w-full min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-left text-sm text-heading transition-colors hover:border-fairy-500/50 hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 disabled:opacity-50"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-fairy-400" aria-hidden="true" />
                        {plug.label}
                        {!plug.is_online && (
                          <span className="ml-auto text-xs text-slate-400">Offline</span>
                        )}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
            <button
              onClick={() => setPlugSuggestionDismissed(true)}
              className="shrink-0 text-xs text-caption hover:text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              aria-label="Dismiss plug suggestion"
            >
              Skip
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
