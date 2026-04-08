import { useRef, useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link2, Radio, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import type { SonosPlaybackState, SonosGroupInfo, SonosNowPlayingEntry } from '@/lib/api'
import { SonosVolumeControl } from './SonosVolumeControl'
import { VolumeGroupPopover } from './VolumeGroupPopover'
import { UnifiedPlaybackCard } from './UnifiedPlaybackCard'
import { GroupManager } from './GroupManager'

// ── Solo speaker props ────────────────────────────────────────────────────────

interface SpeakerCardSoloProps {
  type: 'solo'
  roomName: string
  speakerName: string
  state: SonosPlaybackState | null
  error?: boolean
  onRefresh: () => void
  group?: SonosGroupInfo | null
  allSpeakers: SonosNowPlayingEntry[]
  focusSpeaker?: string
  showVolume?: boolean
  showQueue?: boolean
}

// ── Group speaker props ───────────────────────────────────────────────────────

interface SpeakerCardGroupProps {
  type: 'group'
  coordinator: SonosNowPlayingEntry
  members: SonosNowPlayingEntry[]
  onRefresh: () => void
  allSpeakers: SonosNowPlayingEntry[]
  focusSpeaker?: string
  showVolume?: boolean
  showQueue?: boolean
}

export type SpeakerCardProps = SpeakerCardSoloProps | SpeakerCardGroupProps

// ── Shared badge ──────────────────────────────────────────────────────────────

function PlaybackBadge({ state }: { state: SonosPlaybackState | null }) {
  const isPlaying = state?.playbackState === 'PLAYING'
  const isPaused = state?.playbackState === 'PAUSED_PLAYBACK'
  const isStopped = !state || state.playbackState === 'STOPPED'
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
        isPlaying && 'bg-emerald-500/15 text-emerald-400',
        isPaused && 'bg-amber-500/15 text-amber-400',
        isStopped && 'bg-[var(--bg-tertiary)] text-caption',
      )}
    >
      {isPlaying ? 'Playing' : isPaused ? 'Paused' : 'Stopped'}
    </span>
  )
}

// ── Unified SpeakerCard ───────────────────────────────────────────────────────

/**
 * Unified speaker card that renders either a solo speaker or a grouped speaker.
 *
 * - `type='solo'`  — renders a single speaker (replaces SonosSpeakerCard)
 * - `type='group'` — renders a coordinator + members (replaces SonosGroupCard)
 *
 * Both `showVolume` and `showQueue` default to `true`.
 */
export function SpeakerCard(props: SpeakerCardProps) {
  const { toast } = useToast()
  const { showVolume = true, showQueue = true } = props
  const cardRef = useRef<HTMLDivElement>(null)
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)

  // ── Derive shared values based on type ─────────────────────────────────────

  const isSolo = props.type === 'solo'

  const speakerName = isSolo ? props.speakerName : props.coordinator.speakerName
  const state: SonosPlaybackState | null = isSolo ? props.state : props.coordinator.state
  const allSpeakers = props.allSpeakers
  const focusSpeaker = props.focusSpeaker
  const onRefresh = props.onRefresh

  // For solo: check if this card matches the focused speaker
  // For group: check if any member in the group matches the focused speaker
  const isFocused = isSolo
    ? focusSpeaker === speakerName
    : focusSpeaker != null &&
      [props.coordinator.speakerName, ...props.members.map(m => m.speakerName)].includes(
        focusSpeaker,
      )

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isFocused])

  const volumeMutation = useMutation({
    mutationFn: (level: number) => api.sonos.setVolume(speakerName, level),
    onError: () =>
      toast({
        message: isSolo
          ? `Couldn't update volume for ${props.roomName}`
          : `Couldn't update group volume`,
        type: 'error',
      }),
  })

  // ── Solo-specific values ────────────────────────────────────────────────────

  const soloGroup = isSolo ? (props.group ?? null) : null
  const isGroupedSolo = soloGroup && soloGroup.members.length > 1
  const groupedWithNames = isGroupedSolo
    ? soloGroup.members.filter(m => m !== speakerName)
    : []
  const currentGroupMembersSolo = soloGroup?.isCoordinator
    ? soloGroup.members.filter(m => m !== speakerName)
    : []

  // ── Group-specific values ───────────────────────────────────────────────────

  const allGroupMembers = isSolo ? [] : [props.coordinator, ...props.members]
  const groupLabel = isSolo
    ? (props.roomName)
    : allGroupMembers.map(e => e.roomName).join(' + ')
  const groupInfo: SonosGroupInfo = isSolo
    ? (soloGroup ?? { coordinator: speakerName, members: [speakerName], isCoordinator: true })
    : (props.coordinator.group ?? {
        coordinator: speakerName,
        members: [props.coordinator.speakerName, ...props.members.map(m => m.speakerName)],
        isCoordinator: true,
      })
  const currentGroupMembersGroup = isSolo ? [] : props.members.map(m => m.speakerName)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={cardRef}
      className="card rounded-xl border p-4 transition-colors"
      style={{ borderColor: 'var(--border-primary)' }}
      aria-label={isSolo ? undefined : `Speaker group: ${groupLabel}`}
    >
      {/* Header: room/group name + group button + playback badge */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-heading">{groupLabel}</h3>
            <button
              onClick={() => setGroupManagerOpen(true)}
              aria-label={
                isSolo
                  ? `Manage group for ${props.roomName}`
                  : `Manage speakers in ${props.coordinator.roomName} group`
              }
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-caption transition-colors',
                'hover:bg-[var(--bg-secondary)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              )}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Solo: show group membership label if grouped */}
          {isSolo && isGroupedSolo && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-caption">
              {soloGroup!.isCoordinator ? (
                <Link2 className="h-3 w-3 shrink-0 text-fairy-400" aria-hidden="true" />
              ) : (
                <Radio className="h-3 w-3 shrink-0 text-fairy-400" aria-hidden="true" />
              )}
              {soloGroup!.isCoordinator
                ? `Grouped with ${groupedWithNames.join(', ')}`
                : `Following ${soloGroup!.coordinator}`}
            </p>
          )}

          {/* Group: show speaker count */}
          {!isSolo && (
            <p className="mt-0.5 text-[11px] text-caption">
              {allGroupMembers.length} speakers
            </p>
          )}
        </div>

        <PlaybackBadge state={state} />
      </div>

      {/* Unified playback card — card variant, volume handled below */}
      <UnifiedPlaybackCard
        speaker={speakerName}
        roomName={isSolo ? props.roomName : props.coordinator.roomName}
        state={state}
        group={isSolo ? soloGroup : groupInfo}
        allSpeakers={allSpeakers}
        error={isSolo ? props.error : undefined}
        onRefresh={onRefresh}
        variant="card"
        showVolume={false}
        showFullQueue={false}
        showQueue={showQueue}
        showGroupSpeakers={true}
      />

      {/* Volume control */}
      {showVolume && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-caption">Volume</p>
          {isSolo ? (
            <SonosVolumeControl
              value={state?.volume ?? 0}
              onChange={level => volumeMutation.mutate(level)}
              label={`${props.roomName} volume`}
              disabled={!!props.error}
              loading={volumeMutation.isPending}
            />
          ) : (
            <VolumeGroupPopover
              speaker={speakerName}
              value={state?.volume ?? 0}
              onChange={level => volumeMutation.mutate(level)}
              group={groupInfo}
              allSpeakers={allSpeakers}
              label="Group volume"
            />
          )}
        </div>
      )}

      {/* Group manager bottom sheet */}
      <GroupManager
        coordinatorSpeaker={speakerName}
        coordinatorRoom={isSolo ? props.roomName : props.coordinator.roomName}
        currentMembers={isSolo ? currentGroupMembersSolo : currentGroupMembersGroup}
        allSpeakers={allSpeakers}
        open={groupManagerOpen}
        onClose={() => setGroupManagerOpen(false)}
      />
    </div>
  )
}
